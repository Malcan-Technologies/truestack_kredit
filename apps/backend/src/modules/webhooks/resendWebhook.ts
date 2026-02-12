/**
 * Resend Webhook Handler
 *
 * POST /api/webhooks/resend
 *
 * Public endpoint (no auth middleware) — verified via Svix signature.
 * Receives delivery status events from Resend and updates EmailLog records.
 *
 * Required Resend dashboard events:
 *   - email.sent
 *   - email.delivered
 *   - email.bounced
 *   - email.delivery_delayed
 *   - email.complained
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
 * IMPORTANT: This route must receive the raw body for signature verification.
 * The main app uses express.json() globally, so we need to parse the raw body
 * from the already-parsed JSON. Svix verification works on the stringified payload.
 */
router.post('/', async (req, res) => {
  try {
    const webhookSecret = config.notifications.resendWebhookSecret;

    if (!webhookSecret) {
      console.warn('[Webhook/Resend] No RESEND_WEBHOOK_SECRET configured — skipping verification');
      // In development, process without verification
    } else {
      // Verify Svix signature
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
        wh.verify(JSON.stringify(req.body), {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        });
      } catch (verifyError) {
        console.error('[Webhook/Resend] Signature verification failed:', verifyError);
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    const payload = req.body as ResendWebhookPayload;
    const eventType = payload.type;
    const emailId = payload.data?.email_id;

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

    // Find the EmailLog by resendMessageId
    const emailLog = await prisma.emailLog.findFirst({
      where: { resendMessageId: emailId },
    });

    if (!emailLog) {
      console.warn(`[Webhook/Resend] No EmailLog found for resendMessageId: ${emailId}`);
      res.status(200).json({ received: true });
      return;
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      status: newStatus,
      lastEventAt: new Date(),
    };

    if (newStatus === 'delivered') {
      updateData.deliveredAt = new Date();
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
