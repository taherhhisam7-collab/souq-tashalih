import { describe, expect, it, vi } from "vitest";
import {
  publishMarketplaceNotification,
  subscribeToMarketplaceNotifications,
  type MarketplaceNotificationPayload,
} from "./marketplaceNotifications";

describe("marketplaceNotifications", () => {
  const payload: MarketplaceNotificationPayload = {
    id: 17,
    userId: 21,
    requestId: 44,
    offerId: 73,
    supplierUserId: 9,
    type: "new_offer",
    title: "وصل عرض جديد على طلبك",
    body: "أرسل مورد عرضاً جديداً على طلب الرديتر.",
    isRead: 0,
    createdAt: new Date("2026-04-15T08:30:00.000Z").toISOString(),
  };

  it("delivers published notifications to subscribers of the same user", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceNotifications(payload.userId, listener);

    publishMarketplaceNotification(payload);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);

    unsubscribe();
  });

  it("stops delivering notifications after unsubscribe is called", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceNotifications(payload.userId, listener);

    unsubscribe();
    publishMarketplaceNotification(payload);

    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates notifications by target user channel", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketplaceNotifications(999, listener);

    publishMarketplaceNotification(payload);

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
