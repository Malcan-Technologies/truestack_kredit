import { Prisma, type EmailLog } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { NotificationChannel } from './catalog.js';
import { getNotificationDefinition } from './catalog.js';
import { PushService } from './pushService.js';
import { getNotificationChannelState } from './settings.js';

type DeliveryLogRow = Prisma.BorrowerNotificationDeliveryGetPayload<{
  include: {
    borrowerNotification: {
      select: {
        title: true;
        body: true;
        notificationKey: true;
        sourceType: true;
      };
    };
    borrower: {
      select: {
        id: true;
        name: true;
        companyName: true;
        borrowerType: true;
      };
    };
  };
}>;

type DeliveryLogItem = {
  id: string;
  channel: string;
  channels?: string[];
  status: string;
  notificationType: string;
  title: string;
  body: string | null;
  notificationKey: string;
  recipient: string | null;
  borrowerId: string | null;
  borrowerName: string | null;
  provider: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  errorMessage: string | null;
  isGroupedBroadcast?: boolean;
  recipientCount?: number;
  audienceType?: string | null;
};

type GroupedCampaignDeliveryRow = {
  id: string;
  title: string;
  body: string;
  notificationKey: string;
  audienceType: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  channels: string[];
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  pendingCount: number;
  sentCount: number;
};

function resolvePushChannelId(category: string): string {
  return category === 'announcements'
    ? 'borrower-announcements'
    : 'borrower-alerts';
}

function summarizeGroupedDeliveryStatus(row: GroupedCampaignDeliveryRow): string {
  const total =
    row.deliveredCount + row.failedCount + row.pendingCount + row.sentCount;

  if (total === 0) {
    return 'pending';
  }

  if (row.failedCount === total) {
    return 'failed';
  }

  if (row.deliveredCount === total) {
    return 'delivered';
  }

  if (row.pendingCount === total) {
    return 'pending';
  }

  if (row.sentCount === total) {
    return 'sent';
  }

  return 'partial';
}

export interface NotifyBorrowerEventInput {
  tenantId: string;
  borrowerId: string;
  notificationKey: string;
  category: string;
  title: string;
  body: string;
  deepLink?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  channelOverrides?: Partial<Record<NotificationChannel, boolean>>;
}

export class NotificationOrchestrator {
  static async notifyBorrowerEvent(input: NotifyBorrowerEventInput) {
    const definition = getNotificationDefinition(input.notificationKey);
    if (!definition) {
      throw new BadRequestError(`Unknown notification key "${input.notificationKey}".`);
    }

    const channelState = await getNotificationChannelState(input.tenantId, input.notificationKey);
    const effectiveChannels: Record<NotificationChannel, boolean> = {
      email:
        input.channelOverrides && 'email' in input.channelOverrides
          ? channelState.email && Boolean(input.channelOverrides.email)
          : channelState.email,
      in_app:
        input.channelOverrides && 'in_app' in input.channelOverrides
          ? channelState.in_app && Boolean(input.channelOverrides.in_app)
          : channelState.in_app,
      push:
        input.channelOverrides && 'push' in input.channelOverrides
          ? channelState.push && Boolean(input.channelOverrides.push)
          : channelState.push,
    };
    /** Push is an add-on: OS alerts only make sense alongside the shared borrower inbox (web + mobile list). */
    if (effectiveChannels.push) {
      effectiveChannels.in_app = true;
    }
    const shouldPersistNotification = effectiveChannels.in_app || effectiveChannels.push;

    if (!shouldPersistNotification) {
      return null;
    }

    const notification = await prisma.borrowerNotification.create({
      data: {
        tenantId: input.tenantId,
        borrowerId: input.borrowerId,
        category: input.category,
        notificationKey: input.notificationKey,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        ...(input.metadata
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (effectiveChannels.in_app) {
      await prisma.borrowerNotificationDelivery.create({
        data: {
          tenantId: input.tenantId,
          borrowerId: input.borrowerId,
          borrowerNotificationId: notification.id,
          channel: 'in_app',
          provider: 'system',
          status: 'delivered',
          sentAt: new Date(),
          deliveredAt: new Date(),
        },
      });
    }

    if (effectiveChannels.push) {
      const devices = await prisma.borrowerPushDevice.findMany({
        where: {
          tenantId: input.tenantId,
          borrowerId: input.borrowerId,
          isActive: true,
          revokedAt: null,
        },
      });

      for (const device of devices) {
        const result = await PushService.send({
          to: device.token,
          title: input.title,
          body: input.body,
          channelId: resolvePushChannelId(input.category),
          data: {
            notificationId: notification.id,
            deepLink: input.deepLink ?? null,
            category: input.category,
            sourceType: input.sourceType ?? null,
            sourceId: input.sourceId ?? null,
          },
        });

        if (
          !result.success &&
          (result.errorCode === 'DeviceNotRegistered' ||
            result.errorCode === 'InvalidPushTokenFormat')
        ) {
          await prisma.borrowerPushDevice.update({
            where: { id: device.id },
            data: {
              isActive: false,
              revokedAt: new Date(),
            },
          });
        }

        await prisma.borrowerNotificationDelivery.create({
          data: {
            tenantId: input.tenantId,
            borrowerId: input.borrowerId,
            borrowerNotificationId: notification.id,
            channel: 'push',
            provider: device.provider,
            providerMessageId: result.providerMessageId ?? null,
            tokenSnapshot: device.token,
            status: result.success ? 'delivered' : 'failed',
            errorMessage: result.errorMessage ?? null,
            sentAt: new Date(),
            deliveredAt: result.success ? new Date() : null,
          },
        });
      }
    }

    return notification;
  }

  static async listBorrowerNotifications(params: {
    tenantId: string;
    borrowerId: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const [items, total, unreadCount] = await Promise.all([
      prisma.borrowerNotification.findMany({
        where: {
          tenantId: params.tenantId,
          borrowerId: params.borrowerId,
          archivedAt: null,
        },
        include: {
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.borrowerNotification.count({
        where: {
          tenantId: params.tenantId,
          borrowerId: params.borrowerId,
          archivedAt: null,
        },
      }),
      prisma.borrowerNotification.count({
        where: {
          tenantId: params.tenantId,
          borrowerId: params.borrowerId,
          archivedAt: null,
          readAt: null,
        },
      }),
    ]);

    return {
      items,
      unreadCount,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  static async markBorrowerNotificationRead(params: {
    tenantId: string;
    borrowerId: string;
    notificationId: string;
  }) {
    const notification = await prisma.borrowerNotification.findFirst({
      where: {
        id: params.notificationId,
        tenantId: params.tenantId,
        borrowerId: params.borrowerId,
      },
    });

    if (!notification) {
      throw new NotFoundError('Notification');
    }

    return prisma.borrowerNotification.update({
      where: { id: notification.id },
      data: {
        readAt: notification.readAt ?? new Date(),
      },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  static async markAllBorrowerNotificationsRead(params: {
    tenantId: string;
    borrowerId: string;
  }) {
    await prisma.borrowerNotification.updateMany({
      where: {
        tenantId: params.tenantId,
        borrowerId: params.borrowerId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  static async registerPushDevice(params: {
    tenantId: string;
    borrowerId: string;
    userId: string;
    token: string;
    platform: string;
    appId?: string | null;
    deviceName?: string | null;
  }) {
    const normalizedToken = params.token.trim();

    return prisma.borrowerPushDevice.upsert({
      where: {
        tenantId_token: {
          tenantId: params.tenantId,
          token: normalizedToken,
        },
      },
      update: {
        borrowerId: params.borrowerId,
        userId: params.userId,
        platform: params.platform,
        appId: params.appId ?? null,
        deviceName: params.deviceName ?? null,
        isActive: true,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        tenantId: params.tenantId,
        borrowerId: params.borrowerId,
        userId: params.userId,
        token: normalizedToken,
        platform: params.platform,
        appId: params.appId ?? null,
        deviceName: params.deviceName ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  static async revokePushDevice(params: {
    tenantId: string;
    borrowerId: string;
    deviceId: string;
  }) {
    const device = await prisma.borrowerPushDevice.findFirst({
      where: {
        id: params.deviceId,
        tenantId: params.tenantId,
        borrowerId: params.borrowerId,
      },
    });

    if (!device) {
      throw new NotFoundError('Push device');
    }

    return prisma.borrowerPushDevice.update({
      where: { id: device.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  static async revokePushDevicesForBorrower(params: {
    tenantId: string;
    borrowerId: string;
    token?: string | null;
  }) {
    const normalizedToken = params.token?.trim();

    await prisma.borrowerPushDevice.updateMany({
      where: {
        tenantId: params.tenantId,
        borrowerId: params.borrowerId,
        ...(normalizedToken ? { token: normalizedToken } : {}),
        revokedAt: null,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  static async listNotificationDeliveries(params: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    channel?: string;
    status?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const includeEmailLogs = !params.channel || params.channel === 'email';

    const statusEmailSql = params.status
      ? Prisma.sql`AND el."status" = ${params.status}`
      : Prisma.sql``;
    const statusDeliverySql = params.status
      ? Prisma.sql`AND d."status" = ${params.status}`
      : Prisma.sql``;
    const channelDeliverySql = params.channel
      ? Prisma.sql`AND d."channel" = ${params.channel}`
      : Prisma.sql``;
    const nonCampaignDeliverySql = Prisma.sql`
      AND (
        bn.id IS NULL
        OR bn."sourceType" IS DISTINCT FROM 'CAMPAIGN'
        OR bn."sourceId" IS NULL
      )
    `;
    const campaignDeliverySql = Prisma.sql`
      AND bn."sourceType" = 'CAMPAIGN'
      AND bn."sourceId" IS NOT NULL
    `;

    const emailBranchSql = includeEmailLogs
      ? Prisma.sql`
          SELECT 'email'::text AS kind, el.id::text AS id, el."createdAt"
          FROM "EmailLog" el
          WHERE el."tenantId" = ${params.tenantId}
          ${statusEmailSql}
        `
      : Prisma.sql`
          SELECT 'email'::text AS kind, el.id::text AS id, el."createdAt"
          FROM "EmailLog" el
          WHERE false
        `;

    const nonCampaignDeliveryBranchSql = Prisma.sql`
      SELECT 'delivery'::text AS kind, d.id::text AS id, d."createdAt"
      FROM "BorrowerNotificationDelivery" d
      LEFT JOIN "BorrowerNotification" bn ON bn.id = d."borrowerNotificationId"
      WHERE d."tenantId" = ${params.tenantId}
      ${statusDeliverySql}
      ${channelDeliverySql}
      ${nonCampaignDeliverySql}
    `;
    const groupedCampaignBranchSql = Prisma.sql`
      SELECT 'campaign'::text AS kind, bn."sourceId"::text AS id, MAX(d."createdAt") AS "createdAt"
      FROM "BorrowerNotificationDelivery" d
      INNER JOIN "BorrowerNotification" bn ON bn.id = d."borrowerNotificationId"
      WHERE d."tenantId" = ${params.tenantId}
      ${statusDeliverySql}
      ${channelDeliverySql}
      ${campaignDeliverySql}
      GROUP BY bn."sourceId"
    `;

    const [emailCount, nonCampaignDeliveryCountRows, groupedCampaignCountRows, mergedRefs] =
      await Promise.all([
        includeEmailLogs
          ? prisma.emailLog.count({
              where: {
                tenantId: params.tenantId,
                ...(params.status ? { status: params.status } : {}),
              },
            })
          : Promise.resolve(0),
        prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "BorrowerNotificationDelivery" d
          LEFT JOIN "BorrowerNotification" bn ON bn.id = d."borrowerNotificationId"
          WHERE d."tenantId" = ${params.tenantId}
          ${statusDeliverySql}
          ${channelDeliverySql}
          ${nonCampaignDeliverySql}
        `),
        prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(DISTINCT bn."sourceId")::int AS count
          FROM "BorrowerNotificationDelivery" d
          INNER JOIN "BorrowerNotification" bn ON bn.id = d."borrowerNotificationId"
          WHERE d."tenantId" = ${params.tenantId}
          ${statusDeliverySql}
          ${channelDeliverySql}
          ${campaignDeliverySql}
        `),
        prisma.$queryRaw<Array<{ kind: string; id: string; createdAt: Date }>>(
          Prisma.sql`
            SELECT *
            FROM (
              ${emailBranchSql}
              UNION ALL
              ${nonCampaignDeliveryBranchSql}
              UNION ALL
              ${groupedCampaignBranchSql}
            ) AS merged
            ORDER BY merged."createdAt" DESC, merged.kind ASC, merged.id DESC
            LIMIT ${pageSize} OFFSET ${skip}
          `,
        ),
      ]);

    const nonCampaignDeliveryCount = nonCampaignDeliveryCountRows[0]?.count ?? 0;
    const groupedCampaignCount = groupedCampaignCountRows[0]?.count ?? 0;
    const total = emailCount + nonCampaignDeliveryCount + groupedCampaignCount;

    const emailIds = mergedRefs.filter((r) => r.kind === 'email').map((r) => r.id);
    const deliveryIds = mergedRefs.filter((r) => r.kind === 'delivery').map((r) => r.id);
    const campaignIds = mergedRefs.filter((r) => r.kind === 'campaign').map((r) => r.id);

    const [emailRows, deliveryRows, groupedCampaignRows] = await Promise.all([
      emailIds.length > 0
        ? prisma.emailLog.findMany({
            where: { tenantId: params.tenantId, id: { in: emailIds } },
          })
        : Promise.resolve<EmailLog[]>([]),
      deliveryIds.length > 0
        ? prisma.borrowerNotificationDelivery.findMany({
            where: { tenantId: params.tenantId, id: { in: deliveryIds } },
            include: {
              borrowerNotification: {
                select: {
                  title: true,
                  notificationKey: true,
                },
              },
              borrower: {
                select: {
                  id: true,
                  name: true,
                  companyName: true,
                  borrowerType: true,
                },
              },
            },
          })
        : Promise.resolve<DeliveryLogRow[]>([]),
      campaignIds.length > 0
        ? prisma.$queryRaw<Array<GroupedCampaignDeliveryRow>>(Prisma.sql`
            SELECT
              bn."sourceId"::text AS id,
              MAX(bn.title)::text AS title,
              MAX(bn.body)::text AS body,
              MAX(bn."notificationKey")::text AS "notificationKey",
              MAX(nc."audienceType")::text AS "audienceType",
              MAX(d."createdAt") AS "createdAt",
              MAX(d."sentAt") AS "sentAt",
              MAX(d."deliveredAt") AS "deliveredAt",
              ARRAY_AGG(DISTINCT d.channel) AS channels,
              COUNT(DISTINCT COALESCE(d."borrowerId", bn."borrowerId"))::int AS "recipientCount",
              COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS "deliveredCount",
              COUNT(*) FILTER (WHERE d.status = 'failed')::int AS "failedCount",
              COUNT(*) FILTER (WHERE d.status = 'pending')::int AS "pendingCount",
              COUNT(*) FILTER (WHERE d.status = 'sent')::int AS "sentCount"
            FROM "BorrowerNotificationDelivery" d
            INNER JOIN "BorrowerNotification" bn ON bn.id = d."borrowerNotificationId"
            LEFT JOIN "NotificationCampaign" nc ON nc.id = bn."sourceId"
            WHERE d."tenantId" = ${params.tenantId}
            AND bn."sourceId" IN (${Prisma.join(campaignIds)})
            ${statusDeliverySql}
            ${channelDeliverySql}
            ${campaignDeliverySql}
            GROUP BY bn."sourceId"
          `)
        : Promise.resolve<GroupedCampaignDeliveryRow[]>([]),
    ]);

    const emailById = new Map<string, EmailLog>(emailRows.map((row) => [row.id, row]));
    const deliveryById = new Map<string, DeliveryLogRow>(
      deliveryRows.map((row): [string, DeliveryLogRow] => [row.id, row]),
    );
    const groupedCampaignById = new Map<string, GroupedCampaignDeliveryRow>(
      groupedCampaignRows.map((row): [string, GroupedCampaignDeliveryRow] => [row.id, row]),
    );

    const items = mergedRefs
      .map((ref) => {
        if (ref.kind === 'email') {
          const row = emailById.get(ref.id);
          if (!row) {
            return null;
          }

          const item: DeliveryLogItem = {
            id: `email:${row.id}`,
            channel: 'email',
            channels: ['email'],
            status: row.status,
            notificationType: 'System automated',
            title: row.subject,
            body: null,
            notificationKey: row.emailType.toLowerCase(),
            recipient: row.recipientEmail,
            borrowerId: row.borrowerId,
            borrowerName: row.recipientName,
            provider: 'resend',
            providerMessageId: row.resendMessageId,
            createdAt: row.createdAt,
            sentAt: row.sentAt,
            deliveredAt: row.deliveredAt,
            errorMessage: row.failureReason,
            recipientCount: 1,
          };

          return item;
        }

        if (ref.kind === 'campaign') {
          const row = groupedCampaignById.get(ref.id);
          if (!row) {
            return null;
          }

          const channels = [...row.channels].sort();
          const item: DeliveryLogItem = {
            id: `campaign:${row.id}`,
            channel: channels[0] ?? 'in_app',
            channels,
            status: summarizeGroupedDeliveryStatus(row),
            notificationType: 'Broadcast',
            title: row.title,
            body: row.body,
            notificationKey: row.notificationKey,
            recipient: null,
            borrowerId: null,
            borrowerName: null,
            provider: null,
            providerMessageId: null,
            createdAt: row.createdAt,
            sentAt: row.sentAt,
            deliveredAt: row.deliveredAt,
            errorMessage: null,
            isGroupedBroadcast: true,
            recipientCount: row.recipientCount,
            audienceType: row.audienceType,
          };

          return item;
        }

        const row = deliveryById.get(ref.id);
        if (!row) {
          return null;
        }

        const item: DeliveryLogItem = {
          id: `delivery:${row.id}`,
          channel: row.channel,
          channels: [row.channel],
          status: row.status,
          notificationType: 'System automated',
          title: row.borrowerNotification?.title ?? row.channel,
          body: row.borrowerNotification?.body ?? null,
          notificationKey: row.borrowerNotification?.notificationKey ?? row.channel,
          recipient: row.tokenSnapshot,
          borrowerId: row.borrowerId,
          borrowerName:
            row.borrower?.borrowerType === 'CORPORATE' && row.borrower.companyName
              ? row.borrower.companyName
              : row.borrower?.name ?? null,
          provider: row.provider,
          providerMessageId: row.providerMessageId,
          createdAt: row.createdAt,
          sentAt: row.sentAt,
          deliveredAt: row.deliveredAt,
          errorMessage: row.errorMessage,
          recipientCount: row.borrowerId ? 1 : undefined,
        };

        return item;
      })
      .filter((row): row is DeliveryLogItem => row !== null);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}

