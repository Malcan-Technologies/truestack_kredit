import path from 'path';
import { Router } from 'express';
import { z } from 'zod';
import type { ApplicationStatus, Product } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { requireBorrowerSession } from '../../middleware/authenticateBorrower.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { requireActiveBorrower } from '../borrower-auth/borrowerContext.js';
import { computeLoanApplicationPreview } from '../loans/loanApplicationPreviewService.js';
import { parseDocumentUpload, saveDocumentFile, deleteDocumentFile, ensureDocumentsDir } from '../../lib/upload.js';
import { AuditService } from '../compliance/auditService.js';
import { toSafeNumber } from '../../lib/math.js';

const router = Router();
router.use(requireBorrowerSession);

const previewBodySchema = z.object({
  productId: z.string().min(1),
  amount: z.number().positive(),
  term: z.number().int().positive(),
});

const createApplicationSchema = z.object({
  productId: z.string().min(1),
  amount: z.number().positive(),
  term: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
  collateralType: z.string().max(200).optional(),
  collateralValue: z.number().positive().optional(),
});

const updateApplicationSchema = z.object({
  productId: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  term: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional().nullable(),
  collateralType: z.string().max(200).optional().nullable(),
  collateralValue: z.number().positive().optional().nullable(),
});

function productEligibleForBorrower(product: Product, borrowerType: string): boolean {
  const eligibility = product.eligibleBorrowerTypes || 'BOTH';
  return eligibility === 'BOTH' || eligibility === borrowerType;
}

function borrowerCanModifyApplicationDocuments(status: ApplicationStatus): boolean {
  return status === 'DRAFT' || status === 'SUBMITTED' || status === 'UNDER_REVIEW';
}

/** Whether every required document category has at least one upload (for audit / UI). */
async function requiredApplicationDocumentsComplete(
  tenantId: string,
  applicationId: string,
  product: Product
): Promise<boolean> {
  const requiredDocs =
    (product.requiredDocuments as Array<{ key: string; label: string; required: boolean }>) ?? [];
  const requiredKeys = requiredDocs.filter((d) => d.required).map((d) => d.key);
  if (requiredKeys.length === 0) return true;

  const uploaded = await prisma.applicationDocument.findMany({
    where: { applicationId, tenantId },
    select: { category: true },
  });
  const categories = new Set(uploaded.map((u) => u.category));
  return requiredKeys.every((key) => categories.has(key));
}

/**
 * GET /api/borrower-auth/products
 * Active products eligible for the current borrower type (pro tenant).
 */
router.get('/products', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true },
    });
    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const filtered = products.filter((p) => productEligibleForBorrower(p, borrower.borrowerType));

    res.json({
      success: true,
      data: filtered,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/applications/preview
 */
router.post('/applications/preview', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const data = previewBodySchema.parse(req.body);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true },
    });
    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        tenantId: tenant.id,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    if (!productEligibleForBorrower(product, borrower.borrowerType)) {
      throw new BadRequestError('This product is not available for your borrower type.');
    }

    if (data.amount < toSafeNumber(product.minAmount) || data.amount > toSafeNumber(product.maxAmount)) {
      throw new BadRequestError(`Amount must be between ${product.minAmount} and ${product.maxAmount}`);
    }

    if (data.term < product.minTerm || data.term > product.maxTerm) {
      throw new BadRequestError(`Term must be between ${product.minTerm} and ${product.maxTerm} months`);
    }

    const preview = computeLoanApplicationPreview(product, data.amount, data.term);

    res.json({
      success: true,
      data: {
        loanAmount: preview.loanAmount,
        term: preview.term,
        interestRate: preview.interestRate,
        interestModel: preview.interestModel,
        legalFee: preview.legalFee,
        legalFeeType: preview.legalFeeType,
        stampingFee: preview.stampingFee,
        stampingFeeType: preview.stampingFeeType,
        totalFees: preview.totalFees,
        netDisbursement: preview.netDisbursement,
        monthlyPayment: preview.monthlyPayment,
        totalInterest: preview.totalInterest,
        totalPayable: preview.totalPayable,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/applications
 */
router.post('/applications', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const data = createApplicationSchema.parse(req.body);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
    });
    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        tenantId: tenant.id,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    if (!productEligibleForBorrower(product, borrower.borrowerType)) {
      throw new BadRequestError('This product is not available for your borrower type.');
    }

    if (data.amount < toSafeNumber(product.minAmount) || data.amount > toSafeNumber(product.maxAmount)) {
      throw new BadRequestError(`Amount must be between ${product.minAmount} and ${product.maxAmount}`);
    }

    if (data.term < product.minTerm || data.term > product.maxTerm) {
      throw new BadRequestError(`Term must be between ${product.minTerm} and ${product.maxTerm} months`);
    }

    if (product.loanScheduleType === 'JADUAL_K') {
      if (!data.collateralType?.trim()) {
        throw new BadRequestError('Collateral type is required for this product.');
      }
      if (data.collateralValue == null || data.collateralValue <= 0) {
        throw new BadRequestError('Collateral value is required for this product.');
      }
    }

    const application = await prisma.loanApplication.create({
      data: {
        tenantId: tenant.id,
        borrowerId,
        productId: data.productId,
        amount: data.amount,
        term: data.term,
        notes: data.notes,
        status: 'DRAFT',
        collateralType: data.collateralType,
        collateralValue: data.collateralValue,
      },
      include: {
        borrower: {
          select: {
            id: true,
            name: true,
            borrowerType: true,
            icNumber: true,
            documentType: true,
            companyName: true,
          },
        },
        product: true,
        documents: true,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_CREATE_APPLICATION',
      entityType: 'LoanApplication',
      entityId: application.id,
      newData: {
        borrowerId,
        productId: data.productId,
        amount: data.amount,
        term: data.term,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: application,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/applications
 */
router.get('/applications', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { status, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(pageSize as string, 10);
    const take = parseInt(pageSize as string, 10);

    const where = {
      tenantId: tenant.id,
      borrowerId,
      ...(status && {
        status: status as
          | 'DRAFT'
          | 'SUBMITTED'
          | 'UNDER_REVIEW'
          | 'APPROVED'
          | 'REJECTED'
          | 'CANCELLED',
      }),
    };

    const [applications, total] = await Promise.all([
      prisma.loanApplication.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              interestModel: true,
              interestRate: true,
            },
          },
          loan: { select: { id: true, status: true } },
        },
      }),
      prisma.loanApplication.count({ where }),
    ]);

    res.json({
      success: true,
      data: applications,
      pagination: {
        total,
        page: parseInt(page as string, 10),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/applications/:applicationId
 */
router.get('/applications/:applicationId', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
      include: {
        borrower: {
          select: {
            id: true,
            name: true,
            borrowerType: true,
            icNumber: true,
            documentType: true,
            phone: true,
            email: true,
            companyName: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postcode: true,
            country: true,
          },
        },
        product: true,
        documents: { orderBy: { uploadedAt: 'desc' } },
        loan: { select: { id: true, status: true } },
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/borrower-auth/applications/:applicationId
 */
router.patch('/applications/:applicationId', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;
    const data = updateApplicationSchema.parse(req.body);

    const existing = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
      include: { product: true },
    });

    if (!existing) {
      throw new NotFoundError('Application');
    }

    if (existing.status !== 'DRAFT') {
      throw new BadRequestError('Can only update draft applications');
    }

    let product = existing.product;
    if (data.productId && data.productId !== existing.productId) {
      const np = await prisma.product.findFirst({
        where: { id: data.productId, tenantId: tenant.id, isActive: true },
      });
      if (!np) {
        throw new NotFoundError('Product');
      }
      const borrower = await prisma.borrower.findFirst({
        where: { id: borrowerId, tenantId: tenant.id },
        select: { borrowerType: true },
      });
      if (!borrower || !productEligibleForBorrower(np, borrower.borrowerType)) {
        throw new BadRequestError('This product is not available for your borrower type.');
      }
      product = np;
    }

    const nextAmount = data.amount ?? toSafeNumber(existing.amount);
    const nextTerm = data.term ?? existing.term;

    if (nextAmount < toSafeNumber(product.minAmount) || nextAmount > toSafeNumber(product.maxAmount)) {
      throw new BadRequestError(`Amount must be between ${product.minAmount} and ${product.maxAmount}`);
    }

    if (nextTerm < product.minTerm || nextTerm > product.maxTerm) {
      throw new BadRequestError(`Term must be between ${product.minTerm} and ${product.maxTerm} months`);
    }

    const collateralType = data.collateralType !== undefined ? data.collateralType : existing.collateralType;
    const collateralValue =
      data.collateralValue !== undefined ? data.collateralValue : existing.collateralValue
        ? toSafeNumber(existing.collateralValue)
        : undefined;

    if (product.loanScheduleType === 'JADUAL_K') {
      if (!collateralType?.trim()) {
        throw new BadRequestError('Collateral type is required for this product.');
      }
      if (collateralValue == null || collateralValue <= 0) {
        throw new BadRequestError('Collateral value is required for this product.');
      }
    }

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        ...(data.productId ? { productId: data.productId } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.term !== undefined ? { term: data.term } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.collateralType !== undefined ? { collateralType: data.collateralType } : {}),
        ...(data.collateralValue !== undefined ? { collateralValue: data.collateralValue } : {}),
      },
      include: {
        borrower: {
          select: {
            id: true,
            name: true,
            borrowerType: true,
            icNumber: true,
            documentType: true,
            companyName: true,
          },
        },
        product: true,
        documents: true,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_UPDATE_APPLICATION',
      entityType: 'LoanApplication',
      entityId: applicationId,
      previousData: {
        productId: existing.productId,
        amount: existing.amount,
        term: existing.term,
      },
      newData: data,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/applications/:applicationId/submit
 */
router.post('/applications/:applicationId/submit', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'DRAFT') {
      throw new BadRequestError('Can only submit draft applications');
    }

    const requiredDocumentsCompleteAtSubmit = await requiredApplicationDocumentsComplete(
      tenant.id,
      applicationId,
      application.product
    );

    if (!requiredDocumentsCompleteAtSubmit) {
      throw new BadRequestError(
        'Upload all required documents (as configured for this product) before submitting.'
      );
    }

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: { status: 'SUBMITTED' },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_SUBMIT_APPLICATION',
      entityType: 'LoanApplication',
      entityId: applicationId,
      previousData: { status: 'DRAFT' },
      newData: {
        status: 'SUBMITTED',
        requiredDocumentsCompleteAtSubmit,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/applications/:applicationId/documents
 */
router.post('/applications/:applicationId/documents', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (!borrowerCanModifyApplicationDocuments(application.status)) {
      throw new BadRequestError(
        'Documents can only be uploaded while the application is draft, submitted, or under review'
      );
    }

    const { buffer, originalName, mimeType, category } = await parseDocumentUpload(req);

    const requiredDocs =
      (application.product.requiredDocuments as Array<{ key: string; label: string; required: boolean }>) ?? [];
    const validCategory =
      requiredDocs.some((doc) => doc.key === category) || category === 'OTHER';

    if (!validCategory) {
      throw new BadRequestError(`Invalid document category: ${category}`);
    }

    ensureDocumentsDir();
    const extension = path.extname(originalName).toLowerCase();
    const { filename, path: filePath } = await saveDocumentFile(buffer, tenant.id, applicationId, extension);

    const document = await prisma.applicationDocument.create({
      data: {
        tenantId: tenant.id,
        applicationId,
        filename,
        originalName,
        mimeType,
        size: buffer.length,
        path: filePath,
        category,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_APPLICATION_DOCUMENT_UPLOAD',
      entityType: 'LoanApplication',
      entityId: applicationId,
      newData: {
        documentId: document.id,
        category,
        originalName,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/applications/:applicationId/documents
 */
router.get('/applications/:applicationId/documents', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    const documents = await prisma.applicationDocument.findMany({
      where: { applicationId, tenantId: tenant.id },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: documents,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/borrower-auth/applications/:applicationId/documents/:documentId
 */
router.delete('/applications/:applicationId/documents/:documentId', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId, documentId } = req.params;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (!borrowerCanModifyApplicationDocuments(application.status)) {
      throw new BadRequestError(
        'Documents can only be removed while the application is draft, submitted, or under review'
      );
    }

    const document = await prisma.applicationDocument.findFirst({
      where: {
        id: documentId,
        applicationId,
        tenantId: tenant.id,
      },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    await deleteDocumentFile(document.path);
    await prisma.applicationDocument.delete({
      where: { id: documentId },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_APPLICATION_DOCUMENT_DELETE',
      entityType: 'LoanApplication',
      entityId: applicationId,
      previousData: {
        documentId: document.id,
        category: document.category,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Document deleted',
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Withdraw (cancel) a submitted application before a final decision
 * POST /api/borrower-auth/applications/:applicationId/withdraw
 */
router.post('/applications/:applicationId/withdraw', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'SUBMITTED' && application.status !== 'UNDER_REVIEW') {
      throw new BadRequestError('Only submitted or under-review applications can be withdrawn');
    }

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: { status: 'CANCELLED' },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_WITHDRAW_APPLICATION',
      entityType: 'LoanApplication',
      entityId: applicationId,
      previousData: { status: application.status },
      newData: { status: 'CANCELLED' },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Application timeline (audit trail) for the borrower-owned application
 * GET /api/borrower-auth/applications/:applicationId/timeline
 */
router.get('/applications/:applicationId/timeline', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { applicationId } = req.params;
    const { cursor, limit: limitStr = '20' } = req.query;
    const limit = Math.min(parseInt(limitStr as string, 10), 50);

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: tenant.id,
        borrowerId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entityType: 'LoanApplication',
        entityId: applicationId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        member: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    const hasMore = auditLogs.length > limit;
    const items = hasMore ? auditLogs.slice(0, limit) : auditLogs;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    const timeline = items.map((log) => ({
      id: log.id,
      action: log.action,
      previousData: log.previousData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.member?.user
        ? {
            id: log.member.user.id,
            email: log.member.user.email,
            name: log.member.user.name,
          }
        : null,
    }));

    res.json({
      success: true,
      data: timeline,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
