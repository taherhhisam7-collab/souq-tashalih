import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  acceptOffer,
  completeDeal,
  createCarSaleWithImages,
  createOfferWithImages,
  createRequestWithImages,
  createReviewForDeal,
  getMarketplaceState,
  markNotificationAsRead,
  saveUserProfile,
} from "./db";
import { getSupabasePublicConfig } from "./supabase";

const accessTokenSchema = z.object({
  accessToken: z.string().min(10),
});

const uploadSchema = z.object({
  dataUrl: z.string().min(20),
  fileName: z.string().min(1),
  mimeType: z.string().min(3),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  marketplace: router({
    getPublicConfig: publicProcedure.query(() => getSupabasePublicConfig()),
    bootstrapUser: publicProcedure
      .input(
        accessTokenSchema.extend({
          role: z.enum(["customer", "supplier"]).default("customer"),
        })
      )
      .mutation(({ input }) => saveUserProfile({ accessToken: input.accessToken, role: input.role })),
    getState: publicProcedure.input(accessTokenSchema).query(({ input }) => getMarketplaceState(input.accessToken)),
    saveProfile: publicProcedure
      .input(
        accessTokenSchema.extend({
          role: z.enum(["customer", "supplier"]),
          name: z.string().trim().optional(),
          city: z.string().trim().optional(),
          businessName: z.string().trim().optional(),
          supportedBrands: z.array(z.string().trim()).default([]),
        })
      )
      .mutation(({ input }) =>
        saveUserProfile({
          accessToken: input.accessToken,
          role: input.role,
          name: input.name,
          city: input.city,
          businessName: input.businessName,
          supportedBrands: input.supportedBrands,
        })
      ),
    createRequest: publicProcedure
      .input(
        accessTokenSchema.extend({
          vehicleBrand: z.string().min(1),
          vehicleModel: z.string().min(1),
          vehicleYear: z.number().int().min(1950).max(2050),
          partName: z.string().min(1),
          partDescription: z.string().optional(),
          city: z.string().optional(),
          files: z.array(uploadSchema).default([]),
        })
      )
      .mutation(({ input }) =>
        createRequestWithImages({
          accessToken: input.accessToken,
          vehicleBrand: input.vehicleBrand,
          vehicleModel: input.vehicleModel,
          vehicleYear: input.vehicleYear,
          partName: input.partName,
          partDescription: input.partDescription,
          city: input.city,
          files: input.files,
        })
      ),
    createOffer: publicProcedure
      .input(
        accessTokenSchema.extend({
          requestId: z.number().int().positive(),
          priceSar: z.number().int().positive(),
          partCondition: z.enum(["new", "used", "refurbished"]),
          warranty: z.string().trim().optional(),
          offerDescription: z.string().optional(),
          whatsappNumber: z.string().optional(),
          files: z.array(uploadSchema).default([]),
        })
      )
      .mutation(({ input }) =>
        createOfferWithImages({
          accessToken: input.accessToken,
          requestId: input.requestId,
          priceSar: input.priceSar,
          partCondition: input.partCondition,
          warranty: input.warranty,
          offerDescription: input.offerDescription,
          whatsappNumber: input.whatsappNumber,
          files: input.files,
        })
      ),
    createCarSale: publicProcedure
      .input(
        accessTokenSchema.extend({
          vehicleBrand: z.string().min(1),
          vehicleModel: z.string().min(1),
          priceSar: z.number().int().positive(),
          location: z.string().min(1),
          damageDescription: z.string().min(1),
          files: z.array(uploadSchema).default([]),
        })
      )
      .mutation(({ input }) =>
        createCarSaleWithImages({
          accessToken: input.accessToken,
          vehicleBrand: input.vehicleBrand,
          vehicleModel: input.vehicleModel,
          priceSar: input.priceSar,
          location: input.location,
          damageDescription: input.damageDescription,
          files: input.files,
        })
      ),
    acceptOffer: publicProcedure
      .input(
        accessTokenSchema.extend({
          requestId: z.number().int().positive(),
          offerId: z.number().int().positive(),
        })
      )
      .mutation(({ input }) => acceptOffer(input)),
    completeDeal: publicProcedure
      .input(
        accessTokenSchema.extend({
          requestId: z.number().int().positive(),
          offerId: z.number().int().positive(),
        })
      )
      .mutation(({ input }) => completeDeal(input)),
    createReview: publicProcedure
      .input(
        accessTokenSchema.extend({
          requestId: z.number().int().positive(),
          offerId: z.number().int().positive(),
          qualityRating: z.number().int().min(1).max(5),
          responseSpeedRating: z.number().int().min(1).max(5),
          priceRating: z.number().int().min(1).max(5),
          comment: z.string().optional(),
        })
      )
      .mutation(({ input }) =>
        createReviewForDeal({
          accessToken: input.accessToken,
          requestId: input.requestId,
          offerId: input.offerId,
          qualityRating: input.qualityRating,
          responseSpeedRating: input.responseSpeedRating,
          priceRating: input.priceRating,
          comment: input.comment,
        })
      ),
    markNotificationRead: publicProcedure
      .input(
        accessTokenSchema.extend({
          notificationId: z.number().int().positive(),
        })
      )
      .mutation(({ input }) =>
        markNotificationAsRead({
          accessToken: input.accessToken,
          notificationId: input.notificationId,
        })
      ),
  }),
});

export type AppRouter = typeof appRouter;
