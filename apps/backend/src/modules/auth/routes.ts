import { Router } from 'express';
import { z } from 'zod';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../lib/auth.js';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { getOrCreateReferralCode } from '../../lib/referral.js';
// @ts-ignore - better-auth crypto module
import { hashPassword, verifyPassword } from 'better-auth/crypto';

const router = Router();

// Helper to parse device type from user agent
function parseDeviceType(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) {
    if (/ipad|tablet/i.test(ua)) return 'Tablet';
    return 'Mobile';
  }
  return 'Desktop';
}

// Helper to get client IP
function getClientIp(req: any): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

// Validate password strength
function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  return { valid: errors.length === 0, errors };
}

/**
 * Get user's tenant memberships (for tenant switcher)
 * GET /api/auth/memberships
 * 
 * This endpoint doesn't require an active tenant - it just needs a valid session
 */
router.get('/memberships', async (req, res, next) => {
  try {
    // Use Better Auth to verify the session
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    // Get the database session to find activeTenantId
    const dbSession = await prisma.session.findFirst({
      where: { 
        userId: session.user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Get all active memberships for this user (with subscription and add-ons for profile)
    const memberships = await prisma.tenantMember.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            subscription: {
              select: {
                plan: true,
                status: true,
                currentPeriodEnd: true,
                gracePeriodEnd: true,
              },
            },
            addOns: {
              select: { addOnType: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: {
        memberships: memberships.map((m) => ({
          id: m.id,
          tenantId: m.tenant.id,
          tenantName: m.tenant.name,
          tenantSlug: m.tenant.slug,
          tenantStatus: m.tenant.status,
          tenantLogoUrl: m.tenant.logoUrl,
          role: m.role,
          subscription: m.tenant.subscription
            ? {
                plan: m.tenant.subscription.plan,
                status: m.tenant.subscription.status,
                currentPeriodEnd: m.tenant.subscription.currentPeriodEnd.toISOString(),
                gracePeriodEnd: m.tenant.subscription.gracePeriodEnd?.toISOString() ?? null,
              }
            : null,
          addOns: m.tenant.addOns?.map((a) => ({ addOnType: a.addOnType, status: a.status })) ?? [],
        })),
        activeTenantId: dbSession?.activeTenantId || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Switch active tenant
 * POST /api/auth/switch-tenant
 */
router.post('/switch-tenant', async (req, res, next) => {
  try {
    // Use Better Auth to verify the session
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    const { tenantId } = z.object({ tenantId: z.string() }).parse(req.body);

    // Get the database session
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

    // Verify user has membership in this tenant
    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId: session.user.id,
          tenantId,
        },
      },
      include: {
        tenant: true,
      },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenError('You do not have access to this tenant');
    }

    if (membership.tenant.status !== 'ACTIVE') {
      throw new ForbiddenError('This tenant is not active');
    }

    // Update session with new active tenant
    await prisma.session.update({
      where: { id: dbSession.id },
      data: { activeTenantId: tenantId },
    });

    res.json({
      success: true,
      data: {
        activeTenantId: tenantId,
        tenantName: membership.tenant.name,
        tenantSlug: membership.tenant.slug,
        role: membership.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get current user info with current membership
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        referrer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // If user has no active tenant, return user info only
    if (!req.user!.tenantId) {
      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: null,
            createdAt: user.createdAt.toISOString(),
            referrer: user.referrer
              ? { id: user.referrer.id, name: user.referrer.name, email: user.referrer.email }
              : null,
          },
          tenant: null,
        },
      });
    }

    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId: req.user!.userId,
          tenantId: req.user!.tenantId,
        },
      },
      include: {
        tenant: true,
      },
    });

    if (!membership) {
      throw new NotFoundError('Membership');
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: membership.role, // Role from membership (tenant-scoped)
          createdAt: user.createdAt.toISOString(),
          referrer: user.referrer
            ? { id: user.referrer.id, name: user.referrer.name, email: user.referrer.email }
            : null,
        },
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
          status: membership.tenant.status,
          subscriptionStatus: membership.tenant.subscriptionStatus,
          subscriptionAmount: membership.tenant.subscriptionAmount,
          subscribedAt: membership.tenant.subscribedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Change password schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/**
 * Change password
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    // Validate new password strength
    const passwordCheck = validatePasswordStrength(data.newPassword);
    if (!passwordCheck.valid) {
      throw new BadRequestError(passwordCheck.errors.join(', '));
    }

    // Get current user's credential account
    const account = await prisma.account.findFirst({
      where: { 
        userId: req.user!.userId,
        providerId: 'credential',
      },
    });

    if (!account || !account.password) {
      throw new NotFoundError('Account credentials');
    }

    // Verify current password using Better Auth's scrypt
    const isValid = await verifyPassword({ password: data.currentPassword, hash: account.password });
    if (!isValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    // Check if new password is the same as current
    const isSamePassword = await verifyPassword({ password: data.newPassword, hash: account.password });
    if (isSamePassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    // Hash and update password using Better Auth's scrypt
    const newPasswordHash = await hashPassword(data.newPassword);
    
    // Update password in Account table and track change in User table
    await prisma.$transaction([
      prisma.account.update({
        where: { id: account.id },
        data: { password: newPasswordHash },
      }),
      prisma.user.update({
        where: { id: req.user!.userId },
        data: { passwordChangedAt: new Date() },
      }),
    ]);

    // Invalidate all sessions for this user
    await prisma.session.deleteMany({
      where: { userId: req.user!.userId },
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get user's password changed date
 * GET /api/auth/password-info
 * 
 * Uses Account table from Better Auth - the updatedAt field
 * is updated when password is changed for credential provider
 */
router.get('/password-info', authenticateToken, async (req, res, next) => {
  try {
    // Get the credential account for this user
    const account = await prisma.account.findFirst({
      where: { 
        userId: req.user!.userId,
        providerId: 'credential',
      },
      select: { updatedAt: true, createdAt: true },
    });

    // Fall back to user record if no credential account
    if (!account) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { passwordChangedAt: true, createdAt: true },
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: {
          passwordChangedAt: user.passwordChangedAt || user.createdAt,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        // Account.updatedAt is updated when password changes
        passwordChangedAt: account.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get recent login history
 * GET /api/auth/login-history
 * 
 * Uses Session table from Better Auth which stores login sessions
 * with IP address and user agent info
 */
router.get('/login-history', authenticateToken, async (req, res, next) => {
  try {
    // Get recent sessions for this user (each session represents a login)
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    });

    // Transform to match expected format with deviceType
    const loginLogs = sessions.map(session => ({
      id: session.id,
      ipAddress: session.ipAddress,
      deviceType: parseDeviceType(session.userAgent || undefined),
      createdAt: session.createdAt,
    }));

    res.json({
      success: true,
      data: loginLogs,
    });
  } catch (error) {
    next(error);
  }
});

// Update profile schema
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100),
});

/**
 * Update current user's profile
 * PATCH /api/auth/profile
 */
router.patch('/profile', authenticateToken, async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        name: data.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    res.json({
      success: true,
      data: {
        ...user,
        role: req.user!.role, // Add role from membership
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get or generate referral code for current user
 * GET /api/auth/referral-code
 */
router.get('/referral-code', authenticateToken, async (req, res, next) => {
  try {
    const referralCode = await getOrCreateReferralCode(req.user!.userId);

    res.json({
      success: true,
      data: {
        referralCode,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Log login event
 * POST /api/auth/log-login
 */
router.post('/log-login', authenticateToken, async (req, res, next) => {
  try {
    const userAgent = req.headers['user-agent'];
    
    await prisma.adminAuditLog.create({
      data: {
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: 'LOGIN',
        ipAddress: getClientIp(req) ?? undefined,
        userAgent: userAgent?.substring(0, 500) ?? undefined,
        details: JSON.stringify({ deviceType: parseDeviceType(userAgent) }),
      },
    });

    res.json({
      success: true,
      message: 'Login logged successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
