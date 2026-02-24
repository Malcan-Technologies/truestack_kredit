import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { generateSchedule } from '../schedules/service.js';
import { parseDocumentUpload, parseFileUpload, saveDocumentFile, deleteDocumentFile, UPLOAD_DIR } from '../../lib/upload.js';
import { AuditService } from '../compliance/auditService.js';
import { toSafeNumber, safeRound, safeMultiply, safeDivide, safeAdd, safeSubtract, calculateFlatInterest, calculateEMI, addMonthsClamped } from '../../lib/math.js';
import { createHash } from 'crypto';
import { LateFeeProcessor } from '../../lib/lateFeeProcessor.js';
import { generateDischargeLetter, generateDefaultLetter, generateArrearsLetter } from '../../lib/letterService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { calculateDaysOverdueMalaysia, getMalaysiaStartOfDay } from '../../lib/malaysiaTime.js';
import { beginPaymentIdempotency, completePaymentIdempotency, failPaymentIdempotency, getIdempotencyKeyFromHeaders } from '../../lib/paymentIdempotency.js';
import { generateReceiptNumber, withReceiptNumberRetry } from '../../lib/receiptNumber.js';
import { fetchLogoBuffer } from '../../lib/safeLogoFetch.js';
import PDFDocument from 'pdfkit';
import { recalculateBorrowerPerformanceProjection } from '../borrowers/performanceProjectionService.js';
import { resolveVerificationStatus } from '../../lib/verification.js';

// Helper function to fetch image from URL or local file (for PDF logos)
const fetchImageBuffer = (url: string): Promise<Buffer> => {
  return fetchLogoBuffer(url, UPLOAD_DIR);
};

function validateSettlementPaymentDate(paymentDate: Date, disbursementDate?: Date | null): void {
  if (Number.isNaN(paymentDate.getTime())) {
    throw new BadRequestError('Invalid payment date');
  }

  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;
  if (paymentDate.getTime() > now + fiveMinutesMs) {
    throw new BadRequestError('Payment date cannot be in the future');
  }

  if (disbursementDate && paymentDate.getTime() < new Date(disbursementDate).getTime()) {
    throw new BadRequestError('Payment date cannot be earlier than loan disbursement date');
  }
}

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

// Generate early settlement receipt PDF
interface SettlementReceiptParams {
  receiptNumber: string;
  paymentDate: Date;
  totalSettlement: number;
  remainingPrincipal: number;
  remainingInterest: number;
  discountAmount: number;
  discountType: string;
  discountValue: number;
  outstandingLateFees: number;
  waiveLateFees: boolean;
  reference?: string;
  notes?: string;
  cancelledInstallments: number;
  loan: {
    id: string;
    principalAmount: unknown;
    interestRate: unknown;
    term: number;
  };
  borrower: {
    displayName: string;
    identificationNumber?: string;
    phone?: string;
    email?: string;
  };
  tenant: {
    name: string;
    registrationNumber?: string | null;
    licenseNumber?: string | null;
    businessAddress?: string | null;
    contactNumber?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
}

async function generateSettlementReceipt(params: SettlementReceiptParams): Promise<string> {
  const originalFilename = `${params.receiptNumber}.pdf`;

  const formatRM = (amount: unknown): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    return `RM ${num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      doc.on('error', reject);

      // Add logo if available
      let logoAdded = false;
      if (params.tenant.logoUrl) {
        try {
          const logoBuffer = await fetchImageBuffer(params.tenant.logoUrl);
          doc.image(logoBuffer, 50, 45, { width: 80 });
          logoAdded = true;
        } catch {
          // Continue without logo
        }
      }

      // Header - Company Info
      const headerX = logoAdded ? 350 : 50;
      const headerAlign: 'right' | 'center' = logoAdded ? 'right' : 'center';
      const headerWidth = logoAdded ? 200 : 500;

      doc.fontSize(16).font('Helvetica-Bold')
         .text(params.tenant.name, headerX, 50, { width: headerWidth, align: headerAlign });
      
      if (params.tenant.registrationNumber) {
        doc.fontSize(9).font('Helvetica')
           .text(`SSM: ${params.tenant.registrationNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (params.tenant.licenseNumber) {
        doc.fontSize(9).font('Helvetica')
           .text(`License: ${params.tenant.licenseNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (params.tenant.businessAddress) {
        doc.text(params.tenant.businessAddress, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (params.tenant.contactNumber) {
        doc.text(`Tel: ${params.tenant.contactNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (params.tenant.email) {
        doc.text(`Email: ${params.tenant.email}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }

      // Line separator
      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#E5E7EB');
      doc.moveDown(1.5);

      // Receipt Title
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000')
         .text('EARLY SETTLEMENT RECEIPT', 50, doc.y, { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`Receipt No: ${params.receiptNumber}`, { align: 'center' })
         .text(`Date: ${formatDate(params.paymentDate)}`, { align: 'center' });

      // Borrower Info Box
      doc.moveDown(1.5);
      const borrowerBoxY = doc.y;
      doc.rect(50, borrowerBoxY, 500, 55).stroke('#E5E7EB');
      doc.fontSize(9).font('Helvetica-Bold').text('RECEIVED FROM:', 60, borrowerBoxY + 10);
      doc.font('Helvetica').text(params.borrower.displayName, 60, borrowerBoxY + 25);
      if (params.borrower.identificationNumber) {
        doc.text(`IC/Passport: ${params.borrower.identificationNumber}`, 300, borrowerBoxY + 25);
      }
      if (params.borrower.phone) {
        doc.text(`Tel: ${params.borrower.phone}`, 60, borrowerBoxY + 40);
      }
      if (params.borrower.email) {
        doc.text(`Email: ${params.borrower.email}`, 300, borrowerBoxY + 40);
      }

      // Loan Info
      doc.moveDown(2.5);
      doc.fontSize(9).font('Helvetica').fillColor('#6B7280');
      doc.text(`Loan Amount: ${formatRM(params.loan.principalAmount)}   |   Interest Rate: ${toSafeNumber(params.loan.interestRate)}% p.a.   |   Term: ${params.loan.term} months`, 50);

      // Settlement Breakdown
      doc.moveDown(1.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
         .text('Settlement Breakdown', 50);
      doc.moveDown(0.5);

      const tableTop = doc.y;
      let rowY = tableTop;

      const drawRow = (label: string, value: string, bold = false, color = '#000000') => {
        doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color);
        doc.text(label, 60, rowY);
        doc.text(value, 350, rowY, { width: 180, align: 'right' });
        rowY += 22;
      };

      drawRow('Remaining Principal', formatRM(params.remainingPrincipal));
      drawRow('Remaining Interest', formatRM(params.remainingInterest));
      
      const discountLabel = params.discountType === 'PERCENTAGE'
        ? `Discount (${params.discountValue}% of future interest)`
        : `Discount (Fixed RM ${params.discountValue})`;
      drawRow(discountLabel, `- ${formatRM(params.discountAmount)}`, false, '#059669');

      // Separator
      doc.moveTo(60, rowY).lineTo(530, rowY).stroke('#E5E7EB');
      rowY += 10;

      const subtotal = safeSubtract(safeAdd(params.remainingPrincipal, params.remainingInterest), params.discountAmount);
      drawRow('Subtotal', formatRM(subtotal));

      if (params.outstandingLateFees > 0) {
        if (params.waiveLateFees) {
          drawRow('Late Fees (Waived)', formatRM(0), false, '#6B7280');
        } else {
          drawRow('Outstanding Late Fees', formatRM(params.outstandingLateFees));
        }
      }

      // Total separator
      doc.moveTo(60, rowY).lineTo(530, rowY).stroke('#E5E7EB');
      rowY += 12;

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
      doc.text('TOTAL SETTLEMENT', 60, rowY);
      doc.text(formatRM(params.totalSettlement), 350, rowY, { width: 180, align: 'right' });
      rowY += 28;

      if (params.discountAmount > 0) {
        doc.fontSize(10).font('Helvetica').fillColor('#059669');
        doc.text(`You saved ${formatRM(params.discountAmount)} through early settlement`, 60, rowY);
        rowY += 20;
      }

      // Reference and notes
      if (params.reference) {
        doc.moveDown(1);
        doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
           .text(`Reference: ${params.reference}`, 50);
      }

      if (params.notes) {
        doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
           .text(`Notes: ${params.notes}`, 50);
      }

      // Settlement summary box
      doc.moveDown(2);
      const summaryBoxY = doc.y;
      doc.rect(50, summaryBoxY, 500, 50).fill('#F0FDF4');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#059669')
         .text('LOAN FULLY SETTLED', 60, summaryBoxY + 12);
      doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
         .text(`${params.cancelledInstallments} remaining installment(s) settled  |  Outstanding balance: RM 0.00`, 60, summaryBoxY + 30);

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF');
      doc.text('This is a computer-generated receipt. No signature required.', 50, 730, { align: 'center' });
      doc.text(`Loan ID: ${params.loan.id}`, 50, 745, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(9).font('Helvetica').fillColor('#3B82F6')
         .text('Powered by TrueKredit', 50, 765, { align: 'center' });

      doc.end();
      doc.on('end', async () => {
        try {
          const { path: receiptPath } = await saveFile(
            Buffer.concat(chunks),
            'receipts',
            params.loan.id,
            originalFilename
          );
          resolve(receiptPath);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
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

type SettlementEvaluationRepayment = {
  dueDate: Date;
  principal: unknown;
  interest: unknown;
  lateFeeAccrued: unknown;
  lateFeesPaid: unknown;
  allocations: Array<{ amount: unknown; lateFee?: unknown | null }>;
};

function evaluateSettlementOutstanding(
  repayment: SettlementEvaluationRepayment
): { remainingPrincipal: number; remainingInterest: number; outstandingLateFees: number } {
  const principalDue = toSafeNumber(repayment.principal);
  const interestDue = toSafeNumber(repayment.interest);
  const principalInterestDue = safeAdd(principalDue, interestDue);

  // Allocation amount stores principal+interest. Late fees are tracked separately on allocation.lateFee.
  const principalInterestPaid = Math.min(
    principalInterestDue,
    Math.max(
      0,
      repayment.allocations.reduce((sum, allocation) => safeAdd(sum, toSafeNumber(allocation.amount)), 0)
    )
  );

  // Payment allocation order: late fee -> interest -> principal.
  const interestPaid = Math.min(interestDue, principalInterestPaid);
  const principalPaid = Math.min(
    principalDue,
    Math.max(0, safeSubtract(principalInterestPaid, interestPaid))
  );

  const remainingInterest = Math.max(0, safeSubtract(interestDue, interestPaid));
  const remainingPrincipal = Math.max(0, safeSubtract(principalDue, principalPaid));
  const outstandingLateFees = Math.max(
    0,
    safeSubtract(toSafeNumber(repayment.lateFeeAccrued), toSafeNumber(repayment.lateFeesPaid))
  );

  return {
    remainingPrincipal,
    remainingInterest,
    outstandingLateFees,
  };
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
  guarantorIds: z.array(z.string()).max(5).optional(),
});

const updateApplicationSchema = z.object({
  amount: z.number().positive().optional(),
  term: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  collateralType: z.string().max(200).optional().nullable(),
  collateralValue: z.number().positive().optional().nullable(),
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
 * Get application counts for action-needed badges (SUBMITTED, UNDER_REVIEW)
 * GET /api/loans/applications/counts
 */
router.get('/applications/counts', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const [submitted, underReview] = await Promise.all([
      prisma.loanApplication.count({
        where: { tenantId, status: 'SUBMITTED' },
      }),
      prisma.loanApplication.count({
        where: { tenantId, status: 'UNDER_REVIEW' },
      }),
    ]);
    res.json({
      success: true,
      data: { submitted, underReview },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List loan applications
 * GET /api/loans/applications
 */
router.get('/applications', async (req, res, next) => {
  try {
    const { status, search, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(status && { status: status as 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED' }),
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
        },
      }),
      prisma.loanApplication.count({ where }),
    ]);

    res.json({
      success: true,
      data: applications,
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
router.post('/applications/preview', async (req, res, next) => {
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

    const loanAmount = data.amount;
    const term = data.term;
    const interestRate = toSafeNumber(product.interestRate);

    // Calculate fees
    const legalFeeValue = toSafeNumber(product.legalFeeValue);
    const stampingFeeValue = toSafeNumber(product.stampingFeeValue);

    const legalFee = product.legalFeeType === 'PERCENTAGE'
      ? safeMultiply(loanAmount, safeDivide(legalFeeValue, 100))
      : legalFeeValue;

    const stampingFee = product.stampingFeeType === 'PERCENTAGE'
      ? safeMultiply(loanAmount, safeDivide(stampingFeeValue, 100))
      : stampingFeeValue;

    const totalFees = safeAdd(legalFee, stampingFee);
    const netDisbursement = safeSubtract(loanAmount, totalFees);

    const interestModel = String(product.interestModel);

    // Calculate monthly payment based on interest model
    let monthlyPayment: number;
    let totalInterest: number;
    let totalPayable: number;

    if (interestModel === 'FLAT' || interestModel === 'RULE_78') {
      // Flat interest: Principal × Rate × Term / 12
      totalInterest = calculateFlatInterest(loanAmount, interestRate, term);
      totalPayable = safeAdd(loanAmount, totalInterest);
      monthlyPayment = safeDivide(totalPayable, term);
    } else {
      // Declining balance EMI
      monthlyPayment = calculateEMI(loanAmount, interestRate, term);
      totalPayable = safeMultiply(monthlyPayment, term);
      totalInterest = safeSubtract(totalPayable, loanAmount);
    }

    res.json({
      success: true,
      data: {
        loanAmount,
        term,
        interestRate,
        interestModel: product.interestModel,
        // Fees
        legalFee,
        legalFeeType: product.legalFeeType,
        stampingFee,
        stampingFeeType: product.stampingFeeType,
        totalFees,
        netDisbursement,
        // Repayment
        monthlyPayment,
        totalInterest,
        totalPayable,
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
router.post('/applications', async (req, res, next) => {
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

    if (data.term < product.minTerm || data.term > product.maxTerm) {
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
        term: data.term,
        notes: data.notes,
        status: 'DRAFT',
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
router.get('/applications/:applicationId', async (req, res, next) => {
  try {
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
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
router.patch('/applications/:applicationId', async (req, res, next) => {
  try {
    const data = updateApplicationSchema.parse(req.body);

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
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
      where: { id: req.params.applicationId },
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
router.post('/applications/:applicationId/submit', async (req, res, next) => {
  try {
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'DRAFT') {
      throw new BadRequestError('Can only submit draft applications');
    }

    const updated = await prisma.loanApplication.update({
      where: { id: req.params.applicationId },
      data: { status: 'SUBMITTED' },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'SUBMIT',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: 'DRAFT' },
      newData: { status: 'SUBMITTED' },
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

/**
 * Approve application and create loan with schedule
 * POST /api/loans/applications/:applicationId/approve
 */
router.post('/applications/:applicationId/approve', requireAdmin, async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId as string;
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

    if (application.status !== 'SUBMITTED' && application.status !== 'UNDER_REVIEW') {
      throw new BadRequestError('Can only approve submitted applications');
    }

    const previousStatus = application.status;

    // Create loan with initial schedule in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update application status
      await tx.loanApplication.update({
        where: { id: application.id },
        data: { status: 'APPROVED' },
      });

      // Create loan (copy collateral fields for Jadual K products)
      const loan = await tx.loan.create({
        data: {
          tenantId: req.tenantId!,
          borrowerId: application.borrowerId,
          productId: application.productId,
          applicationId: application.id,
          principalAmount: application.amount,
          interestRate: application.product.interestRate,
          term: application.term,
          status: 'PENDING_DISBURSEMENT',
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
      newData: { status: 'APPROVED', loanId: result.id },
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
        interestRate: Number(application.product.interestRate),
        term: application.term,
        status: 'PENDING_DISBURSEMENT',
        applicationId: application.id,
        borrowerId: application.borrowerId,
        productId: application.productId,
      },
      ipAddress: req.ip,
    });

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
router.post('/applications/:applicationId/reject', requireAdmin, async (req, res, next) => {
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

    const previousStatus = application.status;

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        notes: reason ? `${application.notes || ''}\n\nRejection reason: ${reason}` : application.notes,
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
      newData: { status: 'REJECTED', reason: reason || null },
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

/**
 * Return application to draft (amendments needed)
 * POST /api/loans/applications/:applicationId/return-to-draft
 */
router.post('/applications/:applicationId/return-to-draft', requireAdmin, async (req, res, next) => {
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

    if (application.status !== 'SUBMITTED' && application.status !== 'UNDER_REVIEW') {
      throw new BadRequestError('Can only return submitted or under-review applications to draft');
    }

    const previousStatus = application.status;

    const updated = await prisma.loanApplication.update({
      where: { id: applicationId },
      data: {
        status: 'DRAFT',
        notes: reason
          ? `${application.notes || ''}\n\nReturned for amendments: ${reason}`
          : application.notes,
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
router.get('/applications/:applicationId/timeline', async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId;
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

// ============================================
// Application Documents
// ============================================

/**
 * Upload document to application
 * POST /api/loans/applications/:applicationId/documents
 */
router.post('/applications/:applicationId/documents', async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId;

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
router.get('/applications/:applicationId/documents', async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId;

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
router.delete('/applications/:applicationId/documents/:documentId', async (req, res, next) => {
  try {
    const { applicationId, documentId } = req.params;

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
router.get('/', async (req, res, next) => {
  try {
    const { status, search, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(status && { status: status as 'PENDING_DISBURSEMENT' | 'ACTIVE' | 'IN_ARREARS' | 'COMPLETED' | 'DEFAULTED' | 'WRITTEN_OFF' }),
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
router.post('/process-late-fees', async (req, res, next) => {
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
router.get('/late-fee-status', async (req, res, next) => {
  try {
    const [status, loansPendingDisbursement] = await Promise.all([
      LateFeeProcessor.getProcessingStatus(req.tenantId!),
      prisma.loan.count({
        where: { tenantId: req.tenantId!, status: 'PENDING_DISBURSEMENT' },
      }),
    ]);
    res.json({ success: true, data: { ...status, loansPendingDisbursement } });
  } catch (error) {
    next(error);
  }
});

/**
 * Get recent late fee processing logs
 * GET /api/loans/late-fee-logs
 */
router.get('/late-fee-logs', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const logs = await LateFeeProcessor.getRecentLogs(limit, req.tenantId!);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single loan with schedule
 * GET /api/loans/:loanId
 */
router.get('/:loanId', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
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

/**
 * Update loan status based on overdue repayments (arrears/default check)
 * POST /api/loans/:loanId/update-status
 * 
 * This endpoint checks overdue repayments and updates loan status:
 * - ACTIVE -> IN_ARREARS if any repayment is overdue past arrearsPeriod
 * - IN_ARREARS -> DEFAULTED if any repayment is overdue past defaultPeriod
 * - IN_ARREARS -> ACTIVE if all overdue repayments are now paid
 */
router.post('/:loanId/update-status', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.post('/update-all-statuses', async (req, res, next) => {
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
router.get('/:loanId/schedule/preview', async (req, res, next) => {
  try {
    const { disbursementDate: disbursementDateStr } = req.query;
    const disbursementDate = disbursementDateStr 
      ? new Date(disbursementDateStr as string) 
      : new Date();

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.get('/:loanId/timeline', async (req, res, next) => {
  try {
    const loanId = req.params.loanId;
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
router.get('/:loanId/metrics', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.post('/:loanId/complete', async (req, res, next) => {
  try {
    const { notes } = req.body;

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.get('/:loanId/discharge-letter', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.get('/:loanId/arrears-letter', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.get('/:loanId/default-letter', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.post('/:loanId/generate-arrears-letter', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.post('/:loanId/generate-default-letter', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.post('/:loanId/mark-default', async (req, res, next) => {
  try {
    const { reason } = req.body;

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
router.post('/:loanId/disburse', async (req, res, next) => {
  try {
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
        id: req.params.loanId,
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
      previousData: { status: 'PENDING_DISBURSEMENT' },
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
router.post('/:loanId/disbursement-proof', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'PENDING_DISBURSEMENT') {
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
router.get('/:loanId/disbursement-proof', async (req, res, next) => {
  try {
    const { loanId } = req.params;

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

import { generateLoanAgreement, generateGuarantorAgreement, LoanForAgreement } from '../../lib/pdfService.js';
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
router.get('/:loanId/generate-agreement', async (req, res, next) => {
  try {
    const { loanId } = req.params;
    
    // Accept required query parameter for agreement date (the agreed disbursement date)
    const { agreementDate: agreementDateParam } = req.query;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: {
          include: {
            directors: {
              orderBy: { order: 'asc' },
            },
          },
        },
        product: true,
        tenant: true,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Helper function to calculate first repayment date (1 month after agreement date)
    const calculateFirstRepaymentDate = (agreementDate: Date): Date => {
      return addMonthsClamped(agreementDate, 1);
    };

    // Calculate dates from agreement date parameter or stored agreement date
    let agreementDate: Date | null = null;
    let firstRepaymentDate: Date | null = null;
    let monthlyRepaymentDay: number | null = null;
    
    // Use query parameter if provided
    if (agreementDateParam !== undefined) {
      if (typeof agreementDateParam !== 'string') {
        throw new BadRequestError('Invalid agreementDate. Expected YYYY-MM-DD.');
      }

      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(agreementDateParam);
      if (!match) {
        throw new BadRequestError('Invalid agreementDate. Expected YYYY-MM-DD.');
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsedDate = new Date(Date.UTC(year, month - 1, day));
      const isValidDate =
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day;
      if (!isValidDate) {
        throw new BadRequestError('Invalid agreementDate. Expected YYYY-MM-DD.');
      }

      agreementDate = parsedDate;
      firstRepaymentDate = calculateFirstRepaymentDate(parsedDate);
      monthlyRepaymentDay = firstRepaymentDate.getUTCDate();

      // Save the agreement date to the loan. If the date changes, invalidate
      // guarantor generation markers so fresh PDFs must be regenerated.
      const agreementDateChanged =
        (loan.agreementDate?.getTime() ?? null) !== parsedDate.getTime();

      if (agreementDateChanged) {
        await prisma.$transaction([
          prisma.loan.update({
            where: { id: loan.id },
            data: { agreementDate: parsedDate },
          }),
          prisma.loanGuarantor.updateMany({
            where: {
              tenantId: req.tenantId!,
              loanId: loan.id,
            },
            data: { agreementGeneratedAt: null },
          }),
        ]);
      } else {
        await prisma.loan.update({
          where: { id: loan.id },
          data: { agreementDate: parsedDate },
        });
      }
    }
    
    // If no query param, try to use existing agreement date
    if (!agreementDate && loan.agreementDate) {
      agreementDate = loan.agreementDate;
      firstRepaymentDate = calculateFirstRepaymentDate(loan.agreementDate);
      monthlyRepaymentDay = firstRepaymentDate.getUTCDate();
    }

    // Prepare loan data for PDF generation
    const loanData: LoanForAgreement = {
      id: loan.id,
      principalAmount: loan.principalAmount,
      interestRate: loan.interestRate,
      term: loan.term,
      firstRepaymentDate,
      monthlyRepaymentDay,
      borrower: {
        name: loan.borrower.name,
        icNumber: loan.borrower.icNumber,
        address: loan.borrower.address,
        type: loan.borrower.borrowerType,
        borrowerType: loan.borrower.borrowerType,
        companyName: loan.borrower.companyName,
        companyRegistrationNumber: loan.borrower.ssmRegistrationNo,
        directors: loan.borrower.directors.map((director) => ({
          name: director.name,
          icNumber: director.icNumber,
          position: director.position,
        })),
      },
      tenant: {
        name: loan.tenant.name,
        registrationNumber: loan.tenant.registrationNumber,
        licenseNumber: loan.tenant.licenseNumber,
        businessAddress: loan.tenant.businessAddress,
      },
      product: {
        interestModel: loan.product.interestModel,
        loanScheduleType: loan.product.loanScheduleType,
      },
      collateralType: loan.collateralType,
      collateralValue: loan.collateralValue ? Number(loan.collateralValue) : null,
    };

    // Generate the PDF (automatically selects Jadual J or K template)
    const pdfBuffer = await generateLoanAgreement(loanData);

    // Generate filename with schedule type
    const scheduleLabel = loan.product.loanScheduleType === 'JADUAL_K' ? 'Jadual_K' : 'Jadual_J';
    const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
      ? loan.borrower.companyName
      : loan.borrower.name;
    const sanitizedName = borrowerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const filename = `${scheduleLabel}_Agreement_${sanitizedName}_${loanId.substring(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
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
router.post('/:loanId/agreement', async (req, res, next) => {
  try {
    const { loanId } = req.params;

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

/**
 * View/download signed loan agreement
 * GET /api/loans/:loanId/agreement
 */
router.get('/:loanId/agreement', async (req, res, next) => {
  try {
    const { loanId } = req.params;

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
 * Generate pre-filled guarantor agreement PDF
 * GET /api/loans/:loanId/guarantors/:guarantorId/generate-agreement
 */
router.get('/:loanId/guarantors/:guarantorId/generate-agreement', async (req, res, next) => {
  try {
    const { loanId, guarantorId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
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

    const pdfBuffer = await generateGuarantorAgreement({
      agreementDate: loan.agreementDate,
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
router.post('/:loanId/guarantors/:guarantorId/agreement', async (req, res, next) => {
  try {
    const { loanId, guarantorId } = req.params;

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
router.get('/:loanId/guarantors/:guarantorId/agreement', async (req, res, next) => {
  try {
    const { loanId, guarantorId } = req.params;

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
router.post('/:loanId/stamp-certificate', async (req, res, next) => {
  try {
    const { loanId } = req.params;

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
router.get('/:loanId/stamp-certificate', async (req, res, next) => {
  try {
    const { loanId } = req.params;

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
router.get('/:loanId/early-settlement/quote', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
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

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Early settlement is only available for active or in-arrears loans');
    }

    const product = loan.product;
    if (!product.earlySettlementEnabled) {
      return res.json({
        success: true,
        data: {
          eligible: false,
          reason: 'Early settlement is not enabled for this product',
        },
      });
    }

    // Check lock-in period (using Malaysia timezone GMT+8)
    const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowMYT = new Date(Date.now() + MYT_OFFSET_MS);

    const lockInMonths = product.earlySettlementLockInMonths;
    let lockInEndDate: Date | null = null;
    if (lockInMonths > 0 && loan.disbursementDate) {
      // Calculate lock-in end date in MYT
      const disbursementMYT = new Date(new Date(loan.disbursementDate).getTime() + MYT_OFFSET_MS);
      const lockInEndMYT = new Date(Date.UTC(
        disbursementMYT.getUTCFullYear(),
        disbursementMYT.getUTCMonth() + lockInMonths,
        disbursementMYT.getUTCDate()
      ));
      // Convert back to UTC for storage/comparison
      lockInEndDate = new Date(lockInEndMYT.getTime() - MYT_OFFSET_MS);

      // Compare in MYT: current MYT date vs lock-in end MYT date
      const todayMYTDate = `${nowMYT.getUTCFullYear()}-${String(nowMYT.getUTCMonth() + 1).padStart(2, '0')}-${String(nowMYT.getUTCDate()).padStart(2, '0')}`;
      const lockInMYTDate = `${lockInEndMYT.getUTCFullYear()}-${String(lockInEndMYT.getUTCMonth() + 1).padStart(2, '0')}-${String(lockInEndMYT.getUTCDate()).padStart(2, '0')}`;

      if (todayMYTDate < lockInMYTDate) {
        return res.json({
          success: true,
          data: {
            eligible: false,
            reason: `Loan is in lock-in period until ${lockInMYTDate}`,
            lockInEndDate: lockInEndDate.toISOString(),
          },
        });
      }
    }

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      throw new BadRequestError('No active schedule found for this loan');
    }

    // Use MYT start-of-day (stored as UTC) for interest calculations
    const today = getMalaysiaStartOfDay(new Date());

    // Calculate remaining balances from unpaid repayments
    let remainingPrincipal = 0;
    let remainingInterest = 0;
    let remainingFutureInterest = 0; // interest on repayments not yet due
    let outstandingLateFees = 0;

    const unpaidRepayments = currentSchedule.repayments.filter(
      r => r.status === 'PENDING' || r.status === 'PARTIAL' || r.status === 'OVERDUE'
    );

    for (const repayment of unpaidRepayments) {
      const {
        remainingPrincipal: repaymentRemainingPrincipal,
        remainingInterest: repaymentRemainingInterest,
        outstandingLateFees: repaymentOutstandingLateFees,
      } = evaluateSettlementOutstanding(repayment);

      remainingPrincipal = safeAdd(remainingPrincipal, repaymentRemainingPrincipal);
      remainingInterest = safeAdd(remainingInterest, repaymentRemainingInterest);
      outstandingLateFees = safeAdd(outstandingLateFees, repaymentOutstandingLateFees);

      // Track future interest separately (for discount calculation)
      const dueDate = getMalaysiaStartOfDay(repayment.dueDate);
      if (dueDate >= today) {
        remainingFutureInterest = safeAdd(remainingFutureInterest, repaymentRemainingInterest);
      }
    }

    // Round to 2 decimal places
    remainingPrincipal = safeRound(remainingPrincipal);
    remainingInterest = safeRound(remainingInterest);
    remainingFutureInterest = safeRound(remainingFutureInterest);
    outstandingLateFees = safeRound(outstandingLateFees);

    // Calculate discount
    const discountType = product.earlySettlementDiscountType;
    const discountValue = toSafeNumber(product.earlySettlementDiscountValue);
    let discountAmount = 0;

    if (discountType === 'PERCENTAGE') {
      discountAmount = safeRound(safeMultiply(remainingFutureInterest, safeDivide(discountValue, 100)));
    } else {
      // FIXED - cap at remaining future interest
      discountAmount = safeRound(Math.min(discountValue, remainingFutureInterest));
    }

    // Total settlement (late fees included by default, admin can toggle)
    const totalWithoutLateFees = safeRound(safeSubtract(safeAdd(remainingPrincipal, remainingInterest), discountAmount));
    const totalSettlement = safeRound(safeAdd(totalWithoutLateFees, outstandingLateFees));
    const totalSavings = discountAmount;

    res.json({
      success: true,
      data: {
        eligible: true,
        remainingPrincipal,
        remainingInterest,
        remainingFutureInterest,
        discountType,
        discountValue,
        discountAmount,
        outstandingLateFees,
        totalWithoutLateFees,
        totalSettlement,
        totalSavings,
        lockInEndDate: lockInEndDate?.toISOString() || null,
        unpaidInstallments: unpaidRepayments.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Confirm early settlement
 * POST /api/loans/:loanId/early-settlement/confirm
 */
router.post('/:loanId/early-settlement/confirm', async (req, res, next) => {
  let idempotencyRecordId: string | null = null;
  let businessCommitted = false;
  let replayResponseStatus: number | null = null;
  let replayResponseBody: unknown = null;
  try {
    let emailSent = false;
    const earlySettlementSchema = z.object({
      paymentDate: z.string().datetime().optional(),
      reference: z.string().max(200).optional(),
      notes: z.string().max(1000).optional(),
      waiveLateFees: z.boolean().default(false),
    });

    const data = earlySettlementSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKeyFromHeaders(req.headers as Record<string, unknown>);
    const idempotency = await beginPaymentIdempotency({
      tenantId: req.tenantId!,
      endpoint: 'POST:/api/loans/:loanId/early-settlement/confirm',
      idempotencyKey,
      requestPayload: {
        tenantId: req.tenantId,
        loanId: req.params.loanId,
        paymentDate: data.paymentDate || null,
        reference: data.reference || null,
        notes: data.notes || null,
        waiveLateFees: data.waiveLateFees,
      },
    });
    idempotencyRecordId = idempotency.recordId;

    if (idempotency.replay) {
      res.status(idempotency.responseStatus || 200).json(idempotency.responseBody);
      return;
    }

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Early settlement is only available for active or in-arrears loans');
    }

    const product = loan.product;
    if (!product.earlySettlementEnabled) {
      throw new BadRequestError('Early settlement is not enabled for this product');
    }

    // Check lock-in period (using Malaysia timezone GMT+8)
    const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowMYT = new Date(Date.now() + MYT_OFFSET_MS);
    const lockInMonths = product.earlySettlementLockInMonths;
    if (lockInMonths > 0 && loan.disbursementDate) {
      const disbursementMYT = new Date(new Date(loan.disbursementDate).getTime() + MYT_OFFSET_MS);
      const lockInEndMYT = new Date(Date.UTC(
        disbursementMYT.getUTCFullYear(),
        disbursementMYT.getUTCMonth() + lockInMonths,
        disbursementMYT.getUTCDate()
      ));
      const todayMYTDate = `${nowMYT.getUTCFullYear()}-${String(nowMYT.getUTCMonth() + 1).padStart(2, '0')}-${String(nowMYT.getUTCDate()).padStart(2, '0')}`;
      const lockInMYTDate = `${lockInEndMYT.getUTCFullYear()}-${String(lockInEndMYT.getUTCMonth() + 1).padStart(2, '0')}-${String(lockInEndMYT.getUTCDate()).padStart(2, '0')}`;
      if (todayMYTDate < lockInMYTDate) {
        throw new BadRequestError('Loan is still in lock-in period');
      }
    }

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      throw new BadRequestError('No active schedule found for this loan');
    }

    // Use MYT start-of-day (stored as UTC) for interest calculations
    const today = getMalaysiaStartOfDay(new Date());
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    validateSettlementPaymentDate(paymentDate, loan.disbursementDate);

    // Re-calculate settlement amount (same as quote, but authoritative)
    let remainingPrincipal = 0;
    let remainingInterest = 0;
    let remainingFutureInterest = 0;
    let outstandingLateFees = 0;

    const unpaidRepayments = currentSchedule.repayments.filter(
      r => r.status === 'PENDING' || r.status === 'PARTIAL' || r.status === 'OVERDUE'
    );

    if (unpaidRepayments.length === 0) {
      throw new BadRequestError('All repayments are already paid');
    }

    for (const repayment of unpaidRepayments) {
      const {
        remainingPrincipal: repaymentRemainingPrincipal,
        remainingInterest: repaymentRemainingInterest,
        outstandingLateFees: repaymentOutstandingLateFees,
      } = evaluateSettlementOutstanding(repayment);

      remainingPrincipal = safeAdd(remainingPrincipal, repaymentRemainingPrincipal);
      remainingInterest = safeAdd(remainingInterest, repaymentRemainingInterest);
      outstandingLateFees = safeAdd(outstandingLateFees, repaymentOutstandingLateFees);

      const dueDate = getMalaysiaStartOfDay(repayment.dueDate);
      if (dueDate >= today) {
        remainingFutureInterest = safeAdd(remainingFutureInterest, repaymentRemainingInterest);
      }
    }

    remainingPrincipal = safeRound(remainingPrincipal);
    remainingInterest = safeRound(remainingInterest);
    remainingFutureInterest = safeRound(remainingFutureInterest);
    outstandingLateFees = safeRound(outstandingLateFees);

    // Calculate discount
    const discountType = product.earlySettlementDiscountType;
    const discountValue = toSafeNumber(product.earlySettlementDiscountValue);
    let discountAmount = 0;

    if (discountType === 'PERCENTAGE') {
      discountAmount = safeRound(safeMultiply(remainingFutureInterest, safeDivide(discountValue, 100)));
    } else {
      discountAmount = safeRound(Math.min(discountValue, remainingFutureInterest));
    }

    const lateFeesForSettlement = data.waiveLateFees ? 0 : outstandingLateFees;
    const principalInterestTarget = safeRound(
      safeSubtract(safeAdd(remainingPrincipal, remainingInterest), discountAmount)
    );
    const totalSettlement = safeRound(
      safeAdd(
        principalInterestTarget,
        lateFeesForSettlement
      )
    );

    const previousStatus = loan.status;

    // Execute everything in a transaction
    const result = await withReceiptNumberRetry(async () => prisma.$transaction(async (tx) => {
      const receiptNumber = await generateReceiptNumber(tx, paymentDate);

      // Lock loan row to prevent concurrent early-settlement confirmations.
      await tx.$executeRaw`SELECT 1 FROM "Loan" WHERE id = ${loan.id} FOR UPDATE`;
      const lockedLoan = await tx.loan.findUnique({
        where: { id: loan.id },
        include: {
          product: true,
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
      if (!lockedLoan || (lockedLoan.status !== 'ACTIVE' && lockedLoan.status !== 'IN_ARREARS')) {
        throw new BadRequestError('Loan is no longer eligible for early settlement');
      }

      const lockedSchedule = lockedLoan.scheduleVersions[0];
      if (!lockedSchedule) {
        throw new BadRequestError('No active schedule found for this loan');
      }

      const freshUnpaidRepayments = lockedSchedule.repayments.filter(
        r => r.status === 'PENDING' || r.status === 'PARTIAL' || r.status === 'OVERDUE'
      );
      if (freshUnpaidRepayments.length === 0) {
        throw new BadRequestError('All repayments are already paid');
      }

      const todayTx = getMalaysiaStartOfDay(paymentDate);
      let remainingPrincipalTx = 0;
      let remainingInterestTx = 0;
      let remainingFutureInterestTx = 0;
      let outstandingLateFeesTx = 0;

      for (const repayment of freshUnpaidRepayments) {
        const {
          remainingPrincipal: repaymentRemainingPrincipal,
          remainingInterest: repaymentRemainingInterest,
          outstandingLateFees: repaymentOutstandingLateFees,
        } = evaluateSettlementOutstanding(repayment);

        remainingPrincipalTx = safeAdd(remainingPrincipalTx, repaymentRemainingPrincipal);
        remainingInterestTx = safeAdd(remainingInterestTx, repaymentRemainingInterest);
        outstandingLateFeesTx = safeAdd(outstandingLateFeesTx, repaymentOutstandingLateFees);

        const dueDate = getMalaysiaStartOfDay(repayment.dueDate);
        if (dueDate >= todayTx) {
          remainingFutureInterestTx = safeAdd(remainingFutureInterestTx, repaymentRemainingInterest);
        }
      }

      remainingPrincipalTx = safeRound(remainingPrincipalTx);
      remainingInterestTx = safeRound(remainingInterestTx);
      remainingFutureInterestTx = safeRound(remainingFutureInterestTx);
      outstandingLateFeesTx = safeRound(outstandingLateFeesTx);

      const discountTypeTx = lockedLoan.product.earlySettlementDiscountType;
      const discountValueTx = toSafeNumber(lockedLoan.product.earlySettlementDiscountValue);
      let discountAmountTx = 0;
      if (discountTypeTx === 'PERCENTAGE') {
        discountAmountTx = safeRound(safeMultiply(remainingFutureInterestTx, safeDivide(discountValueTx, 100)));
      } else {
        discountAmountTx = safeRound(Math.min(discountValueTx, remainingFutureInterestTx));
      }

      const lateFeesForSettlementTx = data.waiveLateFees ? 0 : outstandingLateFeesTx;
      const principalInterestTargetTx = safeRound(
        safeSubtract(safeAdd(remainingPrincipalTx, remainingInterestTx), discountAmountTx)
      );
      const totalSettlementTx = safeRound(
        safeAdd(principalInterestTargetTx, lateFeesForSettlementTx)
      );

      // 1. Create payment transaction
      const transaction = await tx.paymentTransaction.create({
        data: {
          tenantId: req.tenantId!,
          loanId: loan.id,
          totalAmount: totalSettlementTx,
          paymentType: 'EARLY_SETTLEMENT',
          reference: data.reference,
          notes: data.notes || `Early settlement - Discount: ${discountTypeTx === 'PERCENTAGE' ? `${discountValueTx}%` : `RM ${discountValueTx}`}`,
          paymentDate,
          receiptNumber,
        },
      });

      // 2. Create allocations for each remaining repayment and cancel them
      const settlementCandidates = freshUnpaidRepayments.map((repayment) => {
        const totalPaidOnRepayment = repayment.allocations.reduce(
          (sum, a) => safeAdd(sum, toSafeNumber(a.amount)),
          0
        );

        const repaymentRemaining = Math.max(0, safeSubtract(
          toSafeNumber(repayment.totalDue),
          totalPaidOnRepayment
        ));

        const lateFeesOnRepayment = data.waiveLateFees
          ? 0
          : Math.max(0, safeSubtract(toSafeNumber(repayment.lateFeeAccrued), toSafeNumber(repayment.lateFeesPaid)));

        return {
          repayment,
          repaymentRemaining,
          lateFeesOnRepayment,
        };
      });

      const principalCandidates = settlementCandidates.filter(c => c.repaymentRemaining > 0);
      const totalPrincipalRemaining = principalCandidates.reduce(
        (sum, c) => safeAdd(sum, c.repaymentRemaining),
        0
      );

      const principalAllocationMap = new Map<string, number>();
      if (totalPrincipalRemaining > 0 && principalInterestTargetTx > 0) {
        let allocatedPrincipal = 0;
        const lastPrincipalIndex = principalCandidates.length - 1;

        principalCandidates.forEach((candidate, idx) => {
          let amount = 0;

          if (idx === lastPrincipalIndex) {
            amount = Math.max(0, safeSubtract(principalInterestTargetTx, allocatedPrincipal));
          } else {
            const ratio = safeDivide(candidate.repaymentRemaining, totalPrincipalRemaining, 8);
            amount = safeRound(safeMultiply(principalInterestTargetTx, ratio, 8));
          }

          amount = Math.min(candidate.repaymentRemaining, amount);
          principalAllocationMap.set(candidate.repayment.id, amount);
          allocatedPrincipal = safeAdd(allocatedPrincipal, amount);
        });
      }

      let totalAllocatedAmount = 0;
      let totalAllocatedLateFee = 0;
      let lastAllocationId: string | null = null;

      for (const candidate of settlementCandidates) {
        const principalAllocation = principalAllocationMap.get(candidate.repayment.id) ?? 0;
        if (principalAllocation > 0 || candidate.lateFeesOnRepayment > 0) {
          const allocation = await tx.paymentAllocation.create({
            data: {
              transactionId: transaction.id,
              repaymentId: candidate.repayment.id,
              amount: principalAllocation,
              lateFee: candidate.lateFeesOnRepayment > 0 ? candidate.lateFeesOnRepayment : null,
            },
          });
          totalAllocatedAmount = safeAdd(totalAllocatedAmount, principalAllocation);
          totalAllocatedLateFee = safeAdd(totalAllocatedLateFee, candidate.lateFeesOnRepayment);
          lastAllocationId = allocation.id;
        }

        // Mark late fees as paid if waiving
        const updateData: Record<string, unknown> = {
          status: 'CANCELLED',
        };

        if (data.waiveLateFees) {
          // Set lateFeesPaid = lateFeeAccrued to zero out
          updateData.lateFeesPaid = candidate.repayment.lateFeeAccrued;
        } else {
          // Mark late fees as fully paid
          updateData.lateFeesPaid = candidate.repayment.lateFeeAccrued;
        }

        await tx.loanRepayment.update({
          where: { id: candidate.repayment.id },
          data: updateData,
        });
      }

      // Guard against rounding drift so allocations match transaction total.
      const allocatedTotal = safeAdd(totalAllocatedAmount, totalAllocatedLateFee);
      const allocationDiff = safeSubtract(totalSettlementTx, allocatedTotal);
      if (Math.abs(allocationDiff) > 0.01 && lastAllocationId) {
        const lastAllocation = await tx.paymentAllocation.findUnique({
          where: { id: lastAllocationId },
        });
        if (lastAllocation) {
          const adjustedAmount = Math.max(0, safeAdd(toSafeNumber(lastAllocation.amount), allocationDiff));
          await tx.paymentAllocation.update({
            where: { id: lastAllocationId },
            data: { amount: adjustedAmount },
          });
        }
      }

      // 3. Calculate repayment rate for metrics
      const allRepayments = lockedSchedule.repayments;
      let paidOnTime = 0;
      let paidLate = 0;
      for (const repayment of allRepayments) {
        if (repayment.status === 'PAID') {
          const lastPaymentDate = repayment.allocations.length > 0
            ? repayment.allocations[repayment.allocations.length - 1].allocatedAt
            : null;
          if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
            paidOnTime++;
          } else {
            paidLate++;
          }
        }
        // Cancelled (early settlement) repayments don't count for on-time rate
      }
      const totalPaidRepayments = paidOnTime + paidLate;
      const repaymentRate = totalPaidRepayments > 0
        ? safeMultiply(safeDivide(paidOnTime, totalPaidRepayments), 100)
        : 100;

      // 4. Update loan to COMPLETED with early settlement metadata
      const completedAt = new Date();
      const updatedLoan = await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: 'COMPLETED',
          completedAt,
          earlySettlementDate: completedAt,
          earlySettlementAmount: totalSettlementTx,
          earlySettlementDiscount: discountAmountTx,
          earlySettlementNotes: data.notes || null,
          earlySettlementWaiveLateFees: data.waiveLateFees,
          dischargeNotes: data.notes || 'Early settlement',
          repaymentRate,
          // Clear arrears/default tracking
          readyForDefault: false,
          defaultReadyDate: null,
          arrearsStartDate: null,
        },
      });

      return {
        transaction,
        updatedLoan,
        completedAt,
        repaymentRate,
        receiptNumber,
        settlement: {
          totalSettlement: totalSettlementTx,
          remainingPrincipal: remainingPrincipalTx,
          remainingInterest: remainingInterestTx,
          discountAmount: discountAmountTx,
          discountType: discountTypeTx,
          discountValue: discountValueTx,
          outstandingLateFees: outstandingLateFeesTx,
          cancelledInstallments: freshUnpaidRepayments.length,
        },
      };
    }));
    businessCommitted = true;
    replayResponseStatus = 200;
    replayResponseBody = {
      success: true,
      data: {
        loan: result.updatedLoan,
        transaction: result.transaction,
        transactionId: result.transaction.id,
        receiptNumber: result.receiptNumber,
        settlement: {
          remainingPrincipal: result.settlement.remainingPrincipal,
          remainingInterest: result.settlement.remainingInterest,
          discountAmount: result.settlement.discountAmount,
          outstandingLateFees: result.settlement.outstandingLateFees,
          waiveLateFees: data.waiveLateFees,
          totalSettlement: result.settlement.totalSettlement,
          dischargeLetterPath: null,
          receiptPath: null,
        },
      },
      emailSent: false,
    };
    const receiptNumber = result.receiptNumber;

    // Generate discharge letter (outside transaction - non-critical)
    let dischargeLetterPath: string | null = null;
    try {
      const borrower = loan.borrower;
      const totalPaid = safeAdd(
        // Sum all previous payments
        currentSchedule.repayments.reduce((sum, r) =>
          safeAdd(sum, r.allocations.reduce((s, a) => safeAdd(s, toSafeNumber(a.amount)), 0)), 0),
        // Plus this settlement
        result.settlement.totalSettlement
      );

      dischargeLetterPath = await generateDischargeLetter({
        loan: {
          id: loan.id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          term: loan.term,
          disbursementDate: loan.disbursementDate,
          completedAt: result.completedAt,
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
        totalLateFees: toSafeNumber(loan.totalLateFees),
        dischargeNotes: data.notes || 'Early settlement',
        earlySettlement: {
          settlementAmount: result.settlement.totalSettlement,
          discountAmount: result.settlement.discountAmount,
          discountType: result.settlement.discountType,
          discountValue: result.settlement.discountValue,
          remainingPrincipal: result.settlement.remainingPrincipal,
          remainingInterest: result.settlement.remainingInterest,
          waiveLateFees: data.waiveLateFees,
          outstandingLateFees: result.settlement.outstandingLateFees,
        },
      });

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

      // TrueSend: send completion notification with discharge letter (early settlement)
      try {
        emailSent = await TrueSendService.sendCompletionNotification(req.tenantId!, loan.id, dischargeLetterPath);
      } catch (emailErr) {
        console.error(`[EarlySettlement] TrueSend email failed for loan ${loan.id}:`, emailErr);
      }
    } catch (error) {
      console.error('Failed to generate discharge letter:', error);
    }

    // Generate settlement receipt (outside transaction - non-critical)
    let receiptPath: string | null = null;
    try {
      const borrower = loan.borrower;
      receiptPath = await generateSettlementReceipt({
        receiptNumber,
        paymentDate,
        totalSettlement: result.settlement.totalSettlement,
        remainingPrincipal: result.settlement.remainingPrincipal,
        remainingInterest: result.settlement.remainingInterest,
        discountAmount: result.settlement.discountAmount,
        discountType: result.settlement.discountType,
        discountValue: result.settlement.discountValue,
        outstandingLateFees: result.settlement.outstandingLateFees,
        waiveLateFees: data.waiveLateFees,
        reference: data.reference,
        notes: data.notes,
        cancelledInstallments: result.settlement.cancelledInstallments,
        loan: {
          id: loan.id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          term: loan.term,
        },
        borrower: {
          displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName
            ? borrower.companyName
            : borrower.name,
          identificationNumber: borrower.icNumber,
          phone: borrower.phone || undefined,
          email: borrower.email || undefined,
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
      });

      await prisma.paymentTransaction.update({
        where: { id: result.transaction.id },
        data: {
          receiptPath,
          receiptGenAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to generate settlement receipt:', error);
    }

    // Audit log
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'EARLY_SETTLEMENT',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: previousStatus },
      newData: {
        status: 'COMPLETED',
        earlySettlement: true,
        settlementAmount: result.settlement.totalSettlement,
        discountType: result.settlement.discountType,
        discountValue: result.settlement.discountValue,
        discountAmount: result.settlement.discountAmount,
        remainingPrincipal: result.settlement.remainingPrincipal,
        remainingInterest: result.settlement.remainingInterest,
        outstandingLateFees: result.settlement.outstandingLateFees,
        waiveLateFees: data.waiveLateFees,
        lateFeesSettled: data.waiveLateFees ? 0 : result.settlement.outstandingLateFees,
        receiptNumber,
        receiptGenerated: !!receiptPath,
        paymentDate: paymentDate.toISOString(),
        notes: data.notes || null,
        dischargeLetterGenerated: !!dischargeLetterPath,
        cancelledRepayments: result.settlement.cancelledInstallments,
      },
      ipAddress: req.ip,
    });

    try {
      await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    // TrueSend: send early settlement receipt email with PDF attached
    if (receiptPath) {
      try {
        const receiptEmailSent = await TrueSendService.sendPaymentReceipt(
          req.tenantId!,
          loan.id,
          receiptPath,
          result.settlement.totalSettlement,
          receiptNumber,
          true // isEarlySettlement
        );
        if (receiptEmailSent) emailSent = true;
      } catch (emailErr) {
        console.error(`[EarlySettlement] TrueSend receipt email failed for loan ${loan.id}:`, emailErr);
      }
    }

    const responsePayload = {
      success: true,
      data: {
        loan: result.updatedLoan,
        transaction: result.transaction,
        transactionId: result.transaction.id,
        receiptNumber,
        settlement: {
          remainingPrincipal: result.settlement.remainingPrincipal,
          remainingInterest: result.settlement.remainingInterest,
          discountAmount: result.settlement.discountAmount,
          outstandingLateFees: result.settlement.outstandingLateFees,
          waiveLateFees: data.waiveLateFees,
          totalSettlement: result.settlement.totalSettlement,
          dischargeLetterPath,
          receiptPath,
        },
      },
      emailSent,
    };
    replayResponseBody = responsePayload;
    await completePaymentIdempotency(idempotencyRecordId, 200, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    if (idempotencyRecordId) {
      if (businessCommitted) {
        if (replayResponseBody && replayResponseStatus !== null) {
          await completePaymentIdempotency(idempotencyRecordId, replayResponseStatus, replayResponseBody).catch(() => undefined);
        }
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await failPaymentIdempotency(idempotencyRecordId, message).catch(() => undefined);
      }
    }
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
router.get('/:loanId/email-logs', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
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
