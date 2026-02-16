import { Router, Request } from 'express';
import { z } from 'zod';
import path from 'path';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { authenticateToken, requireSession } from '../../middleware/authenticate.js';
import { requireAdmin, requireOwner } from '../../middleware/requireRole.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { 
  parseLogoUpload, 
  validateImageDimensions, 
  saveLogoFile, 
  deleteLogoFile 
} from '../../lib/upload.js';
import { derivePlanName } from '../../lib/subscription.js';
// @ts-ignore - better-auth crypto module
import { hashPassword } from 'better-auth/crypto';

const router = Router();

// Create tenant: only requires valid session (no active tenant yet)
const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  type: z.enum(["PPW", "PPG"], { required_error: "License type is required" }),
  licenseNumber: z.string().min(1).max(50),
  registrationNumber: z.string().min(1).max(50),
  email: z.string().email(),
  contactNumber: z.string().min(1).max(20),
  businessAddress: z.string().min(1).max(500),
});

/**
 * Create a new tenant (allowed when user has no tenant - first-time setup)
 * POST /api/tenants/create
 */
router.post('/create', requireSession, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const data = createTenantSchema.parse(req.body);

    // Check if tenant slug already exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: data.slug },
    });

    if (existingTenant) {
      throw new ConflictError('Tenant slug already exists');
    }

    // Create tenant in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant with subscriptionStatus = FREE
      const newTenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          type: data.type,
          licenseNumber: data.licenseNumber,
          registrationNumber: data.registrationNumber,
          email: data.email,
          contactNumber: data.contactNumber,
          businessAddress: data.businessAddress,
          status: "ACTIVE",
          subscriptionStatus: "FREE",
        },
      });

      // Create TenantMember with role = OWNER
      await tx.tenantMember.create({
        data: {
          userId: userId,
          tenantId: newTenant.id,
          role: "OWNER",
          isActive: true,
        },
      });

      // Create Subscription record (for billing tracking)
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30); // 30-day trial period

      await tx.subscription.create({
        data: {
          tenantId: newTenant.id,
          plan: "trial",
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      return newTenant;
    });

    // Set activeTenantId on session
    const dbSession = await prisma.session.findFirst({
      where: { 
        userId: userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (dbSession) {
      await prisma.session.update({
        where: { id: dbSession.id },
        data: { activeTenantId: result.id },
      });
    }

    res.json({
      success: true,
      data: {
        tenant: {
          id: result.id,
          name: result.name,
          slug: result.slug,
          subscriptionStatus: result.subscriptionStatus,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// All other tenant routes require full auth (session + active tenant)
router.use(authenticateToken);

// All other routes require active subscription
router.use(requireActiveSubscription);

// Helper to get client IP
function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

// Helper to log admin audit action
async function logAdminAction(
  userId: string,
  tenantId: string,
  action: string,
  req: Request,
  targetId?: string,
  targetType?: string,
  details?: Record<string, unknown>
) {
  await prisma.adminAuditLog.create({
    data: {
      userId,
      tenantId,
      action,
      targetId,
      targetType,
      details: details ? JSON.stringify(details) : null,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    },
  });
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

// Validation schemas
const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  licenseNumber: z.string().max(50).optional().nullable(),
  registrationNumber: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  contactNumber: z.string().max(20).optional().nullable(),
  businessAddress: z.string().max(500).optional().nullable(),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'STAFF']),
  password: z.string().min(8).optional(), // Optional if user already exists
});

const updateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Get current tenant details
 * GET /api/tenants/current
 */
router.get('/current', async (req, res, next) => {
  try {
    const [tenant, truesendAddOn] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: req.tenantId },
        include: {
          subscription: true,
          _count: {
            select: {
              members: true,
              borrowers: true,
              loans: true,
            },
          },
        },
      }),
      prisma.tenantAddOn.findUnique({
        where: { tenantId_addOnType: { tenantId: req.tenantId!, addOnType: 'TRUESEND' } },
        select: { status: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    // Derive plan name (Core/Core+) from subscriptionStatus, subscriptionAmount, and TrueSend
    const truesendActive = truesendAddOn?.status === 'ACTIVE';
    const derivedPlan =
      tenant.subscriptionStatus === 'PAID'
        ? derivePlanName(
            { subscriptionStatus: tenant.subscriptionStatus, subscriptionAmount: tenant.subscriptionAmount },
            truesendActive
          )
        : 'Free';

    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        type: tenant.type,
        licenseNumber: tenant.licenseNumber,
        registrationNumber: tenant.registrationNumber,
        email: tenant.email,
        contactNumber: tenant.contactNumber,
        businessAddress: tenant.businessAddress,
        logoUrl: tenant.logoUrl,
        status: tenant.status,
        subscription: tenant.subscription ? {
          plan: derivedPlan,
          status: tenant.subscription.status,
          currentPeriodEnd: tenant.subscription.currentPeriodEnd,
          gracePeriodEnd: tenant.subscription.gracePeriodEnd,
        } : null,
        counts: {
          users: tenant._count.members,
          borrowers: tenant._count.borrowers,
          loans: tenant._count.loans,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update tenant
 * PATCH /api/tenants/current
 */
router.patch('/current', requireAdmin, async (req, res, next) => {
  try {
    const data = updateTenantSchema.parse(req.body);

    // Get current tenant for audit log
    const currentTenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
    });

    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId },
      data,
    });

    // Log audit trail
    await logAdminAction(
      req.user!.userId,
      req.tenantId!,
      'TENANT_UPDATED',
      req,
      tenant.id,
      'TENANT',
      { 
        previousData: {
          name: currentTenant?.name,
          licenseNumber: currentTenant?.licenseNumber,
          registrationNumber: currentTenant?.registrationNumber,
          email: currentTenant?.email,
          contactNumber: currentTenant?.contactNumber,
          businessAddress: currentTenant?.businessAddress,
        },
        newData: data,
      }
    );

    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        type: tenant.type,
        licenseNumber: tenant.licenseNumber,
        registrationNumber: tenant.registrationNumber,
        email: tenant.email,
        contactNumber: tenant.contactNumber,
        businessAddress: tenant.businessAddress,
        logoUrl: tenant.logoUrl,
        status: tenant.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload tenant logo
 * POST /api/tenants/current/logo
 * 
 * Constraints:
 * - Max file size: 2MB
 * - Allowed formats: JPEG, PNG, WebP
 * - Dimensions: 100-1000px width/height
 * - Aspect ratio: between 1:2 and 2:1
 */
router.post('/current/logo', requireAdmin, async (req, res, next) => {
  try {
    // Parse the uploaded file
    const { buffer, originalName, mimeType } = await parseLogoUpload(req);
    
    // Validate image dimensions and aspect ratio
    const { width, height } = validateImageDimensions(buffer, mimeType);
    
    // Get current tenant to check for existing logo
    const currentTenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
    });
    
    // Delete old logo if exists
    if (currentTenant?.logoUrl) {
      await deleteLogoFile(currentTenant.logoUrl);
    }
    
    // Save new logo
    const extension = path.extname(originalName).toLowerCase();
    const logoUrl = await saveLogoFile(buffer, req.tenantId!, extension);
    
    // Update tenant with new logo URL
    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId },
      data: { logoUrl },
    });
    
    // Log audit trail
    await logAdminAction(
      req.user!.userId,
      req.tenantId!,
      'TENANT_LOGO_UPDATED',
      req,
      tenant.id,
      'TENANT',
      { 
        previousLogoUrl: currentTenant?.logoUrl,
        newLogoUrl: logoUrl,
        dimensions: { width, height },
      }
    );
    
    res.json({
      success: true,
      data: {
        logoUrl: tenant.logoUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete tenant logo
 * DELETE /api/tenants/current/logo
 */
router.delete('/current/logo', requireAdmin, async (req, res, next) => {
  try {
    const currentTenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
    });
    
    if (!currentTenant?.logoUrl) {
      throw new BadRequestError('No logo to delete');
    }
    
    // Delete the file
    await deleteLogoFile(currentTenant.logoUrl);
    
    // Update tenant
    await prisma.tenant.update({
      where: { id: req.tenantId },
      data: { logoUrl: null },
    });
    
    // Log audit trail
    await logAdminAction(
      req.user!.userId,
      req.tenantId!,
      'TENANT_LOGO_DELETED',
      req,
      currentTenant.id,
      'TENANT',
      { deletedLogoUrl: currentTenant.logoUrl }
    );
    
    res.json({
      success: true,
      message: 'Logo deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List members in tenant
 * GET /api/tenants/users
 */
router.get('/users', async (req, res, next) => {
  try {
    const members = await prisma.tenantMember.findMany({
      where: { tenantId: req.tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: members.map((m) => ({
        id: m.user.id,
        memberId: m.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        isActive: m.isActive,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Maximum users per tenant (including owner)
const MAX_USERS_PER_TENANT = 5;

/**
 * Invite/add a user to tenant
 * POST /api/tenants/users
 * 
 * If user already exists: just create membership
 * If user doesn't exist: create user + account + membership
 * 
 * Limit: Maximum 5 users per tenant (including owner)
 */
router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const data = inviteUserSchema.parse(req.body);

    // Check current member count
    const memberCount = await prisma.tenantMember.count({
      where: { tenantId: req.tenantId! },
    });

    if (memberCount >= MAX_USERS_PER_TENANT) {
      throw new BadRequestError(
        `Maximum of ${MAX_USERS_PER_TENANT} team members allowed per tenant.`
      );
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    // Check if user already has membership in this tenant
    if (user) {
      const existingMembership = await prisma.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId: user.id,
            tenantId: req.tenantId!,
          },
        },
      });

      if (existingMembership) {
        throw new ConflictError('User is already a member of this tenant');
      }

      // Create membership for existing user
      const membership = await prisma.tenantMember.create({
        data: {
          userId: user.id,
          tenantId: req.tenantId!,
          role: data.role,
          isActive: true,
        },
      });

      // Log audit trail
      await logAdminAction(
        req.user!.userId,
        req.tenantId!,
        'USER_INVITED',
        req,
        user.id,
        'USER',
        { 
          email: user.email,
          name: user.name,
          role: data.role,
          isExistingUser: true,
        }
      );

      return res.status(201).json({
        success: true,
        data: {
          id: user.id,
          memberId: membership.id,
          email: user.email,
          name: user.name,
          role: membership.role,
          isActive: membership.isActive,
          createdAt: membership.createdAt,
          isExistingUser: true,
        },
      });
    }

    // User doesn't exist - password is required
    if (!data.password) {
      throw new BadRequestError('Password is required for new users');
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(data.password);
    if (!passwordCheck.valid) {
      throw new BadRequestError(passwordCheck.errors.join(', '));
    }

    // Create user, account, and membership in a transaction
    const passwordHash = await hashPassword(data.password);
    
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          emailVerified: true, // Auto-verify invited users
          name: data.name,
          isActive: true,
        },
      });

      // Create credential account for Better Auth
      await tx.account.create({
        data: {
          userId: newUser.id,
          accountId: newUser.id,
          providerId: 'credential',
          password: passwordHash,
        },
      });

      // Create membership
      const membership = await tx.tenantMember.create({
        data: {
          userId: newUser.id,
          tenantId: req.tenantId!,
          role: data.role,
          isActive: true,
        },
      });

      return { user: newUser, membership };
    });

    // Log audit trail
    await logAdminAction(
      req.user!.userId,
      req.tenantId!,
      'USER_INVITED',
      req,
      result.user.id,
      'USER',
      { 
        email: result.user.email,
        name: result.user.name,
        role: data.role,
        isExistingUser: false,
      }
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.user.id,
        memberId: result.membership.id,
        email: result.user.email,
        name: result.user.name,
        role: result.membership.role,
        isActive: result.membership.isActive,
        createdAt: result.membership.createdAt,
        isExistingUser: false,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update a member's role or status
 * PATCH /api/tenants/users/:userId
 */
router.patch('/users/:userId', requireAdmin, async (req, res, next) => {
  try {
    const data = updateMemberSchema.parse(req.body);
    const userId = req.params.userId as string;

    // Get membership
    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId: req.tenantId!,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Member');
    }

    // Only OWNER can change roles
    if (data.role && req.user!.role !== 'OWNER') {
      throw new ForbiddenError('Only the owner can change member roles');
    }

    // Prevent demoting or deactivating OWNER
    if (membership.role === 'OWNER') {
      if (data.role) {
        throw new BadRequestError('Cannot change owner role');
      }
      if (data.isActive === false) {
        throw new BadRequestError('Cannot deactivate owner');
      }
    }

    const updatedMembership = await prisma.tenantMember.update({
      where: { id: membership.id },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Log audit trail for activation/deactivation and role changes
    if (data.isActive !== undefined && data.isActive !== membership.isActive) {
      const action = data.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
      await logAdminAction(
        req.user!.userId,
        req.tenantId!,
        action,
        req,
        userId,
        'USER',
        { 
          email: updatedMembership.user.email,
          name: updatedMembership.user.name,
        }
      );
    }

    if (data.role && data.role !== membership.role) {
      await logAdminAction(
        req.user!.userId,
        req.tenantId!,
        'USER_ROLE_CHANGED',
        req,
        userId,
        'USER',
        { 
          email: updatedMembership.user.email,
          previousRole: membership.role,
          newRole: data.role,
        }
      );
    }

    res.json({
      success: true,
      data: {
        id: updatedMembership.user.id,
        memberId: updatedMembership.id,
        email: updatedMembership.user.email,
        name: updatedMembership.user.name,
        role: updatedMembership.role,
        isActive: updatedMembership.isActive,
        createdAt: updatedMembership.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Transfer ownership to another member
 * POST /api/tenants/transfer-ownership
 * 
 * Only the current OWNER can transfer ownership.
 * The new owner must be an existing active member.
 * The current owner will be demoted to ADMIN.
 */
router.post('/transfer-ownership', requireOwner, async (req, res, next) => {
  try {
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      throw new BadRequestError('New owner ID is required');
    }

    // Get current owner membership
    const currentOwnerMembership = await prisma.tenantMember.findFirst({
      where: {
        tenantId: req.tenantId!,
        role: 'OWNER',
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!currentOwnerMembership) {
      throw new NotFoundError('Current owner');
    }

    // Verify the requesting user is the current owner
    if (currentOwnerMembership.userId !== req.user!.userId) {
      throw new BadRequestError('Only the current owner can transfer ownership');
    }

    // Get new owner membership
    const newOwnerMembership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId: newOwnerId,
          tenantId: req.tenantId!,
        },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!newOwnerMembership) {
      throw new NotFoundError('New owner must be an existing member');
    }

    if (!newOwnerMembership.isActive) {
      throw new BadRequestError('New owner must be an active member');
    }

    if (newOwnerMembership.role === 'OWNER') {
      throw new BadRequestError('User is already the owner');
    }

    // Transfer ownership in a transaction
    await prisma.$transaction(async (tx) => {
      // Demote current owner to ADMIN
      await tx.tenantMember.update({
        where: { id: currentOwnerMembership.id },
        data: { role: 'ADMIN' },
      });

      // Promote new owner to OWNER
      await tx.tenantMember.update({
        where: { id: newOwnerMembership.id },
        data: { role: 'OWNER' },
      });
    });

    // Log audit trail
    await logAdminAction(
      req.user!.userId,
      req.tenantId!,
      'OWNERSHIP_TRANSFERRED',
      req,
      newOwnerId,
      'USER',
      { 
        previousOwner: {
          id: currentOwnerMembership.user.id,
          email: currentOwnerMembership.user.email,
          name: currentOwnerMembership.user.name,
        },
        newOwner: {
          id: newOwnerMembership.user.id,
          email: newOwnerMembership.user.email,
          name: newOwnerMembership.user.name,
        },
      }
    );

    res.json({
      success: true,
      message: 'Ownership transferred successfully',
      data: {
        previousOwner: {
          id: currentOwnerMembership.user.id,
          email: currentOwnerMembership.user.email,
          newRole: 'ADMIN',
        },
        newOwner: {
          id: newOwnerMembership.user.id,
          email: newOwnerMembership.user.email,
          newRole: 'OWNER',
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove a member from tenant
 * DELETE /api/tenants/users/:userId
 */
router.delete('/users/:userId', requireOwner, async (req, res, next) => {
  try {
    const userId = req.params.userId as string;

    // Get membership with user info for audit log
    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId: req.tenantId!,
        },
      },
      include: {
        user: {
          select: { email: true, name: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Member');
    }

    // Prevent removing OWNER
    if (membership.role === 'OWNER') {
      throw new BadRequestError('Cannot remove owner from tenant');
    }

    // Delete membership (not the user - they may belong to other tenants)
    await prisma.tenantMember.delete({
      where: { id: membership.id },
    });

    // Log audit trail
    await logAdminAction(
      req.user!.userId,
      req.tenantId!,
      'USER_REMOVED',
      req,
      userId,
      'USER',
      { 
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
      }
    );

    res.json({
      success: true,
      message: 'Member removed from tenant',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get admin audit logs for the tenant
 * GET /api/tenants/admin-logs
 */
router.get('/admin-logs', requireAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where: { tenantId: req.tenantId! },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.adminAuditLog.count({
        where: { tenantId: req.tenantId! },
      }),
    ]);

    res.json({
      success: true,
      data: logs.map(log => ({
        id: log.id,
        action: log.action,
        targetId: log.targetId,
        targetType: log.targetType,
        details: log.details ? JSON.parse(log.details) : null,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
        user: {
          id: log.user.id,
          email: log.user.email,
          name: log.user.name,
        },
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get entity audit logs for the tenant (Borrower, Loan, etc.)
 * GET /api/tenants/audit-logs
 */
router.get('/audit-logs', requireAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const skip = (page - 1) * pageSize;
    const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;

    const where: { tenantId: string; entityType?: string; action?: string } = { 
      tenantId: req.tenantId! 
    };
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        previousData: log.previousData,
        newData: log.newData,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
        user: log.member?.user ? {
          id: log.member.user.id,
          email: log.member.user.email,
          name: log.member.user.name,
        } : null,
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
