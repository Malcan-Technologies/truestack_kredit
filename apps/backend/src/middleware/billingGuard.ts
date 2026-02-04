import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { SubscriptionBlockedError, UnauthorizedError } from '../lib/errors.js';

/**
 * Check subscription status and block access if expired
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) {
      return next(new UnauthorizedError());
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId },
    });

    if (!subscription) {
      // No subscription found - allow for now (trial or setup period)
      return next();
    }

    // Check if subscription is blocked
    if (subscription.status === 'BLOCKED') {
      return next(new SubscriptionBlockedError());
    }

    // If in grace period, add headers to inform frontend
    if (subscription.status === 'GRACE_PERIOD') {
      res.setHeader('X-Grace-Period', 'true');
      if (subscription.gracePeriodEnd) {
        res.setHeader('X-Grace-Period-End', subscription.gracePeriodEnd.toISOString());
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}
