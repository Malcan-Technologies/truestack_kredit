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

    if (subscription.status === 'CANCELLED') {
      return next(new SubscriptionBlockedError('Subscription has been cancelled'));
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

/**
 * Check tenant subscription status and block access if FREE
 * This is for feature access control (FREE vs PAID)
 */
export async function requirePaidSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) {
      return next(new UnauthorizedError());
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { subscriptionStatus: true },
    });

    if (!tenant || tenant.subscriptionStatus === 'FREE') {
      return next(new SubscriptionBlockedError('Upgrade to access this feature'));
    }

    if (tenant.subscriptionStatus === 'SUSPENDED') {
      return next(new SubscriptionBlockedError('Your account is suspended. Please contact support.'));
    }

    if (tenant.subscriptionStatus === 'OVERDUE') {
      res.setHeader('X-Overdue', 'true');
    }

    next();
  } catch (error) {
    next(error);
  }
}
