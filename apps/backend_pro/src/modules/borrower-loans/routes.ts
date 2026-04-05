import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { requireBorrowerSession } from '../../middleware/authenticateBorrower.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { requireActiveBorrower } from '../borrower-auth/borrowerContext.js';
import { parseFileUpload, parseMultipartWithOptionalFile } from '../../lib/upload.js';
import {
  saveAgreementFile,
  deleteAgreementFile,
  getAgreementFile,
  getLocalPath,
  saveFile,
  getFile,
} from '../../lib/storage.js';
import { AuditService } from '../compliance/auditService.js';
import { buildLoanAgreementPdfBuffer } from '../loans/loanAgreementPdfService.js';
import { toSafeNumber, safeAdd, safeSubtract, safeMultiply, safeDivide, safeRound } from '../../lib/math.js';
import { calculateDaysOverdueMalaysia } from '../../lib/malaysiaTime.js';
import { listAvailableAttestationSlots } from '../../lib/attestationAvailability.js';
import {
  proposeBorrowerSlot,
  borrowerAcceptCounter,
  borrowerDeclineCounter,
  cancelLoanFromBorrower,
  expireStaleAttestationProposalForLoan,
} from '../../lib/attestationBookingService.js';
import { isPreDisbursementLoanStatus } from '../../lib/loanStatusHelpers.js';
import { getEarlySettlementQuoteForLoan } from '../loans/earlySettlementQuoteService.js';

const router = Router();
router.use(requireBorrowerSession);

const getLatestAllocationAt = (
  allocations: Array<{ allocatedAt: Date | string | null | undefined }> | null | undefined,
): Date | null => {
  if (!allocations?.length) return null;

  return allocations.reduce<Date | null>((latest, allocation) => {
    if (!allocation.allocatedAt) return latest;

    const allocatedAt =
      allocation.allocatedAt instanceof Date ? allocation.allocatedAt : new Date(String(allocation.allocatedAt));

    if (Number.isNaN(allocatedAt.getTime())) return latest;

    return !latest || allocatedAt > latest ? allocatedAt : latest;
  }, null);
};

const createManualPaymentBodySchema = z.object({
  amount: z.number().positive(),
  reference: z.string().min(1).max(200),
});

async function createBorrowerManualPaymentRequest(params: {
  tenantId: string;
  borrowerId: string;
  loanId: string;
  amount: number;
  reference: string;
  receipt?: { buffer: Buffer; originalName: string; mimeType: string };
}): Promise<{ id: string }> {
  const { tenantId, borrowerId, loanId, amount, reference, receipt } = params;

  const loan = await prisma.loan.findFirst({
    where: { id: loanId, tenantId, borrowerId },
  });
  if (!loan) {
    throw new NotFoundError('Loan');
  }
  if (loan.status === 'PENDING_DISBURSEMENT' || loan.status === 'PENDING_ATTESTATION') {
    throw new BadRequestError('Loan has not been disbursed yet');
  }
  if (loan.status === 'COMPLETED') {
    throw new BadRequestError('Loan is already completed');
  }
  if (loan.status === 'WRITTEN_OFF') {
    throw new BadRequestError('Cannot submit payments on a written-off loan');
  }

  let receiptPath: string | null = null;
  let receiptFilename: string | null = null;
  let receiptOriginalName: string | null = null;
  let receiptMimeType: string | null = null;
  let receiptSize: number | null = null;

  if (receipt) {
    const ext = path.extname(receipt.originalName) || '.pdf';
    const saved = await saveFile(receipt.buffer, 'borrower-payment-slips', `${tenantId}-${loanId}`, `slip${ext}`);
    receiptPath = saved.path;
    receiptFilename = saved.filename;
    receiptOriginalName = receipt.originalName;
    receiptMimeType = receipt.mimeType;
    receiptSize = receipt.buffer.length;
  }

  const row = await prisma.borrowerManualPaymentRequest.create({
    data: {
      tenantId,
      loanId,
      borrowerId,
      amount,
      reference: reference.trim(),
      status: 'PENDING',
      receiptPath,
      receiptFilename,
      receiptOriginalName,
      receiptMimeType,
      receiptSize,
    },
  });

  await AuditService.log({
    tenantId,
    action: 'BORROWER_MANUAL_PAYMENT_REQUEST_CREATED',
    entityType: 'Loan',
    entityId: loanId,
    newData: { requestId: row.id, amount, reference: reference.trim() },
  });

  return { id: row.id };
}

/**
 * GET /api/borrower-auth/loan-center/overview
 * Tab counts + dashboard summary for the active borrower.
 */
router.get('/loan-center/overview', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const [
      incompleteApplications,
      pipelineApplications,
      rejectedApplications,
      pendingDisbursementLoans,
      activeLoans,
      dischargedLoans,
      paymentAgg,
      loansForNext,
    ] = await Promise.all([
      prisma.loanApplication.count({
        where: { tenantId: tenant.id, borrowerId, status: 'DRAFT' },
      }),
      prisma.loanApplication.count({
        where: {
          tenantId: tenant.id,
          borrowerId,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
      }),
      prisma.loanApplication.count({
        where: {
          tenantId: tenant.id,
          borrowerId,
          status: { in: ['REJECTED', 'CANCELLED'] },
        },
      }),
      prisma.loan.count({
        where: {
          tenantId: tenant.id,
          borrowerId,
          status: { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
        },
      }),
      prisma.loan.count({
        where: {
          tenantId: tenant.id,
          borrowerId,
          status: { in: ['ACTIVE', 'IN_ARREARS', 'DEFAULTED'] },
        },
      }),
      prisma.loan.count({
        where: { tenantId: tenant.id, borrowerId, status: 'COMPLETED' },
      }),
      prisma.paymentTransaction.aggregate({
        where: { tenantId: tenant.id, loan: { borrowerId } },
        _sum: { totalAmount: true },
      }),
      prisma.loan.findMany({
        where: {
          tenantId: tenant.id,
          borrowerId,
          status: { in: ['ACTIVE', 'IN_ARREARS', 'DEFAULTED', 'PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
        },
        select: { id: true },
        take: 50,
      }),
    ]);

    const applicationsTabCount = pipelineApplications + pendingDisbursementLoans;

    let totalOutstanding = 0;
    let nextDue: Date | null = null;
    let nextDueAmount: number | null = null;

    for (const l of loansForNext) {
      const loan = await prisma.loan.findFirst({
        where: { id: l.id, tenantId: tenant.id, borrowerId },
        include: {
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
      if (!loan?.scheduleVersions[0]) continue;
      const sch = loan.scheduleVersions[0];
      for (const r of sch.repayments) {
        if (r.status === 'PAID' || r.status === 'CANCELLED') continue;
        const paid = r.allocations.reduce((s, a) => safeAdd(s, toSafeNumber(a.amount)), 0);
        const principalInterestOutstanding = Math.max(0, safeSubtract(toSafeNumber(r.totalDue), paid));
        const lateFeeAccrued = toSafeNumber(r.lateFeeAccrued);
        const lateFeesPaid = toSafeNumber(r.lateFeesPaid);
        const outstandingLateFees = Math.max(0, safeSubtract(lateFeeAccrued, lateFeesPaid));
        const rowOutstanding = safeAdd(principalInterestOutstanding, outstandingLateFees);
        totalOutstanding = safeAdd(totalOutstanding, rowOutstanding);
        if (rowOutstanding > 0.01) {
          const due = new Date(r.dueDate);
          if (!nextDue || due < nextDue) {
            nextDue = due;
            nextDueAmount = rowOutstanding;
          }
        }
      }
    }

    const totalPaid = paymentAgg._sum.totalAmount ? toSafeNumber(paymentAgg._sum.totalAmount) : 0;

    res.json({
      success: true,
      data: {
        counts: {
          incompleteApplications,
          applicationsTab: applicationsTabCount,
          rejectedApplications,
          pendingDisbursementLoans,
          activeLoans,
          dischargedLoans,
        },
        summary: {
          totalPaid: safeRound(totalPaid, 2),
          totalOutstanding: safeRound(totalOutstanding, 2),
          nextPaymentDue: nextDue ? nextDue.toISOString() : null,
          nextPaymentAmount: nextDueAmount != null ? safeRound(nextDueAmount, 2) : null,
      activeLoanCount: activeLoans,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans
 */
router.get('/loans', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { tab = 'active', page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string, 10) - 1) * parseInt(pageSize as string, 10);
    const take = parseInt(pageSize as string, 10);

    let statusWhere:
      | { in: Array<'ACTIVE' | 'IN_ARREARS' | 'DEFAULTED' | 'PENDING_ATTESTATION' | 'PENDING_DISBURSEMENT' | 'COMPLETED'> }
      | { equals: 'COMPLETED' | 'PENDING_DISBURSEMENT' | 'PENDING_ATTESTATION' };
    switch (tab) {
      case 'active':
        statusWhere = { in: ['ACTIVE', 'IN_ARREARS', 'DEFAULTED'] };
        break;
      case 'discharged':
        statusWhere = { equals: 'COMPLETED' };
        break;
      case 'pending_disbursement':
        statusWhere = { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] };
        break;
      default:
        statusWhere = { in: ['ACTIVE', 'IN_ARREARS', 'DEFAULTED'] };
    }

    const where = {
      tenantId: tenant.id,
      borrowerId,
      ...('in' in statusWhere ? { status: { in: statusWhere.in } } : { status: statusWhere.equals }),
    };

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, loanScheduleType: true } },
          application: { select: { id: true, status: true } },
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              repayments: {
                orderBy: { dueDate: 'asc' },
                select: {
                  status: true,
                  dueDate: true,
                  totalDue: true,
                  lateFeeAccrued: true,
                  lateFeesPaid: true,
                  allocations: { select: { amount: true, allocatedAt: true } },
                },
              },
            },
          },
        },
      }),
      prisma.loan.count({ where }),
    ]);

    const now = new Date();

    const data = loans.map((loan) => {
      const schedule = loan.scheduleVersions[0];
      const repayments = schedule?.repayments || [];
      const totalRepayments = repayments.length;
      const paidCount = repayments.filter((r) => r.status === 'PAID' || r.status === 'CANCELLED').length;
      const readyToComplete =
        totalRepayments > 0 &&
        paidCount === totalRepayments &&
        (loan.status === 'ACTIVE' || loan.status === 'IN_ARREARS');

      let totalDue = 0;
      let totalPaid = 0;
      let overdueCount = 0;
      let totalLateFees = 0;
      let paidOnTime = 0;
      let paidLate = 0;
      let cancelledDue = 0;
      let nextPaymentDue: string | null = null;

      for (const r of repayments) {
        const due = toSafeNumber(r.totalDue);
        const paid = (r.allocations ?? []).reduce((s: number, a: { amount: unknown }) => safeAdd(s, toSafeNumber(a.amount)), 0);
        const lateAccrued = toSafeNumber(r.lateFeeAccrued ?? 0);
        totalDue = safeAdd(totalDue, due);
        totalPaid = safeAdd(totalPaid, paid);
        totalLateFees = safeAdd(totalLateFees, lateAccrued);

        if (r.status === 'PAID') {
          const lastPayAt = getLatestAllocationAt(r.allocations);
          if (lastPayAt && lastPayAt <= new Date(r.dueDate)) {
            paidOnTime++;
          } else {
            paidLate++;
          }
        } else if (r.status === 'CANCELLED') {
          cancelledDue = safeAdd(cancelledDue, due);
        } else {
          if (new Date(r.dueDate) < now) {
            overdueCount++;
          }
          if (!nextPaymentDue) {
            nextPaymentDue = r.dueDate instanceof Date ? r.dueDate.toISOString() : String(r.dueDate);
          }
        }
      }

      if (loan.earlySettlementDate && loan.earlySettlementAmount && cancelledDue > 0) {
        const settlementAmount = toSafeNumber(loan.earlySettlementAmount);
        totalDue = safeSubtract(totalDue, cancelledDue);
        totalDue = safeAdd(totalDue, settlementAmount);
        totalPaid = safeRound(Math.min(totalPaid, totalDue));
      }

      const totalOutstanding = Math.max(0, safeSubtract(totalDue, totalPaid));
      const amountProgressPercent =
        totalDue > 0 ? Math.min(100, safeRound(safeMultiply(safeDivide(totalPaid, totalDue), 100), 1)) : 0;
      const totalScheduled = paidOnTime + paidLate + overdueCount;
      const repaymentRate =
        totalScheduled > 0
          ? safeRound(safeMultiply(safeDivide(paidOnTime, totalScheduled), 100), 1)
          : 0;

      const { scheduleVersions, ...rest } = loan;
      return {
        ...rest,
        progress: {
          paidCount,
          totalRepayments,
          progressPercent: amountProgressPercent,
          readyToComplete,
          totalPaid: safeRound(totalPaid, 2),
          totalDue: safeRound(totalDue, 2),
          totalOutstanding: safeRound(totalOutstanding, 2),
          overdueCount,
          totalLateFees: safeRound(totalLateFees, 2),
          repaymentRate,
          nextPaymentDue,
        },
      };
    });

    res.json({
      success: true,
      data,
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
 * GET /api/borrower-auth/loans/:loanId
 */
router.get('/loans/:loanId', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    await expireStaleAttestationProposalForLoan({
      loanId,
      tenantId: tenant.id,
      borrowerId,
    });

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
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
          },
        },
        product: true,
        application: { select: { id: true, status: true, createdAt: true, updatedAt: true } },
        scheduleVersions: {
          orderBy: { version: 'desc' },
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
                  orderBy: { allocatedAt: 'desc' },
                  include: { transaction: true },
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

    res.json({ success: true, data: loan });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/timeline
 * Borrower-facing activity timeline for the active borrower's loan.
 */
router.get('/loans/:loanId/timeline', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;
    const { cursor, limit: limitStr = '20' } = req.query;
    const parsedLimit = parseInt(limitStr as string, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 20;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
      select: { id: true },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entityType: 'Loan',
        entityId: loanId,
        action: { notIn: ['TRUESEND_EMAIL_SENT', 'TRUESEND_EMAIL_RESENT'] },
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
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
      user: null,
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

/**
 * GET /api/borrower-auth/loans/:loanId/schedule
 * Mirrors schedules/loan/:loanId for borrower-owned loans.
 */
router.get('/loans/:loanId/schedule', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
      include: {
        scheduleVersions: {
          orderBy: { version: 'desc' },
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
                  orderBy: { allocatedAt: 'desc' },
                  include: {
                    transaction: {
                      select: {
                        id: true,
                        receiptNumber: true,
                        receiptPath: true,
                        proofPath: true,
                        proofOriginalName: true,
                        proofMimeType: true,
                        paymentDate: true,
                        totalAmount: true,
                        reference: true,
                      },
                    },
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

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      return res.json({
        success: true,
        data: {
          loan: { id: loan.id, status: loan.status },
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
      summary.totalOutstanding = safeAdd(
        summary.totalOutstanding,
        safeAdd(outstandingPrincipalInterest, outstandingLateFees)
      );

      const status = repayment.status as string;
      if (status === 'PAID') {
        summary.paidCount++;
      } else if (status === 'CANCELLED') {
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
        allVersions: loan.scheduleVersions.map((v) => ({
          id: v.id,
          version: v.version,
          interestModel: v.interestModel,
          createdAt: v.createdAt,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/metrics
 */
router.get('/loans/:loanId/metrics', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
      include: {
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: { include: { allocations: true } },
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
    let cancelledDue = 0;

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
          const lastPaymentDate = getLatestAllocationAt(repayment.allocations);
          if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
            paidOnTime++;
          } else {
            paidLate++;
          }
        } else {
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

    const isEarlySettled = !!loan.earlySettlementDate;
    if (isEarlySettled && loan.earlySettlementAmount && cancelledDue > 0) {
      const settlementAmount = toSafeNumber(loan.earlySettlementAmount);
      totalDue = safeSubtract(totalDue, cancelledDue);
      totalDue = safeAdd(totalDue, settlementAmount);
      totalPaid = safeRound(Math.min(totalPaid, totalDue));
      totalOutstanding = Math.max(0, safeSubtract(totalDue, totalPaid));
    }

    const totalScheduled = paidCount + overdueCount + pendingCount;
    const repaymentRate =
      totalScheduled > 0
        ? safeMultiply(safeDivide(paidOnTime, paidOnTime + paidLate + overdueCount), 100)
        : 0;

    const arrearsPeriod = loan.product.arrearsPeriod;
    const defaultPeriod = loan.product.defaultPeriod;
    const isInArrears = oldestOverdueDays >= arrearsPeriod;
    const isDefaulted = oldestOverdueDays >= defaultPeriod;

    const earlySettlementInfo = isEarlySettled
      ? {
          isEarlySettled: true,
          settlementAmount: loan.earlySettlementAmount ? safeRound(toSafeNumber(loan.earlySettlementAmount), 2) : null,
          discountAmount: loan.earlySettlementDiscount ? safeRound(toSafeNumber(loan.earlySettlementDiscount), 2) : null,
        }
      : null;

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        status: loan.status,
        hasSchedule: true,
        totalDue: safeRound(totalDue, 2),
        totalPaid: safeRound(totalPaid, 2),
        totalOutstanding: safeRound(totalOutstanding, 2),
        totalLateFees: safeRound(totalLateFees, 2),
        paidCount,
        pendingCount,
        overdueCount,
        totalRepayments: currentSchedule.repayments.length,
        repaymentRate: safeRound(repaymentRate, 1),
        paidOnTime,
        paidLate,
        oldestOverdueDays,
        arrearsPeriod,
        defaultPeriod,
        isInArrears,
        isDefaulted,
        progressPercent: Math.min(100, safeRound(safeMultiply(safeDivide(totalPaid, totalDue), 100), 1)),
        earlySettlement: earlySettlementInfo,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/payments
 */
router.get('/loans/:loanId/payments', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const transactions = await prisma.paymentTransaction.findMany({
      where: { loanId, tenantId: tenant.id },
      include: {
        allocations: {
          include: {
            repayment: {
              select: { dueDate: true, totalDue: true },
            },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });

    res.json({ success: true, data: transactions });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/manual-payment-requests
 * Creates a pending manual payment (bank transfer) for admin approval. Optional receipt upload (multipart).
 */
router.post('/loans/:loanId/manual-payment-requests', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    let amount: number;
    let reference: string;
    let receipt: { buffer: Buffer; originalName: string; mimeType: string } | undefined;

    const contentType = String(req.headers['content-type'] || '');
    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipartWithOptionalFile(req);
      amount = parseFloat(parsed.fields.amount || '');
      reference = parsed.fields.reference || '';
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestError('Enter a valid amount');
      }
      if (!reference.trim()) {
        throw new BadRequestError('Payment reference is required');
      }
      if (parsed.file) {
        receipt = parsed.file;
      }
    } else {
      const body = createManualPaymentBodySchema.parse(req.body);
      amount = body.amount;
      reference = body.reference;
    }

    const { id } = await createBorrowerManualPaymentRequest({
      tenantId: tenant.id,
      borrowerId,
      loanId,
      amount,
      reference,
      receipt,
    });

    const row = await prisma.borrowerManualPaymentRequest.findFirst({
      where: { id, tenantId: tenant.id, borrowerId },
    });

    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/manual-payment-requests
 */
router.get('/loans/:loanId/manual-payment-requests', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const rows = await prisma.borrowerManualPaymentRequest.findMany({
      where: { loanId, tenantId: tenant.id, borrowerId },
      orderBy: { createdAt: 'desc' },
      include: {
        paymentTransaction: { select: { id: true, receiptNumber: true, paymentDate: true } },
      },
    });

    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/manual-payment-requests/:requestId/receipt
 * Download optional borrower-uploaded payment slip (not the generated PDF receipt).
 */
const createEarlySettlementRequestSchema = z.object({
  borrowerNote: z.string().max(1000).optional(),
  reference: z.string().max(200).optional(),
});

/**
 * GET /api/borrower-auth/loans/:loanId/early-settlement/quote
 */
router.get('/loans/:loanId/early-settlement/quote', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const out = await getEarlySettlementQuoteForLoan(tenant.id, loanId);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/early-settlement/requests
 */
router.post('/loans/:loanId/early-settlement/requests', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;
    const body = createEarlySettlementRequestSchema.parse(req.body ?? {});

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Early settlement is only available for active or in-arrears loans');
    }

    const pending = await prisma.borrowerEarlySettlementRequest.findFirst({
      where: { loanId, tenantId: tenant.id, status: 'PENDING' },
    });
    if (pending) {
      throw new BadRequestError('You already have a pending early settlement request for this loan');
    }

    const quote = await getEarlySettlementQuoteForLoan(tenant.id, loanId);
    const d = quote.data as {
      eligible?: boolean;
      reason?: string;
      totalSettlement?: number;
      totalWithoutLateFees?: number;
      outstandingLateFees?: number;
      discountAmount?: number;
      remainingPrincipal?: number;
      remainingInterest?: number;
      unpaidInstallments?: number;
    };

    if (!d.eligible) {
      throw new BadRequestError(d.reason || 'Early settlement is not available for this loan');
    }
    if (!d.unpaidInstallments || d.unpaidInstallments < 1) {
      throw new BadRequestError('No unpaid installments to settle');
    }

    const row = await prisma.borrowerEarlySettlementRequest.create({
      data: {
        tenantId: tenant.id,
        loanId,
        borrowerId,
        status: 'PENDING',
        snapshotEligible: true,
        snapshotReason: null,
        snapshotTotalSettlement: new Prisma.Decimal(d.totalSettlement ?? 0),
        snapshotTotalWithoutLateFees: new Prisma.Decimal(d.totalWithoutLateFees ?? 0),
        snapshotOutstandingLateFees: new Prisma.Decimal(d.outstandingLateFees ?? 0),
        snapshotDiscountAmount: new Prisma.Decimal(d.discountAmount ?? 0),
        snapshotRemainingPrincipal: new Prisma.Decimal(d.remainingPrincipal ?? 0),
        snapshotRemainingInterest: new Prisma.Decimal(d.remainingInterest ?? 0),
        snapshotUnpaidInstallments: d.unpaidInstallments,
        borrowerNote: body.borrowerNote?.trim() || null,
        reference: body.reference?.trim() || null,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_EARLY_SETTLEMENT_REQUEST_CREATED',
      entityType: 'Loan',
      entityId: loanId,
      newData: {
        requestId: row.id,
        snapshotTotalSettlement: d.totalSettlement,
      },
    });

    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/early-settlement/requests
 */
router.get('/loans/:loanId/early-settlement/requests', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const rows = await prisma.borrowerEarlySettlementRequest.findMany({
      where: { loanId, tenantId: tenant.id, borrowerId },
      orderBy: { createdAt: 'desc' },
      include: {
        paymentTransaction: { select: { id: true, receiptNumber: true, paymentDate: true } },
      },
    });

    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/loans/:loanId/manual-payment-requests/:requestId/receipt', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId, requestId } = req.params;

    const row = await prisma.borrowerManualPaymentRequest.findFirst({
      where: {
        id: requestId,
        loanId,
        tenantId: tenant.id,
        borrowerId,
      },
    });
    if (!row || !row.receiptPath) {
      throw new NotFoundError('Receipt');
    }

    const fileBuffer = await getFile(row.receiptPath);
    if (!fileBuffer) {
      throw new NotFoundError('Receipt file');
    }

    const name = row.receiptOriginalName || 'receipt';
    res.setHeader('Content-Type', row.receiptMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/payments
 * @deprecated Creates a pending manual payment request (same as manual-payment-requests). Immediate allocation removed.
 */
router.post('/loans/:loanId/payments', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;
    const body = createManualPaymentBodySchema.parse(req.body);

    const { id } = await createBorrowerManualPaymentRequest({
      tenantId: tenant.id,
      borrowerId,
      loanId,
      amount: body.amount,
      reference: body.reference,
    });

    const row = await prisma.borrowerManualPaymentRequest.findFirst({
      where: { id, tenantId: tenant.id, borrowerId },
    });

    res.status(201).json({ success: true, data: row, message: 'Pending lender approval' });
  } catch (e) {
    next(e);
  }
});

const videoCompleteBodySchema = z.object({
  watchedPercent: z.number().min(0).max(100),
});

const proposeSlotBodySchema = z.object({
  startAt: z.string().datetime(),
});

const attestationCancelBodySchema = z.object({
  reason: z.enum(['WITHDRAWN', 'REJECTED_AFTER_ATTESTATION']),
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/video-complete
 * Borrower confirms 100% watch of the attestation video.
 */
router.post('/loans/:loanId/attestation/video-complete', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;
    const body = videoCompleteBodySchema.parse(req.body);

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status)) {
      throw new BadRequestError('Attestation is only available while the loan is pending disbursement');
    }
    if (loan.attestationStatus !== 'NOT_STARTED') {
      throw new BadRequestError('Video attestation has already been started or completed.');
    }
    if (body.watchedPercent !== 100) {
      throw new BadRequestError('You must watch the full video (100%) before continuing.');
    }

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        attestationStatus: 'VIDEO_COMPLETED',
        attestationVideoCompletedAt: new Date(),
        attestationVideoWatchedPercent: 100,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_VIDEO_COMPLETE',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { attestationStatus: loan.attestationStatus },
      newData: { attestationStatus: updated.attestationStatus, watchedPercent: 100 },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/attestation/availability
 * Slots for self-serve booking (30 min grid, 60 min duration).
 */
router.get('/loans/:loanId/attestation/availability', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    await expireStaleAttestationProposalForLoan({
      loanId,
      tenantId: tenant.id,
      borrowerId,
    });

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status) || loan.attestationCompletedAt) {
      throw new BadRequestError('Availability is not available for this loan.');
    }
    if (loan.attestationStatus !== 'MEETING_REQUESTED') {
      throw new BadRequestError('Request a meeting before choosing a slot.');
    }

    const { slots, source } = await listAvailableAttestationSlots({
      tenantId: tenant.id,
      loanId,
    });

    res.json({ success: true, data: { slots, source } });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/propose-slot
 * Firm DB hold; awaits admin acceptance (Meet created on accept only).
 */
router.post('/loans/:loanId/attestation/propose-slot', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;
    const body = proposeSlotBodySchema.parse(req.body);
    const startAt = new Date(body.startAt);

    await expireStaleAttestationProposalForLoan({
      loanId,
      tenantId: tenant.id,
      borrowerId,
    });

    let updated;
    try {
      updated = await proposeBorrowerSlot({
        loanId,
        tenantId: tenant.id,
        borrowerId,
        startAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'MAX_PROPOSALS_REACHED') {
        throw new BadRequestError('You have already used your one-time slot proposal for this loan.');
      }
      if (msg === 'SLOT_NO_LONGER_AVAILABLE') {
        throw new BadRequestError('That slot is no longer available. Choose another time.');
      }
      if (msg === 'INVALID_ATTESTATION_STATE') {
        throw new BadRequestError('You cannot propose a slot in the current step.');
      }
      throw err;
    }

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_SLOT_PROPOSED',
      entityType: 'Loan',
      entityId: loanId,
      newData: { startAt: startAt.toISOString(), status: updated.attestationStatus },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/accept-counter
 * Borrower accepts admin counter-proposal; creates Calendar + Meet.
 */
router.post('/loans/:loanId/attestation/accept-counter', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    let result;
    try {
      result = await borrowerAcceptCounter({ loanId, tenantId: tenant.id, borrowerId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GOOGLE_CALENDAR_NOT_CONFIGURED') {
        throw new BadRequestError('Calendar integration is not configured. Contact your lender.');
      }
      if (msg === 'INVALID_ATTESTATION_STATE') {
        throw new BadRequestError('No counter-proposal to accept.');
      }
      if (msg.startsWith('Google Calendar auth failed') || msg.startsWith('Google Calendar:')) {
        throw new BadRequestError(msg);
      }
      throw err;
    }

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_COUNTER_ACCEPTED',
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
 * POST /api/borrower-auth/loans/:loanId/attestation/decline-counter
 */
router.post('/loans/:loanId/attestation/decline-counter', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    let updated;
    try {
      updated = await borrowerDeclineCounter({ loanId, tenantId: tenant.id, borrowerId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'INVALID_ATTESTATION_STATE') {
        throw new BadRequestError('There is no counter-proposal to decline.');
      }
      throw err;
    }

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_COUNTER_DECLINED',
      entityType: 'Loan',
      entityId: loanId,
      newData: { note: 'COUNTER_DECLINED' },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/cancel-loan
 * Cancel loan before disbursement (withdraw / reject after attestation).
 */
router.post('/loans/:loanId/attestation/cancel-loan', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;
    const body = attestationCancelBodySchema.parse(req.body);
    const userId = req.borrowerUser?.userId;
    if (!userId) {
      throw new BadRequestError('Session error');
    }

    let updated;
    try {
      updated = await cancelLoanFromBorrower({
        loanId,
        tenantId: tenant.id,
        borrowerId,
        userId,
        reason: body.reason,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'INVALID_LOAN_STATUS') {
        throw new BadRequestError('This loan cannot be cancelled.');
      }
      throw err;
    }

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_LOAN_CANCELLED',
      entityType: 'Loan',
      entityId: loanId,
      newData: { reason: body.reason },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/proceed-to-signing
 * After video, borrower completes attestation and may access agreement signing.
 */
router.post('/loans/:loanId/attestation/proceed-to-signing', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status)) {
      throw new BadRequestError('Attestation is only available while the loan is pending disbursement');
    }
    if (loan.attestationStatus !== 'VIDEO_COMPLETED') {
      throw new BadRequestError('Complete the attestation video before proceeding to signing.');
    }
    if (loan.attestationCompletedAt) {
      throw new BadRequestError('Attestation is already complete.');
    }

    const now = new Date();
    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: 'PENDING_DISBURSEMENT',
        attestationStatus: 'COMPLETED',
        attestationCompletedAt: now,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_COMPLETE',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { attestationStatus: loan.attestationStatus, status: loan.status },
      newData: {
        attestationStatus: updated.attestationStatus,
        attestationCompletedAt: now.toISOString(),
        status: 'PENDING_DISBURSEMENT',
      },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/request-meeting
 * Request an online lawyer meeting (Google Meet scheduled separately).
 */
router.post('/loans/:loanId/attestation/request-meeting', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status)) {
      throw new BadRequestError('Attestation is only available while the loan is pending disbursement');
    }
    if (!['NOT_STARTED', 'VIDEO_COMPLETED'].includes(loan.attestationStatus)) {
      if (loan.attestationStatus === 'MEETING_REQUESTED') {
        return res.json({ success: true, data: loan });
      }
      throw new BadRequestError('A meeting cannot be requested at this step.');
    }
    if (loan.attestationCompletedAt) {
      throw new BadRequestError('Attestation is already complete.');
    }

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        attestationStatus: 'MEETING_REQUESTED',
        attestationMeetingRequestedAt: loan.attestationMeetingRequestedAt ?? new Date(),
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_MEETING_REQUESTED',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { attestationStatus: loan.attestationStatus },
      newData: { attestationStatus: updated.attestationStatus },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/restart
 * Borrower backs out of scheduling before proposing a slot: full attestation reset to NOT_STARTED
 * (video progress cleared) so they can choose instant video or meeting again.
 */
router.post('/loans/:loanId/attestation/restart', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!isPreDisbursementLoanStatus(loan.status)) {
      throw new BadRequestError('Attestation restart is only available while the loan is pending disbursement.');
    }
    if (loan.attestationCompletedAt) {
      throw new BadRequestError('Attestation is already complete.');
    }
    if (loan.attestationStatus !== 'MEETING_REQUESTED') {
      throw new BadRequestError(
        'You can only restart from the meeting scheduling step (before a time slot is proposed).'
      );
    }

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: {
        attestationStatus: 'NOT_STARTED',
        attestationVideoCompletedAt: null,
        attestationVideoWatchedPercent: 0,
        attestationMeetingRequestedAt: null,
        attestationProposalStartAt: null,
        attestationProposalEndAt: null,
        attestationProposalDeadlineAt: null,
        attestationProposalSource: null,
        attestationBorrowerProposalCount: 0,
        attestationAssignedMemberId: null,
        attestationMeetingScheduledAt: null,
        attestationMeetingStartAt: null,
        attestationMeetingEndAt: null,
        attestationMeetingLink: null,
        attestationMeetingNotes: null,
        attestationGoogleCalendarEventId: null,
        attestationMeetingReminder24hSentAt: null,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_ATTESTATION_RESTARTED',
      entityType: 'Loan',
      entityId: loanId,
      previousData: { attestationStatus: loan.attestationStatus },
      newData: { attestationStatus: updated.attestationStatus },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/attestation/complete-meeting
 * Borrower cannot self-complete lawyer meetings; lender must confirm on admin side.
 */
router.post('/loans/:loanId/attestation/complete-meeting', async (req, res, next) => {
  try {
    await requireActiveBorrower(req);
    throw new BadRequestError('Your lender will mark the meeting complete after it ends.');
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/generate-agreement
 * Download pre-filled loan agreement PDF (same as admin). Query: agreementDate=YYYY-MM-DD
 */
router.get('/loans/:loanId/generate-agreement', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const existing = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!existing) {
      throw new NotFoundError('Loan');
    }
    if (existing.status !== 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Agreement PDF is only available while the loan is pending disbursement');
    }
    if (!existing.attestationCompletedAt) {
      throw new BadRequestError('Complete loan attestation before downloading the agreement.');
    }

    const agreementDateParam =
      typeof req.query.agreementDate === 'string' ? req.query.agreementDate : undefined;

    const { buffer, filename } = await buildLoanAgreementPdfBuffer({
      tenantId: tenant.id,
      loanId,
      agreementDateParam,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/loans/:loanId/agreement
 * Borrower uploads signed agreement PDF; awaits admin approval before disbursement.
 */
router.post('/loans/:loanId/agreement', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (loan.status !== 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Signed agreement can only be uploaded while the loan is pending disbursement');
    }
    if (!loan.attestationCompletedAt) {
      throw new BadRequestError('Complete loan attestation before uploading the signed agreement.');
    }

    const contentType = String(req.headers['content-type'] || '');
    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;
    let agreementDateInput: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipartWithOptionalFile(req);
      if (!parsed.file) {
        throw new BadRequestError('Upload a signed PDF file');
      }
      buffer = parsed.file.buffer;
      originalName = parsed.file.originalName;
      mimeType = parsed.file.mimeType;
      agreementDateInput = parsed.fields.agreementDate?.trim() || null;
    } else {
      const parsed = await parseFileUpload(req);
      buffer = parsed.buffer;
      originalName = parsed.originalName;
      mimeType = parsed.mimeType;
    }

    if (mimeType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are allowed for loan agreements');
    }

    let nextAgreementDate = loan.agreementDate;
    if (agreementDateInput) {
      const parsedDate = new Date(`${agreementDateInput}T00:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestError('Enter a valid agreement date');
      }
      nextAgreementDate = parsedDate;
    }
    if (!nextAgreementDate) {
      throw new BadRequestError('Set the agreement date before uploading the signed agreement');
    }

    if (loan.agreementPath) {
      try {
        await deleteAgreementFile(loan.agreementPath);
      } catch (err) {
        console.error('Failed to delete old agreement file:', err);
      }
    }

    const { path: agreementPath, filename } = await saveAgreementFile(buffer, loanId, originalName);
    const newVersion = loan.agreementVersion + 1;

    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        agreementPath,
        agreementFilename: filename,
        agreementOriginalName: originalName,
        agreementMimeType: mimeType,
        agreementSize: buffer.length,
        agreementUploadedAt: new Date(),
        agreementDate: nextAgreementDate,
        agreementVersion: newVersion,
        signedAgreementReviewStatus: 'PENDING',
        signedAgreementReviewedAt: null,
        signedAgreementReviewerMemberId: null,
        signedAgreementReviewNotes: null,
      },
    });

    await AuditService.log({
      tenantId: tenant.id,
      action: 'BORROWER_UPLOAD_AGREEMENT',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.agreementPath
        ? {
            version: loan.agreementVersion,
            path: loan.agreementPath,
            filename: loan.agreementOriginalName,
          }
        : null,
      newData: {
        version: newVersion,
        path: agreementPath,
        filename: originalName,
        agreementDate: nextAgreementDate.toISOString(),
        signedAgreementReviewStatus: 'PENDING',
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
        agreementDate: updatedLoan.agreementDate,
        signedAgreementReviewStatus: updatedLoan.signedAgreementReviewStatus,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/agreement
 * View uploaded signed agreement PDF.
 */
router.get('/loans/:loanId/agreement', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!loan.agreementPath || !loan.agreementOriginalName) {
      throw new NotFoundError('Loan agreement');
    }

    const localPath = getLocalPath(loan.agreementPath);
    if (localPath && fs.existsSync(localPath)) {
      res.setHeader('Content-Type', loan.agreementMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.agreementOriginalName}"`);
      fs.createReadStream(localPath).pipe(res);
      return;
    }

    const fileBuffer = await getAgreementFile(loan.agreementPath);
    if (!fileBuffer) {
      throw new NotFoundError('Loan agreement file');
    }
    res.setHeader('Content-Type', loan.agreementMimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${loan.agreementOriginalName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/disbursement-proof
 */
router.get('/loans/:loanId/disbursement-proof', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
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
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/loans/:loanId/stamp-certificate
 */
router.get('/loans/:loanId/stamp-certificate', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId: tenant.id, borrowerId },
    });
    if (!loan) {
      throw new NotFoundError('Loan');
    }
    if (!loan.stampCertPath || !loan.stampCertOriginalName) {
      throw new NotFoundError('Stamp certificate');
    }

    const fileBuffer = await getFile(loan.stampCertPath);
    if (!fileBuffer) {
      throw new NotFoundError('Stamp certificate file');
    }
    res.setHeader('Content-Type', loan.stampCertMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${loan.stampCertOriginalName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/schedules/transactions/:transactionId/receipt
 */
router.get('/schedules/transactions/:transactionId/receipt', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { transactionId } = req.params;

    const transaction = await prisma.paymentTransaction.findFirst({
      where: { id: transactionId, tenantId: tenant.id },
      include: { loan: { select: { borrowerId: true } } },
    });
    if (!transaction || transaction.loan.borrowerId !== borrowerId) {
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
    res.setHeader('Content-Disposition', `inline; filename="${transaction.receiptNumber || 'receipt'}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/borrower-auth/schedules/transactions/:transactionId/proof
 */
router.get('/schedules/transactions/:transactionId/proof', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { transactionId } = req.params;

    const transaction = await prisma.paymentTransaction.findFirst({
      where: { id: transactionId, tenantId: tenant.id },
      include: { loan: { select: { borrowerId: true } } },
    });
    if (!transaction || transaction.loan.borrowerId !== borrowerId) {
      throw new NotFoundError('Payment transaction');
    }
    if (!transaction.proofPath) {
      throw new NotFoundError('Proof of payment');
    }
    const fileBuffer = await getFile(transaction.proofPath);
    if (!fileBuffer) {
      throw new NotFoundError('Proof of payment file');
    }
    res.setHeader('Content-Type', transaction.proofMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${transaction.proofOriginalName || 'proof'}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (e) {
    next(e);
  }
});

export default router;
