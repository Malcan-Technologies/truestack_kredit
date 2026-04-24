import { Router } from 'express';
import type { InterestModel, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { AuditService } from '../compliance/auditService.js';

// Helper to get client IP from request
function getClientIp(req: import('express').Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress;
}

const router = Router();

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requirePaidSubscription);

function requireAuditContext(req: import('express').Request): { tenantId: string; memberId: string } {
  const tenantId = req.tenantId ?? req.user?.tenantId;
  const memberId = req.memberId ?? req.user?.memberId;

  if (!tenantId || !memberId) {
    throw new UnauthorizedError('Active tenant context required');
  }

  return { tenantId, memberId };
}

// Schema for required document categories
const requiredDocumentSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  required: z.boolean(),
});

// Default required documents for new products
const DEFAULT_REQUIRED_DOCUMENTS = [
  { key: 'IC_FRONT', label: 'IC Front', required: true },
  { key: 'IC_BACK', label: 'IC Back', required: true },
  { key: 'PAYSLIP', label: 'Payslip (last 3 months)', required: true },
  { key: 'BANK_STATEMENT', label: 'Bank Statement', required: false },
  { key: 'EMPLOYMENT_LETTER', label: 'Employment Letter', required: false },
];

function isAllowedTermsWithinRange(
  allowedTerms: number[] | undefined,
  minTerm: number,
  maxTerm: number
): boolean {
  if (!allowedTerms?.length) return true;
  return allowedTerms.every((t) => t >= minTerm && t <= maxTerm);
}

/** Strict parse of JSON `allowedTerms`: all elements must be integers. */
function parseProductAllowedTerms(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const terms = value.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
  return terms.length === value.length ? terms : undefined;
}

// Validation schemas
const createProductSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(5).max(500),
  interestModel: z.enum(['FLAT', 'RULE_78', 'DECLINING_BALANCE', 'EFFECTIVE_RATE']),
  interestRate: z.number().min(0).max(100).default(18),
  latePaymentRate: z.number().min(0).max(100).default(8),
  arrearsPeriod: z.number().int().min(1).max(365).default(14),
  defaultPeriod: z.number().int().min(1).max(365).default(28),
  minAmount: z.number().positive(),
  maxAmount: z.number().positive(),
  minTerm: z.number().int().min(2).max(600),
  maxTerm: z.number().int().min(2).max(600),
  termInterval: z.number().int().min(1).max(60).default(1),
  allowedTerms: z.array(z.number().int().min(2).max(600)).optional(),
  // Fee configuration
  legalFeeType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  legalFeeValue: z.number().min(0).default(0),
  stampingFeeType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  stampingFeeValue: z.number().min(0).default(0),
  // Required documents
  requiredDocuments: z.array(requiredDocumentSchema).optional(),
  // Borrower eligibility
  eligibleBorrowerTypes: z.enum(['INDIVIDUAL', 'CORPORATE', 'BOTH']).default('BOTH'),
  // Loan schedule type per KPKT regulations
  loanScheduleType: z.enum(['JADUAL_J', 'JADUAL_K']).default('JADUAL_J'),
  // Early settlement configuration
  earlySettlementEnabled: z.boolean().default(false),
  earlySettlementLockInMonths: z.number().int().min(0).max(120).default(0),
  earlySettlementDiscountType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  earlySettlementDiscountValue: z.number().min(0).default(0),
}).refine(data => data.minAmount <= data.maxAmount, {
  message: 'minAmount must be less than or equal to maxAmount',
  path: ['minAmount'],
}).refine(data => data.minTerm <= data.maxTerm, {
  message: 'minTerm must be less than or equal to maxTerm',
  path: ['minTerm'],
}).refine((data) => {
  return isAllowedTermsWithinRange(data.allowedTerms, data.minTerm, data.maxTerm);
}, {
  message: 'allowedTerms must only contain values within minTerm and maxTerm',
  path: ['allowedTerms'],
}).refine(data => data.arrearsPeriod <= data.defaultPeriod, {
  message: 'Arrears period must be less than or equal to default period',
  path: ['arrearsPeriod'],
}).refine(data => {
  if (data.earlySettlementEnabled && data.earlySettlementDiscountType === 'PERCENTAGE' && data.earlySettlementDiscountValue > 100) {
    return false;
  }
  return true;
}, {
  message: 'Percentage discount cannot exceed 100%',
  path: ['earlySettlementDiscountValue'],
});

const updateProductSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().min(5).max(500).optional(),
  interestModel: z.enum(['FLAT', 'RULE_78', 'DECLINING_BALANCE', 'EFFECTIVE_RATE']).optional(),
  interestRate: z.number().min(0).max(100).optional(),
  latePaymentRate: z.number().min(0).max(100).optional(),
  arrearsPeriod: z.number().int().min(1).max(365).optional(),
  defaultPeriod: z.number().int().min(1).max(365).optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  minTerm: z.number().int().min(2).max(600).optional(),
  maxTerm: z.number().int().min(2).max(600).optional(),
  termInterval: z.number().int().min(1).max(60).optional(),
  allowedTerms: z.array(z.number().int().min(2).max(600)).optional(),
  isActive: z.boolean().optional(),
  // Fee configuration
  legalFeeType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  legalFeeValue: z.number().min(0).optional(),
  stampingFeeType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  stampingFeeValue: z.number().min(0).optional(),
  // Required documents
  requiredDocuments: z.array(requiredDocumentSchema).optional(),
  // Borrower eligibility
  eligibleBorrowerTypes: z.enum(['INDIVIDUAL', 'CORPORATE', 'BOTH']).optional(),
  // Loan schedule type per KPKT regulations
  loanScheduleType: z.enum(['JADUAL_J', 'JADUAL_K']).optional(),
  // Early settlement configuration
  earlySettlementEnabled: z.boolean().optional(),
  earlySettlementLockInMonths: z.number().int().min(0).max(120).optional(),
  earlySettlementDiscountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  earlySettlementDiscountValue: z.number().min(0).optional(),
});

/**
 * List products
 * GET /api/products
 */
router.get('/', async (req, res, next) => {
  try {
    const { activeOnly } = req.query;

    const where = {
      tenantId: req.tenantId,
      ...(activeOnly === 'true' && { isActive: true }),
    };

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { loans: true, applications: true },
        },
      },
    });

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get product timeline (audit log)
 * GET /api/products/:productId/timeline
 */
router.get('/:productId/timeline', async (req, res, next) => {
  try {
    const productId = req.params.productId as string;
    const { cursor, limit: limitStr } = req.query;
    const limit = parseInt(limitStr as string) || 10;

    // Verify product belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        tenantId: req.tenantId,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    // Fetch audit logs for this product with cursor-based pagination
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        entityType: 'Product',
        entityId: productId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine hasMore
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
    });

    const hasMore = auditLogs.length > limit;
    const items = hasMore ? auditLogs.slice(0, limit) : auditLogs;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    // Transform to timeline format
    const timeline = items.map(log => ({
      id: log.id,
      action: log.action,
      previousData: log.previousData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.member?.user || null,
    }));

    res.json({
      success: true,
      data: timeline,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single product
 * GET /api/products/:productId
 */
router.get('/:productId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.productId,
        tenantId: req.tenantId,
      },
      include: {
        _count: {
          select: { loans: true, applications: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Create product
 * POST /api/products
 */
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = createProductSchema.parse(req.body);
    const { tenantId, memberId } = requireAuditContext(req);

    // Use default required documents if none provided
    const requiredDocuments = data.requiredDocuments ?? DEFAULT_REQUIRED_DOCUMENTS;
    const createData = {
      ...data,
      // Keep compile compatibility until Prisma client is regenerated with RULE_78.
      interestModel: data.interestModel as unknown as InterestModel,
      requiredDocuments,
    };

    const product = await prisma.product.create({
      data: {
        tenantId,
        ...createData,
      },
    });

    // Log audit event for product creation
    await AuditService.logCreate(
      tenantId,
      memberId,
      'Product',
      product.id,
      {
        name: product.name,
        description: product.description,
        interestModel: product.interestModel,
        interestRate: product.interestRate,
        latePaymentRate: product.latePaymentRate,
        eligibleBorrowerTypes: product.eligibleBorrowerTypes,
        loanScheduleType: product.loanScheduleType,
      },
      getClientIp(req)
    );

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update product
 * PATCH /api/products/:productId
 */
router.patch('/:productId', requireAdmin, async (req, res, next) => {
  try {
    const data = updateProductSchema.parse(req.body);
    const productId = req.params.productId as string;
    const { tenantId, memberId } = requireAuditContext(req);

    // Verify product belongs to tenant
    const existing = await prisma.product.findFirst({
      where: {
        id: productId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundError('Product');
    }

    const effectiveMinTerm = data.minTerm ?? existing.minTerm;
    const effectiveMaxTerm = data.maxTerm ?? existing.maxTerm;
    if (effectiveMinTerm > effectiveMaxTerm) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'minTerm must be less than or equal to maxTerm',
          details: [{ path: ['minTerm'], message: 'minTerm must be less than or equal to maxTerm' }],
        },
      });
    }

    const existingAllowedTerms = parseProductAllowedTerms(
      (existing as unknown as Record<string, unknown>).allowedTerms
    );
    const effectiveAllowedTerms = data.allowedTerms ?? existingAllowedTerms;
    if (!isAllowedTermsWithinRange(effectiveAllowedTerms, effectiveMinTerm, effectiveMaxTerm)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'allowedTerms must only contain values within minTerm and maxTerm',
          details: [{ path: ['allowedTerms'], message: 'allowedTerms must only contain values within minTerm and maxTerm' }],
        },
      });
    }

    const updateData = (data.interestModel
      ? {
          ...data,
          // Keep compile compatibility until Prisma client is regenerated with RULE_78.
          interestModel: data.interestModel as unknown as InterestModel,
        }
      : data) as unknown as Prisma.ProductUpdateInput;

    const product = await prisma.product.update({
      where: { id: productId },
      data: updateData,
    });

    // Log audit event for product update
    // Only include fields that were actually changed
    const changedFields: Record<string, unknown> = {};
    const previousFields: Record<string, unknown> = {};
    
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      const existingValue = existing[key as keyof typeof existing];
      const newValue = product[key as keyof typeof product];
      // Compare stringified values to handle Decimal and JSON types
      if (JSON.stringify(existingValue) !== JSON.stringify(newValue)) {
        previousFields[key] = existingValue;
        changedFields[key] = newValue;
      }
    }

    if (Object.keys(changedFields).length > 0) {
      await AuditService.logUpdate(
        tenantId,
        memberId,
        'Product',
        product.id,
        previousFields,
        changedFields,
        getClientIp(req)
      );
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete product
 * DELETE /api/products/:productId
 */
router.delete('/:productId', requireAdmin, async (req, res, next) => {
  try {
    const productId = req.params.productId as string;
    const { tenantId, memberId } = requireAuditContext(req);

    // Verify product belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        tenantId,
      },
      include: {
        _count: {
          select: { loans: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    // If product has loans, just deactivate instead of deleting
    if (product._count.loans > 0) {
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });

      // Log audit event for deactivation
      await AuditService.logUpdate(
        tenantId,
        memberId,
        'Product',
        product.id,
        { isActive: true },
        { isActive: false },
        getClientIp(req)
      );

      return res.json({
        success: true,
        message: 'Product deactivated (has existing loans)',
      });
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    // Log audit event for deletion
    await AuditService.logDelete(
      tenantId,
      memberId,
      'Product',
      product.id,
      {
        name: product.name,
        description: product.description,
        interestModel: product.interestModel,
        interestRate: product.interestRate,
      },
      getClientIp(req)
    );

    res.json({
      success: true,
      message: 'Product deleted',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
