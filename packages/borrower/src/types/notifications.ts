export type BorrowerNotificationChannel = 'email' | 'in_app' | 'push';

export interface BorrowerNotificationDelivery {
  id: string;
  tenantId: string;
  borrowerId: string | null;
  borrowerNotificationId: string | null;
  channel: BorrowerNotificationChannel;
  provider: string | null;
  providerMessageId: string | null;
  tokenSnapshot: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BorrowerNotificationItem {
  id: string;
  tenantId: string;
  borrowerId: string;
  category: string;
  notificationKey: string;
  title: string;
  body: string;
  deepLink: string | null;
  sourceType: string | null;
  sourceId: string | null;
  metadata?: Record<string, unknown> | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on list responses; may be omitted on partial updates unless the API includes relations. */
  deliveries?: BorrowerNotificationDelivery[];
}

export interface BorrowerNotificationsPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BorrowerNotificationsListResponse {
  success: boolean;
  data: BorrowerNotificationItem[];
  unreadCount: number;
  pagination: BorrowerNotificationsPagination;
}

export interface RegisterBorrowerPushDevicePayload {
  token: string;
  platform: string;
  appId?: string;
  deviceName?: string;
}

export interface BorrowerPushDevice {
  id: string;
  tenantId: string;
  borrowerId: string;
  userId: string | null;
  token: string;
  platform: string;
  provider: string;
  appId: string | null;
  deviceName: string | null;
  isActive: boolean;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
