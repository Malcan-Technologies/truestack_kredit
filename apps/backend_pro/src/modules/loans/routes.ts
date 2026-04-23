import { Router, type Request } from 'express';
import { z } from 'zod';
import type { TenantPermission } from '@kredit/shared';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { requireAnyPermission, requirePermission } from '../../middleware/requireRole.js';
import { generateSchedule } from '../schedules/service.js';
import { parseDocumentUpload, parseFileUpload, saveDocumentFile, deleteDocumentFile, UPLOAD_DIR } from '../../lib/upload.js';
import { AuditService } from '../compliance/auditService.js';
import { toSafeNumber, safeRound, safeMultiply, safeDivide, safeAdd, safeSubtract, calculateFlatInterest, calculateEMI, addMonthsClamped } from '../../lib/math.js';
import { createHash } from 'crypto';
import { LateFeeProcessor } from '../../lib/lateFeeProcessor.js';
import { generateDischargeLetter, generateDefaultLetter, generateArrearsLetter } from '../../lib/letterService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { NotificationOrchestrator } from '../notifications/orchestrator.js';
import { calculateDaysOverdueMalaysia } from '../../lib/malaysiaTime.js';
import { recalculateBorrowerPerformanceProjection } from '../borrowers/performanceProjectionService.js';
import { getBorrowerVerificationSummary } from '../../lib/verification.js';
import { buildInternalScheduleView, supportsInternalScheduleView } from './scheduleViewService.js';
import { computeLoanApplicationPreview } from './loanApplicationPreviewService.js';
import { buildLoanAgreementPdfBuffer } from './loanAgreementPdfService.js';
import { getTenantOfficeHoursConfig } from '../../lib/attestationAvailability.js';
import {
  adminAcceptBorrowerProposal,
  adminCounterProposal,
  expireStaleAttestationProposalForLoan,
  expirePendingProposals,
} from '../../lib/attestationBookingService.js';
import { isPreDisbursementLoanStatus } from '../../lib/loanStatusHelpers.js';
import {
  adminCounterOffer,
  adminAcceptLatestOffer,
  assertNoPendingOffersForApproval,
  rejectPendingOffers,
} from './applicationNegotiationService.js';
import { getEarlySettlementQuoteForLoan } from './earlySettlementQuoteService.js';
import { confirmEarlySettlement } from './earlySettlementConfirmService.js';

type BorrowerVerificationSummary = 'FULLY_VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';

function resolveVerificationStatus(borrower: {
  borrowerType: string;
  documentVerified: boolean;
  verificationStatus?: string | null;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
  directors?: Array<{
    trueIdentityStatus: string | null;
    trueIdentityResult: string | null;
  }>;
}): BorrowerVerificationSummary {
  if (
    borrower.verificationStatus === 'FULLY_VERIFIED' ||
    borrower.verificationStatus === 'PARTIALLY_VERIFIED' ||
    borrower.verificationStatus === 'UNVERIFIED'
  ) {
    return borrower.verificationStatus;
  }
  return getBorrowerVerificationSummary(borrower);
}

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function userHasPermission(req: Request, permission: TenantPermission): boolean {
  if (req.user?.role === 'OWNER') return true;
  return (req.user?.permissions ?? []).includes(permission);
}

function assertL1ApplicationAction(req: Request): void {
  if (!userHasPermission(req, 'applications.approve_l1')) {
    throw new ForbiddenError('This action requires L1 (first-line) approval permission');
  }
}

function assertL2ApplicationAction(req: Request): void {
  if (!userHasPermission(req, 'applications.approve_l2')) {
    throw new ForbiddenError('This action requires L2 (final) approval permission');
  }
}

const APPLICATION_STATUS_FILTER = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'PENDING_L2_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

type ApplicationStatusFilter = (typeof APPLICATION_STATUS_FILTER)[number];

function isL1QueueStatus(status: string): boolean {
  return status === 'SUBMITTED' || status === 'UNDER_REVIEW';
}

const submitApplicationSchema = z.object({
  enableInternalSchedule: z.boolean().optional().default(false),
  actualInterestRate: z.number().positive().max(100).optional(),
  actualTerm: z.number().int().positive().optional(),
});

function deriveCompliantStructureFromInternal(params: {
  principal: number;
  compliantRateCap: number;
  actualInterestRate: number;
  actualTerm: number;
}): {
  compliantInterestRate: number;
  compliantTerm: number;
} {
  const {
    principal,
    compliantRateCap,
    actualInterestRate,
    actualTerm,
  } = params;

  if (principal <= 0) {
    throw new BadRequestError('Loan principal must be greater than zero');
  }

  if (compliantRateCap <= 0) {
    throw new BadRequestError('Product interest rate cap must be greater than zero');
  }

  const normalizedActualRate = safeRound(actualInterestRate, 2);
  const normalizedRateCap = safeRound(compliantRateCap, 2);
  const targetTotalInterest = calculateFlatInterest(
    principal,
    normalizedActualRate,
    actualTerm,
  );
  const targetTotalPayable = safeAdd(principal, targetTotalInterest);
  const minCompliantTerm = Math.max(
    1,
    Math.ceil(
      safeDivide(
        safeMultiply(targetTotalInterest, 1200, 8),
        safeMultiply(principal, normalizedRateCap, 8),
        8,
      ),
    ),
  );

  for (let compliantTerm = minCompliantTerm; compliantTerm <= 600; compliantTerm++) {
    const compliantInterestRate = safeRound(
      safeDivide(
        safeMultiply(targetTotalInterest, 1200, 8),
        safeMultiply(principal, compliantTerm, 8),
        8,
      ),
      2,
    );

    if (compliantInterestRate <= 0 || compliantInterestRate > normalizedRateCap) {
      continue;
    }

    const compliantTotalInterest = calculateFlatInterest(
      principal,
      compliantInterestRate,
      compliantTerm,
    );
    const compliantTotalPayable = safeAdd(principal, compliantTotalInterest);

    if (Math.abs(compliantTotalPayable - targetTotalPayable) <= 0.001) {
      return {
        compliantInterestRate,
        compliantTerm,
      };
    }
  }

  throw new BadRequestError(
    'Unable to derive a compliant schedule that matches the simulated total payable within the product rate cap',
  );
}

const router = Router();

type StatusEvaluationRepayment = {
  status: string;
  dueDate: Date;
  totalDue: unknown;
  lateFeeAccrued: unknown;
  lateFeesPaid: unknown;
  allocations: Array<{ amount: unknown }>;
};

function evaluateOverdueStatus(
  repayments: StatusEvaluationRepayment[],
  asOf: Date
): { oldestOverdueDays: number; hasUnpaidOverdue: boolean } {
  let oldestOverdueDays = 0;
  let hasUnpaidOverdue = false;

  for (const repayment of repayments) {
    if (repayment.status === 'CANCELLED') continue;

    const daysOverdue = calculateDaysOverdueMalaysia(repayment.dueDate, asOf);
    if (daysOverdue <= 0) continue;

    const totalPaid = repayment.allocations.reduce(
      (sum, allocation) => safeAdd(sum, toSafeNumber(allocation.amount)),
      0
    );
    const principalInterestOutstanding = safeSubtract(toSafeNumber(repayment.totalDue), totalPaid);
    const lateFeeOutstanding = Math.max(
      0,
      safeSubtract(toSafeNumber(repayment.lateFeeAccrued), toSafeNumber(repayment.lateFeesPaid))
    );

    if (principalInterestOutstanding > 0.01 || lateFeeOutstanding > 0.01) {
      hasUnpaidOverdue = true;
      oldestOverdueDays = Math.max(oldestOverdueDays, daysOverdue);
    }
  }

  return { oldestOverdueDays, hasUnpaidOverdue };
}

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requirePaidSubscription);

// Validation schemas
const createApplicationSchema = z.object({
  borrowerId: z.string(),
  productId: z.string(),
  amount: z.number().positive(),
  term: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
  collateralType: z.string().max(200).optional(),
  collateralValue: z.number().positive().optional(),
  loanChannel: z.enum(['ONLINE', 'PHYSICAL']).optional(),
  guarantorIds: z.array(z.string()).max(5).optional(),
  enableInternalSchedule: z.boolean().optional().default(false),
  actualInterestRate: z.number().positive().max(100).optional(),
  actualTerm: z.number().int().positive().optional(),
});

const updateApplicationSchema = z.object({
  amount: z.number().positive().optional(),
  term: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  collateralType: z.string().max(200).optional().nullable(),
  collateralValue: z.number().positive().optional().nullable(),
  loanChannel: z.enum(['ONLINE', 'PHYSICAL']).optional(),
});

const disburseSchema = z.object({
  disbursementDate: z.string().datetime().optional(),
  reference: z.string().max(100).optional(), // Auto-generated or custom reference
});

const previewSchema = z.object({
  productId: z.string(),
  amount: z.number().positive(),
  term: z.number().int().positive(),
});

const MAX_GUARANTORS_PER_APPLICATION = 5;

type GuarantorBorrowerSnapshot = {
  id: string;
  name: string;
  borrowerType: string;
  companyName: string | null;
  documentType: string;
  icNumber: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

async function resolveValidGuarantors(
  tenantId: string,
  borrowerId: string,
  guarantorIds: string[] | undefined
): Promise<GuarantorBorrowerSnapshot[]> {
  if (!guarantorIds || guarantorIds.length === 0) {
    return [];
  }

  if (guarantorIds.length > MAX_GUARANTORS_PER_APPLICATION) {
    throw new BadRequestError(`Maximum ${MAX_GUARANTORS_PER_APPLICATION} guarantors are allowed`);
  }

  const uniqueGuarantorIds = [...new Set(guarantorIds)];
  if (uniqueGuarantorIds.length !== guarantorIds.length) {
    throw new BadRequestError('Duplicate guarantors are not allowed');
  }

  if (uniqueGuarantorIds.includes(borrowerId)) {
    throw new BadRequestError('Borrower cannot be selected as a guarantor');
  }

  const guarantors = await prisma.borrower.findMany({
    where: {
      tenantId,
      id: { in: uniqueGuarantorIds },
    },
    select: {
      id: true,
      name: true,
      borrowerType: true,
      companyName: true,
      documentType: true,
      icNumber: true,
      phone: true,
      email: true,
      address: true,
    },
  });

  if (guarantors.length !== uniqueGuarantorIds.length) {
    throw new BadRequestError('One or more selected guarantors are invalid');
  }

  const nonPersonalGuarantors = guarantors.filter((guarantor) => guarantor.borrowerType !== 'INDIVIDUAL');
  if (nonPersonalGuarantors.length > 0) {
    throw new BadRequestError('Guarantors must be personal borrowers only');
  }

  const guarantorMap = new Map(guarantors.map((guarantor) => [guarantor.id, guarantor]));
  return uniqueGuarantorIds.map((id) => {
    const guarantor = guarantorMap.get(id);
    if (!guarantor) {
      throw new BadRequestError('One or more selected guarantors are invalid');
    }
    return guarantor;
  });
}

// Note: Letter generation (discharge, arrears, default) is consolidated in letterService.ts

/**
 * Get loan counts for action-needed badges (pre-disbursement pipeline, attestation proposals)
 * GET /api/loans/counts
 */
router.get('/counts', requireAnyPermission('loans.view', 'loans.disburse', 'attestation.view'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const [pendingDisbursement, pendingAttestation, attestationSlotProposed] = await Promise.all([
      prisma.loan.count({
        where: { tenantId, status: 'PENDING_DISBURSEMENT' },
      }),
      prisma.loan.count({
        where: { tenantId, status: 'PENDING_ATTESTATION' },
      }),
      prisma.loan.count({
        where: {
          tenantId,
          status: { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
          attestationStatus: 'SLOT_PROPOSED',
          attestationCompletedAt: null,
        },
      }),
    ]);
    res.json({
      success: true,
      data: { pendingDisbursement, pendingAttestation, attestationSlotProposed },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get application counts for action-needed badges (permission-scoped).
 * GET /api/loans/applications/counts
 */
router.get(
  '/applications/counts',
  requireAnyPermission('applications.view', 'applications.approve_l1', 'applications.approve_l2', 'applications.reject'),
  async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const canL1 = userHasPermission(req, 'applications.approve_l1');
    const canL2 = userHasPermission(req, 'applications.approve_l2');

    const [submitted, underReview, pendingL2Approval] = await Promise.all([
      canL1
        ? prisma.loanApplication.count({ where: { tenantId, status: 'SUBMITTED' } })
        : Promise.resolve(0),
      canL1
        ? prisma.loanApplication.count({ where: { tenantId, status: 'UNDER_REVIEW' } })
        : Promise.resolve(0),
      canL2
        ? prisma.loanApplication.count({ where: { tenantId, status: 'PENDING_L2_APPROVAL' } })
        : Promise.resolve(0),
    ]);

    const l1QueueCount = submitted + underReview;
    res.json({
      success: true,
      data: {
        submitted,
        underReview,
        pendingL2Approval,
        l1QueueCount,
        /** Total items this user should see as actionable on Applications */
        actionableTotal: l1QueueCount + pendingL2Approval,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List loan applications
 * GET /api/loans/applications
 */
router.get('/applications', requirePermission('applications.view'), async (req, res, next) => {
  try {
    const { status, search, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const statusStr = typeof status === 'string' && status.length > 0 ? status : undefined;
    const l1QueueStatuses: ApplicationStatusFilter[] = ['SUBMITTED', 'UNDER_REVIEW'];
    const where = {
      tenantId: req.tenantId,
      ...(statusStr === 'L1_QUEUE'
        ? { status: { in: l1QueueStatuses } }
        : statusStr
          ? { status: statusStr as ApplicationStatusFilter }
          : {}),
      ...(search && {
        borrower: {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' as const } },
            { icNumber: { contains: search as string } },
            { companyName: { contains: search as string, mode: 'insensitive' as const } },
          ],
        },
      }),
    };

    const [applications, total] = await Promise.all([
      prisma.loanApplication.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          borrower: { select: { id: true, name: true, borrowerType: true, icNumber: true, documentType: true, companyName: true } },
          product: { select: { id: true, name: true, interestModel: true, interestRate: true } },
          /** List UI: pending lender counter-offer badge */
          offerRounds: { select: { status: true, fromParty: true } },
        },
      }),
      prisma.loanApplication.count({ where }),
    ]);

    const draftIdsForAmendmentCheck = applications.filter((a) => a.status === 'DRAFT').map((a) => a.id);

    let returnedDraftIdSet = new Set<string>();
    if (draftIdsForAmendmentCheck.length > 0) {
      const returnLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: req.tenantId!,
          entityType: 'LoanApplication',
          action: 'RETURN_TO_DRAFT',
          entityId: { in: draftIdsForAmendmentCheck },
        },
        select: { entityId: true },
      });
      returnedDraftIdSet = new Set(returnLogs.map((r) => r.entityId));
    }

    const data = applications.map((a) => {
      const { offerRounds = [], ...rest } = a;
      const pendingLenderCounterOffer =
        (a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW') &&
        offerRounds.some((o) => o.status === 'PENDING' && o.fromParty === 'ADMIN');
      return {
        ...rest,
        returnedForAmendment:
          a.status === 'DRAFT' &&
          (returnedDraftIdSet.has(a.id) || Boolean(a.notes?.includes('Returned for amendments:'))),
        pendingLenderCounterOffer,
      };
    });

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Preview loan calculation (fees, monthly payment, net disbursement)
 * POST /api/loans/applications/preview
 */
router.post('/applications/preview', requirePermission('applications.create'), async (req, res, next) => {
  try {
    const data = previewSchema.parse(req.body);

    // Verify product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        tenantId: req.tenantId,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    // Validate amount and term against product limits
    if (data.amount < toSafeNumber(product.minAmount) || data.amount > toSafeNumber(product.maxAmount)) {
      throw new BadRequestError(
        `Amount must be between ${product.minAmount} and ${product.maxAmount}`
      );
    }

    if (data.term < product.minTerm || data.term > product.maxTerm) {
      throw new BadRequestError(
        `Term must be between ${product.minTerm} and ${product.maxTerm} months`
      );
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
  } catch (error) {
    next(error);
  }
});

/**
 * Create loan application
 * POST /api/loans/applications
 */
router.post('/applications', requirePermission('applications.create'), async (req, res, next) => {
  try {
    const data = createApplicationSchema.parse(req.body);
    const tenantId = req.tenantId!;

    // Verify borrower exists and belongs to tenant
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: data.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const guarantors = await resolveValidGuarantors(tenantId, data.borrowerId, data.guarantorIds);

    // Verify product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        tenantId: req.tenantId,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    // Validate amount and term against product limits
    if (data.amount < toSafeNumber(product.minAmount) || data.amount > toSafeNumber(product.maxAmount)) {
      throw new BadRequestError(
        `Amount must be between ${product.minAmount} and ${product.maxAmount}`
      );
    }

    let actualInterestRate: number | null = null;
    let actualTerm: number | null = null;
    let applicationTerm = data.term;

    if (data.enableInternalSchedule) {
      if (!supportsInternalScheduleView(product.interestModel as 'FLAT' | 'RULE_78')) {
        throw new BadRequestError('Additional schedule options are only supported for flat-structured products');
      }

      if (data.actualInterestRate == null || data.actualTerm == null) {
        throw new BadRequestError('Risk-adjusted schedule rate and term are required');
      }

      actualInterestRate = safeRound(data.actualInterestRate, 2);
      actualTerm = data.actualTerm;

      const compliantStructure = deriveCompliantStructureFromInternal({
        principal: data.amount,
        compliantRateCap: toSafeNumber(product.interestRate),
        actualInterestRate: actualInterestRate!,
        actualTerm: actualTerm!,
      });
      applicationTerm = compliantStructure.compliantTerm;
    } else if (data.term < product.minTerm || data.term > product.maxTerm) {
      throw new BadRequestError(
        `Term must be between ${product.minTerm} and ${product.maxTerm} months`
      );
    }

    const application = await prisma.loanApplication.create({
      data: {
        tenantId,
        borrowerId: data.borrowerId,
        productId: data.productId,
        amount: data.amount,
        term: applicationTerm,
        notes: data.notes,
        status: 'DRAFT',
        // Admin-created applications are treated as branch / physical-origin unless explicitly overridden.
        loanChannel: data.loanChannel ?? 'PHYSICAL',
        actualInterestRate,
        actualTerm,
        collateralType: data.collateralType,
        collateralValue: data.collateralValue,
        guarantors: guarantors.length > 0
          ? {
              create: guarantors.map((guarantor, index) => ({
                tenantId,
                borrowerId: guarantor.id,
                order: index,
              })),
            }
          : undefined,
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
            documentVerified: true,
            verificationStatus: true,
            trueIdentityStatus: true,
            trueIdentityResult: true,
            directors: {
              select: {
                trueIdentityStatus: true,
                trueIdentityResult: true,
              },
            },
          },
        },
        product: { select: { id: true, name: true, interestModel: true, interestRate: true, loanScheduleType: true } },
        guarantors: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            borrower: {
              select: {
                id: true,
                name: true,
                borrowerType: true,
                companyName: true,
                icNumber: true,
                documentType: true,
                phone: true,
                email: true,
                address: true,
                documentVerified: true,
                verificationStatus: true,
                trueIdentityStatus: true,
                trueIdentityResult: true,
                directors: {
                  select: {
                    trueIdentityStatus: true,
                    trueIdentityResult: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Log to audit trail
    // For corporate borrowers, use companyName instead of rep name
    const borrowerDisplayName = borrower.borrowerType === 'CORPORATE' && borrower.companyName
      ? borrower.companyName
      : borrower.name;
    
    await AuditService.logCreate(
      req.tenantId!,
      req.memberId!,
      'LoanApplication',
      application.id,
      {
        borrowerId: data.borrowerId,
        borrowerName: borrowerDisplayName,
        productId: data.productId,
        productName: product.name,
        guarantorIds: guarantors.map((guarantor) => guarantor.id),
        amount: data.amount,
        term: data.term,
        status: 'DRAFT',
      },
      req.ip
    );

    const applicationWithVerification = {
      ...application,
      borrower: {
        ...application.borrower,
        verificationStatus: resolveVerificationStatus(application.borrower),
      },
      guarantors: application.guarantors.map((guarantor) => ({
        ...guarantor,
        borrower: {
          ...guarantor.borrower,
          verificationStatus: resolveVerificationStatus(guarantor.borrower),
        },
      })),
    };

    res.status(201).json({
      success: true,
      data: applicationWithVerification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single application
 * GET /api/loans/applications/:applicationId
 * Includes documents to avoid a separate round-trip.
 */
router.get('/applications/:applicationId', requirePermission('applications.view'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
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
            documentVerified: true,
            verificationStatus: true,
            trueIdentityStatus: true,
            trueIdentityResult: true,
            directors: {
              select: {
                trueIdentityStatus: true,
                trueIdentityResult: true,
              },
            },
          },
        },
        product: true,
        guarantors: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            borrower: {
              select: {
                id: true,
                name: true,
                borrowerType: true,
                companyName: true,
                icNumber: true,
                documentType: true,
                documentVerified: true,
                verificationStatus: true,
                trueIdentityStatus: true,
                trueIdentityResult: true,
                directors: {
                  select: {
                    trueIdentityStatus: true,
                    trueIdentityResult: true,
                  },
                },
                phone: true,
                email: true,
                address: true,
              },
            },
          },
        },
        documents: {
          orderBy: { uploadedAt: 'desc' },
        },
        loan: {
          select: { id: true, status: true },
        },
        offerRounds: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    const applicationWithVerification = {
      ...application,
      borrower: {
        ...application.borrower,
        verificationStatus: resolveVerificationStatus(application.borrower),
      },
      guarantors: application.guarantors.map((guarantor) => ({
        ...guarantor,
        borrower: {
          ...guarantor.borrower,
          verificationStatus: resolveVerificationStatus(guarantor.borrower),
        },
      })),
    };

    res.json({
      success: true,
      data: applicationWithVerification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update application
 * PATCH /api/loans/applications/:applicationId
 */
router.patch('/applications/:applicationId', requirePermission('applications.edit'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const data = updateApplicationSchema.parse(req.body);

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'DRAFT') {
      throw new BadRequestError('Can only update draft applications');
    }

    // Validate amount and term if provided
    if (data.amount !== undefined) {
      if (data.amount < toSafeNumber(application.product.minAmount) ||
          data.amount > toSafeNumber(application.product.maxAmount)) {
        throw new BadRequestError(
          `Amount must be between ${application.product.minAmount} and ${application.product.maxAmount}`
        );
      }
    }

    if (data.term !== undefined) {
      if (data.term < application.product.minTerm || 
          data.term > application.product.maxTerm) {
        throw new BadRequestError(
          `Term must be between ${application.product.minTerm} and ${application.product.maxTerm} months`
        );
      }
    }

    // Capture previous data for audit
    const previousData = {
      amount: application.amount,
      term: application.term,
      notes: application.notes,
    };

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data,
      include: {
        borrower: { select: { id: true, name: true, borrowerType: true, icNumber: true, documentType: true, companyName: true } },
        product: { select: { id: true, name: true, interestModel: true, interestRate: true } },
      },
    });

    // Log to audit trail
    await AuditService.logUpdate(
      req.tenantId!,
      req.memberId!,
      'LoanApplication',
      application.id,
      previousData,
      data,
      req.ip
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Submit application for approval
 * POST /api/loans/applications/:applicationId/submit
 */
router.post('/applications/:applicationId/submit', requirePermission('applications.edit'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const submitData = submitApplicationSchema.parse(req.body);
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'DRAFT') {
      throw new BadRequestError('Can only submit draft applications');
    }

    if (application.loanChannel !== 'PHYSICAL') {
      throw new BadRequestError(
        'Online applications must be submitted by the borrower. Admin submit is only for physical (in-branch) applications.',
      );
    }

    let actualInterestRate: number | null = null;
    let actualTerm: number | null = null;

    if (submitData.enableInternalSchedule) {
      if (!supportsInternalScheduleView(application.product.interestModel as 'FLAT' | 'RULE_78')) {
        throw new BadRequestError('Additional schedule options are only supported for flat-structured products');
      }

      if (submitData.actualInterestRate == null || submitData.actualTerm == null) {
        throw new BadRequestError('Risk-adjusted schedule rate and term are required');
      }

      actualInterestRate = safeRound(submitData.actualInterestRate, 2);
      actualTerm = submitData.actualTerm;

      deriveCompliantStructureFromInternal({
        principal: toSafeNumber(application.amount),
        compliantRateCap: toSafeNumber(application.product.interestRate),
        actualInterestRate: actualInterestRate!,
        actualTerm: actualTerm!,
      });
    }

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: 'SUBMITTED',
        actualInterestRate,
        actualTerm,
        l1ReviewedAt: null,
        l1ReviewedByMemberId: null,
        l1DecisionNote: null,
        l2ReviewedAt: null,
        l2ReviewedByMemberId: null,
        l2DecisionNote: null,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'SUBMIT',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: {
        status: 'DRAFT',
        actualInterestRate: application.actualInterestRate,
        actualTerm: application.actualTerm,
      },
      newData: {
        status: 'SUBMITTED',
        actualInterestRate,
        actualTerm,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

const sendToL2Schema = z.object({
  note: z.string().max(8000).optional(),
});

/**
 * L1: send application to L2 queue (no loan created)
 * POST /api/loans/applications/:applicationId/send-to-l2
 */
router.post('/applications/:applicationId/send-to-l2', requirePermission('applications.approve_l1'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;
    const body = sendToL2Schema.parse(req.body ?? {});

    const application = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (!isL1QueueStatus(application.status)) {
      throw new BadRequestError('Can only send to L2 from submitted or under-review applications');
    }

    await assertNoPendingOffersForApproval(applicationId);

    const previousStatus = application.status;
    const noteTrim = body.note?.trim() || null;

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: 'PENDING_L2_APPROVAL',
        l1ReviewedAt: new Date(),
        l1ReviewedByMemberId: req.memberId ?? null,
        l1DecisionNote: noteTrim,
        l2ReviewedAt: null,
        l2ReviewedByMemberId: null,
        l2DecisionNote: null,
      },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPLICATION_SEND_TO_L2',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: previousStatus },
      newData: { status: 'PENDING_L2_APPROVAL', l1DecisionNote: noteTrim },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

const finalApproveSchema = z.object({
  note: z.string().max(8000).optional(),
});

/**
 * L2: approve application and create loan with schedule
 * POST /api/loans/applications/:applicationId/approve
 */
router.post('/applications/:applicationId/approve', requirePermission('applications.approve_l2'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;
    const approveBody = finalApproveSchema.parse(req.body ?? {});
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        guarantors: {
          orderBy: { order: 'asc' },
          include: {
            borrower: {
              select: {
                id: true,
                name: true,
                borrowerType: true,
                companyName: true,
                documentType: true,
                icNumber: true,
                phone: true,
                email: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'PENDING_L2_APPROVAL') {
      throw new BadRequestError('Final approval is only available for applications pending L2 review');
    }

    await assertNoPendingOffersForApproval(applicationId);

    const previousStatus = application.status;
    const productRateCap = toSafeNumber(application.product.interestRate);
    const principalAmount = toSafeNumber(application.amount);
    const hasRiskAdjustedSchedule = application.actualInterestRate != null && application.actualTerm != null;
    let compliantInterestRate = productRateCap;
    let derivedTerm = application.term;
    let actualInterestRate: number | null = null;
    let actualTerm: number | null = null;

    if (hasRiskAdjustedSchedule) {
      if (!supportsInternalScheduleView(application.product.interestModel as 'FLAT' | 'RULE_78')) {
        throw new BadRequestError('Additional schedule options are only supported for flat-structured products');
      }

      const rate = safeRound(toSafeNumber(application.actualInterestRate), 2);
      const term = application.actualTerm!;
      actualInterestRate = rate;
      actualTerm = term;
      const compliantStructure = deriveCompliantStructureFromInternal({
        principal: principalAmount,
        compliantRateCap: productRateCap,
        actualInterestRate: rate,
        actualTerm: term,
      });
      compliantInterestRate = compliantStructure.compliantInterestRate;
      derivedTerm = compliantStructure.compliantTerm;
    }

    const initialLoanStatus =
      application.loanChannel === 'ONLINE' ? 'PENDING_ATTESTATION' : 'PENDING_DISBURSEMENT';

    const noteTrim = approveBody.note?.trim() || null;

    // Create loan with initial schedule in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update application status
      await tx.loanApplication.update({
        where: { id: application.id },
        data: {
          status: 'APPROVED',
          l2ReviewedAt: new Date(),
          l2ReviewedByMemberId: req.memberId ?? null,
          l2DecisionNote: noteTrim,
        },
      });

      // Create loan (copy collateral fields for Jadual K products)
      const loan = await tx.loan.create({
        data: {
          tenantId: req.tenantId!,
          borrowerId: application.borrowerId,
          productId: application.productId,
          applicationId: application.id,
          principalAmount: application.amount,
          interestRate: compliantInterestRate,
          term: derivedTerm,
          actualInterestRate,
          actualTerm,
          status: initialLoanStatus,
          loanChannel: application.loanChannel,
          collateralType: application.collateralType,
          collateralValue: application.collateralValue,
          guarantors: application.guarantors.length > 0
            ? {
                create: application.guarantors.map((guarantor, index) => ({
                  tenantId: req.tenantId!,
                  borrowerId: guarantor.borrowerId,
                  order: guarantor.order ?? index,
                  name: guarantor.borrower.name,
                  borrowerType: guarantor.borrower.borrowerType,
                  companyName: guarantor.borrower.companyName,
                  documentType: guarantor.borrower.documentType,
                  icNumber: guarantor.borrower.icNumber,
                  phone: guarantor.borrower.phone,
                  email: guarantor.borrower.email,
                  address: guarantor.borrower.address,
                })),
              }
            : undefined,
        },
      });

      return loan;
    });

    // Log application approval to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPROVE',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: previousStatus },
      newData: { status: 'APPROVED', loanId: result.id, l2DecisionNote: noteTrim },
      ipAddress: req.ip,
    });

    // Log loan creation to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'CREATE',
      entityType: 'Loan',
      entityId: result.id,
      previousData: null,
      newData: {
        principalAmount: Number(application.amount),
        interestRate: compliantInterestRate,
        term: derivedTerm,
        status: initialLoanStatus,
        applicationId: application.id,
        borrowerId: application.borrowerId,
        productId: application.productId,
      },
      ipAddress: req.ip,
    });

    try {
      await NotificationOrchestrator.notifyBorrowerEvent({
        tenantId: req.tenantId!,
        borrowerId: application.borrowerId,
        notificationKey: 'application_approved',
        category: 'applications',
        title: 'Application approved',
        body: 'Your application has been approved and moved into the loan setup stage.',
        deepLink: `/applications/${application.id}`,
        sourceType: 'LOAN_APPLICATION',
        sourceId: application.id,
      });
    } catch (notificationError) {
      console.error(`[Notifications] Failed to fan out application approval ${application.id}:`, notificationError);
    }

    try {
      await recalculateBorrowerPerformanceProjection(req.tenantId!, application.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${application.borrowerId}:`, projectionError);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Reject application
 * POST /api/loans/applications/:applicationId/reject
 */
router.post('/applications/:applicationId/reject', requirePermission('applications.reject'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;
    const { reason } = req.body;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status === 'APPROVED' || application.status === 'REJECTED') {
      throw new BadRequestError('Cannot reject this application');
    }

    if (application.status === 'DRAFT' || application.status === 'CANCELLED') {
      throw new BadRequestError('Cannot reject this application in its current state');
    }

    if (isL1QueueStatus(application.status)) {
      assertL1ApplicationAction(req);
    } else if (application.status === 'PENDING_L2_APPROVAL') {
      assertL2ApplicationAction(req);
    } else {
      throw new BadRequestError('Cannot reject this application in its current state');
    }

    const previousStatus = application.status;
    const reasonStr = typeof reason === 'string' ? reason : '';

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        notes: reasonStr ? `${application.notes || ''}\n\nRejection reason: ${reasonStr}` : application.notes,
        ...(application.status === 'PENDING_L2_APPROVAL'
          ? {
              l2ReviewedAt: new Date(),
              l2ReviewedByMemberId: req.memberId ?? null,
              l2DecisionNote: reasonStr.trim() || null,
            }
          : {}),
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'REJECT',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: previousStatus },
      newData: { status: 'REJECTED', reason: reasonStr || null },
      ipAddress: req.ip,
    });

    try {
      await NotificationOrchestrator.notifyBorrowerEvent({
        tenantId: req.tenantId!,
        borrowerId: application.borrowerId,
        notificationKey: 'application_rejected',
        category: 'applications',
        title: 'Application rejected',
        body: reason?.trim()
          ? `Your application was rejected. Reason: ${reason.trim()}`
          : 'Your application was rejected.',
        deepLink: `/applications/${application.id}`,
        sourceType: 'LOAN_APPLICATION',
        sourceId: application.id,
      });
    } catch (notificationError) {
      console.error(`[Notifications] Failed to fan out application rejection ${application.id}:`, notificationError);
    }

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

const negotiationBodySchema = z.object({
  amount: z.number().positive(),
  term: z.number().int().positive(),
});

/**
 * Admin counter-offer (amount + term)
 * POST /api/loans/applications/:applicationId/counter-offer
 */
router.post('/applications/:applicationId/counter-offer', requireAnyPermission('applications.approve_l1', 'applications.approve_l2'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;
    const body = negotiationBodySchema.parse(req.body);

    const appRow = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
      select: { status: true, borrowerId: true },
    });
    if (!appRow) throw new NotFoundError('Application');
    if (isL1QueueStatus(appRow.status)) {
      assertL1ApplicationAction(req);
    } else if (appRow.status === 'PENDING_L2_APPROVAL') {
      assertL2ApplicationAction(req);
    } else {
      throw new BadRequestError('Negotiation is not available for this application status');
    }

    const out = await adminCounterOffer({
      tenantId: req.tenantId!,
      applicationId,
      amount: body.amount,
      term: body.term,
    });
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPLICATION_COUNTER_OFFER',
      entityType: 'LoanApplication',
      entityId: applicationId,
      newData: { offerId: out.id, fromParty: 'ADMIN', amount: body.amount, term: body.term },
      ipAddress: req.ip,
    });

    try {
      await NotificationOrchestrator.notifyBorrowerEvent({
        tenantId: req.tenantId!,
        borrowerId: appRow.borrowerId,
        notificationKey: 'application_counter_offer',
        category: 'applications',
        title: 'Counter offer from your lender',
        body: `The lender proposed RM ${safeRound(body.amount, 2).toFixed(2)} over ${body.term} months. Review and respond in your application.`,
        deepLink: `/applications/${applicationId}`,
        sourceType: 'LOAN_APPLICATION',
        sourceId: applicationId,
        metadata: {
          offerId: out.id,
          amount: body.amount,
          term: body.term,
        },
      });
    } catch (notificationError) {
      console.error(
        `[Notifications] Failed to fan out lender counter-offer for application ${applicationId}:`,
        notificationError
      );
    }

    res.status(201).json({ success: true, data: out });
  } catch (error) {
    next(error);
  }
});

/**
 * Admin accepts borrower's latest pending counter-offer
 * POST /api/loans/applications/:applicationId/accept-offer
 */
router.post('/applications/:applicationId/accept-offer', requireAnyPermission('applications.approve_l1', 'applications.approve_l2'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;

    const appRow = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
      select: { status: true },
    });
    if (!appRow) throw new NotFoundError('Application');
    if (isL1QueueStatus(appRow.status)) {
      assertL1ApplicationAction(req);
    } else if (appRow.status === 'PENDING_L2_APPROVAL') {
      assertL2ApplicationAction(req);
    } else {
      throw new BadRequestError('Cannot accept offer for this application');
    }

    await adminAcceptLatestOffer({ tenantId: req.tenantId!, applicationId });
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPLICATION_ACCEPT_BORROWER_OFFER',
      entityType: 'LoanApplication',
      entityId: applicationId,
      ipAddress: req.ip,
    });
    const updated = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
      include: { offerRounds: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * Reject all pending negotiation offers (admin)
 * POST /api/loans/applications/:applicationId/reject-offers
 */
router.post('/applications/:applicationId/reject-offers', requireAnyPermission('applications.approve_l1', 'applications.approve_l2'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;

    const appRow = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
      select: { status: true },
    });
    if (!appRow) throw new NotFoundError('Application');
    if (isL1QueueStatus(appRow.status)) {
      assertL1ApplicationAction(req);
    } else if (appRow.status === 'PENDING_L2_APPROVAL') {
      assertL2ApplicationAction(req);
    } else {
      throw new BadRequestError('Cannot reject offers for this application');
    }

    await rejectPendingOffers({ tenantId: req.tenantId!, applicationId });
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPLICATION_REJECT_OFFERS',
      entityType: 'LoanApplication',
      entityId: applicationId,
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Return application to draft (amendments needed)
 * POST /api/loans/applications/:applicationId/return-to-draft
 */
router.post('/applications/:applicationId/return-to-draft', requireAnyPermission('applications.approve_l1', 'applications.approve_l2'), async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;
    const { reason } = req.body;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (isL1QueueStatus(application.status)) {
      assertL1ApplicationAction(req);
    } else if (application.status === 'PENDING_L2_APPROVAL') {
      assertL2ApplicationAction(req);
    } else {
      throw new BadRequestError('Can only return submitted, under-review, or pending-L2 applications to draft');
    }

    const previousStatus = application.status;

    const reasonStr = typeof reason === 'string' ? reason.trim() : '';
    const amendmentNote = reasonStr
      ? `\n\nReturned for amendments: ${reasonStr}`
      : '\n\nReturned for amendments:';

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: 'DRAFT',
        notes: `${application.notes || ''}${amendmentNote}`,
        l1ReviewedAt: null,
        l1ReviewedByMemberId: null,
        l1DecisionNote: null,
        l2ReviewedAt: null,
        l2ReviewedByMemberId: null,
        l2DecisionNote: null,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'RETURN_TO_DRAFT',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: previousStatus },
      newData: { status: 'DRAFT', reason: reason || null },
      ipAddress: req.ip,
    });

    try {
      await NotificationOrchestrator.notifyBorrowerEvent({
        tenantId: req.tenantId!,
        borrowerId: application.borrowerId,
        notificationKey: 'application_returned_for_amendments',
        category: 'applications',
        title: 'Application returned for amendments',
        body: reasonStr
          ? `Your lender returned this application to draft. ${reasonStr.length > 400 ? `${reasonStr.slice(0, 400)}…` : reasonStr}`
          : 'Your lender returned your application to draft so you can make updates.',
        deepLink: `/applications/${applicationId}`,
        sourceType: 'LOAN_APPLICATION',
        sourceId: applicationId,
        metadata: { previousStatus, reason: reasonStr || null },
      });
    } catch (notificationError) {
      console.error(
        `[Notifications] Failed to fan out return-to-draft for application ${applicationId}:`,
        notificationError
      );
    }

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Application Timeline
// ============================================

/**
 * Get application activity timeline
 * GET /api/loans/applications/:applicationId/timeline
 */
router.get('/applications/:applicationId/timeline', requirePermission('applications.view'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const { cursor, limit: limitStr = '10' } = req.query;
    const limit = Math.min(parseInt(limitStr as string, 10), 50);

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    // Fetch audit logs for this application with cursor-based pagination
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        entityType: 'LoanApplication',
        entityId: applicationId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine hasMore
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
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    // Transform to timeline format
    const timeline = items.map(log => ({
      id: log.id,
      action: log.action,
      previousData: log.previousData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.member?.user ? {
        id: log.member.user.id,
        email: log.member.user.email,
        name: log.member.user.name,
      } : null,
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

const applicationStaffNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(16000),
});

function mapApplicationStaffNoteAuthor(createdBy: {
  user: { id: string; name: string | null; email: string };
} | null) {
  if (!createdBy?.user) return null;
  return {
    id: createdBy.user.id,
    name: createdBy.user.name,
    email: createdBy.user.email,
  };
}

/**
 * Staff internal notes on an application
 * GET /api/loans/applications/:applicationId/staff-notes
 */
router.get('/applications/:applicationId/staff-notes', requirePermission('applications.view'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const { cursor, limit: limitStr = '30' } = req.query;
    const limit = Math.min(Math.max(parseInt(limitStr as string, 10) || 30, 1), 100);

    const application = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!application) throw new NotFoundError('Application');

    const rows = await prisma.applicationNote.findMany({
      where: {
        tenantId: req.tenantId!,
        applicationId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        createdBy: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    res.json({
      success: true,
      data: items.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        author: mapApplicationStaffNoteAuthor(n.createdBy),
      })),
      pagination: { hasMore, nextCursor },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loans/applications/:applicationId/staff-notes
 */
router.post('/applications/:applicationId/staff-notes', requirePermission('applications.edit'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const parsed = applicationStaffNoteBodySchema.parse(req.body);

    const application = await prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!application) throw new NotFoundError('Application');

    const note = await prisma.applicationNote.create({
      data: {
        tenantId: req.tenantId!,
        applicationId,
        body: parsed.body,
        createdByMemberId: req.memberId ?? null,
      },
      include: {
        createdBy: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'STAFF_NOTE_CREATE',
      entityType: 'LoanApplication',
      entityId: applicationId,
      newData: {
        noteId: note.id,
        excerpt: parsed.body.slice(0, 500),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        author: mapApplicationStaffNoteAuthor(note.createdBy),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Application Documents
// ============================================

/**
 * Upload document to application
 * POST /api/loans/applications/:applicationId/documents
 */
router.post('/applications/:applicationId/documents', requirePermission('applications.edit'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    // Parse the file upload
    const { buffer, originalName, mimeType, category } = await parseDocumentUpload(req);

    // Validate category against product's required documents
    const requiredDocs = application.product.requiredDocuments as Array<{ key: string; label: string; required: boolean }>;
    const validCategory = requiredDocs.some(doc => doc.key === category) || category === 'OTHER';
    
    if (!validCategory) {
      throw new BadRequestError(`Invalid document category: ${category}`);
    }

    // Save the file
    const extension = path.extname(originalName).toLowerCase();
    const { filename, path: filePath } = await saveDocumentFile(buffer, req.tenantId!, applicationId, extension);

    // Create document record
    const document = await prisma.applicationDocument.create({
      data: {
        tenantId: req.tenantId!,
        applicationId,
        filename,
        originalName,
        mimeType,
        size: buffer.length,
        path: filePath,
        category,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'DOCUMENT_UPLOAD',
      entityType: 'LoanApplication',
      entityId: applicationId,
      newData: {
        documentId: document.id,
        category,
        originalName,
        mimeType,
        size: buffer.length,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List documents for application
 * GET /api/loans/applications/:applicationId/documents
 */
router.get('/applications/:applicationId/documents', requirePermission('applications.view'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    const documents = await prisma.applicationDocument.findMany({
      where: {
        applicationId,
        tenantId: req.tenantId,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete document from application
 * DELETE /api/loans/applications/:applicationId/documents/:documentId
 */
router.delete('/applications/:applicationId/documents/:documentId', requirePermission('applications.edit'), async (req, res, next) => {
  try {
    const applicationId = getRouteParam(req.params.applicationId);
    const documentId = getRouteParam(req.params.documentId);

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    // Find the document
    const document = await prisma.applicationDocument.findFirst({
      where: {
        id: documentId,
        applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Delete the file from storage
    await deleteDocumentFile(document.path);

    // Delete the document record
    await prisma.applicationDocument.delete({
      where: { id: documentId },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'DOCUMENT_DELETE',
      entityType: 'LoanApplication',
      entityId: applicationId,
      previousData: {
        documentId: document.id,
        category: document.category,
        originalName: document.originalName,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Document deleted',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Loans
// ============================================

/**
 * List loans
 * GET /api/loans
 */
router.get('/', requirePermission('loans.view'), async (req, res, next) => {
  try {
    const { status, search, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(status && {
        status: status as
          | 'PENDING_ATTESTATION'
          | 'PENDING_DISBURSEMENT'
          | 'ACTIVE'
          | 'IN_ARREARS'
          | 'COMPLETED'
          | 'DEFAULTED'
          | 'WRITTEN_OFF'
          | 'CANCELLED',
      }),
      ...(search && {
        borrower: {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' as const } },
            { icNumber: { contains: search as string } },
            { companyName: { contains: search as string, mode: 'insensitive' as const } },
          ],
        },
      }),
    };

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          borrower: {
            select: {
              id: true,
              name: true,
              borrowerType: true,
              icNumber: true,
              documentType: true,
              companyName: true,
              documentVerified: true,
              verificationStatus: true,
              trueIdentityStatus: true,
              trueIdentityResult: true,
              directors: {
                select: {
                  trueIdentityStatus: true,
                  trueIdentityResult: true,
                },
              },
            },
          },
          product: { select: { id: true, name: true, loanScheduleType: true } },
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              repayments: {
                select: { status: true, lateFeeAccrued: true, lateFeesPaid: true },
              },
            },
          },
        },
      }),
      prisma.loan.count({ where: where }),
    ]);

    // Transform loans to include progress data and late fee breakdown
    const loansWithProgress = loans.map(loan => {
      const schedule = loan.scheduleVersions[0];
      const repayments = schedule?.repayments || [];
      const totalRepayments = repayments.length;
      const paidCount = repayments.filter(r => r.status === 'PAID' || r.status === 'CANCELLED').length;
      const readyToComplete = totalRepayments > 0 && paidCount === totalRepayments && 
        (loan.status === 'ACTIVE' || loan.status === 'IN_ARREARS');
      const borrowerVerificationStatus = resolveVerificationStatus(loan.borrower);

      // Calculate late fee breakdown
      const totalLateFeesAccrued = repayments.reduce((sum, r) => safeAdd(sum, toSafeNumber(r.lateFeeAccrued)), 0);
      const totalLateFeesPaid = repayments.reduce((sum, r) => safeAdd(sum, toSafeNumber(r.lateFeesPaid)), 0);
      const unpaidLateFees = safeRound(Math.max(0, safeSubtract(totalLateFeesAccrued, totalLateFeesPaid)), 2);
      
      // Remove scheduleVersions from response to keep it clean
      const { scheduleVersions, ...loanData } = loan;
      
      return {
        ...loanData,
        borrower: {
          ...loan.borrower,
          verificationStatus: borrowerVerificationStatus,
        },
        lateFeeBreakdown: {
          total: safeRound(toSafeNumber(loan.totalLateFees), 2),
          paid: safeRound(totalLateFeesPaid, 2),
          unpaid: unpaidLateFees,
        },
        progress: {
          paidCount,
          totalRepayments,
          progressPercent: totalRepayments > 0 ? safeRound(safeDivide(paidCount, totalRepayments) * 100, 1) : 0,
          readyToComplete,
        },
      };
    });

    res.json({
      success: true,
      data: loansWithProgress,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Late Fee Processing Routes
// (Must be defined BEFORE /:loanId catch-all)
// ============================================

/**
 * Process late fees manually
 * POST /api/loans/process-late-fees
 * 
 * Safe to run multiple times - backfill logic with unique constraint
 * (@@unique([repaymentId, accrualDate])) prevents double-charging.
 * Each run catches up any missed days since the last accrual.
 */
router.post('/process-late-fees', requireAnyPermission('loans.manage', 'collections.manage'), async (req, res, next) => {
  try {
    // Scope to current tenant so admin only processes their own loans
    const result = await LateFeeProcessor.processLateFees('MANUAL', req.tenantId!);

    if (result.skippedReason) {
      return res.status(409).json({
        success: false,
        error: result.skippedReason,
      });
    }

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'LATE_FEE_PROCESSING',
      entityType: 'System',
      entityId: 'late-fee-processor',
      newData: {
        trigger: 'MANUAL',
        loansProcessed: result.loansProcessed,
        feesCalculated: result.feesCalculated,
        totalFeeAmount: result.totalFeeAmount,
        arrearsLettersGenerated: result.arrearsLettersGenerated,
        defaultReadyLoans: result.defaultReadyLoans,
        processingTimeMs: result.processingTimeMs,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get late fee processing status
 * GET /api/loans/late-fee-status
 */
router.get(
  '/late-fee-status',
  requireAnyPermission('loans.view', 'loans.manage', 'collections.view', 'collections.manage'),
  async (req, res, next) => {
  try {
    const [status, loansPendingDisbursement, loansPendingAttestation] = await Promise.all([
      LateFeeProcessor.getProcessingStatus(req.tenantId!),
      prisma.loan.count({
        where: {
          tenantId: req.tenantId!,
          status: 'PENDING_DISBURSEMENT',
        },
      }),
      prisma.loan.count({
        where: {
          tenantId: req.tenantId!,
          status: 'PENDING_ATTESTATION',
        },
      }),
    ]);
    res.json({
      success: true,
      data: { ...status, loansPendingDisbursement, loansPendingAttestation },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get recent late fee processing logs
 * GET /api/loans/late-fee-logs
 */
router.get(
  '/late-fee-logs',
  requireAnyPermission('loans.view', 'loans.manage', 'collections.view', 'collections.manage'),
  async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const logs = await LateFeeProcessor.getRecentLogs(limit, req.tenantId!);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

const attestationOfficeHoursPutSchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  slotStepMinutes: z.number().int().positive().optional(),
  slotDurationMinutes: z.number().int().positive().optional(),
  /** How many days ahead to show slots (1–7) */
  availabilityHorizonDays: z.number().int().min(1).max(7).optional(),
});

const acceptAttestationProposalBodySchema = z
  .object({
    mode: z.enum(['google', 'manual']).optional(),
    manualMeetingUrl: z.string().min(1).max(2048).optional(),
    manualMeetingNotes: z.string().max(2000).optional(),
  })
  .optional();

const attestationCounterSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  mode: z.enum(['google', 'manual']),
  manualMeetingUrl: z.string().min(1).max(2048).optional(),
  manualMeetingNotes: z.string().max(2000).optional(),
});

/**
 * GET /api/loans/attestation/office-hours
 * Fallback availability rules when Google free/busy is unavailable.
 */
router.get(
  '/attestation/office-hours',
  requireAnyPermission('availability.view', 'availability.manage', 'attestation.view'),
  async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const config = await getTenantOfficeHoursConfig(tenantId);
    res.json({ success: true, data: config });
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /api/loans/attestation/office-hours
 */
router.put('/attestation/office-hours', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const body = attestationOfficeHoursPutSchema.parse(req.body);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { attestationOfficeHoursJson: body },
    });
    await AuditService.log({
      tenantId,
      memberId: req.memberId,
      action: 'ATTESTATION_OFFICE_HOURS_UPDATED',
      entityType: 'Tenant',
      entityId: tenantId,
      newData: body,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: body });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/loans/attestation-queue
 * Loans with pending attestation meeting proposals (sorted by meeting requested time).
 */
router.get(
  '/attestation-queue',
  requireAnyPermission('attestation.view', 'attestation.schedule', 'attestation.witness_sign'),
  async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    await expirePendingProposals({ tenantId });
    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
        attestationStatus: {
          in: [
            'MEETING_REQUESTED',
            'SLOT_PROPOSED',
            'COUNTER_PROPOSED',
            'PROPOSAL_EXPIRED',
            'MEETING_SCHEDULED',
          ],
        },
        attestationCompletedAt: null,
      },
      orderBy: { attestationMeetingRequestedAt: 'asc' },
      include: {
        borrower: { select: { id: true, name: true, email: true, phone: true } },
        product: { select: { name: true } },
        attestationAssignedMember: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
      },
      take: 200,
    });
    res.json({ success: true, data: loans });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/loans/:loanId/attestation/accept-proposal
 */
router.post('/:loanId/attestation/accept-proposal', requirePermission('attestation.schedule'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const loanId = getRouteParam(req.params.loanId);
    const memberId = req.memberId;
    if (!memberId) {
      throw new BadRequestError('Member context required');
    }

    const body = acceptAttestationProposalBodySchema.parse(req.body);

    let result;
    try {
      result = await adminAcceptBorrowerProposal({
        loanId,
        tenantId,
        memberId,
        mode: body?.mode,
        manualMeetingUrl: body?.manualMeetingUrl,
        manualMeetingNotes: body?.manualMeetingNotes,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GOOGLE_CALENDAR_NOT_CONFIGURED') {
        throw new BadRequestError('Google Calendar is not configured for this tenant.');
      }
      if (msg === 'INVALID_ATTESTATION_STATE') {
        throw new BadRequestError('No borrower proposal to accept.');
      }
      if (msg.startsWith('Google Calendar auth failed') || msg.startsWith('Google Calendar:')) {
        throw new BadRequestError(msg);
      }
      if (msg === 'MANUAL_MEETING_URL_REQUIRED') {
        throw new BadRequestError('Provide a meeting URL for manual scheduling.');
      }
      throw err;
    }

    await AuditService.log({
      tenantId,
      memberId,
      action: 'ADMIN_ATTESTATION_PROPOSAL_ACCEPTED',
      entityType: 'Loan',
      entityId: loanId,
      newData: { meetLink: result.meetLink },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/loans/:loanId/attestation/counter-proposal
 */
router.post('/:loanId/attestation/counter-proposal', requirePermission('attestation.schedule'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const loanId = getRouteParam(req.params.loanId);
    const memberId = req.memberId;
    if (!memberId) {
      throw new BadRequestError('Member context required');
    }
    const body = attestationCounterSchema.parse(req.body);
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);

    let updated;
    try {
      updated = await adminCounterProposal({
        loanId,
        tenantId,
        memberId,
        startAt,
        endAt,
        mode: body.mode,
        manualMeetingUrl: body.manualMeetingUrl,
        manualMeetingNotes: body.manualMeetingNotes,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SLOT_NO_LONGER_AVAILABLE') {
        throw new BadRequestError('That slot overlaps another booking. Choose another time.');
      }
      if (msg === 'INVALID_ATTESTATION_STATE') {
        throw new BadRequestError('Counter is only allowed when a borrower proposal is pending.');
      }
      if (msg === 'GOOGLE_CALENDAR_NOT_CONFIGURED') {
        throw new BadRequestError('Google Calendar is not configured. Use manual meeting link or configure Calendar.');
      }
      if (msg === 'MANUAL_MEETING_URL_REQUIRED') {
        throw new BadRequestError('Provide a meeting URL for manual scheduling.');
      }
      if (msg.startsWith('Google Calendar auth failed') || msg.startsWith('Google Calendar:')) {
        throw new BadRequestError(msg);
      }
      throw err;
    }

    await AuditService.log({
      tenantId,
      memberId,
      action: 'ADMIN_ATTESTATION_COUNTER_PROPOSED',
      entityType: 'Loan',
      entityId: loanId,
      newData: { startAt: startAt.toISOString(), endAt: endAt.toISOString() },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/loans/:loanId/attestation/reject-proposal
 */
router.post('/:loanId/attestation/reject-proposal', requirePermission('attestation.schedule'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      select: {
        id: true,
        status: true,
        attestationStatus: true,
      },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status) || loan.attestationStatus !== 'SLOT_PROPOSED') {
      throw new BadRequestError('Nothing to reject.');
    }

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'CANCELLED',
        attestationCancellationReason: 'PROPOSAL_REJECTED_BY_LENDER',
        attestationCancelledAt: new Date(),
        attestationProposalStartAt: null,
        attestationProposalEndAt: null,
        attestationProposalDeadlineAt: null,
        attestationProposalSource: null,
        attestationMeetingLink: null,
        attestationMeetingNotes: null,
        attestationGoogleCalendarEventId: null,
      },
    });

    await AuditService.log({
      tenantId,
      memberId: req.memberId,
      action: 'ADMIN_ATTESTATION_PROPOSAL_REJECTED',
      entityType: 'Loan',
      entityId: loanId,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/loans/:loanId/attestation/complete-meeting
 * Admin confirms the scheduled attestation meeting is finished; unlocks signing.
 */
router.post(
  '/:loanId/attestation/complete-meeting',
  requireAnyPermission('attestation.schedule', 'attestation.witness_sign'),
  async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const memberId = req.memberId;
    const loanId = getRouteParam(req.params.loanId);
    if (!memberId) {
      throw new BadRequestError('Member context required');
    }

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      select: {
        id: true,
        status: true,
        attestationStatus: true,
        attestationCompletedAt: true,
        borrowerId: true,
      },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status)) {
      throw new BadRequestError('Attestation is only available while the loan is pending disbursement');
    }
    if (loan.attestationStatus !== 'MEETING_SCHEDULED') {
      throw new BadRequestError('Schedule a meeting before marking it complete.');
    }
    if (loan.attestationCompletedAt) {
      throw new BadRequestError('Attestation is already complete.');
    }

    const now = new Date();
    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'PENDING_DISBURSEMENT',
        attestationStatus: 'MEETING_COMPLETED',
        attestationMeetingAdminCompletedAt: now,
      },
    });

    await AuditService.log({
      tenantId,
      memberId,
      action: 'ADMIN_ATTESTATION_MEETING_MARKED_COMPLETE',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { attestationStatus: loan.attestationStatus, status: loan.status },
      newData: {
        attestationStatus: updated.attestationStatus,
        attestationMeetingAdminCompletedAt: now.toISOString(),
        status: 'PENDING_DISBURSEMENT',
      },
      ipAddress: req.ip,
    });

    try {
      await NotificationOrchestrator.notifyBorrowerEvent({
        tenantId,
        borrowerId: loan.borrowerId,
        notificationKey: 'loan_attestation_meeting_done',
        category: 'loan_lifecycle',
        title: 'Meeting complete — action required',
        body: 'Your attestation meeting is complete. In your loan, accept the loan to continue to identity verification and signing, or reject if you do not wish to proceed.',
        deepLink: `/loans/${loanId}`,
        sourceType: 'LOAN',
        sourceId: loanId,
      });
    } catch (notificationError) {
      console.error(`[Notifications] Failed admin attestation complete notify ${loanId}:`, notificationError);
    }

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

const loanStaffNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(16000),
});

function mapLoanStaffNoteAuthor(createdBy: {
  user: { id: string; name: string | null; email: string };
} | null) {
  if (!createdBy?.user) return null;
  return {
    id: createdBy.user.id,
    name: createdBy.user.name,
    email: createdBy.user.email,
  };
}

/**
 * Staff internal notes on a loan
 * GET /api/loans/:loanId/staff-notes
 */
router.get('/:loanId/staff-notes', requirePermission('loans.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const { cursor, limit: limitStr = '30' } = req.query;
    const limit = Math.min(Math.max(parseInt(limitStr as string, 10) || 30, 1), 100);

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!loan) throw new NotFoundError('Loan');

    const rows = await prisma.loanNote.findMany({
      where: {
        tenantId: req.tenantId!,
        loanId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        createdBy: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    res.json({
      success: true,
      data: items.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        author: mapLoanStaffNoteAuthor(n.createdBy),
      })),
      pagination: { hasMore, nextCursor },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loans/:loanId/staff-notes
 */
router.post('/:loanId/staff-notes', requirePermission('loans.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const parsed = loanStaffNoteBodySchema.parse(req.body);

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: req.tenantId },
      select: { id: true },
    });
    if (!loan) throw new NotFoundError('Loan');

    const note = await prisma.loanNote.create({
      data: {
        tenantId: req.tenantId!,
        loanId,
        body: parsed.body,
        createdByMemberId: req.memberId ?? null,
      },
      include: {
        createdBy: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'STAFF_NOTE_CREATE',
      entityType: 'Loan',
      entityId: loanId,
      newData: {
        noteId: note.id,
        excerpt: parsed.body.slice(0, 500),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        author: mapLoanStaffNoteAuthor(note.createdBy),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single loan with schedule
 * GET /api/loans/:loanId
 */
router.get('/:loanId', requirePermission('loans.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const tenantId = req.tenantId!;
    await expireStaleAttestationProposalForLoan({ loanId, tenantId });

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId,
      },
      include: {
        borrower: {
          include: {
            directors: {
              select: {
                trueIdentityStatus: true,
                trueIdentityResult: true,
              },
            },
          },
        },
        product: true,
        application: true,
        guarantors: {
          orderBy: { order: 'asc' },
          include: {
            borrower: {
              select: {
                documentVerified: true,
                verificationStatus: true,
                borrowerType: true,
                trueIdentityStatus: true,
                trueIdentityResult: true,
                directors: {
                  select: {
                    trueIdentityStatus: true,
                    trueIdentityResult: true,
                  },
                },
              },
            },
          },
        },
        scheduleVersions: {
          orderBy: { version: 'desc' },
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
                  include: {
                    transaction: true, // Include transaction with receipt and proof of payment
                  },
                  orderBy: { allocatedAt: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const loanWithVerification = {
      ...loan,
      borrower: {
        ...loan.borrower,
        verificationStatus: resolveVerificationStatus(loan.borrower),
      },
      guarantors: loan.guarantors.map((guarantor) => ({
        ...guarantor,
        borrower: guarantor.borrower
          ? {
              ...guarantor.borrower,
              verificationStatus: resolveVerificationStatus(guarantor.borrower),
            }
          : guarantor.borrower,
      })),
    };

    res.json({
      success: true,
      data: loanWithVerification,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:loanId/schedule/internal', requireAnyPermission('applications.approve_l1', 'applications.approve_l2', 'loans.manage', 'loans.disburse'), async (req, res, next) => {
  try {
    const loanId = req.params.loanId as string;
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      select: {
        id: true,
        principalAmount: true,
        interestRate: true,
        actualInterestRate: true,
        term: true,
        actualTerm: true,
        disbursementDate: true,
        agreementDate: true,
        createdAt: true,
        product: {
          select: {
            interestModel: true,
          },
        },
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            interestModel: true,
            repayments: {
              orderBy: { dueDate: 'asc' },
              select: {
                id: true,
                status: true,
                principal: true,
                interest: true,
                totalDue: true,
                allocations: {
                  orderBy: { allocatedAt: 'asc' },
                  select: {
                    id: true,
                    amount: true,
                    allocatedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const schedule = buildInternalScheduleView({
      id: loan.id,
      principalAmount: loan.principalAmount,
      interestRate: loan.interestRate,
      actualInterestRate: loan.actualInterestRate,
      term: loan.term,
      actualTerm: loan.actualTerm,
      disbursementDate: loan.disbursementDate,
      agreementDate: loan.agreementDate,
      createdAt: loan.createdAt,
      product: {
        interestModel: loan.product.interestModel,
      },
      scheduleVersions: loan.scheduleVersions.map((version) => ({
        id: version.id,
        interestModel: version.interestModel,
        repayments: version.repayments.map((repayment) => ({
          id: repayment.id,
          status: repayment.status,
          principal: repayment.principal,
          interest: repayment.interest,
          totalDue: repayment.totalDue,
          allocations: repayment.allocations.map((allocation) => ({
            id: allocation.id,
            amount: allocation.amount,
            allocatedAt: allocation.allocatedAt,
          })),
        })),
      })),
    });

    res.json({
      success: true,
      data: schedule
        ? {
            enabled: true,
            schedule,
          }
        : {
            enabled: false,
          },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update loan status based on overdue repayments (arrears/default check)
 * POST /api/loans/:loanId/update-status
 * 
 * This endpoint checks overdue repayments and updates loan status:
 * - ACTIVE -> IN_ARREARS if any repayment is overdue past arrearsPeriod
 * - IN_ARREARS -> DEFAULTED if any repayment is overdue past defaultPeriod
 * - IN_ARREARS -> ACTIVE if all overdue repayments are now paid
 */
router.post('/:loanId/update-status', requirePermission('loans.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Only check active or in-arrears loans
    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      return res.json({
        success: true,
        data: { 
          loanId: loan.id, 
          status: loan.status, 
          message: 'Status check not applicable for this loan status' 
        },
      });
    }

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      return res.json({
        success: true,
        data: { 
          loanId: loan.id, 
          status: loan.status, 
          message: 'No schedule found' 
        },
      });
    }

    const now = new Date();
    const arrearsPeriod = loan.product.arrearsPeriod;
    const defaultPeriod = loan.product.defaultPeriod;
    const { oldestOverdueDays, hasUnpaidOverdue } = evaluateOverdueStatus(currentSchedule.repayments, now);

    // Determine new status
    let newStatus: string = loan.status;
    let statusChanged = false;

    if (oldestOverdueDays >= defaultPeriod) {
      newStatus = 'DEFAULTED';
    } else if (oldestOverdueDays >= arrearsPeriod) {
      newStatus = 'IN_ARREARS';
    } else if (!hasUnpaidOverdue && loan.status === 'IN_ARREARS') {
      // No more overdue repayments, can return to ACTIVE
      newStatus = 'ACTIVE';
    }

    if (newStatus !== loan.status) {
      statusChanged = true;
      const previousStatus = loan.status;

      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: newStatus as 'ACTIVE' | 'IN_ARREARS' | 'DEFAULTED' },
      });

      // Log to audit trail
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'STATUS_UPDATE',
        entityType: 'Loan',
        entityId: loan.id,
        previousData: { status: previousStatus },
        newData: { 
          status: newStatus, 
          oldestOverdueDays,
          arrearsPeriod,
          defaultPeriod,
        },
        ipAddress: req.ip,
      });

      try {
        await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
      } catch (projectionError) {
        console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
      }
    }

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        previousStatus: loan.status,
        newStatus,
        statusChanged,
        oldestOverdueDays,
        arrearsPeriod,
        defaultPeriod,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Bulk update loan statuses for all active/in-arrears loans (admin utility)
 * POST /api/loans/update-all-statuses
 */
router.post('/update-all-statuses', requirePermission('loans.manage'), async (req, res, next) => {
  try {
    // Get all active and in-arrears loans for this tenant
    const loans = await prisma.loan.findMany({
      where: {
        tenantId: req.tenantId,
        status: { in: ['ACTIVE', 'IN_ARREARS'] },
      },
      include: {
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: { allocations: true },
            },
          },
        },
      },
    });

    const results: Array<{
      loanId: string;
      status?: string;
      previousStatus?: string;
      newStatus?: string;
      changed: boolean;
      reason?: string;
      oldestOverdueDays?: number;
    }> = [];
    const now = new Date();

    for (const loan of loans) {
      const currentSchedule = loan.scheduleVersions[0];
      if (!currentSchedule) {
        results.push({ loanId: loan.id, status: loan.status, changed: false, reason: 'No schedule' });
        continue;
      }

      const arrearsPeriod = loan.product.arrearsPeriod;
      const defaultPeriod = loan.product.defaultPeriod;
      const { oldestOverdueDays, hasUnpaidOverdue } = evaluateOverdueStatus(currentSchedule.repayments, now);

      let newStatus: string = loan.status;
      if (oldestOverdueDays >= defaultPeriod) {
        newStatus = 'DEFAULTED';
      } else if (oldestOverdueDays >= arrearsPeriod) {
        newStatus = 'IN_ARREARS';
      } else if (!hasUnpaidOverdue && loan.status === 'IN_ARREARS') {
        newStatus = 'ACTIVE';
      }

      if (newStatus !== loan.status) {
        const previousStatus = loan.status;
        await prisma.loan.update({
          where: { id: loan.id },
          data: { status: newStatus as 'ACTIVE' | 'IN_ARREARS' | 'DEFAULTED' },
        });

        await AuditService.log({
          tenantId: req.tenantId!,
          memberId: req.memberId,
          action: 'STATUS_UPDATE',
          entityType: 'Loan',
          entityId: loan.id,
          previousData: { status: previousStatus },
          newData: { status: newStatus, oldestOverdueDays },
          ipAddress: req.ip,
        });

        try {
          await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
        } catch (projectionError) {
          console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
        }

        results.push({ loanId: loan.id, previousStatus, newStatus, changed: true, oldestOverdueDays });
      } else {
        results.push({ loanId: loan.id, status: loan.status, changed: false, oldestOverdueDays });
      }
    }

    res.json({
      success: true,
      data: {
        totalChecked: loans.length,
        totalUpdated: results.filter(r => r.changed).length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Preview schedule for a loan (before disbursement)
 * GET /api/loans/:loanId/schedule/preview
 */
router.get('/:loanId/schedule/preview', requirePermission('loans.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const { disbursementDate: disbursementDateStr } = req.query;
    const disbursementDate = disbursementDateStr 
      ? new Date(disbursementDateStr as string) 
      : new Date();

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Generate preview schedule
    const scheduleOutput = generateSchedule({
      principal: Number(loan.principalAmount),
      interestRate: Number(loan.interestRate),
      term: loan.term,
      disbursementDate,
      interestModel: loan.product.interestModel,
    });

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        principal: loan.principalAmount,
        interestRate: loan.interestRate,
        term: loan.term,
        interestModel: loan.product.interestModel,
        disbursementDate: disbursementDate.toISOString(),
        ...scheduleOutput,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get loan activity timeline
 * GET /api/loans/:loanId/timeline
 */
router.get('/:loanId/timeline', requirePermission('loans.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const { cursor, limit: limitStr = '20' } = req.query;
    const limit = Math.min(parseInt(limitStr as string, 10), 50);

    // Verify loan exists and belongs to tenant
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        guarantors: {
          select: { id: true },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const loanGuarantorIds = (loan.guarantors || []).map((guarantor) => guarantor.id);

    // Fetch audit logs for this loan with cursor-based pagination
    // Exclude TrueSend email entries — they have their own dedicated section
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        OR: [
          { entityType: 'Loan', entityId: loanId },
          ...(loanGuarantorIds.length > 0
            ? [{ entityType: 'LoanGuarantor', entityId: { in: loanGuarantorIds } }]
            : []),
        ],
        action: { notIn: ['TRUESEND_EMAIL_SENT', 'TRUESEND_EMAIL_RESENT'] },
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
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    const timeline = items.map(log => ({
      id: log.id,
      action: log.action,
      previousData: log.previousData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.member?.user ? {
        id: log.member.user.id,
        email: log.member.user.email,
        name: log.member.user.name,
      } : null,
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
 * Get loan metrics (repayment rate, totals, etc.)
 * GET /api/loans/:loanId/metrics
 */
router.get('/:loanId/metrics', requirePermission('loans.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: {
                allocations: true,
              },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      return res.json({
        success: true,
        data: {
          loanId: loan.id,
          status: loan.status,
          hasSchedule: false,
        },
      });
    }

    const now = new Date();
    let totalDue = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalLateFees = toSafeNumber(loan.totalLateFees);
    let paidOnTime = 0;
    let paidLate = 0;
    let overdueCount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let oldestOverdueDays = 0;
    let cancelledDue = 0; // Track original totalDue of CANCELLED repayments

    for (const repayment of currentSchedule.repayments) {
      const repaymentTotalDue = toSafeNumber(repayment.totalDue);
      const repaymentPaid = repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
      const remaining = safeSubtract(repaymentTotalDue, repaymentPaid);

      totalDue = safeAdd(totalDue, repaymentTotalDue);
      totalPaid = safeAdd(totalPaid, repaymentPaid);
      totalOutstanding = safeAdd(totalOutstanding, Math.max(0, remaining));

      if (repayment.status === 'PAID' || repayment.status === 'CANCELLED') {
        paidCount++;
        if (repayment.status === 'PAID') {
          // Check if paid on time (before or on due date)
          const lastPaymentDate = repayment.allocations.length > 0
            ? repayment.allocations[repayment.allocations.length - 1].allocatedAt
            : null;
          if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
            paidOnTime++;
          } else {
            paidLate++;
          }
        } else {
          // CANCELLED repayments from early settlement - track their original amounts
          cancelledDue += repaymentTotalDue;
        }
      } else if (repayment.dueDate < now && remaining > 0) {
        overdueCount++;
        const daysOverdue = calculateDaysOverdueMalaysia(repayment.dueDate, now);
        if (daysOverdue > oldestOverdueDays) {
          oldestOverdueDays = daysOverdue;
        }
      } else {
        pendingCount++;
      }
    }

    // For early-settled loans, adjust totals to reflect the discounted settlement
    // instead of the full original obligation of cancelled repayments.
    // The settlement payment covers the discounted remaining balance, so we need to
    // reconcile totalDue and totalPaid so they match for a completed loan.
    const isEarlySettled = !!loan.earlySettlementDate;
    if (isEarlySettled && loan.earlySettlementAmount && cancelledDue > 0) {
      const settlementAmount = toSafeNumber(loan.earlySettlementAmount);
      // Replace the original full totalDue of cancelled repayments with the actual settlement amount
      totalDue = safeSubtract(totalDue, cancelledDue);
      totalDue = safeAdd(totalDue, settlementAmount);
      // Cap totalPaid to totalDue — the borrower's effective obligation was the adjusted totalDue
      totalPaid = safeRound(Math.min(totalPaid, totalDue));
      // Outstanding should be 0 for completed early-settled loans
      totalOutstanding = Math.max(0, safeSubtract(totalDue, totalPaid));
    }

    const totalScheduled = paidCount + overdueCount + pendingCount;
    const repaymentRate = totalScheduled > 0 ? safeMultiply(safeDivide(paidOnTime, paidOnTime + paidLate + overdueCount), 100) : 0;

    // Determine arrears/default status
    const arrearsPeriod = loan.product.arrearsPeriod;
    const defaultPeriod = loan.product.defaultPeriod;
    const isInArrears = oldestOverdueDays >= arrearsPeriod;
    const isDefaulted = oldestOverdueDays >= defaultPeriod;

    // Early settlement details for progress display
    const earlySettlementInfo = isEarlySettled ? {
      isEarlySettled: true,
      settlementAmount: loan.earlySettlementAmount ? safeRound(toSafeNumber(loan.earlySettlementAmount), 2) : null,
      discountAmount: loan.earlySettlementDiscount ? safeRound(toSafeNumber(loan.earlySettlementDiscount), 2) : null,
    } : null;

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        status: loan.status,
        hasSchedule: true,
        // Totals
        totalDue: safeRound(totalDue, 2),
        totalPaid: safeRound(totalPaid, 2),
        totalOutstanding: safeRound(totalOutstanding, 2),
        totalLateFees: safeRound(totalLateFees, 2),
        // Counts
        paidCount,
        pendingCount,
        overdueCount,
        totalRepayments: currentSchedule.repayments.length,
        // Performance
        repaymentRate: safeRound(repaymentRate, 1),
        paidOnTime,
        paidLate,
        // Overdue status
        oldestOverdueDays,
        arrearsPeriod,
        defaultPeriod,
        isInArrears,
        isDefaulted,
        // Progress (cap at 100% for completed/early-settled loans)
        progressPercent: Math.min(100, safeRound(safeDivide(totalPaid, totalDue) * 100, 1)),
        // Early settlement
        earlySettlement: earlySettlementInfo,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Complete/discharge loan after all payments
 * POST /api/loans/:loanId/complete
 */
router.post('/:loanId/complete', requirePermission('loans.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const { notes } = req.body;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        tenant: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'COMPLETED') {
      throw new BadRequestError('Loan is already completed');
    }

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Can only complete active or in-arrears loans');
    }

    // Verify all repayments are paid (CANCELLED from early settlement counts as settled)
    const currentSchedule = loan.scheduleVersions[0];
    if (currentSchedule) {
      const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED');
      if (unpaidRepayments.length > 0) {
        throw new BadRequestError(`Cannot complete loan: ${unpaidRepayments.length} unpaid repayment(s) remaining`);
      }
    }

    // Calculate repayment rate for metrics
    let paidOnTime = 0;
    let paidLate = 0;
    let totalPaid = 0;
    if (currentSchedule) {
      for (const repayment of currentSchedule.repayments) {
        const lastPaymentDate = repayment.allocations.length > 0
          ? repayment.allocations[repayment.allocations.length - 1].allocatedAt
          : null;
        if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
          paidOnTime++;
        } else {
          paidLate++;
        }
        // Sum up all payments
        totalPaid = safeAdd(totalPaid, repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0));
      }
    }
    const totalPayments = paidOnTime + paidLate;
    const repaymentRate = totalPayments > 0 ? safeMultiply(safeDivide(paidOnTime, totalPayments), 100) : 100;

    const previousStatus = loan.status;
    const completedAt = new Date();

    const updatedLoan = await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        dischargeNotes: notes || null,
        repaymentRate,
      },
    });

    // Generate discharge letter
    const borrower = loan.borrower;
    const totalLateFees = toSafeNumber(loan.totalLateFees);
    
    let dischargeLetterPath: string | null = null;
    try {
      dischargeLetterPath = await generateDischargeLetter({
        loan: {
          id: loan.id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          term: loan.term,
          disbursementDate: loan.disbursementDate,
          completedAt,
        },
        borrower: {
          displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName 
            ? borrower.companyName 
            : borrower.name,
          identificationNumber: borrower.icNumber,
          address: borrower.address,
        },
        tenant: {
          name: loan.tenant.name,
          registrationNumber: loan.tenant.registrationNumber,
          licenseNumber: loan.tenant.licenseNumber,
          businessAddress: loan.tenant.businessAddress,
          contactNumber: loan.tenant.contactNumber,
          email: loan.tenant.email,
          logoUrl: loan.tenant.logoUrl,
        },
        totalPaid,
        totalLateFees,
        dischargeNotes: notes || null,
      });

      // Update loan with discharge letter path
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          dischargeLetterPath,
          dischargeLetterGenAt: new Date(),
        },
      });

      // Audit log for discharge letter generation
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'GENERATE_DISCHARGE_LETTER',
        entityType: 'Loan',
        entityId: loan.id,
        previousData: { dischargeLetterPath: null },
        newData: { dischargeLetterPath },
        ipAddress: req.ip,
      });
    } catch (error) {
      console.error('Failed to generate discharge letter:', error);
      // Continue without failing - letter generation is not critical
    }

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'COMPLETE',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: previousStatus },
      newData: { 
        status: 'COMPLETED', 
        notes: notes || null, 
        repaymentRate,
        dischargeLetterGenerated: !!dischargeLetterPath,
      },
      ipAddress: req.ip,
    });

    try {
      await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    // TrueSend: send completion notification with discharge letter
    let emailSent = false;
    if (dischargeLetterPath) {
      try {
        emailSent = await TrueSendService.sendCompletionNotification(req.tenantId!, loan.id, dischargeLetterPath);
      } catch (emailErr) {
        console.error(`[CompleteLoan] TrueSend email failed for loan ${loan.id}:`, emailErr);
      }
    }

    res.json({
      success: true,
      data: {
        ...updatedLoan,
        dischargeLetterPath,
      },
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Download discharge letter for a completed loan
 * GET /api/loans/:loanId/discharge-letter
 */
router.get(
  '/:loanId/discharge-letter',
  requireAnyPermission('loans.view', 'collections.view'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'COMPLETED') {
      throw new BadRequestError('Discharge letter is only available for completed loans');
    }

    if (!loan.dischargeLetterPath) {
      throw new NotFoundError('Discharge letter not generated');
    }

    const fileBuffer = await getFile(loan.dischargeLetterPath);
    if (!fileBuffer) {
      throw new NotFoundError('Discharge letter file');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Discharge-Letter-${loan.id.substring(0, 8)}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Download arrears letter for a loan
 * GET /api/loans/:loanId/arrears-letter
 */
router.get(
  '/:loanId/arrears-letter',
  requireAnyPermission('loans.view', 'collections.view'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.arrearsLetterPath) {
      throw new NotFoundError('Arrears letter not generated');
    }

    const fileBuffer = await getFile(loan.arrearsLetterPath);
    if (!fileBuffer) {
      throw new NotFoundError('Arrears letter file');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Arrears-Letter-${loan.id.substring(0, 8)}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Download default letter for a loan
 * GET /api/loans/:loanId/default-letter
 */
router.get(
  '/:loanId/default-letter',
  requireAnyPermission('loans.view', 'collections.view'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.defaultLetterPath) {
      throw new NotFoundError('Default letter not generated');
    }

    const fileBuffer = await getFile(loan.defaultLetterPath);
    if (!fileBuffer) {
      throw new NotFoundError('Default letter file');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Default-Letter-${loan.id.substring(0, 8)}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Manually generate (regenerate) an arrears letter for a loan
 * POST /api/loans/:loanId/generate-arrears-letter
 * 
 * Allowed for IN_ARREARS and DEFAULTED status.
 * Does NOT overwrite old letters — generates a new PDF with fresh data.
 * Enforces a 1-day cooldown: if the current arrearsLetterPath was generated 
 * within the last 24 hours, the request is rejected.
 */
router.post(
  '/:loanId/generate-arrears-letter',
  requireAnyPermission('loans.manage', 'collections.manage'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        borrower: true,
        tenant: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'IN_ARREARS' && loan.status !== 'DEFAULTED') {
      throw new BadRequestError('Arrears letter can only be generated for loans in arrears or default status');
    }

    // 1-day cooldown check: parse date from the most recent arrears letter filename
    if (loan.arrearsLetterPath) {
      const filename = loan.arrearsLetterPath.split('/').pop() || '';
      // Filename format: ARR-YYYYMMDD-HHmmss-loanId.pdf
      const match = filename.match(/^ARR-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/);
      if (match) {
        const [, y, m, d, hh, mm, ss] = match;
        const letterDate = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
        const hoursSince = (Date.now() - letterDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          throw new BadRequestError(
            `An arrears letter was generated ${Math.floor(hoursSince)} hours ago. Please wait at least 24 hours between letters.`
          );
        }
      } else {
        // Legacy format: ARR-YYYYMMDD-loanId.pdf (no time component)
        const legacyMatch = filename.match(/^ARR-(\d{4})(\d{2})(\d{2})-/);
        if (legacyMatch) {
          const [, y, m, d] = legacyMatch;
          const letterDate = new Date(`${y}-${m}-${d}T00:00:00Z`);
          const hoursSince = (Date.now() - letterDate.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            throw new BadRequestError(
              `An arrears letter was generated recently. Please wait at least 24 hours between letters.`
            );
          }
        }
      }
    }

    // Gather fresh overdue data
    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      throw new BadRequestError('Loan has no repayment schedule');
    }

    const overdueRepayments = currentSchedule.repayments
      .filter(r => r.status !== 'PAID' && new Date(r.dueDate) < new Date())
      .map((r) => {
        const repIdx = currentSchedule.repayments.findIndex(ar => ar.id === r.id);
        const totalDue = toSafeNumber(r.totalDue);
        const paid = r.allocations.reduce((s, a) => safeAdd(s, toSafeNumber(a.amount)), 0);
        return {
          repaymentNumber: repIdx + 1,
          dueDate: r.dueDate,
          totalDue,
          amountPaid: paid,
          outstanding: safeSubtract(totalDue, paid),
          lateFeeAccrued: toSafeNumber(r.lateFeeAccrued),
          daysOverdue: calculateDaysOverdueMalaysia(r.dueDate),
        };
      });

    if (overdueRepayments.length === 0) {
      throw new BadRequestError('No overdue repayments found');
    }

    const totalOutstanding = overdueRepayments.reduce((s, r) => safeAdd(s, r.outstanding), 0);
    const totalLateFees = overdueRepayments.reduce((s, r) => safeAdd(s, r.lateFeeAccrued), 0);

    const borrower = loan.borrower;
    const letterPath = await generateArrearsLetter({
      loan: {
        id: loan.id,
        principalAmount: loan.principalAmount,
        interestRate: loan.interestRate,
        term: loan.term,
        disbursementDate: loan.disbursementDate,
        totalLateFees: loan.totalLateFees,
      },
      borrower: {
        displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName
          ? borrower.companyName
          : borrower.name,
        identificationNumber: borrower.icNumber,
        address: borrower.address,
      },
      tenant: {
        name: loan.tenant.name,
        registrationNumber: loan.tenant.registrationNumber,
        licenseNumber: loan.tenant.licenseNumber,
        businessAddress: loan.tenant.businessAddress,
        contactNumber: loan.tenant.contactNumber,
        email: loan.tenant.email,
        logoUrl: loan.tenant.logoUrl,
      },
      overdueRepayments,
      totalOutstanding,
      totalLateFees,
      arrearsPeriod: loan.product.arrearsPeriod,
    });

    // Update loan with new letter path (old file is NOT deleted)
    await prisma.loan.update({
      where: { id: loan.id },
      data: { arrearsLetterPath: letterPath },
    });

    // Audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'GENERATE_ARREARS_LETTER',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { arrearsLetterPath: loan.arrearsLetterPath },
      newData: { arrearsLetterPath: letterPath },
      ipAddress: req.ip,
    });

    // TrueSend: send arrears notice email with letter attached
    let emailSent = false;
    try {
      emailSent = await TrueSendService.sendArrearsNotice(req.tenantId!, loan.id, letterPath);
    } catch (emailErr) {
      console.error(`[GenerateArrearsLetter] TrueSend email failed for loan ${loan.id}:`, emailErr);
    }

    res.json({
      success: true,
      data: { arrearsLetterPath: letterPath },
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Manually generate (regenerate) a default letter for a loan
 * POST /api/loans/:loanId/generate-default-letter
 * 
 * Allowed for DEFAULTED status only.
 * Does NOT overwrite old letters — generates a new PDF with fresh data.
 * Enforces a 1-day cooldown from the last generated default letter.
 */
router.post(
  '/:loanId/generate-default-letter',
  requireAnyPermission('loans.manage', 'collections.manage'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        borrower: true,
        tenant: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'DEFAULTED') {
      throw new BadRequestError('Default letter can only be generated for defaulted loans');
    }

    // 1-day cooldown check
    if (loan.defaultLetterPath) {
      const filename = loan.defaultLetterPath.split('/').pop() || '';
      // Filename format: DEF-YYYYMMDD-HHmmss-loanId.pdf
      const match = filename.match(/^DEF-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/);
      if (match) {
        const [, y, m, d, hh, mm, ss] = match;
        const letterDate = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
        const hoursSince = (Date.now() - letterDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          throw new BadRequestError(
            `A default letter was generated ${Math.floor(hoursSince)} hours ago. Please wait at least 24 hours between letters.`
          );
        }
      } else {
        // Legacy format: DEF-YYYYMMDD-loanId.pdf
        const legacyMatch = filename.match(/^DEF-(\d{4})(\d{2})(\d{2})-/);
        if (legacyMatch) {
          const [, y, m, d] = legacyMatch;
          const letterDate = new Date(`${y}-${m}-${d}T00:00:00Z`);
          const hoursSince = (Date.now() - letterDate.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            throw new BadRequestError(
              `A default letter was generated recently. Please wait at least 24 hours between letters.`
            );
          }
        }
      }
    }

    // Gather fresh overdue data
    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      throw new BadRequestError('Loan has no repayment schedule');
    }

    const overdueRepayments = currentSchedule.repayments
      .filter(r => r.status !== 'PAID' && new Date(r.dueDate) < new Date())
      .map((r) => {
        const repIdx = currentSchedule.repayments.findIndex(ar => ar.id === r.id);
        const totalDue = toSafeNumber(r.totalDue);
        const paid = r.allocations.reduce((s, a) => safeAdd(s, toSafeNumber(a.amount)), 0);
        return {
          repaymentNumber: repIdx + 1,
          dueDate: r.dueDate,
          totalDue,
          amountPaid: paid,
          outstanding: safeSubtract(totalDue, paid),
          lateFeeAccrued: toSafeNumber(r.lateFeeAccrued),
          daysOverdue: calculateDaysOverdueMalaysia(r.dueDate),
        };
      });

    if (overdueRepayments.length === 0) {
      throw new BadRequestError('No overdue repayments found');
    }

    const totalOutstanding = overdueRepayments.reduce((s, r) => safeAdd(s, r.outstanding), 0);
    const totalLateFees = overdueRepayments.reduce((s, r) => safeAdd(s, r.lateFeeAccrued), 0);

    const borrower = loan.borrower;
    const letterPath = await generateDefaultLetter({
      loan: {
        id: loan.id,
        principalAmount: loan.principalAmount,
        interestRate: loan.interestRate,
        term: loan.term,
        disbursementDate: loan.disbursementDate,
        totalLateFees: loan.totalLateFees,
      },
      borrower: {
        displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName
          ? borrower.companyName
          : borrower.name,
        identificationNumber: borrower.icNumber,
        address: borrower.address,
      },
      tenant: {
        name: loan.tenant.name,
        registrationNumber: loan.tenant.registrationNumber,
        licenseNumber: loan.tenant.licenseNumber,
        businessAddress: loan.tenant.businessAddress,
        contactNumber: loan.tenant.contactNumber,
        email: loan.tenant.email,
        logoUrl: loan.tenant.logoUrl,
      },
      overdueRepayments,
      totalOutstanding,
      totalLateFees,
    });

    // Update loan with new letter path (old file is NOT deleted)
    await prisma.loan.update({
      where: { id: loan.id },
      data: { defaultLetterPath: letterPath },
    });

    // Audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'GENERATE_DEFAULT_LETTER',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { defaultLetterPath: loan.defaultLetterPath },
      newData: { defaultLetterPath: letterPath },
      ipAddress: req.ip,
    });

    // TrueSend: send default notice email with letter attached
    let emailSent = false;
    try {
      emailSent = await TrueSendService.sendDefaultNotice(req.tenantId!, loan.id, letterPath);
    } catch (emailErr) {
      console.error(`[GenerateDefaultLetter] TrueSend email failed for loan ${loan.id}:`, emailErr);
    }

    res.json({
      success: true,
      data: { defaultLetterPath: letterPath },
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Mark loan as defaulted
 * POST /api/loans/:loanId/mark-default
 * 
 * Enhanced: generates a default letter PDF and logs to audit trail.
 * Loan should ideally have readyForDefault=true (but admin can override).
 */
router.post(
  '/:loanId/mark-default',
  requireAnyPermission('loans.manage', 'collections.manage'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const { reason } = req.body;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        borrower: true,
        tenant: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'DEFAULTED' || loan.status === 'WRITTEN_OFF') {
      throw new BadRequestError('Loan is already defaulted or written off');
    }

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Can only default active or in-arrears loans');
    }

    const previousStatus = loan.status;

    // Generate default letter
    let defaultLetterPath: string | null = null;
    try {
      const currentSchedule = loan.scheduleVersions[0];
      const overdueRepayments = currentSchedule?.repayments
        .filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED' && new Date(r.dueDate) < new Date())
        .map((r, _idx) => {
          const repIdx = currentSchedule.repayments.findIndex(ar => ar.id === r.id);
          const totalDue = toSafeNumber(r.totalDue);
          const paid = r.allocations.reduce((s, a) => safeAdd(s, toSafeNumber(a.amount)), 0);
          return {
            repaymentNumber: repIdx + 1,
            dueDate: r.dueDate,
            totalDue,
            amountPaid: paid,
            outstanding: safeSubtract(totalDue, paid),
            lateFeeAccrued: toSafeNumber(r.lateFeeAccrued),
            daysOverdue: calculateDaysOverdueMalaysia(r.dueDate),
          };
        }) || [];

      const totalOutstanding = overdueRepayments.reduce((s, r) => safeAdd(s, r.outstanding), 0);
      const totalLateFees = overdueRepayments.reduce((s, r) => safeAdd(s, r.lateFeeAccrued), 0);

      const borrower = loan.borrower;
      defaultLetterPath = await generateDefaultLetter({
        loan: {
          id: loan.id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          term: loan.term,
          disbursementDate: loan.disbursementDate,
          totalLateFees: loan.totalLateFees,
        },
        borrower: {
          displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName
            ? borrower.companyName
            : borrower.name,
          identificationNumber: borrower.icNumber,
          address: borrower.address,
        },
        tenant: {
          name: loan.tenant.name,
          registrationNumber: loan.tenant.registrationNumber,
          licenseNumber: loan.tenant.licenseNumber,
          businessAddress: loan.tenant.businessAddress,
          contactNumber: loan.tenant.contactNumber,
          email: loan.tenant.email,
          logoUrl: loan.tenant.logoUrl,
        },
        overdueRepayments,
        totalOutstanding,
        totalLateFees,
      });

      // Audit log: default letter generated (auto during mark-default)
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'GENERATE_DEFAULT_LETTER',
        entityType: 'Loan',
        entityId: loan.id,
        newData: {
          defaultLetterPath,
          trigger: 'mark_default',
        },
        ipAddress: req.ip,
      });
    } catch (letterErr) {
      console.error('Failed to generate default letter:', letterErr);
    }

    const updatedLoan = await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: 'DEFAULTED',
        dischargeNotes: reason ? `Default reason: ${reason}` : null,
        defaultLetterPath,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'MARK_DEFAULT',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: previousStatus },
      newData: {
        status: 'DEFAULTED',
        reason: reason || null,
        defaultLetterPath,
      },
      ipAddress: req.ip,
    });

    try {
      await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    // TrueSend: send default notice email with letter attached
    let emailSent = false;
    if (defaultLetterPath) {
      try {
        emailSent = await TrueSendService.sendDefaultNotice(req.tenantId!, loan.id, defaultLetterPath);
      } catch (emailErr) {
        console.error(`[MarkDefault] TrueSend email failed for loan ${loan.id}:`, emailErr);
      }
    }

    res.json({
      success: true,
      data: updatedLoan,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Disburse loan and generate schedule
 * POST /api/loans/:loanId/disburse
 * 
 * Supports multipart form data for optional proof of disbursement file upload
 */
router.post('/:loanId/disburse', requirePermission('loans.disburse'), async (req, res, next) => {
  try {
    const loanId = req.params.loanId as string;
    // Check content type to determine if file upload
    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    
    let disbursementDate: Date;
    let reference: string | undefined;
    let proofFile: { buffer: Buffer; originalName: string; mimeType: string } | null = null;

    if (isMultipart) {
      // Parse multipart form data (use parseFileUpload which doesn't require category)
      const { buffer, originalName, mimeType, fields } = await parseFileUpload(req);
      
      // Get fields from form data
      disbursementDate = fields?.disbursementDate 
        ? new Date(fields.disbursementDate) 
        : new Date();
      reference = fields?.reference;
      
      // Store file info if file was uploaded
      if (buffer && buffer.length > 0) {
        proofFile = { buffer, originalName, mimeType };
      }
    } else {
      // Parse JSON body
      const data = disburseSchema.parse(req.body);
      disbursementDate = data.disbursementDate ? new Date(data.disbursementDate) : new Date();
      reference = data.reference;
    }

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        guarantors: {
          select: {
            id: true,
            name: true,
            agreementGeneratedAt: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Loan is not pending disbursement');
    }

    // Agreement date must be fixed before disbursement so schedule generation
    // follows the downloaded agreement date.
    if (!loan.agreementDate) {
      throw new BadRequestError('Agreement date is not set. Please regenerate the loan agreement first.');
    }

    const pendingGuarantorAgreements = loan.guarantors.filter((guarantor) => !guarantor.agreementGeneratedAt);
    if (pendingGuarantorAgreements.length > 0) {
      const guarantorNames = pendingGuarantorAgreements.map((guarantor) => guarantor.name).join(', ');
      throw new BadRequestError(
        `Generate guarantor agreement(s) first before disbursement: ${guarantorNames}`
      );
    }

    if (!loan.agreementPath) {
      throw new BadRequestError('Signed loan agreement is not uploaded yet.');
    }

    if (loan.signedAgreementReviewStatus !== 'APPROVED') {
      throw new BadRequestError(
        'Signed loan agreement must be approved before disbursement. Ask the borrower to upload the signed agreement or approve it in the loan admin screen.'
      );
    }

    if (loan.loanChannel === 'ONLINE' && !loan.attestationCompletedAt) {
      throw new BadRequestError(
        'Borrower attestation must be completed before disbursement. Ask the borrower to finish attestation in the borrower portal.'
      );
    }

    // Generate disbursement reference if not provided
    const dateStr = disbursementDate.toISOString().split('T')[0].replace(/-/g, '');
    const disbursementReference = reference || `DIS-${dateStr}-${loan.id.substring(0, 8).toUpperCase()}`;

    // Handle proof file upload
    let proofData: {
      disbursementProofPath: string;
      disbursementProofName: string;
      disbursementProofMime: string;
      disbursementProofSize: number;
      disbursementProofAt: Date;
    } | null = null;

    if (proofFile) {
      const { path: disbursementProofPath } = await saveFile(
        proofFile.buffer,
        'disbursement-proofs',
        loan.id,
        proofFile.originalName
      );

      proofData = {
        disbursementProofPath,
        disbursementProofName: proofFile.originalName,
        disbursementProofMime: proofFile.mimeType,
        disbursementProofSize: proofFile.buffer.length,
        disbursementProofAt: new Date(),
      };
    }

    // Generate schedule using agreement date (the date agreed upon in the signed agreement)
    // This ensures the schedule matches what's in the signed agreement
    const scheduleOutput = generateSchedule({
      principal: Number(loan.principalAmount),
      interestRate: Number(loan.interestRate),
      term: loan.term,
      disbursementDate: loan.agreementDate, // Use agreement date, not actual disbursement date
      interestModel: loan.product.interestModel,
    });

    // Create schedule inputs hash for integrity
    const inputs = {
      principal: Number(loan.principalAmount),
      interestRate: Number(loan.interestRate),
      term: loan.term,
      agreementDate: loan.agreementDate.toISOString(), // Track agreement date used for schedule
      disbursementDate: disbursementDate.toISOString(), // Track actual disbursement date
      interestModel: loan.product.interestModel,
    };
    const outputsHash = createHash('sha256')
      .update(JSON.stringify(scheduleOutput))
      .digest('hex');

    // Update loan and create schedule in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update loan status with disbursement details
      const updatedLoan = await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: 'ACTIVE',
          disbursementDate,
          disbursementReference,
          ...(proofData || {}),
        },
      });

      // Create schedule version
      const scheduleVersion = await tx.loanScheduleVersion.create({
        data: {
          loanId: loan.id,
          version: 1,
          interestModel: loan.product.interestModel,
          inputs,
          outputsHash,
        },
      });

      // Create repayments
      await tx.loanRepayment.createMany({
        data: scheduleOutput.repayments.map(rep => ({
          scheduleVersionId: scheduleVersion.id,
          dueDate: rep.dueDate,
          principal: rep.principal,
          interest: rep.interest,
          totalDue: rep.totalDue,
          status: 'PENDING',
        })),
      });

      // Fetch the complete schedule
      const completeSchedule = await tx.loanScheduleVersion.findUnique({
        where: { id: scheduleVersion.id },
        include: {
          repayments: {
            orderBy: { dueDate: 'asc' },
          },
        },
      });

      return { loan: updatedLoan, schedule: completeSchedule };
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'DISBURSE',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: loan.status },
      newData: { 
        status: 'ACTIVE', 
        disbursementDate: disbursementDate.toISOString(),
        disbursementReference,
        scheduleGenerated: true,
      },
      ipAddress: req.ip,
    });

    // Log separate audit entry for disbursement proof if uploaded
    if (proofData) {
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'UPLOAD_DISBURSEMENT_PROOF',
        entityType: 'Loan',
        entityId: loan.id,
        newData: {
          originalName: proofData.disbursementProofName,
          mimeType: proofData.disbursementProofMime,
          size: proofData.disbursementProofSize,
          disbursementReference,
        },
        ipAddress: req.ip,
      });
    }

    try {
      await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    // TrueSend: send disbursement notification email
    let emailSent = false;
    try {
      emailSent = await TrueSendService.sendDisbursementNotification(req.tenantId!, loan.id);
    } catch (emailErr) {
      console.error(`[Disburse] TrueSend email failed for loan ${loan.id}:`, emailErr);
    }

    res.json({
      success: true,
      data: result,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload proof of disbursement for a loan
 * POST /api/loans/:loanId/disbursement-proof
 */
router.post('/:loanId/disbursement-proof', requirePermission('loans.disburse'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (isPreDisbursementLoanStatus(loan.status)) {
      throw new BadRequestError('Loan has not been disbursed yet');
    }

    // If proof already exists, delete old file first
    if (loan.disbursementProofPath) {
      await deleteFile(loan.disbursementProofPath);
    }

    // Parse the file upload (use parseFileUpload which doesn't require category)
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    const { path: disbursementProofPath } = await saveFile(
      buffer,
      'disbursement-proofs',
      loanId,
      originalName
    );

    // Update loan with proof info
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        disbursementProofPath,
        disbursementProofName: originalName,
        disbursementProofMime: mimeType,
        disbursementProofSize: buffer.length,
        disbursementProofAt: new Date(),
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_DISBURSEMENT_PROOF',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.disbursementProofPath ? { replacedProof: true } : undefined,
      newData: {
        originalName,
        mimeType,
        size: buffer.length,
        disbursementReference: loan.disbursementReference,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: updatedLoan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View proof of disbursement for a loan
 * GET /api/loans/:loanId/disbursement-proof
 */
router.get('/:loanId/disbursement-proof', requireAnyPermission('loans.view', 'loans.disburse'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.disbursementProofPath || !loan.disbursementProofName) {
      throw new NotFoundError('Proof of disbursement');
    }

    const fileBuffer = await getFile(loan.disbursementProofPath);
    if (!fileBuffer) {
      throw new NotFoundError('Proof of disbursement file');
    }

    res.setHeader('Content-Type', loan.disbursementProofMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${loan.disbursementProofName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

// ============================================
// Loan Agreement Endpoints
// ============================================

import { generateGuarantorAgreement, computeScheduleTotal } from '../../lib/pdfService.js';
import {
  saveAgreementFile,
  getAgreementFile,
  deleteAgreementFile,
  saveGuarantorAgreementFile,
  getGuarantorAgreementFile,
  deleteGuarantorAgreementFile,
  getLocalPath,
  saveFile,
  getFile,
  deleteFile,
} from '../../lib/storage.js';

/**
 * Generate pre-filled loan agreement PDF (Jadual J)
 * GET /api/loans/:loanId/generate-agreement
 * 
 * Downloads a PDF with loan details pre-filled for printing and signing
 */
router.get('/:loanId/generate-agreement', requireAnyPermission('agreements.view', 'agreements.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const agreementDateParam =
      typeof req.query.agreementDate === 'string' ? req.query.agreementDate : undefined;

    const { buffer, filename } = await buildLoanAgreementPdfBuffer({
      tenantId: req.tenantId!,
      loanId,
      agreementDateParam,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Upload signed loan agreement
 * POST /api/loans/:loanId/agreement
 * 
 * Uploads the signed agreement PDF with version control audit trail
 */
router.post('/:loanId/agreement', requirePermission('agreements.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Parse the file upload
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    // Validate PDF only
    if (mimeType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are allowed for loan agreements');
    }

    // If agreement already exists, delete old file first
    if (loan.agreementPath) {
      try {
        await deleteAgreementFile(loan.agreementPath);
      } catch (error) {
        console.error('Failed to delete old agreement file:', error);
        // Continue anyway - don't fail the upload
      }
    }

    // Save the new agreement file
    const { path: agreementPath, filename } = await saveAgreementFile(buffer, loanId, originalName);

    // Calculate new version
    const newVersion = loan.agreementVersion + 1;

    // Update loan with agreement info
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        agreementPath,
        agreementFilename: filename,
        agreementOriginalName: originalName,
        agreementMimeType: mimeType,
        agreementSize: buffer.length,
        agreementUploadedAt: new Date(),
        agreementVersion: newVersion,
        signedAgreementReviewStatus: 'APPROVED',
        signedAgreementReviewedAt: new Date(),
        signedAgreementReviewerMemberId: req.memberId ?? null,
        signedAgreementReviewNotes: null,
      },
    });

    // Log to audit trail with version info
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_AGREEMENT',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.agreementPath ? {
        version: loan.agreementVersion,
        path: loan.agreementPath,
        filename: loan.agreementOriginalName,
        uploadedAt: loan.agreementUploadedAt,
      } : null,
      newData: {
        version: newVersion,
        path: agreementPath,
        filename: originalName,
        size: buffer.length,
        uploadedAt: new Date(),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        agreementPath: updatedLoan.agreementPath,
        agreementOriginalName: updatedLoan.agreementOriginalName,
        agreementVersion: updatedLoan.agreementVersion,
        agreementUploadedAt: updatedLoan.agreementUploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

const signedAgreementReviewBodySchema = z.object({
  notes: z.string().max(2000).optional(),
});

/**
 * POST /api/loans/:loanId/signed-agreement/approve
 * Admin approves the borrower-uploaded signed agreement so disbursement can proceed.
 */
router.post('/:loanId/signed-agreement/approve', requireAnyPermission('loans.disburse', 'applications.approve_l2'), async (req, res, next) => {
  try {
    const loanId = String(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: req.tenantId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (loan.status !== 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Can only approve the signed agreement while the loan is pending disbursement');
    }
    if (!loan.agreementPath) {
      throw new BadRequestError('No signed agreement file to approve');
    }

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        signedAgreementReviewStatus: 'APPROVED',
        signedAgreementReviewedAt: new Date(),
        signedAgreementReviewerMemberId: req.memberId ?? null,
        signedAgreementReviewNotes: null,
      },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPROVE_SIGNED_AGREEMENT',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { signedAgreementReviewStatus: loan.signedAgreementReviewStatus },
      newData: { signedAgreementReviewStatus: 'APPROVED' },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loans/:loanId/signed-agreement/reject
 * Admin rejects the signed agreement; borrower must upload a replacement.
 */
router.post('/:loanId/signed-agreement/reject', requireAnyPermission('loans.disburse', 'applications.approve_l2'), async (req, res, next) => {
  try {
    const loanId = String(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: req.tenantId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (loan.status !== 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Can only reject the signed agreement while the loan is pending disbursement');
    }

    const { notes } = signedAgreementReviewBodySchema.parse(req.body ?? {});

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        signedAgreementReviewStatus: 'REJECTED',
        signedAgreementReviewedAt: new Date(),
        signedAgreementReviewerMemberId: req.memberId ?? null,
        signedAgreementReviewNotes: notes ?? null,
      },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'REJECT_SIGNED_AGREEMENT',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { signedAgreementReviewStatus: loan.signedAgreementReviewStatus },
      newData: { signedAgreementReviewStatus: 'REJECTED', signedAgreementReviewNotes: notes ?? null },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * View/download signed loan agreement
 * GET /api/loans/:loanId/agreement
 */
router.get('/:loanId/agreement', requirePermission('agreements.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.agreementPath || !loan.agreementOriginalName) {
      throw new NotFoundError('Loan agreement');
    }

    // Try to get local file path for streaming (more efficient)
    const localPath = getLocalPath(loan.agreementPath);
    
    if (localPath && fs.existsSync(localPath)) {
      // Stream from local filesystem
      res.setHeader('Content-Type', loan.agreementMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.agreementOriginalName}"`);
      
      const fileStream = fs.createReadStream(localPath);
      fileStream.pipe(res);
    } else {
      // Get from storage (S3 or fallback)
      const fileBuffer = await getAgreementFile(loan.agreementPath);
      
      if (!fileBuffer) {
        throw new NotFoundError('Loan agreement file');
      }

      res.setHeader('Content-Type', loan.agreementMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.agreementOriginalName}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * View/download borrower-only signed agreement (before internal signatures)
 * GET /api/loans/:loanId/borrower-signed-agreement
 */
router.get('/:loanId/borrower-signed-agreement', requirePermission('agreements.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: req.tenantId },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.borrowerSignedAgreementPath) {
      throw new NotFoundError('Borrower-signed agreement');
    }

    const localPath = getLocalPath(loan.borrowerSignedAgreementPath);
    const filename = `borrower-signed-${loan.agreementOriginalName || 'agreement.pdf'}`;

    if (localPath && fs.existsSync(localPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      fs.createReadStream(localPath).pipe(res);
    } else {
      const fileBuffer = await getAgreementFile(loan.borrowerSignedAgreementPath);
      if (!fileBuffer) {
        throw new NotFoundError('Borrower-signed agreement file');
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Generate pre-filled guarantor agreement PDF
 * GET /api/loans/:loanId/guarantors/:guarantorId/generate-agreement
 */
router.get(
  '/:loanId/guarantors/:guarantorId/generate-agreement',
  requireAnyPermission('agreements.view', 'agreements.manage'),
  async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const guarantorId = getRouteParam(req.params.guarantorId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        product: true,
        tenant: true,
        guarantors: {
          where: { id: guarantorId },
          take: 1,
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const guarantor = loan.guarantors[0];
    if (!guarantor) {
      throw new NotFoundError('Guarantor');
    }

    if (!loan.agreementDate) {
      throw new BadRequestError('Agreement date is not set. Please generate the loan agreement first.');
    }

    const principal = toSafeNumber(loan.principalAmount);
    const interestRate = toSafeNumber(loan.interestRate);
    const term = loan.term;
    const interestModel = String(loan.product?.interestModel ?? 'FLAT');
    const isFlat = interestModel === 'FLAT' || interestModel === 'RULE_78';
    const flatInterest = calculateFlatInterest(principal, interestRate, term);
    const monthlyPaymentFlat = safeRound(safeDivide(safeAdd(principal, flatInterest), term), 2);
    const monthlyPaymentEmi = calculateEMI(principal, interestRate, term);
    const monthlyPayment = isFlat ? monthlyPaymentFlat : monthlyPaymentEmi;
    const totalPayable = computeScheduleTotal(principal, interestRate, term, isFlat, monthlyPayment);

    const pdfBuffer = await generateGuarantorAgreement({
      agreementDate: loan.agreementDate,
      loanDetails: {
        principal,
        interestRate,
        term,
        totalPayable,
        monthlyPayment,
      },
      guarantor: {
        name: guarantor.name,
        borrowerType: guarantor.borrowerType,
        companyName: guarantor.companyName,
        documentType: guarantor.documentType,
        icNumber: guarantor.icNumber,
        address: guarantor.address,
      },
      principalDebtor: {
        name: loan.borrower.name,
        borrowerType: loan.borrower.borrowerType,
        companyName: loan.borrower.companyName,
        icNumber: loan.borrower.icNumber,
        documentType: loan.borrower.documentType,
        ssmRegistrationNo: loan.borrower.ssmRegistrationNo,
        address: loan.borrower.address,
      },
      creditor: {
        name: loan.tenant.name,
        registrationNumber: loan.tenant.registrationNumber,
        businessAddress: loan.tenant.businessAddress,
      },
    });

    await prisma.loanGuarantor.update({
      where: { id: guarantor.id },
      data: { agreementGeneratedAt: new Date() },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'GENERATE_GUARANTOR_AGREEMENT',
      entityType: 'LoanGuarantor',
      entityId: guarantor.id,
      newData: {
        loanId,
        guarantorId: guarantor.id,
        guarantorName: guarantor.name,
        agreementDate: loan.agreementDate.toISOString(),
      },
      ipAddress: req.ip,
    });

    const displayName = guarantor.companyName || guarantor.name;
    const sanitizedName = displayName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const filename = `Guarantor_Agreement_${sanitizedName}_${loanId.substring(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Upload signed guarantor agreement
 * POST /api/loans/:loanId/guarantors/:guarantorId/agreement
 */
router.post('/:loanId/guarantors/:guarantorId/agreement', requirePermission('agreements.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const guarantorId = getRouteParam(req.params.guarantorId);

    const guarantor = await prisma.loanGuarantor.findFirst({
      where: {
        id: guarantorId,
        loanId,
        tenantId: req.tenantId,
      },
    });

    if (!guarantor) {
      throw new NotFoundError('Guarantor');
    }

    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    if (mimeType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are allowed for guarantor agreements');
    }

    if (guarantor.agreementPath) {
      try {
        await deleteGuarantorAgreementFile(guarantor.agreementPath);
      } catch (error) {
        console.error('Failed to delete old guarantor agreement file:', error);
      }
    }

    const { path: agreementPath, filename } = await saveGuarantorAgreementFile(
      buffer,
      loanId,
      guarantor.id,
      originalName
    );

    const newVersion = guarantor.agreementVersion + 1;
    const updatedGuarantor = await prisma.loanGuarantor.update({
      where: { id: guarantor.id },
      data: {
        agreementPath,
        agreementFilename: filename,
        agreementOriginalName: originalName,
        agreementMimeType: mimeType,
        agreementSize: buffer.length,
        agreementUploadedAt: new Date(),
        agreementVersion: newVersion,
      },
    });

    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_GUARANTOR_AGREEMENT',
      entityType: 'LoanGuarantor',
      entityId: guarantor.id,
      previousData: guarantor.agreementPath
        ? {
            version: guarantor.agreementVersion,
            path: guarantor.agreementPath,
            filename: guarantor.agreementOriginalName,
            uploadedAt: guarantor.agreementUploadedAt,
          }
        : null,
      newData: {
        loanId,
        guarantorId: guarantor.id,
        guarantorName: guarantor.name,
        version: newVersion,
        path: agreementPath,
        filename: originalName,
        size: buffer.length,
        uploadedAt: updatedGuarantor.agreementUploadedAt,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        agreementPath: updatedGuarantor.agreementPath,
        agreementOriginalName: updatedGuarantor.agreementOriginalName,
        agreementVersion: updatedGuarantor.agreementVersion,
        agreementUploadedAt: updatedGuarantor.agreementUploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View/download signed guarantor agreement
 * GET /api/loans/:loanId/guarantors/:guarantorId/agreement
 */
router.get('/:loanId/guarantors/:guarantorId/agreement', requirePermission('agreements.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const guarantorId = getRouteParam(req.params.guarantorId);

    const guarantor = await prisma.loanGuarantor.findFirst({
      where: {
        id: guarantorId,
        loanId,
        tenantId: req.tenantId,
      },
    });

    if (!guarantor) {
      throw new NotFoundError('Guarantor');
    }

    if (!guarantor.agreementPath || !guarantor.agreementOriginalName) {
      throw new NotFoundError('Guarantor agreement');
    }

    const localPath = getLocalPath(guarantor.agreementPath);

    if (localPath && fs.existsSync(localPath)) {
      res.setHeader('Content-Type', guarantor.agreementMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${guarantor.agreementOriginalName}"`);
      const fileStream = fs.createReadStream(localPath);
      fileStream.pipe(res);
      return;
    }

    const fileBuffer = await getGuarantorAgreementFile(guarantor.agreementPath);
    if (!fileBuffer) {
      throw new NotFoundError('Guarantor agreement file');
    }

    res.setHeader('Content-Type', guarantor.agreementMimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${guarantor.agreementOriginalName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Upload stamp certificate
 * POST /api/loans/:loanId/stamp-certificate
 * 
 * Uploads the stamp certificate PDF with version control audit trail
 */
router.post('/:loanId/stamp-certificate', requirePermission('agreements.manage'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Parse the uploaded file
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    if (!buffer || buffer.length === 0) {
      throw new BadRequestError('No file uploaded');
    }

    // Validate it's a PDF
    if (mimeType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are allowed for stamp certificates');
    }

    // If stamp certificate already exists, delete old file first
    if (loan.stampCertPath) {
      try {
        await deleteAgreementFile(loan.stampCertPath);
      } catch (error) {
        console.error('Failed to delete old stamp certificate file:', error);
        // Continue anyway - don't fail the upload
      }
    }

    // Save the new stamp certificate file (reuse agreement storage with different prefix)
    const stampCertFilename = `stamp-cert-${loanId}-${Date.now()}.pdf`;
    const { path: stampCertPath, filename } = await saveAgreementFile(buffer, `stamp-${loanId}`, originalName);

    // Calculate new version
    const newVersion = loan.stampCertVersion + 1;

    // Update loan with stamp certificate info
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        stampCertPath,
        stampCertFilename: filename,
        stampCertOriginalName: originalName,
        stampCertMimeType: mimeType,
        stampCertSize: buffer.length,
        stampCertUploadedAt: new Date(),
        stampCertVersion: newVersion,
      },
    });

    // Log to audit trail with version info
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_STAMP_CERTIFICATE',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.stampCertPath ? {
        version: loan.stampCertVersion,
        path: loan.stampCertPath,
        filename: loan.stampCertOriginalName,
        uploadedAt: loan.stampCertUploadedAt,
      } : null,
      newData: {
        version: newVersion,
        path: stampCertPath,
        filename: originalName,
        size: buffer.length,
        uploadedAt: new Date(),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        stampCertPath: updatedLoan.stampCertPath,
        stampCertOriginalName: updatedLoan.stampCertOriginalName,
        stampCertVersion: updatedLoan.stampCertVersion,
        stampCertUploadedAt: updatedLoan.stampCertUploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View/download stamp certificate
 * GET /api/loans/:loanId/stamp-certificate
 */
router.get('/:loanId/stamp-certificate', requirePermission('agreements.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.stampCertPath || !loan.stampCertOriginalName) {
      throw new NotFoundError('Stamp certificate');
    }

    // Try to get local file path for streaming (more efficient)
    const localPath = getLocalPath(loan.stampCertPath);
    
    if (localPath && fs.existsSync(localPath)) {
      // Stream from local filesystem
      res.setHeader('Content-Type', loan.stampCertMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.stampCertOriginalName}"`);
      
      const fileStream = fs.createReadStream(localPath);
      fileStream.pipe(res);
    } else {
      // Get from storage (S3 or fallback)
      const fileBuffer = await getAgreementFile(loan.stampCertPath);
      
      if (!fileBuffer) {
        throw new NotFoundError('Stamp certificate file');
      }

      res.setHeader('Content-Type', loan.stampCertMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.stampCertOriginalName}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }
  } catch (error) {
    next(error);
  }
});

// ============================================
// Early Settlement Endpoints
// ============================================

/**
 * Get early settlement quote
 * GET /api/loans/:loanId/early-settlement/quote
 */
router.get('/:loanId/early-settlement/quote', requireAnyPermission('settlements.view', 'loans.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const out = await getEarlySettlementQuoteForLoan(req.tenantId!, loanId);
    res.json(out);
  } catch (error) {
    next(error);
  }
});

/**
 * Confirm early settlement
 * POST /api/loans/:loanId/early-settlement/confirm
 */
router.post('/:loanId/early-settlement/confirm', requirePermission('settlements.approve'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const { httpStatus, body } = await confirmEarlySettlement({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      loanId,
      ip: req.ip,
      headers: req.headers,
      body: req.body,
      idempotencyEndpoint: 'POST:/api/loans/:loanId/early-settlement/confirm',
    });
    res.status(httpStatus).json(body);
  } catch (error) {
    next(error);
  }
});


// ============================================
// TrueSend Email Logs
// ============================================

/**
 * Get email logs for a specific loan
 * GET /api/loans/:loanId/email-logs
 */
router.get('/:loanId/email-logs', requireAnyPermission('loans.view', 'truesend.view'), async (req, res, next) => {
  try {
    const loanId = getRouteParam(req.params.loanId);
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const emailLogs = await prisma.emailLog.findMany({
      where: {
        loanId: loan.id,
        tenantId: req.tenantId!,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        emailType: true,
        recipientEmail: true,
        recipientName: true,
        subject: true,
        status: true,
        attachmentPath: true,
        failureReason: true,
        sentAt: true,
        deliveredAt: true,
        resentAt: true,
        resentCount: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: emailLogs,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
