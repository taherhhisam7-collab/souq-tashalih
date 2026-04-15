import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  carsForSale,
  InsertCarForSale,
  InsertOffer,
  InsertReview,
  InsertUser,
  offers,
  requests,
  reviews,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { uploadImagesToSupabase, verifySupabaseAccessToken } from "./supabase";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

const safeJsonParse = (value: string | null) => {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const serializeList = (value: string[]) => JSON.stringify(value ?? []);

function normalizeNullableText(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = {
    openId: user.openId,
    name: normalizeNullableText(user.name as string | null | undefined),
    email: normalizeNullableText(user.email),
    loginMethod: normalizeNullableText(user.loginMethod),
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "customer"),
    phoneNumber: normalizeNullableText(user.phoneNumber),
    city: normalizeNullableText(user.city),
    avatarUrl: normalizeNullableText(user.avatarUrl as string | null | undefined),
    businessName: normalizeNullableText(user.businessName),
    supportedBrands: normalizeNullableText(user.supportedBrands as string | null | undefined),
    isProfileCompleted: user.isProfileCompleted ?? 0,
    lastSignedIn: user.lastSignedIn ?? new Date(),
    supabaseUserId: normalizeNullableText(user.supabaseUserId),
  };

  const updateSet: Record<string, unknown> = {
    name: values.name,
    email: values.email,
    loginMethod: values.loginMethod,
    role: values.role,
    phoneNumber: values.phoneNumber,
    city: values.city,
    avatarUrl: values.avatarUrl,
    businessName: values.businessName,
    supportedBrands: values.supportedBrands,
    isProfileCompleted: values.isProfileCompleted,
    lastSignedIn: values.lastSignedIn,
    supabaseUserId: values.supabaseUserId,
  };

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

async function getUserBySupabaseUserId(supabaseUserId: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const result = await db.select().from(users).where(eq(users.supabaseUserId, supabaseUserId)).limit(1);
  return result[0];
}

export async function resolveMarketplaceUser(accessToken: string, roleHint?: "customer" | "supplier") {
  const authUser = await verifySupabaseAccessToken(accessToken);
  const existingUser = await getUserBySupabaseUserId(authUser.id);

  if (existingUser) {
    const nextRole = existingUser.role === "admin" ? "admin" : roleHint ?? existingUser.role ?? "customer";
    await upsertUser({
      openId: existingUser.openId,
      supabaseUserId: authUser.id,
      phoneNumber: authUser.phone ?? existingUser.phoneNumber,
      email: authUser.email ?? existingUser.email,
      name: (authUser.user_metadata?.full_name as string | undefined) ?? existingUser.name,
      loginMethod: "supabase-phone",
      role: nextRole,
      isProfileCompleted: existingUser.isProfileCompleted,
      city: existingUser.city,
      businessName: existingUser.businessName,
      supportedBrands: existingUser.supportedBrands,
      avatarUrl: existingUser.avatarUrl,
      lastSignedIn: new Date(),
    });

    return (await getUserBySupabaseUserId(authUser.id))!;
  }

  await upsertUser({
    openId: `supabase:${authUser.id}`,
    supabaseUserId: authUser.id,
    phoneNumber: authUser.phone ?? null,
    email: authUser.email ?? null,
    name: (authUser.user_metadata?.full_name as string | undefined) ?? null,
    loginMethod: "supabase-phone",
    role: roleHint ?? "customer",
    isProfileCompleted: 0,
    lastSignedIn: new Date(),
  });

  return (await getUserBySupabaseUserId(authUser.id))!;
}

export async function saveUserProfile(params: {
  accessToken: string;
  role: "customer" | "supplier";
  city?: string;
  businessName?: string;
  supportedBrands?: string[];
  name?: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, params.role);
  const updatePayload = {
    role: params.role,
    city: normalizeNullableText(params.city) ?? user.city,
    businessName: normalizeNullableText(params.businessName) ?? user.businessName,
    supportedBrands: params.supportedBrands ? serializeList(params.supportedBrands) : user.supportedBrands,
    name: normalizeNullableText(params.name) ?? user.name,
    isProfileCompleted: 1,
    lastSignedIn: new Date(),
  } as const;

  await db.update(users).set(updatePayload).where(eq(users.id, user.id));
  return getMarketplaceState(params.accessToken);
}

export async function createRequestWithImages(params: {
  accessToken: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  partName: string;
  partDescription?: string;
  city?: string;
  files: { dataUrl: string; fileName: string; mimeType: string }[];
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, "customer");
  const imageUrls = await uploadImagesToSupabase({
    files: params.files,
    userId: user.supabaseUserId ?? String(user.id),
    folder: "requests",
  });

  await db.insert(requests).values({
    customerUserId: user.id,
    vehicleBrand: params.vehicleBrand.trim(),
    vehicleModel: params.vehicleModel.trim(),
    vehicleYear: params.vehicleYear,
    partName: params.partName.trim(),
    partDescription: normalizeNullableText(params.partDescription),
    partImageUrls: serializeList(imageUrls),
    city: normalizeNullableText(params.city) ?? user.city,
    status: "pending",
  });

  return getMarketplaceState(params.accessToken);
}

export async function createOfferWithImages(params: {
  accessToken: string;
  requestId: number;
  priceSar: number;
  partCondition: "new" | "used" | "refurbished";
  offerDescription?: string;
  whatsappNumber?: string;
  files: { dataUrl: string; fileName: string; mimeType: string }[];
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, "supplier");
  const imageUrls = await uploadImagesToSupabase({
    files: params.files,
    userId: user.supabaseUserId ?? String(user.id),
    folder: "offers",
  });

  await db.insert(offers).values({
    requestId: params.requestId,
    supplierUserId: user.id,
    priceSar: params.priceSar,
    partCondition: params.partCondition,
    offerDescription: normalizeNullableText(params.offerDescription),
    offerImageUrls: serializeList(imageUrls),
    whatsappNumber: normalizeNullableText(params.whatsappNumber) ?? user.phoneNumber,
    status: "pending",
  } satisfies InsertOffer);

  await db.update(requests).set({ status: "offered" }).where(eq(requests.id, params.requestId));
  return getMarketplaceState(params.accessToken);
}

export async function createCarSaleWithImages(params: {
  accessToken: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  conditionSummary: string;
  priceSar: number;
  city?: string;
  description?: string;
  files: { dataUrl: string; fileName: string; mimeType: string }[];
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, "customer");
  const imageUrls = await uploadImagesToSupabase({
    files: params.files,
    userId: user.supabaseUserId ?? String(user.id),
    folder: "cars",
  });

  await db.insert(carsForSale).values({
    ownerUserId: user.id,
    vehicleBrand: params.vehicleBrand.trim(),
    vehicleModel: params.vehicleModel.trim(),
    vehicleYear: params.vehicleYear,
    conditionSummary: params.conditionSummary.trim(),
    priceSar: params.priceSar,
    city: normalizeNullableText(params.city) ?? user.city,
    description: normalizeNullableText(params.description),
    imageUrls: serializeList(imageUrls),
    status: "published",
  } satisfies InsertCarForSale);

  return getMarketplaceState(params.accessToken);
}

export async function acceptOffer(params: { accessToken: string; requestId: number; offerId: number }) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, "customer");
  const requestRecord = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, params.requestId), eq(requests.customerUserId, user.id)))
    .limit(1);

  if (!requestRecord[0]) {
    throw new Error("الطلب المطلوب غير موجود أو غير مملوك لك.");
  }

  await db.update(requests).set({ status: "accepted", acceptedOfferId: params.offerId }).where(eq(requests.id, params.requestId));
  await db.update(offers).set({ status: "rejected" }).where(eq(offers.requestId, params.requestId));
  await db.update(offers).set({ status: "accepted" }).where(eq(offers.id, params.offerId));

  return getMarketplaceState(params.accessToken);
}

export async function completeDeal(params: { accessToken: string; requestId: number; offerId: number }) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  await resolveMarketplaceUser(params.accessToken);
  await db.update(requests).set({ status: "completed" }).where(eq(requests.id, params.requestId));
  await db.update(offers).set({ status: "completed" }).where(eq(offers.id, params.offerId));

  return getMarketplaceState(params.accessToken);
}

export async function createReviewForDeal(params: {
  accessToken: string;
  requestId: number;
  offerId: number;
  rating: number;
  comment?: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken);
  const selectedOffer = await db.select().from(offers).where(eq(offers.id, params.offerId)).limit(1);
  if (!selectedOffer[0]) {
    throw new Error("العرض المحدد غير موجود.");
  }

  await db.insert(reviews).values({
    requestId: params.requestId,
    offerId: params.offerId,
    reviewerUserId: user.id,
    supplierUserId: selectedOffer[0].supplierUserId,
    rating: params.rating,
    comment: normalizeNullableText(params.comment),
  } satisfies InsertReview);

  return getMarketplaceState(params.accessToken);
}

export async function getMarketplaceState(accessToken: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const currentUser = await resolveMarketplaceUser(accessToken);

  const [allRequests, allOffers, allCars, allReviews, allUsers] = await Promise.all([
    db.select().from(requests).orderBy(desc(requests.createdAt)),
    db.select().from(offers).orderBy(desc(offers.createdAt)),
    db.select().from(carsForSale).orderBy(desc(carsForSale.createdAt)),
    db.select().from(reviews).orderBy(desc(reviews.createdAt)),
    db.select().from(users).orderBy(desc(users.updatedAt)),
  ]);

  const userById = new Map(allUsers.map((item) => [item.id, item]));
  const reviewsByOfferId = new Map<number, typeof allReviews>();
  for (const review of allReviews) {
    const list = reviewsByOfferId.get(review.offerId) ?? [];
    list.push(review);
    reviewsByOfferId.set(review.offerId, list);
  }

  const offersByRequestId = new Map<number, Array<typeof allOffers[number] & { supplier?: typeof allUsers[number]; reviewCount: number; averageRating: number; imageUrls: string[] }>>();

  for (const offer of allOffers) {
    const relatedReviews = reviewsByOfferId.get(offer.id) ?? [];
    const averageRating = relatedReviews.length
      ? relatedReviews.reduce((sum, review) => sum + review.rating, 0) / relatedReviews.length
      : 0;

    const enrichedOffer = {
      ...offer,
      supplier: userById.get(offer.supplierUserId),
      reviewCount: relatedReviews.length,
      averageRating,
      imageUrls: safeJsonParse(offer.offerImageUrls),
    };

    const list = offersByRequestId.get(offer.requestId) ?? [];
    list.push(enrichedOffer);
    offersByRequestId.set(offer.requestId, list);
  }

  const enrichedRequests = allRequests.map((request) => ({
    ...request,
    imageUrls: safeJsonParse(request.partImageUrls),
    customer: userById.get(request.customerUserId),
    offers: offersByRequestId.get(request.id) ?? [],
  }));

  const customerRequests = enrichedRequests.filter((request) => request.customerUserId === currentUser.id);
  const supplierRequests = enrichedRequests.filter((request) => request.customerUserId !== currentUser.id);
  const myCars = allCars
    .filter((car) => car.ownerUserId === currentUser.id)
    .map((car) => ({ ...car, imageUrls: safeJsonParse(car.imageUrls) }));
  const publicCars = allCars.map((car) => ({ ...car, owner: userById.get(car.ownerUserId), imageUrls: safeJsonParse(car.imageUrls) }));
  const myOfferIds = allOffers.filter((offer) => offer.supplierUserId === currentUser.id).map((offer) => offer.id);
  const myReviews = allReviews.filter((review) => myOfferIds.includes(review.offerId));

  return {
    currentUser: {
      ...currentUser,
      supportedBrands: safeJsonParse(currentUser.supportedBrands),
    },
    customerRequests,
    supplierRequests,
    publicCars,
    myCars,
    myReviews,
  };
}
