import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, notifyBorrowerEventMock } = vi.hoisted(() => ({
  prismaMock: {
    borrower: {
      findMany: vi.fn(),
    },
    borrowerNotification: {
      findFirst: vi.fn(),
    },
    loan: {
      findMany: vi.fn(),
    },
    loanApplication: {
      findMany: vi.fn(),
    },
    notificationCampaign: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  notifyBorrowerEventMock: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('./orchestrator.js', () => ({
  NotificationOrchestrator: {
    notifyBorrowerEvent: notifyBorrowerEventMock,
  },
}));

import { NotificationCampaignService } from './campaignService.js';

describe('NotificationCampaignService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats pending L2 applications as applicants when publishing campaigns', async () => {
    prismaMock.notificationCampaign.findFirst
      .mockResolvedValueOnce({
        id: 'campaign-1',
        tenantId: 'tenant-1',
        title: 'Manual review update',
        body: 'Your application is still under review.',
        deepLink: '/applications',
        audienceType: 'APPLICANTS',
        channels: ['in_app', 'push'],
        status: 'DRAFT',
      })
      .mockResolvedValueOnce({
        id: 'campaign-1',
        tenantId: 'tenant-1',
        title: 'Manual review update',
        body: 'Your application is still under review.',
        deepLink: '/applications',
        audienceType: 'APPLICANTS',
        channels: ['in_app', 'push'],
        status: 'PUBLISHED',
        recipientCount: 2,
      });
    prismaMock.loanApplication.findMany.mockResolvedValue([
      { borrowerId: 'borrower-1' },
      { borrowerId: 'borrower-2' },
    ]);
    prismaMock.notificationCampaign.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue(null);

    const result = await NotificationCampaignService.publishCampaign({
      tenantId: 'tenant-1',
      campaignId: 'campaign-1',
    });

    expect(prismaMock.loanApplication.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        status: {
          in: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_L2_APPROVAL'],
        },
      },
      select: { borrowerId: true },
      distinct: ['borrowerId'],
    });
    expect(prismaMock.notificationCampaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'campaign-1',
        tenantId: 'tenant-1',
        status: 'DRAFT',
      },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        recipientCount: 2,
        publishedAt: expect.any(Date),
      }),
    });
    expect(prismaMock.borrowerNotification.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-1',
        borrowerId: 'borrower-1',
        sourceType: 'CAMPAIGN',
        sourceId: 'campaign-1',
      },
      select: { id: true },
    });
    expect(notifyBorrowerEventMock).toHaveBeenCalledTimes(2);
    expect(notifyBorrowerEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: 'tenant-1',
        borrowerId: 'borrower-1',
        notificationKey: 'announcement_broadcast',
        channelOverrides: { in_app: true, push: true },
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'campaign-1',
        status: 'PUBLISHED',
        recipientCount: 2,
      })
    );
  });

  it('adds in_app when publishing a legacy push-only campaign', async () => {
    prismaMock.notificationCampaign.findFirst.mockResolvedValueOnce({
      id: 'campaign-2',
      tenantId: 'tenant-1',
      title: 'Push only',
      body: 'Test',
      deepLink: null,
      audienceType: 'ALL_BORROWERS',
      channels: ['push'],
      status: 'DRAFT',
    });
    prismaMock.borrower.findMany.mockResolvedValue([{ id: 'borrower-1' }]);
    prismaMock.notificationCampaign.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue(null);
    prismaMock.notificationCampaign.findFirst.mockResolvedValueOnce({
      id: 'campaign-2',
      tenantId: 'tenant-1',
      status: 'PUBLISHED',
      recipientCount: 1,
    });

    await NotificationCampaignService.publishCampaign({
      tenantId: 'tenant-1',
      campaignId: 'campaign-2',
    });

    expect(notifyBorrowerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelOverrides: { in_app: true, push: true },
        metadata: expect.objectContaining({
          channels: expect.arrayContaining(['in_app', 'push']),
        }),
      }),
    );
  });

  it('returns the already-published campaign when another request wins the publish race', async () => {
    prismaMock.notificationCampaign.findFirst
      .mockResolvedValueOnce({
        id: 'campaign-3',
        tenantId: 'tenant-1',
        title: 'Race',
        body: 'Test',
        deepLink: null,
        audienceType: 'ALL_BORROWERS',
        channels: ['in_app'],
        status: 'DRAFT',
      })
      .mockResolvedValueOnce({
        id: 'campaign-3',
        tenantId: 'tenant-1',
        title: 'Race',
        body: 'Test',
        deepLink: null,
        audienceType: 'ALL_BORROWERS',
        channels: ['in_app'],
        status: 'PUBLISHED',
        recipientCount: 1,
      });
    prismaMock.borrower.findMany.mockResolvedValue([{ id: 'borrower-1' }]);
    prismaMock.notificationCampaign.updateMany.mockResolvedValue({ count: 0 });

    const result = await NotificationCampaignService.publishCampaign({
      tenantId: 'tenant-1',
      campaignId: 'campaign-3',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'campaign-3',
        status: 'PUBLISHED',
        recipientCount: 1,
      })
    );
    expect(notifyBorrowerEventMock).not.toHaveBeenCalled();
    expect(prismaMock.borrowerNotification.findFirst).not.toHaveBeenCalled();
  });

  it('skips borrowers already notified for the campaign', async () => {
    prismaMock.notificationCampaign.findFirst
      .mockResolvedValueOnce({
        id: 'campaign-4',
        tenantId: 'tenant-1',
        title: 'No duplicate',
        body: 'Test',
        deepLink: null,
        audienceType: 'ALL_BORROWERS',
        channels: ['in_app'],
        status: 'DRAFT',
      })
      .mockResolvedValueOnce({
        id: 'campaign-4',
        tenantId: 'tenant-1',
        title: 'No duplicate',
        body: 'Test',
        deepLink: null,
        audienceType: 'ALL_BORROWERS',
        channels: ['in_app'],
        status: 'PUBLISHED',
        recipientCount: 2,
      });
    prismaMock.borrower.findMany.mockResolvedValue([
      { id: 'borrower-1' },
      { id: 'borrower-2' },
    ]);
    prismaMock.notificationCampaign.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.borrowerNotification.findFirst
      .mockResolvedValueOnce({ id: 'existing-notification' })
      .mockResolvedValueOnce(null);

    await NotificationCampaignService.publishCampaign({
      tenantId: 'tenant-1',
      campaignId: 'campaign-4',
    });

    expect(notifyBorrowerEventMock).toHaveBeenCalledTimes(1);
    expect(notifyBorrowerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        borrowerId: 'borrower-2',
        sourceType: 'CAMPAIGN',
        sourceId: 'campaign-4',
      })
    );
  });
});
