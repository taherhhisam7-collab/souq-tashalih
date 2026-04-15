import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  saveUserProfile: vi.fn(),
  getMarketplaceState: vi.fn(),
  createRequestWithImages: vi.fn(),
  createOfferWithImages: vi.fn(),
  createCarSaleWithImages: vi.fn(),
  acceptOffer: vi.fn(),
  completeDeal: vi.fn(),
  createReviewForDeal: vi.fn(),
  markNotificationAsRead: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  getSupabasePublicConfig: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./supabase", () => supabaseMocks);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCaller() {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as TrpcContext["res"],
  };

  return appRouter.createCaller(ctx);
}

describe("marketplace router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.getSupabasePublicConfig.mockReturnValue({
      url: "https://example.supabase.co",
      anonKey: "anon-key-value",
    });
    dbMocks.saveUserProfile.mockResolvedValue({ id: 1, role: "customer" });
    dbMocks.getMarketplaceState.mockResolvedValue({
      currentUser: { id: 1, role: "customer" },
      customerRequests: [],
      supplierRequests: [],
      publicCars: [],
      myCars: [],
      myReviews: [],
      notifications: [],
      unreadNotificationsCount: 0,
      allowedVehicleTypes: ["تويوتا كامري"],
      allowedCities: ["الرياض"],
      supplierDashboard: {
        acceptedOffersCount: 2,
        conversionRate: 40,
        totalRevenueSar: 1350,
        newRequestsCount: 3,
        topBrands: [{ label: "تويوتا كامري", count: 2 }],
        topParts: [{ label: "كمبروسر", count: 1 }],
        salesSeries: {
          daily: [{ label: "اليوم", value: 450 }],
          weekly: [{ label: "هذا الأسبوع", value: 1350 }],
          monthly: [{ label: "هذا الشهر", value: 1350 }],
        },
        smartSuggestions: ["ركّز على قطع تويوتا هذا الأسبوع."],
      },
    });
    dbMocks.createRequestWithImages.mockResolvedValue({ id: 11 });
    dbMocks.createOfferWithImages.mockResolvedValue({ id: 22 });
    dbMocks.createCarSaleWithImages.mockResolvedValue({ id: 33 });
    dbMocks.acceptOffer.mockResolvedValue({ success: true });
    dbMocks.completeDeal.mockResolvedValue({ success: true });
    dbMocks.createReviewForDeal.mockResolvedValue({ id: 44 });
    dbMocks.markNotificationAsRead.mockResolvedValue({ success: true });
  });

  it("returns the public supabase config for the client", async () => {
    const caller = createCaller();

    const result = await caller.marketplace.getPublicConfig();

    expect(result).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key-value",
    });
    expect(supabaseMocks.getSupabasePublicConfig).toHaveBeenCalledTimes(1);
  });

  it("returns marketplace state including supplier dashboard analytics", async () => {
    const caller = createCaller();

    const result = await caller.marketplace.getState({ accessToken: "valid-access-token" });

    expect(dbMocks.getMarketplaceState).toHaveBeenCalledWith("valid-access-token");
    expect(result.allowedVehicleTypes).toEqual(["تويوتا كامري"]);
    expect(result.allowedCities).toEqual(["الرياض"]);
    expect(result.supplierDashboard).toEqual({
      acceptedOffersCount: 2,
      conversionRate: 40,
      totalRevenueSar: 1350,
      newRequestsCount: 3,
      topBrands: [{ label: "تويوتا كامري", count: 2 }],
      topParts: [{ label: "كمبروسر", count: 1 }],
      salesSeries: {
        daily: [{ label: "اليوم", value: 450 }],
        weekly: [{ label: "هذا الأسبوع", value: 1350 }],
        monthly: [{ label: "هذا الشهر", value: 1350 }],
      },
      smartSuggestions: ["ركّز على قطع تويوتا هذا الأسبوع."],
    });
  });

  it("delegates request, offer, car sale and review operations to the data layer", async () => {
    const caller = createCaller();
    const files = [
      {
        dataUrl: "data:image/png;base64,aGVsbG8=",
        fileName: "part.png",
        mimeType: "image/png",
      },
    ];

    await caller.marketplace.createRequest({
      accessToken: "valid-access-token",
      vehicleBrand: "تويوتا",
      vehicleModel: "كامري",
      vehicleYear: 2020,
      partName: "شمعة",
      partDescription: "مطلوبة بحالة ممتازة",
      city: "الرياض",
      files,
    });

    await caller.marketplace.createOffer({
      accessToken: "valid-access-token",
      requestId: 11,
      priceSar: 750,
      partCondition: "used",
      offerDescription: "قطعة أصلية مفكوكة",
      whatsappNumber: "0500000000",
      files,
    });

    await caller.marketplace.createCarSale({
      accessToken: "valid-access-token",
      vehicleBrand: "هيونداي",
      vehicleModel: "2019",
      priceSar: 28000,
      location: "جدة",
      damageDescription: "السيارة متضررة من الجهة الأمامية وتحتاج تغيير رفرف وصدام",
      files,
    });

    await caller.marketplace.createReview({
      accessToken: "valid-access-token",
      requestId: 11,
      offerId: 22,
      qualityRating: 5,
      responseSpeedRating: 4,
      priceRating: 5,
      comment: "التعامل ممتاز وسرعة في التسليم",
    });

    await caller.marketplace.markNotificationRead({
      accessToken: "valid-access-token",
      notificationId: 91,
    });

    expect(dbMocks.createRequestWithImages).toHaveBeenCalledWith({
      accessToken: "valid-access-token",
      vehicleBrand: "تويوتا",
      vehicleModel: "كامري",
      vehicleYear: 2020,
      partName: "شمعة",
      partDescription: "مطلوبة بحالة ممتازة",
      city: "الرياض",
      files,
    });
    expect(dbMocks.createOfferWithImages).toHaveBeenCalledWith({
      accessToken: "valid-access-token",
      requestId: 11,
      priceSar: 750,
      partCondition: "used",
      offerDescription: "قطعة أصلية مفكوكة",
      whatsappNumber: "0500000000",
      files,
    });
    expect(dbMocks.createCarSaleWithImages).toHaveBeenCalledWith({
      accessToken: "valid-access-token",
      vehicleBrand: "هيونداي",
      vehicleModel: "2019",
      priceSar: 28000,
      location: "جدة",
      damageDescription: "السيارة متضررة من الجهة الأمامية وتحتاج تغيير رفرف وصدام",
      files,
    });
    expect(dbMocks.createReviewForDeal).toHaveBeenCalledWith({
      accessToken: "valid-access-token",
      requestId: 11,
      offerId: 22,
      qualityRating: 5,
      responseSpeedRating: 4,
      priceRating: 5,
      comment: "التعامل ممتاز وسرعة في التسليم",
    });
    expect(dbMocks.markNotificationAsRead).toHaveBeenCalledWith({
      accessToken: "valid-access-token",
      notificationId: 91,
    });
  });

  it("rejects invalid marketplace payloads before touching the data layer", async () => {
    const caller = createCaller();

    await expect(
      caller.marketplace.createOffer({
        accessToken: "valid-access-token",
        requestId: 11,
        priceSar: -5,
        partCondition: "used",
        offerDescription: "",
        whatsappNumber: "",
        files: [],
      })
    ).rejects.toThrow();

    expect(dbMocks.createOfferWithImages).not.toHaveBeenCalled();
  });
});
