import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * The template uses openId for authentication identity. For phone-auth users,
 * we can persist a derived openId such as `firebase:{uid}` while keeping the same contract.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 128 }).notNull().unique(),
  supabaseUserId: varchar("supabaseUserId", { length: 128 }).unique(),
  phoneNumber: varchar("phoneNumber", { length: 32 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "customer", "supplier"]).default("customer").notNull(),
  city: varchar("city", { length: 128 }),
  avatarUrl: text("avatarUrl"),
  businessName: varchar("businessName", { length: 255 }),
  supportedBrands: text("supportedBrands"),
  isProfileCompleted: int("isProfileCompleted").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const requests = mysqlTable("requests", {
  id: int("id").autoincrement().primaryKey(),
  customerUserId: int("customerUserId").notNull(),
  vehicleBrand: varchar("vehicleBrand", { length: 128 }).notNull(),
  vehicleModel: varchar("vehicleModel", { length: 128 }).notNull(),
  vehicleYear: int("vehicleYear").notNull(),
  partName: varchar("partName", { length: 255 }).notNull(),
  partDescription: text("partDescription"),
  partImageUrls: text("partImageUrls"),
  city: varchar("city", { length: 128 }),
  status: mysqlEnum("status", ["pending", "offered", "accepted", "completed", "cancelled", "rejected"]).default("pending").notNull(),
  acceptedOfferId: int("acceptedOfferId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const offers = mysqlTable("offers", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  supplierUserId: int("supplierUserId").notNull(),
  priceSar: int("priceSar").notNull(),
  partCondition: mysqlEnum("partCondition", ["new", "used", "refurbished"]).default("used").notNull(),
  offerDescription: text("offerDescription"),
  offerImageUrls: text("offerImageUrls"),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "completed", "withdrawn"]).default("pending").notNull(),
  whatsappNumber: varchar("whatsappNumber", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const carsForSale = mysqlTable("carsForSale", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  vehicleBrand: varchar("vehicleBrand", { length: 128 }).notNull(),
  vehicleModel: varchar("vehicleModel", { length: 128 }).notNull(),
  vehicleYear: int("vehicleYear").notNull(),
  conditionSummary: varchar("conditionSummary", { length: 255 }).notNull(),
  priceSar: int("priceSar").notNull(),
  city: varchar("city", { length: 128 }),
  description: text("description"),
  imageUrls: text("imageUrls"),
  status: mysqlEnum("status", ["draft", "published", "sold", "archived"]).default("published").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  offerId: int("offerId").notNull(),
  reviewerUserId: int("reviewerUserId").notNull(),
  supplierUserId: int("supplierUserId").notNull(),
  rating: int("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = typeof offers.$inferInsert;

export type CarForSale = typeof carsForSale.$inferSelect;
export type InsertCarForSale = typeof carsForSale.$inferInsert;

export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;
