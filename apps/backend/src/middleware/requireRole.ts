import type { Request, Response, NextFunction } from 'express';
import type { TenantPermission } from '@kredit/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

export type UserRole = string;

function getEffectiveRole(req: Request): string | undefined {
  return req.user?.roleKey ?? req.user?.role;
}

function hasFullAccessRole(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'SUPER_ADMIN';
}

export function userHasPermission(req: Request, permission: TenantPermission): boolean {
  if (hasFullAccessRole(getEffectiveRole(req))) return true;
  return (req.user?.permissions ?? []).includes(permission);
}

function hasRequiredPermission(
  req: Request,
  permissions: readonly TenantPermission[]
): boolean {
  if (hasFullAccessRole(getEffectiveRole(req))) return true;
  const userPermissions = new Set(req.user?.permissions ?? []);
  return permissions.every((permission) => userPermissions.has(permission));
}

/**
 * Require specific role(s) to access a route
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    const role = getEffectiveRole(req);
    if (!roles.includes(role as UserRole)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Legacy helper for OWNER or operations-admin style role.
 */
export const requireAdmin = requireRole('OWNER', 'SUPER_ADMIN', 'OPS_ADMIN');

/**
 * Require OWNER role only
 */
export const requireOwner = requireRole('OWNER');

/**
 * Require every permission in the provided list.
 */
export function requirePermission(...permissions: TenantPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (!hasRequiredPermission(req, permissions)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Require at least one of the provided permissions.
 */
export function requireAnyPermission(...permissions: TenantPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (hasFullAccessRole(getEffectiveRole(req))) {
      next();
      return;
    }

    const userPermissions = new Set(req.user.permissions ?? []);
    if (!permissions.some((permission) => userPermissions.has(permission))) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}
