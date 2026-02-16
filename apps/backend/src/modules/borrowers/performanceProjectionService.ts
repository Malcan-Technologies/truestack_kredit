import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AddOnService } from '../../lib/addOnService.js';
import { calculateDaysOverdueMalaysia } from '../../lib/malaysiaTime.js';
import { safeAdd, safeDivide, safeMultiply, safeRound, safeSubtract, toSafeNumber } from '../../lib/math.js';

type BorrowerRiskLevel = 'NO_HISTORY' | 'GOOD' | 'WATCH' | 'HIGH_RISK' | 'DEFAULTED';

const WATCH_ON_TIME_THRESHOLD = 70;

type RecalculateOptions = {
  skipAccessCheck?: boolean;
};

type LoanSnapshot = {
  id: string;
  status: string;
  readyForDefault: boolean;
  repaymentRate: Prisma.Decimal | null;
  scheduleVersions: Array<{
    repayments: Array<{
      dueDate: Date;
      totalDue: Prisma.Decimal;
      status: string;
      allocations: Array<{
        amount: Prisma.Decimal;
        allocatedAt: Date;
      }>;
    }>;
  }>;
};

type LoanPerformanceMetrics = {
  paidOnTime: number;
  paidLate: number;
  overdueCount: number;
  repaymentRate: number | null;
};

function calculateLoanPerformance(loan: LoanSnapshot, now: Date): LoanPerformanceMetrics {
  const currentSchedule = loan.scheduleVersions[0];
  if (!currentSchedule) {
    return {
      paidOnTime: 0,
      paidLate: 0,
      overdueCount: 0,
      repaymentRate: null,
    };
  }

  let paidOnTime = 0;
  let paidLate = 0;
  let overdueCount = 0;

  for (const repayment of currentSchedule.repayments) {
    const totalDue = toSafeNumber(repayment.totalDue);
    const paidAmount = repayment.allocations.reduce((sum, alloc) => safeAdd(sum, toSafeNumber(alloc.amount)), 0);
    const remaining = Math.max(0, safeSubtract(totalDue, paidAmount));

    if (repayment.status === 'PAID') {
      const lastPaymentDate = repayment.allocations.length > 0
        ? repayment.allocations[repayment.allocations.length - 1].allocatedAt
        : null;
      if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
        paidOnTime++;
      } else {
        paidLate++;
      }
      continue;
    }

    // CANCELLED repayments (early settlement) are excluded from repayment performance.
    if (repayment.status !== 'CANCELLED' && calculateDaysOverdueMalaysia(repayment.dueDate, now) > 0 && remaining > 0) {
      overdueCount++;
    }
  }

  const denominator = paidOnTime + paidLate + overdueCount;
  const repaymentRate = denominator > 0
    ? safeRound(safeMultiply(safeDivide(paidOnTime, denominator, 8), 100, 8), 2)
    : null;

  return {
    paidOnTime,
    paidLate,
    overdueCount,
    repaymentRate,
  };
}

function determineRiskLevel(params: {
  totalLoans: number;
  pendingDisbursementLoans: number;
  inArrearsLoans: number;
  defaultedLoans: number;
  writtenOffLoans: number;
  readyForDefaultLoans: number;
  onTimeRate: number | null;
}): BorrowerRiskLevel {
  const {
    totalLoans,
    pendingDisbursementLoans,
    inArrearsLoans,
    defaultedLoans,
    writtenOffLoans,
    readyForDefaultLoans,
    onTimeRate,
  } = params;

  if (defaultedLoans > 0 || writtenOffLoans > 0) {
    return 'DEFAULTED';
  }

  if (inArrearsLoans > 0 || readyForDefaultLoans > 0) {
    return 'HIGH_RISK';
  }

  const disbursedLoans = Math.max(0, totalLoans - pendingDisbursementLoans);
  if (disbursedLoans === 0 || onTimeRate === null) {
    return 'NO_HISTORY';
  }

  if (onTimeRate < WATCH_ON_TIME_THRESHOLD) {
    return 'WATCH';
  }

  return 'GOOD';
}

function buildProjectionTags(params: {
  riskLevel: BorrowerRiskLevel;
  inArrearsLoans: number;
  defaultedLoans: number;
  writtenOffLoans: number;
  readyForDefaultLoans: number;
  overdueCount: number;
  onTimeRate: number | null;
}): string[] {
  const tags: string[] = [];

  if (params.defaultedLoans > 0) tags.push('Defaulted');
  if (params.writtenOffLoans > 0) tags.push('Written Off');
  if (params.inArrearsLoans > 0) tags.push('In Arrears');
  if (params.readyForDefaultLoans > 0) tags.push('Default Ready');
  if (params.overdueCount > 0 && params.inArrearsLoans === 0 && params.defaultedLoans === 0 && params.writtenOffLoans === 0) {
    tags.push('Overdue Repayments');
  }

  if (params.onTimeRate !== null) {
    if (params.onTimeRate >= 90) tags.push('Strong Payer');
    if (params.onTimeRate < WATCH_ON_TIME_THRESHOLD) tags.push('Needs Attention');
  }

  if (tags.length === 0) {
    if (params.riskLevel === 'GOOD') tags.push('Healthy');
    if (params.riskLevel === 'NO_HISTORY') tags.push('No Track Record');
  }

  return tags.slice(0, 4);
}

export async function recalculateBorrowerPerformanceProjection(
  tenantId: string,
  borrowerId: string,
  options: RecalculateOptions = {}
): Promise<void> {
  if (!options.skipAccessCheck) {
    const enabled = await AddOnService.hasActiveAddOn(tenantId, 'BORROWER_PERFORMANCE');
    if (!enabled) return;
  }

  const borrower = await prisma.borrower.findFirst({
    where: {
      id: borrowerId,
      tenantId,
    },
    select: {
      id: true,
      loans: {
        select: {
          id: true,
          status: true,
          readyForDefault: true,
          repaymentRate: true,
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              repayments: {
                select: {
                  dueDate: true,
                  totalDue: true,
                  status: true,
                  allocations: {
                    orderBy: { allocatedAt: 'asc' },
                    select: {
                      amount: true,
                      allocatedAt: true,
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

  if (!borrower) return;

  const now = new Date();
  let paidOnTimeCount = 0;
  let paidLateCount = 0;
  let overdueCount = 0;

  let pendingDisbursementLoans = 0;
  let activeLoans = 0;
  let inArrearsLoans = 0;
  let defaultedLoans = 0;
  let completedLoans = 0;
  let writtenOffLoans = 0;
  let readyForDefaultLoans = 0;

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const loan of borrower.loans) {
    if (loan.readyForDefault) {
      readyForDefaultLoans++;
    }

    switch (loan.status) {
      case 'PENDING_DISBURSEMENT':
        pendingDisbursementLoans++;
        break;
      case 'ACTIVE':
        activeLoans++;
        break;
      case 'IN_ARREARS':
        inArrearsLoans++;
        break;
      case 'DEFAULTED':
        defaultedLoans++;
        break;
      case 'COMPLETED':
        completedLoans++;
        break;
      case 'WRITTEN_OFF':
        writtenOffLoans++;
        break;
      default:
        break;
    }

    const metrics = calculateLoanPerformance(loan, now);
    paidOnTimeCount += metrics.paidOnTime;
    paidLateCount += metrics.paidLate;
    overdueCount += metrics.overdueCount;

    if (metrics.repaymentRate !== null) {
      const currentRepaymentRate = loan.repaymentRate === null ? null : toSafeNumber(loan.repaymentRate);
      if (currentRepaymentRate === null || Math.abs(currentRepaymentRate - metrics.repaymentRate) >= 0.01) {
        operations.push(
          prisma.loan.update({
            where: { id: loan.id },
            data: { repaymentRate: metrics.repaymentRate },
          })
        );
      }
    }
  }

  const onTimeDenominator = paidOnTimeCount + paidLateCount + overdueCount;
  const onTimeRate = onTimeDenominator > 0
    ? safeRound(safeMultiply(safeDivide(paidOnTimeCount, onTimeDenominator, 8), 100, 8), 2)
    : null;

  const riskLevel = determineRiskLevel({
    totalLoans: borrower.loans.length,
    pendingDisbursementLoans,
    inArrearsLoans,
    defaultedLoans,
    writtenOffLoans,
    readyForDefaultLoans,
    onTimeRate,
  });

  const tags = buildProjectionTags({
    riskLevel,
    inArrearsLoans,
    defaultedLoans,
    writtenOffLoans,
    readyForDefaultLoans,
    overdueCount,
    onTimeRate,
  });

  operations.push(
    prisma.borrowerPerformanceProjection.upsert({
      where: { borrowerId: borrower.id },
      update: {
        riskLevel,
        onTimeRate,
        tags,
        totalLoans: borrower.loans.length,
        activeLoans,
        inArrearsLoans,
        defaultedLoans,
        completedLoans,
        writtenOffLoans,
        pendingDisbursementLoans,
        readyForDefaultLoans,
        paidOnTimeCount,
        paidLateCount,
        overdueCount,
      },
      create: {
        tenantId,
        borrowerId: borrower.id,
        riskLevel,
        onTimeRate,
        tags,
        totalLoans: borrower.loans.length,
        activeLoans,
        inArrearsLoans,
        defaultedLoans,
        completedLoans,
        writtenOffLoans,
        pendingDisbursementLoans,
        readyForDefaultLoans,
        paidOnTimeCount,
        paidLateCount,
        overdueCount,
      },
    })
  );

  await prisma.$transaction(operations);
}

export async function ensureBorrowerPerformanceProjections(
  tenantId: string,
  borrowerIds: string[]
): Promise<void> {
  if (borrowerIds.length === 0) return;

  const enabled = await AddOnService.hasActiveAddOn(tenantId, 'BORROWER_PERFORMANCE');
  if (!enabled) return;

  const uniqueBorrowerIds = [...new Set(borrowerIds)];
  for (const borrowerId of uniqueBorrowerIds) {
    await recalculateBorrowerPerformanceProjection(tenantId, borrowerId, { skipAccessCheck: true });
  }
}
