import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, getNotificationChannelStateMock, pushSendMock } = vi.hoisted(
  () => ({
    prismaMock: {
      $queryRaw: vi.fn(),
      borrowerNotification: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      borrowerNotificationDelivery: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      borrowerPushDevice: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      emailLog: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    },
    getNotificationChannelStateMock: vi.fn(),
    pushSendMock: vi.fn(),
  })
);

vi.mock('../../lib/prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('./settings.js', () => ({
  getNotificationChannelState: getNotificationChannelStateMock,
}));

vi.mock('./pushService.js', () => ({
  PushService: {
    send: pushSendMock,
  },
}));

import { NotificationOrchestrator } from './orchestrator.js';

describe('NotificationOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fans out borrower events to in-app and push channels', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: false,
      in_app: true,
      push: true,
    });
    prismaMock.borrowerNotification.create.mockResolvedValue({
      id: 'notification-1',
    });
    prismaMock.borrowerPushDevice.findMany.mockResolvedValue([
      {
        id: 'device-1',
        token: 'ExponentPushToken[test-token]',
        provider: 'expo',
      },
    ]);
    pushSendMock.mockResolvedValue({
      success: true,
      providerMessageId: 'expo-message-1',
    });

    await NotificationOrchestrator.notifyBorrowerEvent({
      tenantId: 'tenant-1',
      borrowerId: 'borrower-1',
      notificationKey: 'announcement_broadcast',
      category: 'announcements',
      title: 'Notice',
      body: 'System maintenance tonight.',
      deepLink: '/loans',
    });

    expect(prismaMock.borrowerNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        borrowerId: 'borrower-1',
        notificationKey: 'announcement_broadcast',
        title: 'Notice',
      }),
    });
    expect(prismaMock.borrowerNotificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(pushSendMock).toHaveBeenCalledWith({
      to: 'ExponentPushToken[test-token]',
      title: 'Notice',
      body: 'System maintenance tonight.',
      channelId: 'borrower-announcements',
      data: {
        notificationId: 'notification-1',
        deepLink: '/loans',
        category: 'announcements',
        sourceType: null,
        sourceId: null,
      },
    });
  });

  it('treats push as requiring in-app: push-only overrides still create in-app delivery', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: false,
      in_app: true,
      push: true,
    });
    prismaMock.borrowerNotification.create.mockResolvedValue({
      id: 'notification-push-only',
    });
    prismaMock.borrowerPushDevice.findMany.mockResolvedValue([
      {
        id: 'device-1',
        token: 'ExponentPushToken[test-token]',
        provider: 'expo',
      },
    ]);
    pushSendMock.mockResolvedValue({ success: true, providerMessageId: 'expo-1' });

    await NotificationOrchestrator.notifyBorrowerEvent({
      tenantId: 'tenant-1',
      borrowerId: 'borrower-1',
      notificationKey: 'announcement_broadcast',
      category: 'announcements',
      title: 'Notice',
      body: 'Hello',
      channelOverrides: { in_app: false, push: true },
    });

    expect(prismaMock.borrowerNotificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.borrowerNotificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'in_app' }),
      }),
    );
    expect(prismaMock.borrowerNotificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'push' }),
      }),
    );
  });

  it('scopes borrower notification listing by tenant and borrower', async () => {
    prismaMock.borrowerNotification.findMany.mockResolvedValue([]);
    prismaMock.borrowerNotification.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const result = await NotificationOrchestrator.listBorrowerNotifications({
      tenantId: 'tenant-1',
      borrowerId: 'borrower-1',
      page: 2,
      pageSize: 10,
    });

    expect(prismaMock.borrowerNotification.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        borrowerId: 'borrower-1',
        archivedAt: null,
      },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result.unreadCount).toBe(3);
    expect(result.pagination).toEqual({
      total: 0,
      page: 2,
      pageSize: 10,
      totalPages: 0,
    });
  });

  it('groups broadcast deliveries into a single admin log row', async () => {
    prismaMock.emailLog.count.mockResolvedValue(0);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([
        {
          kind: 'campaign',
          id: 'campaign-1',
          createdAt: new Date('2026-04-15T11:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'campaign-1',
          title: 'Maintenance window',
          body: 'Tonight from 11 PM to 1 AM.',
          notificationKey: 'announcement_broadcast',
          audienceType: 'ALL_BORROWERS',
          createdAt: new Date('2026-04-15T11:00:00.000Z'),
          sentAt: new Date('2026-04-15T11:00:01.000Z'),
          deliveredAt: new Date('2026-04-15T11:00:02.000Z'),
          channels: ['push', 'in_app'],
          recipientCount: 42,
          deliveredCount: 84,
          failedCount: 0,
          pendingCount: 0,
          sentCount: 0,
        },
      ]);

    const result = await NotificationOrchestrator.listNotificationDeliveries({
      tenantId: 'tenant-1',
      page: 1,
      pageSize: 15,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'campaign:campaign-1',
        title: 'Maintenance window',
        body: 'Tonight from 11 PM to 1 AM.',
        notificationKey: 'announcement_broadcast',
        notificationType: 'Broadcast',
        isGroupedBroadcast: true,
        recipientCount: 42,
        audienceType: 'ALL_BORROWERS',
        status: 'delivered',
        channels: ['in_app', 'push'],
      }),
    ]);
    expect(result.pagination).toEqual({
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });
  });
});
