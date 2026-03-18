/**
 * Kredit referral paid status webhook (Admin -> Kredit)
 *
 * POST /api/webhooks/kredit/referral-paid
 *
 * Receives paid status updates for referrals from Admin.
 * Uses HMAC signature verification and idempotent processing.
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { verifyCallbackSignature } from '../trueidentity/signature.js';

const router = Router();

type ReferralPaidPayload = {
  event?: string;
  referral_id?: string;
  referrer_user_id?: string;
  paid?: boolean;
  paid_at?: string;
  decided_by?: string;
};

router.post('/', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
  const signatureHeader = req.headers['x-trueidentity-signature'] as string | undefined;
  const timestampHeader = req.headers['x-trueidentity-timestamp'] as string | undefined;
  const secret = config.trueIdentity.callbackWebhookSecret;

  const failEvent = async (idempotencyKey: string | null, errorMessage: string) => {
    if (!idempotencyKey) return;
    await prisma.trueIdentityWebhookEvent.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        rawPayload: rawBody as unknown as object,
        signatureHeader: signatureHeader ?? null,
        timestampHeader: timestampHeader ?? null,
        status: 'FAILED',
        errorMessage,
      },
      update: {
        status: 'FAILED',
        errorMessage,
      },
    });
  };

  try {
    if (!secret) {
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const valid = verifyCallbackSignature(
      rawBody,
      signatureHeader,
      secret,
      timestampHeader,
      config.trueIdentity.timestampMaxAgeMs
    );
    if (!valid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let payload: ReferralPaidPayload;
    try {
      payload = JSON.parse(rawBody) as ReferralPaidPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    if (payload.event !== 'referral.paid') {
      res.status(200).json({ ok: true, skipped: 'wrong event' });
      return;
    }

    if (!payload.referral_id || !payload.referrer_user_id) {
      res.status(400).json({ error: 'referral_id and referrer_user_id are required' });
      return;
    }

    const idempotencyKey = `referral.paid:${payload.referral_id}:${payload.paid_at ?? ''}`;
    const existingEvent = await prisma.trueIdentityWebhookEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existingEvent?.status === 'PROCESSED') {
      res.status(200).json({ ok: true, processed: 'idempotent' });
      return;
    }

    if (!existingEvent) {
      await prisma.trueIdentityWebhookEvent.create({
        data: {
          idempotencyKey,
          rawPayload: payload as object,
          signatureHeader: signatureHeader ?? null,
          timestampHeader: timestampHeader ?? null,
          status: 'PENDING',
        },
      });
    }

    // Find the referral
    const referral = await prisma.referral.findUnique({
      where: { id: payload.referral_id },
      include: {
        referrer: {
          select: { id: true, email: true, name: true },
        },
        referredUser: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!referral) {
      await failEvent(idempotencyKey, `Unknown referral_id: ${payload.referral_id}`);
      res.status(404).json({ error: 'Referral not found' });
      return;
    }

    // Verify referrer matches
    if (referral.referrerUserId !== payload.referrer_user_id) {
      await failEvent(idempotencyKey, 'Referrer user ID mismatch');
      res.status(400).json({ error: 'Referrer user ID does not match' });
      return;
    }

    // Check if already paid
    if (referral.isPaid) {
      await prisma.trueIdentityWebhookEvent.update({
        where: { idempotencyKey },
        data: { status: 'PROCESSED', processedAt: new Date(), errorMessage: null },
      });
      res.status(200).json({ ok: true, processed: 'idempotent', alreadyPaid: true });
      return;
    }

    // Check eligibility
    if (!referral.isEligible) {
      await failEvent(idempotencyKey, 'Referral is not eligible for payout');
      res.status(400).json({ error: 'Referral is not eligible for payout' });
      return;
    }

    const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();

    // Update the referral as paid
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        isPaid: true,
        paidAt,
      },
    });

    await prisma.trueIdentityWebhookEvent.update({
      where: { idempotencyKey },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    res.status(200).json({
      ok: true,
      data: {
        id: referral.id,
        isPaid: true,
        paidAt: paidAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Webhook/KreditReferralPaid] Error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
