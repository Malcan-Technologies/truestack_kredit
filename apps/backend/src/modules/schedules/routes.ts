import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { previewSchedule, generateSchedule } from './service.js';
import { parseFileUpload, savePaymentReceiptFile, deleteDocumentFile, UPLOAD_DIR } from '../../lib/upload.js';
import { AuditService } from '../compliance/auditService.js';
import { TrueSendService } from '../notifications/trueSendService.js';
import { toSafeNumber, safeRound, safeMultiply, safeDivide, safeAdd, safeSubtract } from '../../lib/math.js';
import { createHash } from 'crypto';
import https from 'https';
import http from 'http';

const router = Router();

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requirePaidSubscription);

// Validation schemas
const previewScheduleSchema = z.object({
  principal: z.number().positive(),
  interestRate: z.number().min(0).max(100),
  term: z.number().int().positive(),
  disbursementDate: z.string().datetime().optional(),
  interestModel: z.enum(['FLAT', 'DECLINING_BALANCE', 'EFFECTIVE_RATE']),
});

const recordPaymentSchema = z.object({
  repaymentId: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
  notes: z.string().max(500).optional(),
  isEarlyPayment: z.boolean().optional().default(false),
  applyLateFee: z.boolean().optional().default(true), // Whether to calculate and apply late fee
  paymentDate: z.string().datetime().optional(), // Date when payment was actually made (defaults to now)
});

// New schema for recording payment with automatic spillover
const recordLoanPaymentSchema = z.object({
  loanId: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
  notes: z.string().max(500).optional(),
  applyLateFee: z.boolean().optional().default(true),
  paymentDate: z.string().datetime().optional(),
});

// Helper function to fetch image from URL or local file
const fetchImageBuffer = (url: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    if (url.startsWith('/api/uploads/') || url.startsWith('/uploads/')) {
      const relativePath = url.replace('/api/uploads/', '').replace('/uploads/', '');
      const filePath = path.join(UPLOAD_DIR, relativePath);
      
      if (fs.existsSync(filePath)) {
        resolve(fs.readFileSync(filePath));
      } else {
        reject(new Error(`File not found: ${filePath}`));
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    } else {
      reject(new Error(`Unsupported URL format: ${url}`));
    }
  });
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
async function generateAndStoreReceipt(params: ReceiptParams): Promise<string> {
  const { transaction, allocations, loan, borrower, tenant, totalLateFees, totalOutstandingAfter } = params;
  
  // Ensure receipts directory exists
  const receiptsDir = path.join(UPLOAD_DIR, 'receipts');
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
  }

  // Generate filename
  const filename = `${transaction.receiptNumber}.pdf`;
  const filePath = path.join(receiptsDir, filename);

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
      const writeStream = fs.createWriteStream(filePath);
      
      doc.pipe(writeStream);

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

      writeStream.on('finish', () => {
        resolve(`/api/uploads/receipts/${filename}`);
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Preview a schedule (without saving)
 * POST /api/schedules/preview
 */
router.post('/preview', async (req, res, next) => {
  try {
    const data = previewScheduleSchema.parse(req.body);
    
    const schedule = previewSchedule({
      principal: data.principal,
      interestRate: data.interestRate,
      term: data.term,
      disbursementDate: data.disbursementDate ? new Date(data.disbursementDate) : new Date(),
      interestModel: data.interestModel,
    });

    res.json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get schedule for a loan
 * GET /api/schedules/loan/:loanId
 */
router.get('/loan/:loanId', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        scheduleVersions: {
          orderBy: { version: 'desc' },
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
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

    // Calculate payment summary
    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      return res.json({
        success: true,
        data: {
          loan: {
            id: loan.id,
            status: loan.status,
          },
          schedule: null,
        },
      });
    }

    const summary = {
      totalDue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueCount: 0,
      paidCount: 0,
      pendingCount: 0,
    };

    const now = new Date();
    for (const repayment of currentSchedule.repayments) {
      const totalDue = Number(repayment.totalDue);
      const totalPaid = repayment.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
      
      summary.totalDue += totalDue;
      summary.totalPaid += totalPaid;
      summary.totalOutstanding += Math.max(0, totalDue - totalPaid);

      const status = repayment.status as string;
      if (status === 'PAID') {
        summary.paidCount++;
      } else if (status === 'CANCELLED') {
        // Cancelled repayments (early settlement) - don't count as outstanding
        summary.paidCount++;
      } else if (status === 'OVERDUE' || (repayment.dueDate < now && !['PAID', 'CANCELLED'].includes(status))) {
        summary.overdueCount++;
      } else {
        summary.pendingCount++;
      }
    }

    res.json({
      success: true,
      data: {
        loan: {
          id: loan.id,
          status: loan.status,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          term: loan.term,
          disbursementDate: loan.disbursementDate,
        },
        schedule: currentSchedule,
        summary,
        allVersions: loan.scheduleVersions.map(v => ({
          id: v.id,
          version: v.version,
          interestModel: v.interestModel,
          createdAt: v.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Record a payment allocation
 * POST /api/schedules/payments
 */
router.post('/payments', async (req, res, next) => {
  try {
    const data = recordPaymentSchema.parse(req.body);

    // Get repayment and verify it belongs to tenant's loan
    const repayment = await prisma.loanRepayment.findFirst({
      where: {
        id: data.repaymentId,
      },
      include: {
        scheduleVersion: {
          include: {
            loan: {
              include: {
                product: true,
              },
            },
          },
        },
        allocations: true,
      },
    });

    if (!repayment || repayment.scheduleVersion.loan.tenantId !== req.tenantId) {
      throw new NotFoundError('Repayment');
    }

    if (repayment.status === 'PAID') {
      throw new BadRequestError('Repayment is already fully paid');
    }

    const loan = repayment.scheduleVersion.loan;
    const product = loan.product;

    // Calculate current paid amount
    const currentPaid = repayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
    const totalDue = toSafeNumber(repayment.totalDue);
    const remaining = safeSubtract(totalDue, currentPaid);

    if (data.amount > remaining + 0.01) { // Small tolerance for rounding
      throw new BadRequestError(`Payment amount exceeds remaining balance of ${remaining.toFixed(2)}`);
    }

    // Calculate late fee if payment is overdue
    let lateFee = 0;
    const now = new Date();
    const dueDate = new Date(repayment.dueDate);
    const isOverdue = now > dueDate;
    const isEarlyPayment = data.isEarlyPayment || now < dueDate;

    if (isOverdue && data.applyLateFee !== false) {
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const latePaymentRate = toSafeNumber(product.latePaymentRate); // Annual rate
      // Daily rate = annual rate / 365
      // Late fee = outstanding × daily rate × days overdue
      const dailyRate = safeDivide(latePaymentRate, 365 * 100, 8);
      lateFee = safeRound(safeMultiply(remaining, safeMultiply(dailyRate, daysOverdue, 8)));
    }

    // Parse payment date if provided, otherwise use now
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();

    // Create allocation and update repayment status
    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.paymentAllocation.create({
        data: {
          repaymentId: data.repaymentId,
          amount: data.amount,
          reference: data.reference,
          notes: data.notes,
          lateFee: lateFee > 0 ? lateFee : null,
          isEarlyPayment,
          allocatedAt: paymentDate, // Use the provided payment date
        },
      });

      // Update repayment status
      const newPaid = safeAdd(currentPaid, data.amount);
      let newStatus = repayment.status;
      
      if (newPaid >= totalDue - 0.01) {
        newStatus = 'PAID';
      } else if (newPaid > 0) {
        newStatus = 'PARTIAL';
      }

      const updatedRepayment = await tx.loanRepayment.update({
        where: { id: data.repaymentId },
        data: { status: newStatus },
        include: {
          allocations: {
            include: {
              transaction: true,
            },
          },
        },
      });

      // Update loan's total late fees if applicable
      if (lateFee > 0) {
        const currentLateFees = toSafeNumber(loan.totalLateFees);
        await tx.loan.update({
          where: { id: loan.id },
          data: { totalLateFees: safeAdd(currentLateFees, lateFee) },
        });
      }

      // Check if all repayments are paid - don't auto-complete, let admin do it manually
      // This allows for proper discharge notes and metrics calculation
      // const allRepayments = await tx.loanRepayment.findMany({...});
      // const allPaid = allRepayments.every(r => r.status === 'PAID');

      return { allocation, repayment: updatedRepayment, lateFee };
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'RECORD_PAYMENT',
      entityType: 'Loan',
      entityId: loan.id,
      newData: {
        repaymentId: data.repaymentId,
        amount: data.amount,
        lateFee: lateFee > 0 ? lateFee : null,
        isEarlyPayment,
        reference: data.reference || null,
        paymentDate: paymentDate.toISOString(),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Record a payment for a loan with automatic spillover to subsequent repayments
 * POST /api/schedules/loan/:loanId/payments
 * 
 * This endpoint:
 * 1. Creates a PaymentTransaction record
 * 2. Allocates payments chronologically to unpaid/partial repayments
 * 3. Generates and stores a PDF receipt
 * 4. Returns the transaction with receipt info
 */
router.post('/loan/:loanId/payments', async (req, res, next) => {
  try {
    const { loanId } = req.params;
    const data = recordLoanPaymentSchema.parse({ ...req.body, loanId });

    // Get loan with current schedule, all repayments, borrower, and tenant info
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

    // Find unpaid/partial repayments in chronological order (exclude PAID and CANCELLED)
    const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED');
    if (unpaidRepayments.length === 0) {
      throw new BadRequestError('All repayments are already paid');
    }

    // Calculate total outstanding balance including late fees
    let totalOutstanding = 0;
    for (const rep of unpaidRepayments) {
      const paid = rep.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
      const outstandingLateFees = safeSubtract(toSafeNumber(rep.lateFeeAccrued), toSafeNumber(rep.lateFeesPaid));
      totalOutstanding = safeAdd(
        totalOutstanding,
        safeAdd(safeSubtract(toSafeNumber(rep.totalDue), paid), Math.max(0, outstandingLateFees))
      );
    }

    if (data.amount > totalOutstanding + 0.01) {
      throw new BadRequestError(`Payment amount exceeds total outstanding balance of ${totalOutstanding.toFixed(2)}`);
    }

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const product = loan.product;
    let remainingPayment = data.amount;
    const allocationData: {
      repaymentId: string;
      repaymentNumber: number;
      dueDate: Date;
      amount: number;        // principal + interest portion allocated
      lateFee: number;        // late fee portion allocated from payment
      isEarlyPayment: boolean;
      lateFeeAllocated: number; // how much of the payment went to late fees
      interestAllocated: number;
      principalAllocated: number;
    }[] = [];
    let totalLateFeesPaid = 0;

    // Allocate payment across repayments
    // Priority: late fees first, then interest, then principal (per repayment, oldest first)
    for (let i = 0; i < unpaidRepayments.length; i++) {
      if (remainingPayment <= 0.01) break;
      
      const repayment = unpaidRepayments[i];
      const repaymentIndex = currentSchedule.repayments.findIndex(r => r.id === repayment.id);
      const currentPaid = repayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
      const totalDue = toSafeNumber(repayment.totalDue);
      const interestDue = toSafeNumber(repayment.interest);
      const remaining = safeSubtract(totalDue, currentPaid);
      const dueDate = new Date(repayment.dueDate);
      const isEarlyPayment = paymentDate < dueDate;

      if (remaining <= 0.01 && toSafeNumber(repayment.lateFeeAccrued) <= toSafeNumber(repayment.lateFeesPaid) + 0.01) continue;

      let lateFeeAllocated = 0;
      let interestAllocated = 0;
      let principalAllocated = 0;

      // 1. Pay outstanding late fees first
      const outstandingLateFees = Math.max(0, safeSubtract(
        toSafeNumber(repayment.lateFeeAccrued),
        toSafeNumber(repayment.lateFeesPaid)
      ));

      if (outstandingLateFees > 0.01 && remainingPayment > 0.01) {
        lateFeeAllocated = Math.min(remainingPayment, outstandingLateFees);
        remainingPayment = safeSubtract(remainingPayment, lateFeeAllocated);
        totalLateFeesPaid = safeAdd(totalLateFeesPaid, lateFeeAllocated);
      }

      // 2. Pay interest portion
      // Calculate how much interest is still unpaid for this repayment
      // Interest is paid before principal from the totalDue allocation
      const totalAllocatedSoFar = currentPaid; // total of previous payment allocations
      const interestUnpaid = Math.max(0, safeSubtract(interestDue, Math.min(totalAllocatedSoFar, interestDue)));
      
      if (interestUnpaid > 0.01 && remainingPayment > 0.01) {
        interestAllocated = Math.min(remainingPayment, interestUnpaid);
        remainingPayment = safeSubtract(remainingPayment, interestAllocated);
      }

      // 3. Pay principal portion
      const principalUnpaid = Math.max(0, safeSubtract(remaining, interestUnpaid));

      if (principalUnpaid > 0.01 && remainingPayment > 0.01) {
        principalAllocated = Math.min(remainingPayment, principalUnpaid);
        remainingPayment = safeSubtract(remainingPayment, principalAllocated);
      }

      const allocationAmount = safeAdd(interestAllocated, principalAllocated);

      if (allocationAmount > 0.01 || lateFeeAllocated > 0.01) {
        allocationData.push({
          repaymentId: repayment.id,
          repaymentNumber: repaymentIndex + 1,
          dueDate,
          amount: allocationAmount, // principal + interest portion (for backward compatibility)
          lateFee: lateFeeAllocated,
          isEarlyPayment,
          lateFeeAllocated,
          interestAllocated,
          principalAllocated,
        });
      }
    }

    // Generate receipt number (RCP-YYYYMMDD-XXX)
    const dateStr = paymentDate.toISOString().split('T')[0].replace(/-/g, '');
    const existingCount = await prisma.paymentTransaction.count({
      where: {
        tenantId: req.tenantId!,
        receiptNumber: { startsWith: `RCP-${dateStr}` },
      },
    });
    const receiptNumber = `RCP-${dateStr}-${String(existingCount + 1).padStart(3, '0')}`;

    // Execute transaction to create all records
    const result = await prisma.$transaction(async (tx) => {
      // Create PaymentTransaction
      const transaction = await tx.paymentTransaction.create({
        data: {
          tenantId: req.tenantId!,
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

        // Update repayment status and late fees paid
        const repayment = await tx.loanRepayment.findUnique({
          where: { id: alloc.repaymentId },
          include: { allocations: true },
        });

        if (repayment) {
          const newPaid = repayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
          const totalDue = toSafeNumber(repayment.totalDue);
          const newLateFeesPaid = safeAdd(toSafeNumber(repayment.lateFeesPaid), alloc.lateFeeAllocated);
          
          let newStatus = repayment.status;
          // Consider repayment PAID only if both principal+interest and late fees are covered
          const lateFeesCovered = newLateFeesPaid >= toSafeNumber(repayment.lateFeeAccrued) - 0.01;
          if (newPaid >= totalDue - 0.01 && lateFeesCovered) {
            newStatus = 'PAID';
          } else if (newPaid > 0 || newLateFeesPaid > 0) {
            newStatus = 'PARTIAL';
          }

          await tx.loanRepayment.update({
            where: { id: alloc.repaymentId },
            data: {
              status: newStatus,
              lateFeesPaid: newLateFeesPaid,
            },
          });
        }
      }

      return { transaction, allocations: createdAllocations };
    });

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
        const overdueRepayments = freshSchedule.repayments.filter(r => r.status !== 'CANCELLED' && new Date(r.dueDate) < now);
        
        // Check if all overdue repayments are fully paid (principal + interest + late fees)
        const allOverduePaid = overdueRepayments.length > 0 && overdueRepayments.every(r => {
          const totalDue = toSafeNumber(r.totalDue);
          const paid = r.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
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

    // Generate and store receipt PDF
    const borrower = loan.borrower;
    const receiptPath = await generateAndStoreReceipt({
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
      totalLateFees: totalLateFeesPaid,
      totalOutstandingAfter: safeSubtract(totalOutstanding, data.amount),
    });

    // Update transaction with receipt path
    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id: result.transaction.id },
      data: {
        receiptPath,
        receiptGenAt: new Date(),
      },
      include: {
        allocations: true,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'RECORD_PAYMENT',
      entityType: 'Loan',
      entityId: loanId,
      newData: {
        transactionId: result.transaction.id,
        receiptNumber,
        totalAmount: data.amount,
        allocations: allocationData.map(a => ({
          repaymentNumber: a.repaymentNumber,
          amount: a.amount,
          lateFeeAllocated: a.lateFeeAllocated,
          interestAllocated: a.interestAllocated,
          principalAllocated: a.principalAllocated,
        })),
        totalLateFeesPaid,
        reference: data.reference || null,
        paymentDate: paymentDate.toISOString(),
        spillover: allocationData.length > 1,
      },
      ipAddress: req.ip,
    });

    // Audit log: default cleared (after RECORD_PAYMENT so it appears in correct order)
    if (defaultCleared) {
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'STATUS_UPDATE',
        entityType: 'Loan',
        entityId: loanId,
        previousData: { status: 'DEFAULTED' },
        newData: {
          status: 'ACTIVE',
          reason: 'All overdue repayments fully paid - default cleared',
          paymentTransactionId: result.transaction.id,
        },
        ipAddress: req.ip,
      });
    }

    // TrueSend: send payment receipt email with PDF attached
    let emailSent = false;
    if (receiptPath) {
      try {
        emailSent = await TrueSendService.sendPaymentReceipt(
          req.tenantId!,
          loanId,
          receiptPath,
          data.amount,
          receiptNumber
        );
      } catch (emailErr) {
        console.error(`[RecordPayment] TrueSend email failed for loan ${loanId}:`, emailErr);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        transaction: updatedTransaction,
        receiptNumber,
        allocations: allocationData.map(a => ({
          repaymentNumber: a.repaymentNumber,
          amount: a.amount,
          lateFeeAllocated: a.lateFeeAllocated,
          interestAllocated: a.interestAllocated,
          principalAllocated: a.principalAllocated,
        })),
        totalLateFeesPaid,
        defaultCleared,
      },
      emailSent,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get payment transaction history for a loan
 * GET /api/schedules/loan/:loanId/payments
 */
router.get('/loan/:loanId/payments', async (req, res, next) => {
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

    const transactions = await prisma.paymentTransaction.findMany({
      where: {
        loanId: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        allocations: {
          include: {
            repayment: {
              select: {
                dueDate: true,
                totalDue: true,
              },
            },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Download receipt for a payment transaction
 * GET /api/schedules/transactions/:transactionId/receipt
 */
router.get('/transactions/:transactionId/receipt', async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        id: transactionId,
        tenantId: req.tenantId,
      },
    });

    if (!transaction) {
      throw new NotFoundError('Payment transaction');
    }

    if (!transaction.receiptPath) {
      throw new NotFoundError('Receipt not generated');
    }

    // Extract filename from path
    const filename = transaction.receiptPath.split('/').pop();
    if (!filename) {
      throw new NotFoundError('Receipt file');
    }

    const filePath = path.join(UPLOAD_DIR, 'receipts', filename);
    
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Receipt file');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${transaction.receiptNumber}.pdf"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * Upload proof of payment for a payment transaction
 * POST /api/schedules/transactions/:transactionId/proof
 */
router.post('/transactions/:transactionId/proof', async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        id: transactionId,
        tenantId: req.tenantId,
      },
      include: {
        loan: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError('Payment transaction');
    }

    // If proof already exists, delete old file first
    if (transaction.proofPath) {
      const oldFilename = transaction.proofPath.split('/').pop();
      if (oldFilename) {
        const oldFilePath = path.join(UPLOAD_DIR, 'proofs', oldFilename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
    }

    // Parse the file upload (use parseFileUpload which doesn't require category)
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    // Ensure proofs directory exists
    const proofsDir = path.join(UPLOAD_DIR, 'proofs');
    if (!fs.existsSync(proofsDir)) {
      fs.mkdirSync(proofsDir, { recursive: true });
    }

    // Save the file
    const extension = path.extname(originalName).toLowerCase();
    const filename = `${transactionId}-${Date.now()}${extension}`;
    const filePath = path.join(proofsDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Update transaction with proof info
    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        proofFilename: filename,
        proofOriginalName: originalName,
        proofMimeType: mimeType,
        proofSize: buffer.length,
        proofPath: `/api/uploads/proofs/${filename}`,
        proofUploadedAt: new Date(),
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_PROOF_OF_PAYMENT',
      entityType: 'Loan',
      entityId: transaction.loanId,
      previousData: transaction.proofPath ? { replacedProof: true } : undefined,
      newData: {
        transactionId,
        receiptNumber: transaction.receiptNumber,
        originalName,
        mimeType,
        size: buffer.length,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: updatedTransaction,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View proof of payment for a transaction
 * GET /api/schedules/transactions/:transactionId/proof
 */
router.get('/transactions/:transactionId/proof', async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        id: transactionId,
        tenantId: req.tenantId,
      },
    });

    if (!transaction) {
      throw new NotFoundError('Payment transaction');
    }

    if (!transaction.proofPath || !transaction.proofFilename) {
      throw new NotFoundError('Proof of payment');
    }

    const filePath = path.join(UPLOAD_DIR, 'proofs', transaction.proofFilename);
    
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Proof of payment file');
    }

    res.setHeader('Content-Type', transaction.proofMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${transaction.proofOriginalName}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
