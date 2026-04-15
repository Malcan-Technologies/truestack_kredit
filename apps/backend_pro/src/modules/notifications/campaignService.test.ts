import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, notifyBorrowerEventMock } = vi.hoisted(() => ({
  prismaMock: {
    borrower: {
      findMany: vi.fn(),
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
    prismaMock.notificationCampaign.findFirst.mockResolvedValue({
      id: 'campaign-1',
      tenantId: 'tenant-1',
      title: 'Manual review update',
      body: 'Your application is still under review.',
      deepLink: '/applications',
      audienceType: 'APPLICANTS',
      channels: ['in_app', 'push'],
      status: 'DRAFT',
    });
    prismaMock.loanApplication.findMany.mockResolvedValue([
      { borrowerId: 'borrower-1' },
      { borrowerId: 'borrower-2' },
    ]);
    prismaMock.notificationCampaign.update.mockResolvedValue({
      id: 'campaign-1',
      status: 'PUBLISHED',
      recipientCount: 2,
    });

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
    expect(result).toEqual({
      id: 'campaign-1',
      status: 'PUBLISHED',
      recipientCount: 2,
    });
  });

  it('adds in_app when publishing a legacy push-only campaign', async () => {
    prismaMock.notificationCampaign.findFirst.mockResolvedValue({
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
    prismaMock.notificationCampaign.update.mockResolvedValue({
      id: 'campaign-2',
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
});
