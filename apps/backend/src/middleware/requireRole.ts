import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

// Valid role values (stored as strings in Better Auth)
export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF';

/**
 * Require specific role(s) to access a route
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Require OWNER or ADMIN role
 */
export const requireAdmin = requireRole('OWNER', 'ADMIN');

/**
 * Require OWNER role only
 */
export const requireOwner = requireRole('OWNER');
