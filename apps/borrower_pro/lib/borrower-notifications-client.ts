import {
  createNotificationsApiClient,
  type BorrowerNotificationItem,
  type BorrowerNotificationsPagination,
  type BorrowerPushDevice,
  type RegisterBorrowerPushDevicePayload,
} from "@kredit/borrower";

export type {
  BorrowerNotificationChannel,
  BorrowerNotificationDelivery,
  BorrowerNotificationItem,
  BorrowerNotificationsPagination,
  BorrowerPushDevice,
  RegisterBorrowerPushDevicePayload,
} from "@kredit/borrower";

/** Fired when the notifications inbox list or read state changes (same tab). Header bell listens to refetch unread count. */
export const BORROWER_NOTIFICATIONS_INBOX_UPDATED_EVENT = "borrower-notifications-inbox-updated";

export function notifyBorrowerNotificationsInboxUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BORROWER_NOTIFICATIONS_INBOX_UPDATED_EVENT));
}

const BASE = "/api/proxy/borrower-auth";

const notificationsApi = createNotificationsApiClient(BASE, async (url, init) =>
  fetch(url, {
    credentials: "include",
    ...init,
  })
);

export async function listBorrowerNotifications(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{
  success: boolean;
  data: BorrowerNotificationItem[];
  unreadCount: number;
  pagination: BorrowerNotificationsPagination;
}> {
  return notificationsApi.listBorrowerNotifications(params);
}

export async function markBorrowerNotificationRead(
  notificationId: string
): Promise<{ success: boolean; data: BorrowerNotificationItem }> {
  return notificationsApi.markBorrowerNotificationRead(notificationId);
}

export async function markAllBorrowerNotificationsRead(): Promise<{
  success: boolean;
  message: string;
}> {
  return notificationsApi.markAllBorrowerNotificationsRead();
}

export async function registerBorrowerPushDevice(
  payload: RegisterBorrowerPushDevicePayload
): Promise<{ success: boolean; data: BorrowerPushDevice }> {
  return notificationsApi.registerPushDevice(payload);
}

export async function revokeBorrowerPushDeviceByToken(token: string): Promise<{
  success: boolean;
  message: string;
}> {
  return notificationsApi.revokePushDeviceByToken(token);
}
