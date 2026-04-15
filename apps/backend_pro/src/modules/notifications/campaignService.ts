import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { NotificationAudienceType } from './catalog.js';
import { NotificationOrchestrator } from './orchestrator.js';

async function resolveAudienceBorrowerIds(tenantId: string, audienceType: NotificationAudienceType): Promise<string[]> {
  if (audienceType === 'ALL_BORROWERS') {
    const borrowers = await prisma.borrower.findMany({
      where: { tenantId },
      select: { id: true },
    });
    return borrowers.map((borrower) => borrower.id);
  }

  if (audienceType === 'ACTIVE_BORROWERS') {
    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: {
          in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT', 'ACTIVE', 'IN_ARREARS'],
        },
      },
      select: { borrowerId: true },
      distinct: ['borrowerId'],
    });
    return loans.map((loan) => loan.borrowerId);
  }

  if (audienceType === 'OVERDUE_BORROWERS') {
    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: {
          in: ['IN_ARREARS', 'DEFAULTED'],
        },
      },
      select: { borrowerId: true },
      distinct: ['borrowerId'],
    });
    return loans.map((loan) => loan.borrowerId);
  }

  const applications = await prisma.loanApplication.findMany({
    where: {
      tenantId,
      status: {
        in: ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_L2_APPROVAL'],
      },
    },
    select: { borrowerId: true },
    distinct: ['borrowerId'],
  });
  return applications.map((application) => application.borrowerId);
}

export class NotificationCampaignService {
  static async listCampaigns(tenantId: string) {
    return prisma.notificationCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createDraft(params: {
    tenantId: string;
    memberId?: string | null;
    title: string;
    body: string;
    deepLink?: string | null;
    audienceType: NotificationAudienceType;
    channels: string[];
  }) {
    const channels = [...new Set(params.channels)].filter((channel) =>
      channel === 'in_app' || channel === 'push',
    );
    if (channels.includes('push') && !channels.includes('in_app')) {
      channels.push('in_app');
    }

    if (channels.length === 0) {
      throw new BadRequestError('Select at least one delivery channel.');
    }

    return prisma.notificationCampaign.create({
      data: {
        tenantId: params.tenantId,
        title: params.title.trim(),
        body: params.body.trim(),
        deepLink: params.deepLink?.trim() || null,
        audienceType: params.audienceType,
        channels,
        createdByMemberId: params.memberId ?? null,
      },
    });
  }

  static async publishCampaign(params: {
    tenantId: string;
    campaignId: string;
  }) {
    const campaign = await prisma.notificationCampaign.findFirst({
      where: {
        id: params.campaignId,
        tenantId: params.tenantId,
      },
    });

    if (!campaign) {
      throw new NotFoundError('Notification campaign');
    }

    if (campaign.status === 'PUBLISHED') {
      return campaign;
    }

    if (campaign.status === 'CANCELLED') {
      throw new BadRequestError('Cancelled campaigns cannot be published.');
    }

    const borrowerIds = await resolveAudienceBorrowerIds(
      params.tenantId,
      campaign.audienceType as NotificationAudienceType,
    );

    const campaignChannels = [...campaign.channels];
    if (campaignChannels.includes('push') && !campaignChannels.includes('in_app')) {
      campaignChannels.push('in_app');
    }

    for (const borrowerId of borrowerIds) {
      await NotificationOrchestrator.notifyBorrowerEvent({
        tenantId: params.tenantId,
        borrowerId,
        notificationKey: 'announcement_broadcast',
        category: 'announcements',
        title: campaign.title,
        body: campaign.body,
        deepLink: campaign.deepLink,
        sourceType: 'CAMPAIGN',
        sourceId: campaign.id,
        metadata: {
          audienceType: campaign.audienceType,
          channels: campaignChannels,
        },
        channelOverrides: {
          in_app: campaignChannels.includes('in_app'),
          push: campaignChannels.includes('push'),
        },
      });
    }

    return prisma.notificationCampaign.update({
      where: { id: campaign.id },
      data: {
        status: 'PUBLISHED',
        recipientCount: borrowerIds.length,
        publishedAt: new Date(),
      },
    });
  }

  static async cancelCampaign(params: {
    tenantId: string;
    campaignId: string;
  }) {
    const campaign = await prisma.notificationCampaign.findFirst({
      where: {
        id: params.campaignId,
        tenantId: params.tenantId,
      },
    });

    if (!campaign) {
      throw new NotFoundError('Notification campaign');
    }

    return prisma.notificationCampaign.update({
      where: { id: campaign.id },
      data: {
        status: 'CANCELLED',
      },
    });
  }
}

