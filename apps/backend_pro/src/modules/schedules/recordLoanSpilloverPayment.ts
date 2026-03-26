import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { UPLOAD_DIR } from '../../lib/upload.js';
import { saveFile } from '../../lib/storage.js';
import { AuditService } from '../compliance/auditService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { calculateDailyLateFee, dailyLateFeeRate, toSafeNumber, safeAdd, safeSubtract } from '../../lib/math.js';
import { ONE_DAY_MS, calculateDaysOverdueMalaysia, getMalaysiaDateRange, getMalaysiaStartOfDay } from '../../lib/malaysiaTime.js';
import { beginPaymentIdempotency, completePaymentIdempotency, failPaymentIdempotency, getIdempotencyKeyFromHeaders } from '../../lib/paymentIdempotency.js';
import { generateReceiptNumber, withReceiptNumberRetry } from '../../lib/receiptNumber.js';
import { fetchLogoBuffer } from '../../lib/safeLogoFetch.js';
import { recalculateBorrowerPerformanceProjection } from '../borrowers/performanceProjectionService.js';
import type { IncomingHttpHeaders } from 'http';

// New schema for recording payment with automatic spillover
export const recordLoanPaymentSchema = z.object({
  loanId: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
  notes: z.string().max(500).optional(),
  applyLateFee: z.boolean().optional().default(true),
  paymentDate: z.string().datetime().optional(),
});
export function validatePaymentDate(paymentDate: Date, disbursementDate?: Date | null): void {
  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;
  if (paymentDate.getTime() > now + fiveMinutesMs) {
    throw new BadRequestError('Payment date cannot be in the future');
  }
  if (disbursementDate && paymentDate.getTime() < new Date(disbursementDate).getTime()) {
    throw new BadRequestError('Payment date cannot be earlier than loan disbursement date');
  }
}
type RepaymentAccrualInput = {
  id: string;
  dueDate: Date;
  totalDue: unknown;
  allocations: Array<{ allocatedAt: Date; amount: unknown }>;
  lateFeeEntries: Array<{ accrualDate: Date }>;
};

export async function accrueLateFeesThroughDate(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  loanId: string;
  latePaymentRate: number;
  repayment: RepaymentAccrualInput;
  asOfDate: Date;
}): Promise<number> {
  const { tx, tenantId, loanId, latePaymentRate, repayment, asOfDate } = params;
  if (latePaymentRate <= 0) return 0;

  const firstChargeableDay = new Date(getMalaysiaStartOfDay(repayment.dueDate).getTime() + ONE_DAY_MS);
  const lastAccrualDate = repayment.lateFeeEntries[0]?.accrualDate;
  const startDate = lastAccrualDate
    ? new Date(getMalaysiaStartOfDay(lastAccrualDate).getTime() + ONE_DAY_MS)
    : firstChargeableDay;
  const asOfDayStart = getMalaysiaStartOfDay(asOfDate);
  const accrualEndDay = new Date(asOfDayStart.getTime() - ONE_DAY_MS);

  if (startDate.getTime() > accrualEndDay.getTime()) {
    return 0;
  }

  const datesToCharge = getMalaysiaDateRange(startDate, accrualEndDay);
  const sortedAllocations = [...repayment.allocations].sort(
    (a, b) => new Date(a.allocatedAt).getTime() - new Date(b.allocatedAt).getTime()
  );

  let totalAccrued = 0;
  let allocationCursor = 0;
  let paidBeforeAccrual = 0;
  const totalDue = toSafeNumber(repayment.totalDue);
  const dailyRate = dailyLateFeeRate(latePaymentRate);

  for (const accrualDate of datesToCharge) {
    while (
      allocationCursor < sortedAllocations.length &&
      new Date(sortedAllocations[allocationCursor].allocatedAt).getTime() < accrualDate.getTime()
    ) {
      paidBeforeAccrual = safeAdd(paidBeforeAccrual, toSafeNumber(sortedAllocations[allocationCursor].amount));
      allocationCursor++;
    }

    const outstandingForDay = safeSubtract(totalDue, paidBeforeAccrual);
    if (outstandingForDay <= 0.01) continue;

    const dailyFee = calculateDailyLateFee(outstandingForDay, latePaymentRate);
    if (dailyFee <= 0) continue;

    const daysOverdue = calculateDaysOverdueMalaysia(repayment.dueDate, accrualDate);
    if (daysOverdue <= 0) continue;

    try {
      await tx.lateFeeEntry.create({
        data: {
          tenantId,
          loanId,
          repaymentId: repayment.id,
          accrualDate,
          daysOverdue,
          outstandingAmount: outstandingForDay,
          dailyRate,
          feeAmount: dailyFee,
        },
      });
      totalAccrued = safeAdd(totalAccrued, dailyFee);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        continue;
      }
      throw error;
    }
  }

  if (totalAccrued > 0) {
    await tx.loanRepayment.update({
      where: { id: repayment.id },
      data: { lateFeeAccrued: { increment: totalAccrued } },
    });
  }

  return totalAccrued;
}
// Helper function to fetch image from URL or local file
const fetchImageBuffer = (url: string): Promise<Buffer> => {
  return fetchLogoBuffer(url, UPLOAD_DIR);
};

// Type definitions for receipt generation
interface ReceiptAllocation {
  id: string;
  repaymentNumber: number;
  dueDate: Date;
  amount: unknown;
  lateFee: unknown;
}

interface ReceiptParams {
  transaction: {
    id: string;
    receiptNumber: string | null;
    paymentDate: Date;
    totalAmount: unknown;
    reference: string | null;
  };
  allocations: ReceiptAllocation[];
  loan: {
    id: string;
    principalAmount: unknown;
  };
  borrower: {
    displayName: string;
    identificationNumber: string | null;
    phone: string | null;
    email: string | null;
  };
  tenant: {
    name: string;
    registrationNumber: string | null;
    licenseNumber: string | null;
    businessAddress: string | null;
    contactNumber: string | null;
    email: string | null;
    logoUrl: string | null;
  };
  totalLateFees: number;
  totalOutstandingAfter: number;
}

// Generate and store receipt PDF
export async function generateAndStoreReceipt(params: ReceiptParams): Promise<string> {
  const { transaction, allocations, loan, borrower, tenant, totalLateFees, totalOutstandingAfter } = params;
  const originalFilename = `${transaction.receiptNumber}.pdf`;

  // Format currency helper
  const formatRM = (amount: unknown): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    return `RM ${num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date helper
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
      if (tenant.logoUrl) {
        try {
          const logoBuffer = await fetchImageBuffer(tenant.logoUrl);
          doc.image(logoBuffer, 50, 45, { width: 80 });
          logoAdded = true;
        } catch {
          // Continue without logo
        }
      }

      // Header - Company Info
      const headerX = logoAdded ? 350 : 50;
      const headerAlign = logoAdded ? 'right' : 'center';
      const headerWidth = logoAdded ? 200 : 500;

      doc.fontSize(16).font('Helvetica-Bold')
         .text(tenant.name, headerX, 50, { width: headerWidth, align: headerAlign });
      
      if (tenant.registrationNumber) {
        doc.fontSize(9).font('Helvetica')
           .text(`SSM: ${tenant.registrationNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (tenant.licenseNumber) {
        doc.fontSize(9).font('Helvetica')
           .text(`License: ${tenant.licenseNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (tenant.businessAddress) {
        doc.text(tenant.businessAddress, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (tenant.contactNumber) {
        doc.text(`Tel: ${tenant.contactNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }
      if (tenant.email) {
        doc.text(`Email: ${tenant.email}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
      }

      // Line separator
      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#E5E7EB');
      doc.moveDown(1.5);

      // Receipt Title
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000')
         .text('PAYMENT RECEIPT', 50, doc.y, { align: 'center' });

      // Receipt Number and Date
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`Receipt No: ${transaction.receiptNumber}`, { align: 'center' })
         .text(`Date: ${formatDate(transaction.paymentDate)}`, { align: 'center' });

      // Borrower Info Box
      doc.moveDown(1.5);
      const borrowerBoxY = doc.y;
      const borrowerBoxHeight = 70; // Increased height for more info
      doc.rect(50, borrowerBoxY, 500, borrowerBoxHeight).stroke('#E5E7EB');
      doc.fontSize(9).font('Helvetica-Bold').text('RECEIVED FROM:', 60, borrowerBoxY + 10);
      doc.font('Helvetica').text(borrower.displayName, 60, borrowerBoxY + 25);
      if (borrower.identificationNumber) {
        doc.text(`IC/Passport: ${borrower.identificationNumber}`, 300, borrowerBoxY + 25);
      }
      // Second row for contact info
      let contactY = borrowerBoxY + 42;
      if (borrower.phone) {
        doc.text(`Tel: ${borrower.phone}`, 60, contactY);
      }
      if (borrower.email) {
        doc.text(`Email: ${borrower.email}`, 300, contactY);
      }

      // Payment Details
      doc.moveDown(3);
      doc.fontSize(12).font('Helvetica-Bold').text('Payment Details', 50);
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#6B7280');
      doc.text('Installment', 50, tableTop);
      doc.text('Due Date', 150, tableTop);
      doc.text('Amount', 280, tableTop, { width: 80, align: 'right' });
      doc.text('Late Fee', 380, tableTop, { width: 80, align: 'right' });
      doc.text('Subtotal', 460, tableTop, { width: 80, align: 'right' });

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke('#E5E7EB');

      // Table rows
      let rowY = tableTop + 25;
      doc.font('Helvetica').fillColor('#000000');
      
      for (const alloc of allocations) {
        const amount = toSafeNumber(alloc.amount);
        const lateFee = toSafeNumber(alloc.lateFee);
        const subtotal = safeAdd(amount, lateFee);

        doc.text(`#${alloc.repaymentNumber}`, 50, rowY);
        doc.text(formatDate(alloc.dueDate), 150, rowY);
        doc.text(formatRM(amount), 280, rowY, { width: 80, align: 'right' });
        doc.text(lateFee > 0 ? formatRM(lateFee) : '-', 380, rowY, { width: 80, align: 'right' });
        doc.text(formatRM(subtotal), 460, rowY, { width: 80, align: 'right' });
        
        rowY += 20;
      }

      // Total line
      doc.moveTo(50, rowY).lineTo(550, rowY).stroke('#E5E7EB');
      rowY += 10;
      
      const totalAmount = toSafeNumber(transaction.totalAmount);
      // totalAmount already includes late fees, so split it for display
      const principalInterestTotal = safeSubtract(totalAmount, totalLateFees);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
      doc.text('TOTAL PAID', 50, rowY);
      doc.text(formatRM(principalInterestTotal), 280, rowY, { width: 80, align: 'right' });
      doc.text(totalLateFees > 0 ? formatRM(totalLateFees) : '-', 380, rowY, { width: 80, align: 'right' });
      doc.fontSize(12).fillColor('#000000')
         .text(formatRM(totalAmount), 460, rowY - 2, { width: 80, align: 'right' });

      // Reference
      if (transaction.reference) {
        doc.moveDown(2);
        doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
           .text(`Reference: ${transaction.reference}`, 50);
      }

      // Balance Summary
      doc.moveDown(3);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
         .text('Balance Summary', 50);
      doc.moveDown(1);

      const balanceBoxY = doc.y;
      doc.rect(50, balanceBoxY, 240, 60).fill('#F3F4F6');
      doc.fontSize(9).font('Helvetica').fillColor('#6B7280')
         .text('OUTSTANDING BALANCE', 60, balanceBoxY + 12);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
         .text(formatRM(totalOutstandingAfter), 60, balanceBoxY + 28);
      doc.fontSize(8).font('Helvetica').fillColor('#6B7280')
         .text(`As of ${formatDate(new Date())}`, 60, balanceBoxY + 48);

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF');
      doc.text('This is a computer-generated receipt. No signature required.', 50, 730, { align: 'center' });
      doc.text(`Loan ID: ${loan.id}`, 50, 745, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(9).font('Helvetica').fillColor('#3B82F6')
         .text('Powered by TrueKredit', 50, 765, { align: 'center' });

      doc.end();
      doc.on('end', async () => {
        try {
          const { path: receiptPath } = await saveFile(
            Buffer.concat(chunks),
            'receipts',
            transaction.id,
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
export type RecordLoanSpilloverContext = {
  tenantId: string;
  loanId: string;
  body: unknown;
  memberId?: string | null;
  borrowerIdFilter?: string;
  ip: string | undefined;
  headers: IncomingHttpHeaders;
  idempotencyEndpoint: string;
};

export type RecordLoanSpilloverResult =
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'created'; body: unknown };

export async function handleRecordLoanSpilloverPayment(ctx: RecordLoanSpilloverContext): Promise<RecordLoanSpilloverResult> {
  const { tenantId, loanId, body, memberId, borrowerIdFilter, ip: ipAddress, headers, idempotencyEndpoint } = ctx;
  let idempotencyRecordId: string | null = null;
  let businessCommitted = false;
  let replayResponseStatus: number | null = null;
  let replayResponseBody: unknown = null;
  try {
    const data = recordLoanPaymentSchema.parse({ ...(body as Record<string, unknown>), loanId });
    const idempotencyKey = getIdempotencyKeyFromHeaders(headers as Record<string, unknown>);
    const idempotency = await beginPaymentIdempotency({
      tenantId: tenantId,
      endpoint: idempotencyEndpoint,
      idempotencyKey,
      requestPayload: {
        tenantId: tenantId,
        loanId,
        amount: data.amount,
        reference: data.reference || null,
        notes: data.notes || null,
        applyLateFee: data.applyLateFee,
        paymentDate: data.paymentDate || null,
      },
    });
    idempotencyRecordId = idempotency.recordId;

    if (idempotency.replay) {
      return { kind: 'replay' as const, status: idempotency.responseStatus || 201, body: idempotency.responseBody };
    }

    // Get loan with current schedule, all repayments, borrower, and tenant info
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: tenantId,
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

    if (borrowerIdFilter && loan.borrowerId !== borrowerIdFilter) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Loan has not been disbursed yet');
    }

    if (loan.status === 'COMPLETED') {
      throw new BadRequestError('Loan is already completed');
    }

    if (loan.status === 'WRITTEN_OFF') {
      throw new BadRequestError('Cannot record payments on a written-off loan');
    }

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      throw new BadRequestError('No active schedule found for this loan');
    }

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    validatePaymentDate(paymentDate, loan.disbursementDate);
    const result = await withReceiptNumberRetry(async () => prisma.$transaction(async (tx) => {
      // Serialize all payments per loan to prevent double-recording under concurrent admin submissions.
      await tx.$executeRaw`SELECT 1 FROM "Loan" WHERE id = ${loanId} FOR UPDATE`;

      const lockedLoan = await tx.loan.findUnique({
        where: { id: loanId },
        include: {
          product: true,
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              repayments: {
                orderBy: { dueDate: 'asc' },
                include: {
                  allocations: true,
                  lateFeeEntries: {
                    orderBy: { accrualDate: 'desc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (!lockedLoan || lockedLoan.tenantId !== tenantId) {
        throw new NotFoundError('Loan');
      }

      if (lockedLoan.status === 'PENDING_DISBURSEMENT') {
        throw new BadRequestError('Loan has not been disbursed yet');
      }
      if (lockedLoan.status === 'COMPLETED') {
        throw new BadRequestError('Loan is already completed');
      }
      if (lockedLoan.status === 'WRITTEN_OFF') {
        throw new BadRequestError('Cannot record payments on a written-off loan');
      }

      validatePaymentDate(paymentDate, lockedLoan.disbursementDate);

      const lockedSchedule = lockedLoan.scheduleVersions[0];
      if (!lockedSchedule) {
        throw new BadRequestError('No active schedule found for this loan');
      }

      const unpaidRepayments = lockedSchedule.repayments.filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED');
      if (unpaidRepayments.length === 0) {
        throw new BadRequestError('All repayments are already paid');
      }

      // Lock affected repayments to prevent concurrent payment/accrual races on the same rows.
      for (const repayment of unpaidRepayments) {
        await tx.$executeRaw`SELECT 1 FROM "LoanRepayment" WHERE id = ${repayment.id} FOR UPDATE`;
      }

      const lockedUnpaidRepayments = await tx.loanRepayment.findMany({
        where: { id: { in: unpaidRepayments.map(r => r.id) } },
        orderBy: { dueDate: 'asc' },
        include: {
          allocations: true,
          lateFeeEntries: {
            orderBy: { accrualDate: 'desc' },
            take: 1,
          },
        },
      });

      const latePaymentRate = toSafeNumber(lockedLoan.product.latePaymentRate);
      const accruedIncrements = new Map<string, number>();
      let totalNewLateFeesAccrued = 0;

      if (data.applyLateFee !== false && latePaymentRate > 0) {
        for (const repayment of lockedUnpaidRepayments) {
          const daysOverdue = calculateDaysOverdueMalaysia(repayment.dueDate, paymentDate);
          if (daysOverdue <= 0) {
            accruedIncrements.set(repayment.id, 0);
            continue;
          }

          const accruedIncrement = await accrueLateFeesThroughDate({
            tx,
            tenantId: tenantId,
            loanId,
            latePaymentRate,
            repayment: {
              id: repayment.id,
              dueDate: repayment.dueDate,
              totalDue: repayment.totalDue,
              allocations: repayment.allocations.map(a => ({ allocatedAt: a.allocatedAt, amount: a.amount })),
              lateFeeEntries: repayment.lateFeeEntries.map(e => ({ accrualDate: e.accrualDate })),
            },
            asOfDate: paymentDate,
          });

          accruedIncrements.set(repayment.id, accruedIncrement);
          totalNewLateFeesAccrued = safeAdd(totalNewLateFeesAccrued, accruedIncrement);
        }
      }

      if (totalNewLateFeesAccrued > 0) {
        await tx.loan.update({
          where: { id: loanId },
          data: { totalLateFees: { increment: totalNewLateFeesAccrued } },
        });
      }

      let totalOutstandingBefore = 0;
      for (const repayment of lockedUnpaidRepayments) {
        const paid = repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
        const principalInterestOutstanding = Math.max(0, safeSubtract(toSafeNumber(repayment.totalDue), paid));
        const lateFeeAccrued = safeAdd(toSafeNumber(repayment.lateFeeAccrued), accruedIncrements.get(repayment.id) ?? 0);
        const lateFeeOutstanding = Math.max(0, safeSubtract(lateFeeAccrued, toSafeNumber(repayment.lateFeesPaid)));
        totalOutstandingBefore = safeAdd(totalOutstandingBefore, safeAdd(principalInterestOutstanding, lateFeeOutstanding));
      }

      if (data.amount > totalOutstandingBefore + 0.01) {
        throw new BadRequestError(`Payment amount exceeds total outstanding balance of ${totalOutstandingBefore.toFixed(2)}`);
      }

      let remainingPayment = data.amount;
      const allocationData: {
        repaymentId: string;
        repaymentNumber: number;
        dueDate: Date;
        amount: number;
        lateFeeAllocated: number;
        interestAllocated: number;
        principalAllocated: number;
        isEarlyPayment: boolean;
      }[] = [];
      let totalLateFeesPaid = 0;

      for (let i = 0; i < lockedUnpaidRepayments.length; i++) {
        if (remainingPayment <= 0.01) break;

        const repayment = lockedUnpaidRepayments[i];
        const repaymentNumber = i + 1;
        const dueDate = new Date(repayment.dueDate);
        const isEarlyPayment = paymentDate < dueDate;

        const currentPaid = repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
        const totalDue = toSafeNumber(repayment.totalDue);
        const interestDue = toSafeNumber(repayment.interest);
        const principalInterestOutstanding = Math.max(0, safeSubtract(totalDue, currentPaid));

        const lateFeeAccrued = safeAdd(toSafeNumber(repayment.lateFeeAccrued), accruedIncrements.get(repayment.id) ?? 0);
        const lateFeesPaid = toSafeNumber(repayment.lateFeesPaid);
        const outstandingLateFees = Math.max(0, safeSubtract(lateFeeAccrued, lateFeesPaid));

        if (principalInterestOutstanding <= 0.01 && outstandingLateFees <= 0.01) continue;

        let lateFeeAllocated = 0;
        let interestAllocated = 0;
        let principalAllocated = 0;

        // 1) Late fees
        if (outstandingLateFees > 0.01) {
          lateFeeAllocated = Math.min(remainingPayment, outstandingLateFees);
          remainingPayment = safeSubtract(remainingPayment, lateFeeAllocated);
          totalLateFeesPaid = safeAdd(totalLateFeesPaid, lateFeeAllocated);
        }

        // 2) Interest
        const interestUnpaid = Math.max(0, safeSubtract(interestDue, Math.min(currentPaid, interestDue)));
        if (interestUnpaid > 0.01 && remainingPayment > 0.01) {
          interestAllocated = Math.min(remainingPayment, interestUnpaid);
          remainingPayment = safeSubtract(remainingPayment, interestAllocated);
        }

        // 3) Principal
        const principalUnpaid = Math.max(0, safeSubtract(principalInterestOutstanding, interestUnpaid));
        if (principalUnpaid > 0.01 && remainingPayment > 0.01) {
          principalAllocated = Math.min(remainingPayment, principalUnpaid);
          remainingPayment = safeSubtract(remainingPayment, principalAllocated);
        }

        const allocationAmount = safeAdd(interestAllocated, principalAllocated);
        if (allocationAmount > 0.01 || lateFeeAllocated > 0.01) {
          allocationData.push({
            repaymentId: repayment.id,
            repaymentNumber,
            dueDate,
            amount: allocationAmount,
            lateFeeAllocated,
            interestAllocated,
            principalAllocated,
            isEarlyPayment,
          });
        }
      }

      if (allocationData.length === 0) {
        throw new BadRequestError('Payment amount is too small to allocate');
      }

      const receiptNumber = await generateReceiptNumber(tx, paymentDate);

      // Create PaymentTransaction
      const transaction = await tx.paymentTransaction.create({
        data: {
          tenantId: tenantId,
          loanId,
          totalAmount: data.amount,
          reference: data.reference,
          notes: data.notes,
          paymentDate,
          receiptNumber,
        },
      });

      // Create allocations
      const createdAllocations: { id: string; repaymentNumber: number; dueDate: Date; amount: unknown; lateFee: unknown }[] = [];
      for (const alloc of allocationData) {
        const allocation = await tx.paymentAllocation.create({
          data: {
            transactionId: transaction.id,
            repaymentId: alloc.repaymentId,
            amount: alloc.amount,
            lateFee: alloc.lateFeeAllocated > 0 ? alloc.lateFeeAllocated : null,
            isEarlyPayment: alloc.isEarlyPayment,
            allocatedAt: paymentDate,
          },
        });
        createdAllocations.push({ 
          id: allocation.id,
          repaymentNumber: alloc.repaymentNumber, 
          dueDate: alloc.dueDate,
          amount: allocation.amount,
          lateFee: allocation.lateFee,
        });

        // Update repayment status and balances using locked snapshot + this allocation.
        const baseRepayment = lockedUnpaidRepayments.find(r => r.id === alloc.repaymentId);
        if (!baseRepayment) continue;

        const paidBefore = baseRepayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
        const totalDue = toSafeNumber(baseRepayment.totalDue);
        const lateFeeAccrued = safeAdd(toSafeNumber(baseRepayment.lateFeeAccrued), accruedIncrements.get(baseRepayment.id) ?? 0);
        const lateFeesPaidBefore = toSafeNumber(baseRepayment.lateFeesPaid);

        const newPaid = safeAdd(paidBefore, alloc.amount);
        const newLateFeesPaid = safeAdd(lateFeesPaidBefore, alloc.lateFeeAllocated);
        const lateFeesCovered = newLateFeesPaid >= lateFeeAccrued - 0.01;

        let newStatus: typeof baseRepayment.status | 'PAID' = baseRepayment.status;
        if (newPaid >= totalDue - 0.01 && lateFeesCovered) {
          newStatus = 'PAID';
        } else if (newPaid > 0 || newLateFeesPaid > 0) {
          newStatus = 'PARTIAL';
        }

        await tx.loanRepayment.update({
          where: { id: alloc.repaymentId },
          data: {
            status: newStatus,
            lateFeeAccrued,
            lateFeesPaid: newLateFeesPaid,
          },
        });
      }

      return {
        transaction,
        allocations: createdAllocations,
        receiptNumber,
        totalLateFeesPaid,
        totalOutstandingBefore,
        allocationData,
      };
    }));
    businessCommitted = true;
    replayResponseStatus = 201;
    replayResponseBody = {
      success: true,
      data: {
        transaction: result.transaction,
        receiptNumber: result.receiptNumber,
        allocations: result.allocationData.map(a => ({
          repaymentNumber: a.repaymentNumber,
          amount: a.amount,
          lateFeeAllocated: a.lateFeeAllocated,
          interestAllocated: a.interestAllocated,
          principalAllocated: a.principalAllocated,
        })),
        totalLateFeesPaid: result.totalLateFeesPaid,
        defaultCleared: false,
      },
      emailSent: false,
    };

    // Check if a DEFAULTED loan should be reactivated (evaluated here, but audit logged after RECORD_PAYMENT)
    let defaultCleared = false;
    if (loan.status === 'DEFAULTED') {
      // Re-read the current state of all repayments after payment allocation
      const freshSchedule = await prisma.loanScheduleVersion.findFirst({
        where: { loanId },
        orderBy: { version: 'desc' },
        include: {
          repayments: {
            orderBy: { dueDate: 'asc' },
            include: { allocations: true },
          },
        },
      });

      if (freshSchedule) {
        const now = new Date();
        // Find all overdue repayments (due date is in the past, exclude CANCELLED from early settlement)
        const overdueRepayments = freshSchedule.repayments.filter(
          r => r.status !== 'CANCELLED' && calculateDaysOverdueMalaysia(r.dueDate, now) > 0
        );
        
        // Check if all overdue repayments are fully paid (principal + interest + late fees)
        const allOverduePaid = overdueRepayments.length > 0 && overdueRepayments.every(r => {
          const totalDue = toSafeNumber(r.totalDue);
          const paid = r.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
          const lateFeeAccrued = toSafeNumber(r.lateFeeAccrued);
          const lateFeesPaid = toSafeNumber(r.lateFeesPaid);
          const principalInterestPaid = paid >= totalDue - 0.01;
          const lateFeesCovered = lateFeesPaid >= lateFeeAccrued - 0.01;
          return principalInterestPaid && lateFeesCovered;
        });

        if (allOverduePaid) {
          // Clear default status - reactivate the loan
          await prisma.loan.update({
            where: { id: loanId },
            data: {
              status: 'ACTIVE',
              readyForDefault: false,
              defaultReadyDate: null,
              arrearsStartDate: null,
            },
          });
          defaultCleared = true;
        }
      }
    }

    const borrower = loan.borrower;
    let receiptPath: string | null = null;
    let updatedTransaction = await prisma.paymentTransaction.findUnique({
      where: { id: result.transaction.id },
      include: { allocations: true },
    });
    if (!updatedTransaction) {
      throw new NotFoundError('Payment transaction');
    }

    // Receipt generation is best-effort and should not roll back recorded payments
    try {
      receiptPath = await generateAndStoreReceipt({
        transaction: result.transaction,
        allocations: result.allocations,
        loan,
        borrower: {
          displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName
            ? borrower.companyName
            : borrower.name,
          identificationNumber: borrower.icNumber,
          phone: borrower.phone,
          email: borrower.email,
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
        totalLateFees: result.totalLateFeesPaid,
        totalOutstandingAfter: safeSubtract(result.totalOutstandingBefore, data.amount),
      });

      updatedTransaction = await prisma.paymentTransaction.update({
        where: { id: result.transaction.id },
        data: {
          receiptPath,
          receiptGenAt: new Date(),
        },
        include: {
          allocations: true,
        },
      });
    } catch (receiptErr) {
      console.error(`[RecordPayment] Receipt generation failed for loan ${loanId}:`, receiptErr);
    }

    // Log to audit trail
    await AuditService.log({
      tenantId: tenantId,
      memberId: memberId ?? undefined,
      action: 'RECORD_PAYMENT',
      entityType: 'Loan',
      entityId: loanId,
      newData: {
        transactionId: result.transaction.id,
        receiptNumber: result.receiptNumber,
        totalAmount: data.amount,
        allocations: result.allocationData.map(a => ({
          repaymentNumber: a.repaymentNumber,
          amount: a.amount,
          lateFeeAllocated: a.lateFeeAllocated,
          interestAllocated: a.interestAllocated,
          principalAllocated: a.principalAllocated,
        })),
        totalLateFeesPaid: result.totalLateFeesPaid,
        reference: data.reference || null,
        paymentDate: paymentDate.toISOString(),
        spillover: result.allocationData.length > 1,
      },
      ipAddress: ipAddress,
    });

    // Audit log: default cleared (after RECORD_PAYMENT so it appears in correct order)
    if (defaultCleared) {
      await AuditService.log({
        tenantId: tenantId,
        memberId: memberId ?? undefined,
        action: 'STATUS_UPDATE',
        entityType: 'Loan',
        entityId: loanId,
        previousData: { status: 'DEFAULTED' },
        newData: {
          status: 'ACTIVE',
          reason: 'All overdue repayments fully paid - default cleared',
          paymentTransactionId: result.transaction.id,
        },
        ipAddress: ipAddress,
      });
    }

    try {
      await recalculateBorrowerPerformanceProjection(tenantId, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    // TrueSend: send payment receipt email with PDF attached
    let emailSent = false;
    if (receiptPath) {
      try {
        emailSent = await TrueSendService.sendPaymentReceipt(
          tenantId,
          loanId,
          receiptPath,
          data.amount,
          result.receiptNumber
        );
      } catch (emailErr) {
        console.error(`[RecordPayment] TrueSend email failed for loan ${loanId}:`, emailErr);
      }
    }

    const responsePayload = {
      success: true,
      data: {
        transaction: updatedTransaction,
        receiptNumber: result.receiptNumber,
        allocations: result.allocationData.map(a => ({
          repaymentNumber: a.repaymentNumber,
          amount: a.amount,
          lateFeeAllocated: a.lateFeeAllocated,
          interestAllocated: a.interestAllocated,
          principalAllocated: a.principalAllocated,
        })),
        totalLateFeesPaid: result.totalLateFeesPaid,
        defaultCleared,
      },
      emailSent,
    };
    replayResponseBody = responsePayload;
    await completePaymentIdempotency(idempotencyRecordId, 201, responsePayload);

    return { kind: 'created' as const, body: responsePayload };
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

