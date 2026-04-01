import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { previewSchedule, generateSchedule } from './service.js';
import { parseFileUpload, UPLOAD_DIR } from '../../lib/upload.js';
import { saveFile, getFile, deleteFile } from '../../lib/storage.js';
import { AuditService } from '../compliance/auditService.js';
import { toSafeNumber, safeAdd, safeSubtract } from '../../lib/math.js';
import { beginPaymentIdempotency, completePaymentIdempotency, failPaymentIdempotency, getIdempotencyKeyFromHeaders } from '../../lib/paymentIdempotency.js';
import { recalculateBorrowerPerformanceProjection } from '../borrowers/performanceProjectionService.js';
import {
  accrueLateFeesThroughDate,
  validatePaymentDate,
  handleRecordLoanSpilloverPayment,
} from './recordLoanSpilloverPayment.js';
import {
  approveBorrowerManualPaymentRequest,
  rejectBorrowerManualPaymentRequest,
} from './borrowerManualPaymentService.js';

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
  interestModel: z.enum(['FLAT', 'RULE_78', 'DECLINING_BALANCE', 'EFFECTIVE_RATE']),
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
      totalLateFeesOutstanding: 0,
      overdueCount: 0,
      paidCount: 0,
      pendingCount: 0,
    };

    const now = new Date();
    for (const repayment of currentSchedule.repayments) {
      const totalDue = toSafeNumber(repayment.totalDue);
      const totalPaid = repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
      const outstandingPrincipalInterest = Math.max(0, safeSubtract(totalDue, totalPaid));
      const outstandingLateFees = Math.max(
        0,
        safeSubtract(toSafeNumber(repayment.lateFeeAccrued), toSafeNumber(repayment.lateFeesPaid))
      );

      summary.totalDue = safeAdd(summary.totalDue, totalDue);
      summary.totalPaid = safeAdd(summary.totalPaid, totalPaid);
      summary.totalLateFeesOutstanding = safeAdd(summary.totalLateFeesOutstanding, outstandingLateFees);
      summary.totalOutstanding = safeAdd(summary.totalOutstanding, safeAdd(outstandingPrincipalInterest, outstandingLateFees));

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
  let idempotencyRecordId: string | null = null;
  let businessCommitted = false;
  let replayResponseStatus: number | null = null;
  let replayResponseBody: unknown = null;
  try {
    const data = recordPaymentSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKeyFromHeaders(req.headers as Record<string, unknown>);
    const idempotency = await beginPaymentIdempotency({
      tenantId: req.tenantId!,
      endpoint: 'POST:/api/schedules/payments',
      idempotencyKey,
      requestPayload: {
        tenantId: req.tenantId,
        repaymentId: data.repaymentId,
        amount: data.amount,
        reference: data.reference || null,
        notes: data.notes || null,
        isEarlyPayment: data.isEarlyPayment,
        applyLateFee: data.applyLateFee,
        paymentDate: data.paymentDate || null,
      },
    });
    idempotencyRecordId = idempotency.recordId;

    if (idempotency.replay) {
      res.status(idempotency.responseStatus || 201).json(idempotency.responseBody);
      return;
    }

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
    const now = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const paymentDate = now;
    validatePaymentDate(paymentDate, loan.disbursementDate);

    // Create allocation and update repayment status
    const result = await prisma.$transaction(async (tx) => {
      // Lock loan first, then repayment for consistent lock order across payment endpoints.
      await tx.$executeRaw`SELECT 1 FROM "Loan" WHERE id = ${loan.id} FOR UPDATE`;
      await tx.$executeRaw`SELECT 1 FROM "LoanRepayment" WHERE id = ${data.repaymentId} FOR UPDATE`;

      const lockedRepayment = await tx.loanRepayment.findUnique({
        where: { id: data.repaymentId },
        include: {
          allocations: true,
          lateFeeEntries: {
            orderBy: { accrualDate: 'desc' },
            take: 1,
          },
          scheduleVersion: {
            include: {
              loan: {
                include: { product: true },
              },
            },
          },
        },
      });

      if (!lockedRepayment || lockedRepayment.scheduleVersion.loan.tenantId !== req.tenantId) {
        throw new NotFoundError('Repayment');
      }

      if (lockedRepayment.status === 'PAID') {
        throw new BadRequestError('Repayment is already fully paid');
      }

      const lockedLoan = lockedRepayment.scheduleVersion.loan;
      const latePaymentRate = toSafeNumber(lockedLoan.product.latePaymentRate);
      const isEarlyPayment = data.isEarlyPayment || paymentDate < new Date(lockedRepayment.dueDate);

      const lateFeeAccruedIncrement = data.applyLateFee === false
        ? 0
        : await accrueLateFeesThroughDate({
          tx,
          tenantId: req.tenantId!,
          loanId: lockedLoan.id,
          latePaymentRate,
          repayment: {
            id: lockedRepayment.id,
            dueDate: lockedRepayment.dueDate,
            totalDue: lockedRepayment.totalDue,
            allocations: lockedRepayment.allocations.map(a => ({ allocatedAt: a.allocatedAt, amount: a.amount })),
            lateFeeEntries: lockedRepayment.lateFeeEntries.map(e => ({ accrualDate: e.accrualDate })),
          },
          asOfDate: paymentDate,
        });

      if (lateFeeAccruedIncrement > 0) {
        await tx.loan.update({
          where: { id: lockedLoan.id },
          data: { totalLateFees: { increment: lateFeeAccruedIncrement } },
        });
      }

      const currentPaid = lockedRepayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
      const totalDue = toSafeNumber(lockedRepayment.totalDue);
      const principalInterestOutstanding = Math.max(0, safeSubtract(totalDue, currentPaid));

      const lateFeeAccrued = safeAdd(toSafeNumber(lockedRepayment.lateFeeAccrued), lateFeeAccruedIncrement);
      const lateFeesPaid = toSafeNumber(lockedRepayment.lateFeesPaid);
      const outstandingLateFees = Math.max(0, safeSubtract(lateFeeAccrued, lateFeesPaid));

      const totalOutstanding = safeAdd(principalInterestOutstanding, outstandingLateFees);
      if (data.amount > totalOutstanding + 0.01) {
        throw new BadRequestError(`Payment amount exceeds remaining balance of ${totalOutstanding.toFixed(2)}`);
      }

      let remainingPayment = data.amount;
      const lateFeeAllocated = Math.min(remainingPayment, outstandingLateFees);
      remainingPayment = safeSubtract(remainingPayment, lateFeeAllocated);

      const interestDue = toSafeNumber(lockedRepayment.interest);
      const interestUnpaid = Math.max(0, safeSubtract(interestDue, Math.min(currentPaid, interestDue)));
      const interestAllocated = Math.min(remainingPayment, interestUnpaid);
      remainingPayment = safeSubtract(remainingPayment, interestAllocated);

      const principalUnpaid = Math.max(0, safeSubtract(principalInterestOutstanding, interestUnpaid));
      const principalAllocated = Math.min(remainingPayment, principalUnpaid);
      const allocationAmount = safeAdd(interestAllocated, principalAllocated);

      if (allocationAmount <= 0.01 && lateFeeAllocated <= 0.01) {
        throw new BadRequestError('Payment amount is too small to allocate');
      }

      const allocation = await tx.paymentAllocation.create({
        data: {
          repaymentId: data.repaymentId,
          amount: allocationAmount,
          reference: data.reference,
          notes: data.notes,
          lateFee: lateFeeAllocated > 0 ? lateFeeAllocated : null,
          isEarlyPayment,
          allocatedAt: paymentDate, // Use the provided payment date
        },
      });

      // Update repayment status
      const newPaid = safeAdd(currentPaid, allocationAmount);
      let newStatus: typeof lockedRepayment.status | 'PAID' = lockedRepayment.status;
      const newLateFeesPaid = safeAdd(lateFeesPaid, lateFeeAllocated);
      const lateFeesCovered = newLateFeesPaid >= lateFeeAccrued - 0.01;

      if (newPaid >= totalDue - 0.01 && lateFeesCovered) {
        newStatus = 'PAID';
      } else if (newPaid > 0) {
        newStatus = 'PARTIAL';
      }

      const updatedRepayment = await tx.loanRepayment.update({
        where: { id: data.repaymentId },
        data: {
          status: newStatus,
          lateFeeAccrued,
          lateFeesPaid: newLateFeesPaid,
        },
        include: {
          allocations: {
            include: {
              transaction: true,
            },
          },
        },
      });

      // Check if all repayments are paid - don't auto-complete, let admin do it manually
      // This allows for proper discharge notes and metrics calculation
      // const allRepayments = await tx.loanRepayment.findMany({...});
      // const allPaid = allRepayments.every(r => r.status === 'PAID');

      return {
        allocation,
        repayment: updatedRepayment,
        lateFee: lateFeeAllocated,
        loanId: lockedLoan.id,
        isEarlyPayment,
      };
    });
    businessCommitted = true;
    replayResponseStatus = 201;
    replayResponseBody = {
      success: true,
      data: result,
    };

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'RECORD_PAYMENT',
      entityType: 'Loan',
      entityId: result.loanId,
      newData: {
        repaymentId: data.repaymentId,
        amount: toSafeNumber(result.allocation.amount),
        lateFee: result.lateFee > 0 ? result.lateFee : null,
        isEarlyPayment: result.isEarlyPayment,
        reference: data.reference || null,
        paymentDate: paymentDate.toISOString(),
      },
      ipAddress: req.ip,
    });

    try {
      await recalculateBorrowerPerformanceProjection(req.tenantId!, loan.borrowerId);
    } catch (projectionError) {
      console.error(`[BorrowerPerformance] Projection refresh failed for borrower ${loan.borrowerId}:`, projectionError);
    }

    const responsePayload = {
      success: true,
      data: result,
    };
    replayResponseBody = responsePayload;
    await completePaymentIdempotency(idempotencyRecordId, 201, responsePayload);

    res.status(201).json(responsePayload);
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

/**
 * Record a payment for a loan with automatic spillover to subsequent repayments
 * POST /api/schedules/loan/:loanId/payments
 */
router.post('/loan/:loanId/payments', async (req, res, next) => {
  try {
    const result = await handleRecordLoanSpilloverPayment({
      tenantId: req.tenantId!,
      loanId: req.params.loanId,
      body: req.body,
      memberId: req.memberId,
      ip: req.ip,
      headers: req.headers,
      idempotencyEndpoint: 'POST:/api/schedules/loan/:loanId/payments',
    });
    if (result.kind === 'replay') {
      res.status(result.status).json(result.body);
      return;
    }
    res.status(201).json(result.body);
  } catch (e) {
    next(e);
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

    const fileBuffer = await getFile(transaction.receiptPath);
    if (!fileBuffer) {
      throw new NotFoundError('Receipt file');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${transaction.receiptNumber}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
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
      await deleteFile(transaction.proofPath);
    }

    // Parse the file upload (use parseFileUpload which doesn't require category)
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    const { path: proofPath, filename: proofFilename } = await saveFile(
      buffer,
      'proofs',
      transactionId,
      originalName
    );

    // Update transaction with proof info
    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        proofFilename,
        proofOriginalName: originalName,
        proofMimeType: mimeType,
        proofSize: buffer.length,
        proofPath,
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

    const fileBuffer = await getFile(transaction.proofPath);
    if (!fileBuffer) {
      throw new NotFoundError('Proof of payment file');
    }

    res.setHeader('Content-Type', transaction.proofMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${transaction.proofOriginalName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

const rejectManualPaymentBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * List borrower manual payment requests (pending approval queue)
 * GET /api/schedules/manual-payment-requests
 */
router.get('/manual-payment-requests', async (req, res, next) => {
  try {
    const status = (req.query.status as string) || 'PENDING';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId: req.tenantId!,
      ...(status === 'all' ? {} : { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }),
    };

    const [rows, total] = await Promise.all([
      prisma.borrowerManualPaymentRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          loan: {
            select: {
              id: true,
              status: true,
              borrowerId: true,
            },
          },
          borrower: {
            select: {
              id: true,
              name: true,
              icNumber: true,
              companyName: true,
              borrowerType: true,
            },
          },
          paymentTransaction: {
            select: { id: true, receiptNumber: true, totalAmount: true, paymentDate: true },
          },
        },
      }),
      prisma.borrowerManualPaymentRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: rows,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Approve borrower manual payment request
 * POST /api/schedules/manual-payment-requests/:requestId/approve
 */
router.post('/manual-payment-requests/:requestId/approve', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const out = await approveBorrowerManualPaymentRequest({
      tenantId: req.tenantId!,
      requestId,
      memberId: req.memberId ?? null,
      ip: req.ip,
      headers: req.headers,
    });
    res.status(201).json(out);
  } catch (error) {
    next(error);
  }
});

/**
 * Reject borrower manual payment request
 * POST /api/schedules/manual-payment-requests/:requestId/reject
 */
router.post('/manual-payment-requests/:requestId/reject', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const body = rejectManualPaymentBodySchema.parse(req.body ?? {});
    await rejectBorrowerManualPaymentRequest({
      tenantId: req.tenantId!,
      requestId,
      memberId: req.memberId ?? null,
      reason: body.reason,
      ip: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Admin: view borrower-uploaded payment slip
 * GET /api/schedules/manual-payment-requests/:requestId/borrower-receipt
 */
router.get('/manual-payment-requests/:requestId/borrower-receipt', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const row = await prisma.borrowerManualPaymentRequest.findFirst({
      where: { id: requestId, tenantId: req.tenantId },
    });
    if (!row || !row.receiptPath) {
      throw new NotFoundError('Receipt');
    }
    const fileBuffer = await getFile(row.receiptPath);
    if (!fileBuffer) {
      throw new NotFoundError('Receipt file');
    }
    const name = row.receiptOriginalName || 'slip';
    res.setHeader('Content-Type', row.receiptMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

export default router;
