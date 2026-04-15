import { EventEmitter } from "node:events";

export type MarketplaceNotificationPayload = {
  id: number;
  userId: number;
  requestId: number;
  offerId: number;
  supplierUserId: number;
  type: "new_offer";
  title: string;
  body: string | null;
  isRead: number;
  createdAt: string;
};

const marketplaceNotificationsEmitter = new EventEmitter();
marketplaceNotificationsEmitter.setMaxListeners(250);

function getUserChannel(userId: number) {
  return `marketplace-notifications:${userId}`;
}

export function publishMarketplaceNotification(payload: MarketplaceNotificationPayload) {
  marketplaceNotificationsEmitter.emit(getUserChannel(payload.userId), payload);
}

export function subscribeToMarketplaceNotifications(
  userId: number,
  listener: (payload: MarketplaceNotificationPayload) => void
) {
  const channel = getUserChannel(userId);
  marketplaceNotificationsEmitter.on(channel, listener);
  return () => marketplaceNotificationsEmitter.off(channel, listener);
}
