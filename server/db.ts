import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  carsForSale,
  damagedCars,
  InsertDamagedCar,
  InsertNotification,
  InsertOffer,
  InsertReview,
  InsertUser,
  notifications,
  offers,
  requests,
  reviews,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { publishMarketplaceNotification } from "./marketplaceNotifications";
import { uploadImagesToSupabase, verifySupabaseAccessToken } from "./supabase";

let _db: ReturnType<typeof drizzle> | null = null;

const ALLOWED_VEHICLE_TYPES = new Set([
  "تويوتا كامري",
  "تويوتا كورولا",
  "تويوتا هايلوكس",
  "هونداي النترا",
  "هونداي سوناتا",
  "نيسان صني",
  "نيسان التيما",
  "كيا سيراتو",
  "فورد اكسبلورر",
  "شفروليه تاهو",
]);

const ALLOWED_CITIES = new Set(["جدة", "الرياض", "الدمام"]);

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

function serializeDateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function assertAllowedVehicleType(value: string) {
  const normalized = value.trim();
  if (!ALLOWED_VEHICLE_TYPES.has(normalized)) {
    throw new Error("نوع السيارة يجب أن يكون من القائمة المحددة داخل التطبيق.");
  }
  return normalized;
}

function assertAllowedCity(value?: string | null) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return normalized;
  if (!ALLOWED_CITIES.has(normalized)) {
    throw new Error("المدينة يجب أن تكون واحدة من جدة أو الرياض أو الدمام.");
  }
  return normalized;
}

function normalizeModelYearInput(value: string | number) {
  const normalized = String(value).trim();
  const year = Number(normalized);
  if (!Number.isInteger(year) || year < 1950 || year > 2050) {
    throw new Error("الموديل يجب أن يكون رقماً صحيحاً بين 1950 و2050.");
  }
  return { label: normalized, year };
}

function normalizeWhatsappNumber(value?: string | null) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return digits;
}

function localizeRequestStatus(status: string) {
  switch (status) {
    case "pending":
      return "جديد";
    case "offered":
      return "تم تقديم عروض";
    case "accepted":
      return "تم قبول العرض";
    case "completed":
      return "مكتمل";
    case "cancelled":
      return "ملغي";
    case "rejected":
      return "مرفوض";
    default:
      return status;
  }
}

function localizeOfferStatus(status: string) {
  switch (status) {
    case "pending":
      return "بانتظار القرار";
    case "accepted":
      return "مقبول";
    case "rejected":
      return "مرفوض";
    case "completed":
      return "تم الشراء";
    case "withdrawn":
      return "مسحوب";
    default:
      return status;
  }
}

function localizePartCondition(value: string) {
  switch (value) {
    case "new":
      return "جديدة";
    case "used":
      return "مستعملة";
    case "refurbished":
      return "مجددة";
    default:
      return value;
  }
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isAcceptedOfferStatus(status: string) {
  return status === "accepted" || status === "completed";
}

function buildWhatsappLink(params: { whatsappNumber?: string | null; partName: string; priceSar: number }) {
  const normalizedNumber = normalizeWhatsappNumber(params.whatsappNumber);
  if (!normalizedNumber) return null;
  const text = `مرحبا، بخصوص طلب قطعة ${params.partName} بسعر ${params.priceSar} في سوق التشاليح`;
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(text)}`;
}

function buildSmartSuggestions(params: {
  topBrand?: string;
  topPart?: string;
  totalOffers: number;
  acceptedOffers: number;
}) {
  const suggestions = [
    "إضافة مدة الضمان وصور أوضح للقطعة ترفع احتمالية قبول العرض بشكل ملحوظ.",
    params.topBrand && params.topPart
      ? `الطلب على ${params.topPart} لسيارات ${params.topBrand} مرتفع حالياً، فركّز على هذا المخزون أولاً.`
      : "الطلبات الحالية تتركز على القطع السريعة الدوران، فاعرض الأسعار بسرعة مع وصف مختصر واضح.",
  ];

  if (!params.totalOffers) {
    suggestions.unshift("ابدأ بإرسال أول عرضين الآن لفتح لوحة الأداء والحصول على مؤشرات التحويل الفعلية.");
    return suggestions;
  }

  const conversion = Math.round((params.acceptedOffers / Math.max(params.totalOffers, 1)) * 100);
  suggestions.unshift(
    conversion >= 60
      ? `معدل التحويل لديك جيد (${conversion}%). استمر على نفس وتيرة الرد السريع مع تأكيد حالة القطعة.`
      : `معدل التحويل لديك ${conversion}%. جرّب تخفيض السعر أو إضافة ضمان مختصر لتحسين القبول.`
  );
  return suggestions;
}

function createFallbackSalesSeries() {
  return {
    daily: [120, 150, 110, 170, 190, 145, 210].map((value, index) => ({ label: `يوم ${index + 1}`, value })),
    weekly: [420, 580, 610, 710].map((value, index) => ({ label: `أسبوع ${index + 1}`, value })),
    monthly: [920, 1077, 980, 1260, 1180, 1350].map((value, index) => ({ label: `شهر ${index + 1}`, value })),
    isFallback: true,
  };
}

function buildSalesSeries(entries: Array<{ createdAt: Date | string | null | undefined; value: number }>) {
  if (!entries.length) {
    return createFallbackSalesSeries();
  }

  const now = new Date();
  const daily = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    const value = entries
      .filter((entry) => serializeDateValue(entry.createdAt)?.slice(0, 10) === key)
      .reduce((sum, entry) => sum + entry.value, 0);
    return { label: `${day.getDate()}/${day.getMonth() + 1}`, value };
  });

  const weekly = Array.from({ length: 4 }, (_, index) => {
    const start = new Date(now);
    start.setDate(now.getDate() - (27 - index * 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const value = entries
      .filter((entry) => {
        const entryDate = entry.createdAt ? new Date(entry.createdAt) : null;
        return entryDate && entryDate >= start && entryDate <= end;
      })
      .reduce((sum, entry) => sum + entry.value, 0);
    return { label: `أسبوع ${index + 1}`, value };
  });

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const end = new Date(now.getFullYear(), now.getMonth() - (4 - index), 0, 23, 59, 59, 999);
    const value = entries
      .filter((entry) => {
        const entryDate = entry.createdAt ? new Date(entry.createdAt) : null;
        return entryDate && entryDate >= start && entryDate <= end;
      })
      .reduce((sum, entry) => sum + entry.value, 0);
    return { label: `${start.getMonth() + 1}/${start.getFullYear()}`, value };
  });

  return { daily, weekly, monthly, isFallback: false };
}

function summarizeTopItems(values: string[], limit = 5) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
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

async function createNotificationForNewOffer(params: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  customerUserId: number;
  requestId: number;
  offerId: number;
  supplierUserId: number;
  title: string;
  body: string;
}) {
  const notificationValues: InsertNotification = {
    userId: params.customerUserId,
    requestId: params.requestId,
    offerId: params.offerId,
    supplierUserId: params.supplierUserId,
    type: "new_offer",
    title: params.title,
    body: params.body,
    isRead: 0,
  };

  const insertResult = await params.db.insert(notifications).values(notificationValues);
  const insertedNotificationId = Number((insertResult as { insertId?: number }).insertId ?? 0);
  const createdAtIso = new Date().toISOString();

  publishMarketplaceNotification({
    id: insertedNotificationId,
    userId: params.customerUserId,
    requestId: params.requestId,
    offerId: params.offerId,
    supplierUserId: params.supplierUserId,
    type: "new_offer",
    title: params.title,
    body: params.body,
    isRead: 0,
    createdAt: createdAtIso,
  });
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
  const nextBrands = params.supportedBrands?.map((item) => item.trim()).filter(Boolean) ?? [];
  const updatePayload = {
    role: params.role,
    city: normalizeNullableText(params.city) ?? user.city,
    businessName: normalizeNullableText(params.businessName) ?? user.businessName,
    supportedBrands: nextBrands.length ? serializeList(nextBrands) : user.supportedBrands,
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
  const vehicleBrand = assertAllowedVehicleType(params.vehicleBrand);
  const modelYear = normalizeModelYearInput(params.vehicleModel || params.vehicleYear);
  const city = assertAllowedCity(params.city ?? user.city);
  const imageUrls = await uploadImagesToSupabase({
    files: params.files,
    userId: user.supabaseUserId ?? String(user.id),
    folder: "requests",
  });

  await db.insert(requests).values({
    customerUserId: user.id,
    vehicleBrand,
    vehicleModel: modelYear.label,
    vehicleYear: modelYear.year,
    partName: params.partName.trim(),
    partDescription: normalizeNullableText(params.partDescription),
    partImageUrls: serializeList(imageUrls),
    city,
    status: "جديد",
  });

  return getMarketplaceState(params.accessToken);
}

export async function createOfferWithImages(params: {
  accessToken: string;
  requestId: number;
  priceSar: number;
  partCondition: "new" | "used" | "refurbished";
  warranty?: string;
  offerDescription?: string;
  whatsappNumber?: string;
  files: { dataUrl: string; fileName: string; mimeType: string }[];
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, "supplier");
  const targetRequest = await db.select().from(requests).where(eq(requests.id, params.requestId)).limit(1);
  const requestRecord = targetRequest[0];

  if (!requestRecord) {
    throw new Error("الطلب المطلوب غير موجود.");
  }

  const imageUrls = await uploadImagesToSupabase({
    files: params.files,
    userId: user.supabaseUserId ?? String(user.id),
    folder: "offers",
  });

  const insertOfferResult = await db.insert(offers).values({
    requestId: params.requestId,
    supplierUserId: user.id,
    priceSar: params.priceSar,
    partCondition: params.partCondition,
    warranty: normalizeNullableText(params.warranty),
    offerDescription: normalizeNullableText(params.offerDescription),
    offerImageUrls: serializeList(imageUrls),
    whatsappNumber: normalizeNullableText(params.whatsappNumber) ?? user.phoneNumber,
    status: "pending",
  } satisfies InsertOffer);

  const insertedOfferId = Number((insertOfferResult as { insertId?: number }).insertId ?? 0);
  await db.update(requests).set({ status: "تم تقديم عروض" }).where(eq(requests.id, params.requestId));

  if (requestRecord.customerUserId !== user.id && insertedOfferId > 0) {
    const supplierDisplayName = user.businessName ?? user.name ?? user.phoneNumber ?? "أحد الموردين";
    await createNotificationForNewOffer({
      db,
      customerUserId: requestRecord.customerUserId,
      requestId: params.requestId,
      offerId: insertedOfferId,
      supplierUserId: user.id,
      title: "وصل عرض جديد على طلبك",
      body: `أرسل ${supplierDisplayName} عرضاً جديداً لقطعة ${requestRecord.partName} بسعر ${params.priceSar} ر.س.`,
    });
  }

  return getMarketplaceState(params.accessToken);
}

export async function createCarSaleWithImages(params: {
  accessToken: string;
  vehicleBrand: string;
  vehicleModel: string;
  priceSar: number;
  location?: string;
  damageDescription?: string;
  files: { dataUrl: string; fileName: string; mimeType: string }[];
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken, "customer");
  const vehicleBrand = assertAllowedVehicleType(params.vehicleBrand);
  const modelYear = normalizeModelYearInput(params.vehicleModel);
  const location = assertAllowedCity(params.location ?? user.city);
  if (!location) {
    throw new Error("حدد موقع السيارة أولاً.");
  }

  const imageUrls = await uploadImagesToSupabase({
    files: params.files,
    userId: user.supabaseUserId ?? String(user.id),
    folder: "damaged-cars",
  });

  await db.insert(damagedCars).values({
    ownerUserId: user.id,
    location,
    vehicleBrand,
    vehicleModel: modelYear.label,
    askingPriceSar: params.priceSar,
    imageUrls: serializeList(imageUrls),
    damageDescription: normalizeNullableText(params.damageDescription),
    status: "منشور",
  } satisfies InsertDamagedCar);

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

  await db.update(requests).set({ status: "تم قبول العرض", acceptedOfferId: params.offerId }).where(eq(requests.id, params.requestId));
  await db.update(offers).set({ status: "rejected" }).where(eq(offers.requestId, params.requestId));
  await db.update(offers).set({ status: "accepted" }).where(eq(offers.id, params.offerId));

  return getMarketplaceState(params.accessToken);
}

export async function completeDeal(params: { accessToken: string; requestId: number; offerId: number }) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken);
  const requestRecord = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, params.requestId), eq(requests.customerUserId, user.id)))
    .limit(1);

  if (!requestRecord[0]) {
    throw new Error("لا يمكنك إتمام صفقة لا تخصك.");
  }

  await db.update(requests).set({ status: "مكتمل" }).where(eq(requests.id, params.requestId));
  await db.update(offers).set({ status: "completed" }).where(eq(offers.id, params.offerId));

  return getMarketplaceState(params.accessToken);
}

export async function createReviewForDeal(params: {
  accessToken: string;
  requestId: number;
  offerId: number;
  qualityRating: number;
  responseSpeedRating: number;
  priceRating: number;
  comment?: string;
}) {
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
    throw new Error("لا يمكنك تقييم طلب لا يخص حسابك.");
  }

  const selectedOffer = await db.select().from(offers).where(eq(offers.id, params.offerId)).limit(1);
  if (!selectedOffer[0]) {
    throw new Error("العرض المحدد غير موجود.");
  }

  const detailedRatings = [params.qualityRating, params.responseSpeedRating, params.priceRating];
  if (detailedRatings.some((rating) => !Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("جميع عناصر التقييم يجب أن تكون بين 1 و5 نجوم.");
  }

  const overallRating = Math.round(average(detailedRatings));

  await db.insert(reviews).values({
    requestId: params.requestId,
    offerId: params.offerId,
    reviewerUserId: user.id,
    supplierUserId: selectedOffer[0].supplierUserId,
    rating: overallRating,
    qualityRating: params.qualityRating,
    responseSpeedRating: params.responseSpeedRating,
    priceRating: params.priceRating,
    comment: normalizeNullableText(params.comment),
  } satisfies InsertReview);

  return getMarketplaceState(params.accessToken);
}

export async function markNotificationAsRead(params: { accessToken: string; notificationId: number }) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const user = await resolveMarketplaceUser(params.accessToken);
  const targetNotification = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, params.notificationId), eq(notifications.userId, user.id)))
    .limit(1);

  if (!targetNotification[0]) {
    throw new Error("الإشعار المطلوب غير موجود.");
  }

  if (!targetNotification[0].isRead) {
    await db
      .update(notifications)
      .set({
        isRead: 1,
        readAt: new Date(),
      })
      .where(eq(notifications.id, params.notificationId));
  }

  return getMarketplaceState(params.accessToken);
}

export async function getMarketplaceState(accessToken: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("قاعدة البيانات غير متاحة حالياً.");
  }

  const currentUser = await resolveMarketplaceUser(accessToken);

  const [allRequests, allOffers, legacyCars, allDamagedCars, allReviews, allUsers, allNotifications] = await Promise.all([
    db.select().from(requests).orderBy(desc(requests.createdAt)),
    db.select().from(offers).orderBy(desc(offers.createdAt)),
    db.select().from(carsForSale).orderBy(desc(carsForSale.createdAt)),
    db.select().from(damagedCars).orderBy(desc(damagedCars.createdAt)),
    db.select().from(reviews).orderBy(desc(reviews.createdAt)),
    db.select().from(users).orderBy(desc(users.updatedAt)),
    db.select().from(notifications).orderBy(desc(notifications.createdAt)),
  ]);

  const userById = new Map(allUsers.map((item) => [item.id, item]));
  const rawRequestById = new Map(allRequests.map((item) => [item.id, item]));

  const supplierReviewSummary = new Map<
    number,
    { total: number; count: number; qualityTotal: number; responseTotal: number; priceTotal: number }
  >();
  const reviewsByOfferId = new Map<number, typeof allReviews>();

  for (const review of allReviews) {
    const offerReviews = reviewsByOfferId.get(review.offerId) ?? [];
    offerReviews.push(review);
    reviewsByOfferId.set(review.offerId, offerReviews);

    const supplierSummary = supplierReviewSummary.get(review.supplierUserId) ?? {
      total: 0,
      count: 0,
      qualityTotal: 0,
      responseTotal: 0,
      priceTotal: 0,
    };

    supplierSummary.total += review.rating;
    supplierSummary.count += 1;
    supplierSummary.qualityTotal += review.qualityRating ?? review.rating;
    supplierSummary.responseTotal += review.responseSpeedRating ?? review.rating;
    supplierSummary.priceTotal += review.priceRating ?? review.rating;
    supplierReviewSummary.set(review.supplierUserId, supplierSummary);
  }

  const offersByRequestId = new Map<number, Array<any>>();

  for (const offer of allOffers) {
    const relatedReviews = reviewsByOfferId.get(offer.id) ?? [];
    const requestRecord = rawRequestById.get(offer.requestId);
    const supplierSummary = supplierReviewSummary.get(offer.supplierUserId);
    const averageRating = relatedReviews.length ? average(relatedReviews.map((review) => review.rating)) : 0;
    const supplierAverageRating = supplierSummary ? Number((supplierSummary.total / supplierSummary.count).toFixed(1)) : 0;
    const supplierRatingsBreakdown = supplierSummary
      ? {
          quality: Number((supplierSummary.qualityTotal / supplierSummary.count).toFixed(1)),
          responseSpeed: Number((supplierSummary.responseTotal / supplierSummary.count).toFixed(1)),
          price: Number((supplierSummary.priceTotal / supplierSummary.count).toFixed(1)),
        }
      : { quality: 0, responseSpeed: 0, price: 0 };

    const enrichedOffer = {
      ...offer,
      supplier: userById.get(offer.supplierUserId),
      reviewCount: relatedReviews.length,
      averageRating: Number(averageRating.toFixed(1)),
      supplierAverageRating,
      supplierReviewCount: supplierSummary?.count ?? 0,
      supplierRatingsBreakdown,
      imageUrls: safeJsonParse(offer.offerImageUrls),
      statusLabel: localizeOfferStatus(offer.status),
      partConditionLabel: localizePartCondition(offer.partCondition),
      whatsappUrl: requestRecord ? buildWhatsappLink({ whatsappNumber: offer.whatsappNumber, partName: requestRecord.partName, priceSar: offer.priceSar }) : null,
      createdAtIso: serializeDateValue(offer.createdAt),
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
    statusLabel: localizeRequestStatus(request.status),
    createdAtIso: serializeDateValue(request.createdAt),
    updatedAtIso: serializeDateValue(request.updatedAt),
  }));

  const requestById = new Map(enrichedRequests.map((request) => [request.id, request]));
  const customerRequests = enrichedRequests.filter((request) => request.customerUserId === currentUser.id);
  const supplierRequests = enrichedRequests.filter((request) => request.customerUserId !== currentUser.id);

  const normalizedDamagedCars = allDamagedCars.map((car) => ({
    ...car,
    city: car.location,
    priceSar: car.askingPriceSar,
    description: car.damageDescription,
    imageUrls: safeJsonParse(car.imageUrls),
    owner: userById.get(car.ownerUserId),
    createdAtIso: serializeDateValue(car.createdAt),
    sourceType: "damaged" as const,
  }));

  const normalizedLegacyCars = legacyCars.map((car) => ({
    ...car,
    location: car.city,
    askingPriceSar: car.priceSar,
    damageDescription: car.description ?? car.conditionSummary,
    imageUrls: safeJsonParse(car.imageUrls),
    owner: userById.get(car.ownerUserId),
    createdAtIso: serializeDateValue(car.createdAt),
    sourceType: "legacy" as const,
  }));

  const allCarListings = [...normalizedDamagedCars, ...normalizedLegacyCars].sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });

  const myCars = allCarListings.filter((car) => car.ownerUserId === currentUser.id);
  const publicCars = allCarListings;
  const myOfferIds = allOffers.filter((offer) => offer.supplierUserId === currentUser.id).map((offer) => offer.id);
  const myReviews = allReviews
    .filter((review) => myOfferIds.includes(review.offerId))
    .map((review) => ({
      ...review,
      request: requestById.get(review.requestId),
      createdAtIso: serializeDateValue(review.createdAt),
    }));

  const userNotifications = allNotifications
    .filter((notification) => notification.userId === currentUser.id)
    .map((notification) => ({
      ...notification,
      createdAtIso: serializeDateValue(notification.createdAt),
      readAtIso: serializeDateValue(notification.readAt),
      supplier: userById.get(notification.supplierUserId),
      request: requestById.get(notification.requestId),
    }));

  const unreadNotificationsCount = userNotifications.filter((notification) => !notification.isRead).length;
  const supplierOwnOffers = allOffers.filter((offer) => offer.supplierUserId === currentUser.id);
  const acceptedOffers = supplierOwnOffers.filter((offer) => isAcceptedOfferStatus(offer.status));
  const totalRevenueSar = acceptedOffers.reduce((sum, offer) => sum + offer.priceSar, 0);
  const conversionRate = supplierOwnOffers.length ? Math.round((acceptedOffers.length / supplierOwnOffers.length) * 100) : 100;
  const topBrandStats = summarizeTopItems(supplierRequests.map((request) => request.vehicleBrand));
  const topPartStats = summarizeTopItems(supplierRequests.map((request) => request.partName));
  const salesSeries = buildSalesSeries(acceptedOffers.map((offer) => ({ createdAt: offer.createdAt, value: offer.priceSar })));
  const smartSuggestions = buildSmartSuggestions({
    topBrand: topBrandStats[0]?.label,
    topPart: topPartStats[0]?.label,
    totalOffers: supplierOwnOffers.length,
    acceptedOffers: acceptedOffers.length,
  });

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
    notifications: userNotifications,
    unreadNotificationsCount,
    allowedVehicleTypes: Array.from(ALLOWED_VEHICLE_TYPES),
    allowedCities: Array.from(ALLOWED_CITIES),
    supplierDashboard: {
      acceptedOffersCount: acceptedOffers.length,
      conversionRate,
      totalRevenueSar,
      newRequestsCount: supplierRequests.filter((request) => request.statusLabel === "جديد").length,
      topBrands: topBrandStats,
      topParts: topPartStats,
      salesSeries,
      smartSuggestions,
    },
  };
}
