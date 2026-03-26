import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { SubscriptionBlockedError, UnauthorizedError } from '../lib/errors.js';

/**
 * Pro product has no SaaS subscription record. Block only when the tenant org is not operational.
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

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { status: true },
    });

    if (!tenant) {
      return next(new UnauthorizedError());
    }

    if (tenant.status === 'BLOCKED' || tenant.status === 'SUSPENDED') {
      return next(new SubscriptionBlockedError('This organization is not available. Please contact support.'));
    }

    next();
  } catch (error) {
    next(error);
  }
}

/** Full product access for licensed Pro tenants (no FREE vs PAID gating). */
export async function requirePaidSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return requireActiveSubscription(req, res, next);
}
