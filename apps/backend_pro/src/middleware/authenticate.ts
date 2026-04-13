import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';
import { getBetterAuthHeaders, getSessionTokenFromCookie } from '../lib/authCookies.js';
import { prisma } from '../lib/prisma.js';
import { resolveTenantAccess } from '../lib/rbac.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

async function resolveCurrentSession(userId: string, cookieHeader: string | undefined) {
  const sessionToken = getSessionTokenFromCookie(cookieHeader);
  if (sessionToken) {
    const byToken = await prisma.session.findFirst({
      where: {
        token: sessionToken,
        userId,
        expiresAt: { gt: new Date() },
      },
    });
    if (byToken) return byToken;
  }

  return prisma.session.findFirst({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

// User payload structure from Better Auth session with membership
export interface SessionUser {
  userId: string;
  tenantId?: string;
  memberId?: string;
  email: string;
  name: string | null;
  role?: string; // Current tenant role key (OWNER, OPS_ADMIN, etc.)
  roleId?: string | null;
  roleName?: string | null;
  permissions?: string[];
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
      headers: getBetterAuthHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    // Get the active tenant from the session
    // Better Auth stores this in the session table
    const dbSession = await resolveCurrentSession(session.user.id, req.headers.cookie);

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
      include: {
        roleConfig: true,
      },
    });

    if (!membership) {
      throw new ForbiddenError('You do not have access to this tenant');
    }

    if (!membership.isActive) {
      throw new ForbiddenError('Your access to this tenant has been disabled');
    }

    const access = await resolveTenantAccess(prisma, membership);

    // Set user info on request
    req.user = {
      userId: session.user.id,
      tenantId: dbSession.activeTenantId,
      memberId: membership.id,
      email: session.user.email,
      name: session.user.name,
      role: access.roleKey,
      roleId: access.roleId,
      roleName: access.roleName,
      permissions: access.permissions,
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
      headers: getBetterAuthHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    const dbSession = await resolveCurrentSession(session.user.id, req.headers.cookie);

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
        include: {
          roleConfig: true,
        },
      });
      if (membership?.isActive) {
        const access = await resolveTenantAccess(prisma, membership);
        req.user.tenantId = dbSession.activeTenantId;
        req.user.memberId = membership.id;
        req.user.role = access.roleKey;
        req.user.roleId = access.roleId;
        req.user.roleName = access.roleName;
        req.user.permissions = access.permissions;
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
      headers: getBetterAuthHeaders(req.headers),
    });

    if (session?.user) {
      const dbSession = await resolveCurrentSession(session.user.id, req.headers.cookie);

      if (dbSession?.activeTenantId) {
        const membership = await prisma.tenantMember.findUnique({
          where: {
            userId_tenantId: {
              userId: session.user.id,
              tenantId: dbSession.activeTenantId,
            },
          },
          include: {
            roleConfig: true,
          },
        });

        if (membership?.isActive) {
          const access = await resolveTenantAccess(prisma, membership);
          req.user = {
            userId: session.user.id,
            tenantId: dbSession.activeTenantId,
            memberId: membership.id,
            email: session.user.email,
            name: session.user.name,
            role: access.roleKey,
            roleId: access.roleId,
            roleName: access.roleName,
            permissions: access.permissions,
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

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
