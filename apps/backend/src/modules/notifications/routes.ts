import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { NotificationService } from './service.js';

const router = Router();

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// Validation schemas
const sendNotificationSchema = z.object({
  type: z.enum(['email', 'whatsapp']),
  recipient: z.string(),
  subject: z.string().optional(),
  body: z.string(),
});

/**
 * List notifications
 * GET /api/notifications
 */
router.get('/', async (req, res, next) => {
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

/**
 * Send a notification
 * POST /api/notifications
 */
router.post('/', async (req, res, next) => {
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

/**
 * Retry a failed notification
 * POST /api/notifications/:notificationId/retry
 */
router.post('/:notificationId/retry', async (req, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.notificationId,
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
});

export default router;
