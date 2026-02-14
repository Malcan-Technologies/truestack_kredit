import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

// User payload structure from Better Auth session with membership
export interface SessionUser {
  userId: string;
  tenantId?: string;
  memberId?: string;
  email: string;
  name: string | null;
  role?: string; // Role in the current tenant (when tenant is set)
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      tenantId?: string;
      memberId?: string;
    }
  }
}

/**
 * Authenticate user via Better Auth session
 * Uses Better Auth's getSession to verify the signed cookie
 * Then gets membership for the active tenant from our database
 */
export async function authenticateToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // Use Better Auth to verify the session from cookies
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    // Get the active tenant from the session
    // Better Auth stores this in the session table
    const dbSession = await prisma.session.findFirst({
      where: { 
        userId: session.user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!dbSession) {
      throw new UnauthorizedError('Session not found');
    }

    // Check if user is active
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true },
    });

    if (!user?.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    // Check if session has an active tenant
    if (!dbSession.activeTenantId) {
      throw new UnauthorizedError('No active tenant. Please select a tenant.');
    }

    // Get user's membership in the active tenant
    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId: dbSession.activeTenantId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError('You do not have access to this tenant');
    }

    if (!membership.isActive) {
      throw new ForbiddenError('Your access to this tenant has been disabled');
    }

    // Set user info on request
    req.user = {
      userId: session.user.id,
      tenantId: dbSession.activeTenantId,
      memberId: membership.id,
      email: session.user.email,
      name: session.user.name,
      role: membership.role,
    };
    req.tenantId = dbSession.activeTenantId;
    req.memberId = membership.id;
    
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      next(error);
    } else {
      console.error('[Auth] Session verification error:', error);
      next(new UnauthorizedError('Invalid or expired session'));
    }
  }
}

/**
 * Require valid session but NOT an active tenant.
 * Use for routes that must be logged-in but work without a tenant (e.g. POST /tenants/create).
 */
export async function requireSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    const dbSession = await prisma.session.findFirst({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!dbSession) {
      throw new UnauthorizedError('Session not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true },
    });

    if (!user?.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    req.user = {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };

    if (dbSession.activeTenantId) {
      const membership = await prisma.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId: session.user.id,
            tenantId: dbSession.activeTenantId,
          },
        },
      });
      if (membership?.isActive) {
        req.user.tenantId = dbSession.activeTenantId;
        req.user.memberId = membership.id;
        req.user.role = membership.role;
        req.tenantId = dbSession.activeTenantId;
        req.memberId = membership.id;
      }
    }

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      next(error);
    } else {
      console.error('[Auth] Session verification error:', error);
      next(new UnauthorizedError('Invalid or expired session'));
    }
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session?.user) {
      const dbSession = await prisma.session.findFirst({
        where: { 
          userId: session.user.id,
          expiresAt: { gt: new Date() },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (dbSession?.activeTenantId) {
        const membership = await prisma.tenantMember.findUnique({
          where: {
            userId_tenantId: {
              userId: session.user.id,
              tenantId: dbSession.activeTenantId,
            },
          },
        });

        if (membership?.isActive) {
          req.user = {
            userId: session.user.id,
            tenantId: dbSession.activeTenantId,
            memberId: membership.id,
            email: session.user.email,
            name: session.user.name,
            role: membership.role,
          };
          req.tenantId = dbSession.activeTenantId;
          req.memberId = membership.id;
        }
      }
    }
  } catch {
    // Ignore errors - authentication is optional
  }
  
  next();
}

/**
 * Require specific roles (checks role in current tenant)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
