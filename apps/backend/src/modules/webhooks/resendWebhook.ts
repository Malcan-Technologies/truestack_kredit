/**
 * Resend Webhook Handler
 *
 * POST /api/webhooks/resend
 *
 * Public endpoint — verified via Svix signature (ALWAYS required).
 * Receives delivery status events from Resend and updates EmailLog records.
 *
 * Required Resend dashboard events:
 *   - email.sent
 *   - email.delivered
 *   - email.bounced
 *   - email.delivery_delayed
 *   - email.complained
 *
 * Safety features:
 *   - Svix signature verification is mandatory (no dev bypass)
 *   - Status precedence prevents out-of-order event overwrites
 *   - Uses payload timestamps for accurate event timing
 */

import { Router } from 'express';
import { Webhook } from 'svix';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';

const router = Router();

// Map Resend event types to EmailLog status values
const EVENT_STATUS_MAP: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.delivery_delayed': 'delayed',
  'email.complained': 'complained',
};

// Status precedence — higher rank = more "final" state.
// Prevents out-of-order events from overwriting a more final status.
// e.g. a delayed event arriving after delivered should be ignored.
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  bounced: 4,
  complained: 5,
  failed: 6,
};

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Bounce-specific fields
    bounce?: {
      message: string;
    };
  };
}

/**
 * POST /api/webhooks/resend
 *
 * This route is registered BEFORE express.json() in index.ts with express.raw(),
 * so req.body is a raw Buffer. We verify the Svix signature against the raw body
 * then parse the JSON ourselves.
 */
router.post('/', async (req, res) => {
  try {
    // req.body is a Buffer from express.raw({ type: 'application/json' })
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    // ──────────────────────────────────────────
    // 1) Svix signature verification (MANDATORY)
    // ──────────────────────────────────────────
    const webhookSecret = config.notifications.resendWebhookSecret;

    if (!webhookSecret) {
      console.error('[Webhook/Resend] RESEND_WEBHOOK_SECRET is not configured — rejecting request');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const svixId = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[Webhook/Resend] Missing Svix headers');
      res.status(400).json({ error: 'Missing webhook signature headers' });
      return;
    }

    const wh = new Webhook(webhookSecret);
    try {
      wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (verifyError) {
      console.error('[Webhook/Resend] Signature verification failed:', verifyError);
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    // ──────────────────────────────────────────
    // 2) Parse payload
    // ──────────────────────────────────────────
    const payload: ResendWebhookPayload = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
    const eventType = payload.type;
    const emailId = payload.data?.email_id;

    console.log(`[Webhook/Resend] Received event: ${eventType} for email_id: ${emailId}`);

    if (!emailId) {
      console.warn('[Webhook/Resend] No email_id in payload');
      res.status(200).json({ received: true });
      return;
    }

    const newStatus = EVENT_STATUS_MAP[eventType];
    if (!newStatus) {
      console.log(`[Webhook/Resend] Ignoring unhandled event type: ${eventType}`);
      res.status(200).json({ received: true });
      return;
    }

    // ──────────────────────────────────────────
    // 3) Find the EmailLog by resendMessageId
    // ──────────────────────────────────────────
    const emailLog = await prisma.emailLog.findFirst({
      where: { resendMessageId: emailId },
    });

    if (!emailLog) {
      console.warn(`[Webhook/Resend] No EmailLog found for resendMessageId: ${emailId}`);
      res.status(200).json({ received: true });
      return;
    }

    // ──────────────────────────────────────────
    // 4) Idempotency / ordering safety
    // ──────────────────────────────────────────
    const currentRank = STATUS_RANK[emailLog.status] ?? -1;
    const newRank = STATUS_RANK[newStatus] ?? -1;

    if (newRank <= currentRank) {
      console.log(`[Webhook/Resend] Ignoring out-of-order event: ${emailLog.status}(${currentRank}) -> ${newStatus}(${newRank}) for EmailLog ${emailLog.id}`);
      res.status(200).json({ received: true });
      return;
    }

    // ──────────────────────────────────────────
    // 5) Build update data using payload timestamps
    // ──────────────────────────────────────────
    const eventAt = payload.created_at ? new Date(payload.created_at) : new Date();

    const updateData: Record<string, unknown> = {
      status: newStatus,
      lastEventAt: eventAt,
    };

    if (newStatus === 'delivered') {
      updateData.deliveredAt = eventAt;
    }

    if (newStatus === 'bounced' || newStatus === 'complained') {
      updateData.failureReason = payload.data.bounce?.message || `Email ${newStatus}`;
    }

    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: updateData,
    });

    console.log(`[Webhook/Resend] Updated EmailLog ${emailLog.id}: ${emailLog.status} -> ${newStatus}`);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook/Resend] Error processing webhook:', error);
    // Always return 200 to avoid Resend retrying on our errors
    res.status(200).json({ received: true, error: 'Internal processing error' });
  }
});

export default router;
