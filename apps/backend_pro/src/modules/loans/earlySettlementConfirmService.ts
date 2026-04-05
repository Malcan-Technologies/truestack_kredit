import { z } from 'zod';
import type { IncomingHttpHeaders } from 'http';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { toSafeNumber, safeRound, safeMultiply, safeDivide, safeAdd, safeSubtract } from '../../lib/math.js';
import { generateDischargeLetter } from '../../lib/letterService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { getMalaysiaStartOfDay } from '../../lib/malaysiaTime.js';
import {
  beginPaymentIdempotency,
  completePaymentIdempotency,
  failPaymentIdempotency,
  getIdempotencyKeyFromHeaders,
} from '../../lib/paymentIdempotency.js';
import { generateReceiptNumber, withReceiptNumberRetry } from '../../lib/receiptNumber.js';
import { fetchLogoBuffer } from '../../lib/safeLogoFetch.js';
import PDFDocument from 'pdfkit';
import { recalculateBorrowerPerformanceProjection } from '../borrowers/performanceProjectionService.js';
import { AuditService } from '../compliance/auditService.js';
import { UPLOAD_DIR } from '../../lib/upload.js';
import { saveFile } from '../../lib/storage.js';
import { evaluateSettlementOutstanding } from './earlySettlementQuoteService.js';

const fetchImageBuffer = (url: string): Promise<Buffer> => {
  return fetchLogoBuffer(url, UPLOAD_DIR);
};

export function validateSettlementPaymentDate(paymentDate: Date, disbursementDate?: Date | null): void {
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

export interface ConfirmEarlySettlementContext {
  tenantId: string;
  memberId: string | undefined;
  loanId: string;
  ip?: string;
  headers: IncomingHttpHeaders;
  body: unknown;
  idempotencyEndpoint: string;
  /** When set (e.g. admin approving a borrower request), skips Idempotency-Key header requirement */
  idempotencyKey?: string;
}

export async function confirmEarlySettlement(
  ctx: ConfirmEarlySettlementContext
): Promise<{ httpStatus: number; body: unknown }> {
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

    const data = earlySettlementSchema.parse(ctx.body);
    const idempotencyKey =
      ctx.idempotencyKey?.trim() ||
      getIdempotencyKeyFromHeaders(ctx.headers as Record<string, unknown>);
    const idempotency = await beginPaymentIdempotency({
      tenantId: ctx.tenantId,
      endpoint: ctx.idempotencyEndpoint,
      idempotencyKey,
      requestPayload: {
        tenantId: ctx.tenantId,
        loanId: ctx.loanId,
        paymentDate: data.paymentDate || null,
        reference: data.reference || null,
        notes: data.notes || null,
        waiveLateFees: data.waiveLateFees,
      },
    });
    idempotencyRecordId = idempotency.recordId;

    if (idempotency.replay) {
      return { httpStatus: idempotency.responseStatus || 200, body: idempotency.responseBody };
    }

    const loan = await prisma.loan.findFirst({
      where: {
        id: ctx.loanId,
        tenantId: ctx.tenantId,
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
          tenantId: ctx.tenantId,
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
        tenantId: ctx.tenantId,
        memberId: ctx.memberId,
        action: 'GENERATE_DISCHARGE_LETTER',
        entityType: 'Loan',
        entityId: loan.id,
        previousData: { dischargeLetterPath: null },
        newData: { dischargeLetterPath },
        ipAddress: ctx.ip,
      });

      // TrueSend: send completion notification with discharge letter (early settlement)
      try {
        emailSent = await TrueSendService.sendCompletionNotification(ctx.tenantId, loan.id, dischargeLetterPath);
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
      tenantId: ctx.tenantId,
      memberId: ctx.memberId,
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
      ipAddress: ctx.ip,
    });

    try {
      await recalculateBorrowerPerformanceProjection(ctx.tenantId, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    // TrueSend: send early settlement receipt email with PDF attached
    if (receiptPath) {
      try {
        const receiptEmailSent = await TrueSendService.sendPaymentReceipt(
          ctx.tenantId,
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
    return { httpStatus: 200, body: responsePayload };
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
    throw error;
  }
}
