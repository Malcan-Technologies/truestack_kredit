import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { requireAnyPermission, requirePermission } from '../../middleware/requireRole.js';
import { NotificationService } from './service.js';
import { TrueSendService } from './trueSendService.js';
import { NotificationCampaignService } from './campaignService.js';
import { NOTIFICATION_AUDIENCE_OPTIONS, type NotificationAudienceType } from './catalog.js';
import { NotificationOrchestrator } from './orchestrator.js';
import { getNotificationSettings, updateNotificationSettings } from './settings.js';
import { AuditService } from '../compliance/auditService.js';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

const sendNotificationSchema = z.object({
  type: z.enum(['email', 'whatsapp']),
  recipient: z.string(),
  subject: z.string().optional(),
  body: z.string(),
});

const updateNotificationSettingsSchema = z.object({
  automations: z.array(
    z.object({
      key: z.string().min(1),
      channels: z.record(z.string(), z.boolean()),
    }),
  ),
  truesend: z
    .object({
      paymentReminderDays: z.array(z.number().int().min(0)).min(1),
      latePaymentNoticeDays: z.array(z.number().int().min(1)).min(1),
    })
    .optional(),
});

const createCampaignSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  deepLink: z.string().trim().optional().or(z.literal('')),
  audienceType: z.enum(
    NOTIFICATION_AUDIENCE_OPTIONS.map((option) => option.value) as [
      NotificationAudienceType,
      ...NotificationAudienceType[],
    ],
  ),
  channels: z.array(z.enum(['in_app', 'push'])).min(1),
});

router.get(
  '/settings',
  requireAnyPermission('notifications.view', 'notifications.manage_settings', 'truesend.view', 'truesend.manage'),
  async (req, res, next) => {
    try {
      const settings = await getNotificationSettings(req.tenantId!);
      res.json({
        success: true,
        data: {
          ...settings,
          audiences: NOTIFICATION_AUDIENCE_OPTIONS,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/settings',
  requireAnyPermission('notifications.manage_settings', 'truesend.manage'),
  async (req, res, next) => {
    try {
      const payload = updateNotificationSettingsSchema.parse(req.body);
      const previous = await getNotificationSettings(req.tenantId!);
      const updated = await updateNotificationSettings({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        automations: payload.automations.map((automation) => ({
          key: automation.key,
          channels: Object.fromEntries(
            Object.entries(automation.channels).map(([channel, enabled]) => [
              channel,
              enabled === true,
            ]),
          ),
        })),
        truesend: payload.truesend,
      });

      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'NOTIFICATION_SETTINGS_UPDATED',
        entityType: 'Tenant',
        entityId: req.tenantId!,
        previousData: previous,
        newData: updated,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        success: true,
        data: {
          ...updated,
          audiences: NOTIFICATION_AUDIENCE_OPTIONS,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/campaigns',
  requireAnyPermission('notifications.view', 'notifications.send_broadcast'),
  async (req, res, next) => {
    try {
      const campaigns = await NotificationCampaignService.listCampaigns(req.tenantId!);
      res.json({
        success: true,
        data: campaigns,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/campaigns',
  requirePermission('notifications.send_broadcast'),
  async (req, res, next) => {
    try {
      const payload = createCampaignSchema.parse(req.body);
      const campaign = await NotificationCampaignService.createDraft({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        title: payload.title,
        body: payload.body,
        deepLink: payload.deepLink?.trim() || null,
        audienceType: payload.audienceType,
        channels: payload.channels,
      });

      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'NOTIFICATION_CAMPAIGN_CREATED',
        entityType: 'NotificationCampaign',
        entityId: campaign.id,
        newData: campaign,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/campaigns/:campaignId/publish',
  requirePermission('notifications.send_broadcast'),
  async (req, res, next) => {
    try {
      const campaign = await NotificationCampaignService.publishCampaign({
        tenantId: req.tenantId!,
        campaignId: req.params.campaignId as string,
      });

      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'NOTIFICATION_CAMPAIGN_PUBLISHED',
        entityType: 'NotificationCampaign',
        entityId: campaign.id,
        newData: campaign,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/campaigns/:campaignId/cancel',
  requirePermission('notifications.send_broadcast'),
  async (req, res, next) => {
    try {
      const campaign = await NotificationCampaignService.cancelCampaign({
        tenantId: req.tenantId!,
        campaignId: req.params.campaignId as string,
      });

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deliveries',
  requireAnyPermission('notifications.view_logs', 'notifications.view', 'truesend.view'),
  async (req, res, next) => {
    try {
      const page = Number.parseInt(String(req.query.page ?? '1'), 10) || 1;
      const pageSize = Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20;
      const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const result = await NotificationOrchestrator.listNotificationDeliveries({
        tenantId: req.tenantId!,
        page,
        pageSize,
        channel,
        status,
      });

      res.json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/', requireAnyPermission('notifications.view', 'truesend.view'), async (req, res, next) => {
  try {
    const { status, type, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(status && { status: status as string }),
      ...(type && { type: type as string }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAnyPermission('notifications.send_broadcast', 'truesend.manage'), async (req, res, next) => {
  try {
    const data = sendNotificationSchema.parse(req.body);

    const notification = await NotificationService.send({
      tenantId: req.tenantId!,
      type: data.type,
      recipient: data.recipient,
      subject: data.subject,
      body: data.body,
    });

    res.status(201).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:notificationId/retry',
  requireAnyPermission('notifications.manage_settings', 'truesend.manage'),
  async (req, res, next) => {
    try {
      const notificationId = req.params.notificationId as string;
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          tenantId: req.tenantId,
          status: 'failed',
        },
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found or not in failed state',
        });
      }

      const updated = await NotificationService.retry(notification.id);

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/truesend/:id/resend',
  requireAnyPermission('notifications.manage_settings', 'truesend.manage'),
  async (req, res, next) => {
    try {
      const notificationId = req.params.id as string;
      const result = await TrueSendService.resendEmail(notificationId, req.tenantId!);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.message,
        });
        return;
      }

      res.json({
        success: true,
        data: { message: result.message },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
