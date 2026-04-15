import { Router } from 'express';
import { z } from 'zod';
import { requireBorrowerSession } from '../../middleware/authenticateBorrower.js';
import { requireActiveBorrower } from '../borrower-auth/borrowerContext.js';
import { NotificationOrchestrator } from '../notifications/orchestrator.js';

const router = Router();

router.use(requireBorrowerSession);

const registerPushDeviceSchema = z.object({
  token: z.string().min(1),
  platform: z.string().min(1),
  appId: z.string().trim().optional().or(z.literal('')),
  deviceName: z.string().trim().optional().or(z.literal('')),
});

const revokePushDeviceSchema = z.object({
  token: z.string().min(1),
});

router.get('/notifications', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const page = Number.parseInt(String(req.query.page ?? '1'), 10) || 1;
    const pageSize = Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20;

    const result = await NotificationOrchestrator.listBorrowerNotifications({
      tenantId: tenant.id,
      borrowerId,
      page,
      pageSize,
    });

    res.json({
      success: true,
      data: result.items,
      unreadCount: result.unreadCount,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/read-all', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    await NotificationOrchestrator.markAllBorrowerNotificationsRead({
      tenantId: tenant.id,
      borrowerId,
    });

    res.json({
      success: true,
      message: 'Notifications marked as read.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/:notificationId/read', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const updated = await NotificationOrchestrator.markBorrowerNotificationRead({
      tenantId: tenant.id,
      borrowerId,
      notificationId: req.params.notificationId as string,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/push-devices', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const payload = registerPushDeviceSchema.parse(req.body);
    const device = await NotificationOrchestrator.registerPushDevice({
      tenantId: tenant.id,
      borrowerId,
      userId: req.borrowerUser!.userId,
      token: payload.token,
      platform: payload.platform,
      appId: payload.appId?.trim() || null,
      deviceName: payload.deviceName?.trim() || null,
    });

    res.status(201).json({
      success: true,
      data: device,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/push-devices/revoke', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const payload = revokePushDeviceSchema.parse(req.body);
    await NotificationOrchestrator.revokePushDevicesForBorrower({
      tenantId: tenant.id,
      borrowerId,
      token: payload.token,
    });

    res.json({
      success: true,
      message: 'Push device revoked.',
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/push-devices/:deviceId', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const updated = await NotificationOrchestrator.revokePushDevice({
      tenantId: tenant.id,
      borrowerId,
      deviceId: req.params.deviceId as string,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

