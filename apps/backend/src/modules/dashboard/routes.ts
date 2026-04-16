import { Router, type Request } from 'express';
import type { TenantPermission } from '@kredit/shared';
import { prisma } from '../../lib/prisma.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { requirePermission } from '../../middleware/requireRole.js';
import { safeRound, safeAdd, safeSubtract, safeMultiply, safeDivide, safePercentage, toSafeNumber } from '../../lib/math.js';
import { calculateDaysOverdueMalaysia, getMalaysiaEndOfDay } from '../../lib/malaysiaTime.js';

const router = Router();

function userHasPermission(req: Request, permission: TenantPermission): boolean {
  if (req.user?.role === 'OWNER' || req.user?.role === 'SUPER_ADMIN') return true;
  return (req.user?.permissions ?? []).includes(permission);
}

// All dashboard routes require authentication + active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);
router.use(requirePermission('dashboard.view'));

/**
 * GET /api/dashboard/stats
 * 
 * Aggregated dashboard statistics with optional date range filtering.
 * Query params:
 *   - from: ISO date string (YYYY-MM-DD) - start of range
 *   - to:   ISO date string (YYYY-MM-DD) - end of range
 * 
 * Defaults to last 12 months if no range provided.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const now = new Date();
    const presetAll = req.query.preset === 'all';

    // Parse date range (defaults to last 12 months)
    let fromDate: Date;
    let toDate: Date;

    if (req.query.to && typeof req.query.to === 'string') {
      toDate = new Date(req.query.to);
      if (isNaN(toDate.getTime())) {
        toDate = now;
      } else {
        toDate.setHours(23, 59, 59, 999);
      }
    } else {
      toDate = now;
    }

    // ========================================
    // 1. KPI Cards - Run all count/aggregate queries in parallel
    // When preset=all, also fetch tenant createdAt to derive fromDate
    // ========================================
    const [
      totalBorrowers,
      activeBorrowersResult,
      loanStatusCounts,
      pendingApplications,
      loansPendingDisbursement,
      loansReadyForDefault,
      pendingL2ApprovalTotal,
      tenantForAll,
    ] = await Promise.all([
      prisma.borrower.count({ where: { tenantId } }),
      prisma.borrower.findMany({
        where: {
          tenantId,
          loans: { some: { status: { in: ['ACTIVE', 'IN_ARREARS'] } } },
        },
        select: { id: true },
      }),
      prisma.loan.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.loanApplication.count({
        where: {
          tenantId,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
      }),
      prisma.loan.count({
        where: { tenantId, status: 'PENDING_DISBURSEMENT' },
      }),
      prisma.loan.count({
        where: { tenantId, readyForDefault: true, status: { not: 'DEFAULTED' } },
      }),
      prisma.loanApplication.count({
        where: { tenantId, status: 'PENDING_L2_APPROVAL' },
      }),
      presetAll
        ? prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    // Set fromDate: use tenant start (start of month) when preset=all, else from query
    if (presetAll && tenantForAll?.createdAt) {
      const created = new Date(tenantForAll.createdAt);
      fromDate = new Date(created.getFullYear(), created.getMonth(), 1);
    } else if (req.query.from && typeof req.query.from === 'string') {
      fromDate = new Date(req.query.from);
      if (isNaN(fromDate.getTime())) {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      }
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    }

    const activeBorrowers = activeBorrowersResult.length;

    const statusCountMap: Record<string, number> = {};
    let totalLoans = 0;
    for (const row of loanStatusCounts) {
      statusCountMap[row.status] = row._count.id;
      totalLoans += row._count.id;
    }

    const activeLoans = (statusCountMap['ACTIVE'] || 0) + (statusCountMap['IN_ARREARS'] || 0);
    const loansInArrears = statusCountMap['IN_ARREARS'] || 0;

    // Financial aggregates - loans in range (for disbursed, overdue, PAR) + all loans (for outstanding)
    const [loansInRange, loansForOutstanding, allocationSums, paymentsInRange] = await Promise.all([
      prisma.loan.findMany({
        where: {
          tenantId,
          status: { in: ['ACTIVE', 'IN_ARREARS', 'COMPLETED', 'DEFAULTED', 'WRITTEN_OFF'] },
          disbursementDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
        include: {
          product: {
            select: {
              legalFeeType: true,
              legalFeeValue: true,
              stampingFeeType: true,
              stampingFeeValue: true,
            },
          },
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              repayments: true,
            },
          },
        },
      }),
      prisma.loan.findMany({
        where: {
          tenantId,
          status: { in: ['ACTIVE', 'IN_ARREARS', 'COMPLETED', 'DEFAULTED', 'WRITTEN_OFF'] },
        },
        include: {
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { repayments: true },
          },
        },
      }),
      prisma.paymentAllocation.groupBy({
        by: ['repaymentId'],
        _sum: { amount: true },
        where: {
          repayment: {
            scheduleVersion: {
              loan: { tenantId },
            },
          },
        },
      }),
      prisma.paymentTransaction.findMany({
        where: {
          tenantId,
          paymentDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
        select: { id: true, paymentDate: true, totalAmount: true },
      }),
    ]);
    const paidByRepaymentId = new Map<string, number>();
    for (const row of allocationSums) {
      paidByRepaymentId.set(row.repaymentId, toSafeNumber(row._sum.amount));
    }

    let totalDisbursed = 0;
    let totalNetDisbursed = 0;
    let totalOutstanding = 0;
    let totalDisbursedAllTime = 0;
    let totalCollected = 0;
    let totalEarned = 0; // Collected interest + fees only
    let overdueAmount = 0;
    let totalLateFees = 0;
    let totalLateFeesPaid = 0;

    // PAR calculation: outstanding balance of loans with payments X+ days overdue (for loans in range)
    let par30Outstanding = 0;
    let par60Outstanding = 0;
    let par90Outstanding = 0;
    let totalActiveOutstanding = 0; // denominator for PAR

    // Total collected = sum of payments received in date range
    for (const payment of paymentsInRange) {
      totalCollected = safeAdd(totalCollected, Number(payment.totalAmount));
    }

    for (const loan of loansInRange) {
      // Disbursed = principal of disbursed loans (have disbursementDate)
      if (loan.disbursementDate) {
        const principal = Number(loan.principalAmount);
        totalDisbursed = safeAdd(totalDisbursed, principal);

        // Calculate net disbursement (principal minus fees)
        const legalFeeVal = toSafeNumber(loan.product.legalFeeValue);
        const stampingFeeVal = toSafeNumber(loan.product.stampingFeeValue);
        const legalFee = loan.product.legalFeeType === 'PERCENTAGE'
          ? safeMultiply(principal, safeDivide(legalFeeVal, 100))
          : legalFeeVal;
        const stampingFee = loan.product.stampingFeeType === 'PERCENTAGE'
          ? safeMultiply(principal, safeDivide(stampingFeeVal, 100))
          : stampingFeeVal;
        const netAmount = safeSubtract(principal, legalFee, stampingFee);
        totalNetDisbursed = safeAdd(totalNetDisbursed, netAmount);
      }

      totalLateFees = safeAdd(totalLateFees, Number(loan.totalLateFees));

      const schedule = loan.scheduleVersions[0];
      if (schedule) {
        for (const rep of schedule.repayments) {
          totalLateFeesPaid = safeAdd(totalLateFeesPaid, Number(rep.lateFeesPaid));
        }
      }
      if (!schedule) continue;

      let loanOutstanding = 0;
      let maxDaysOverdue = 0;

      for (const rep of schedule.repayments) {
        if (rep.status === 'CANCELLED') continue;

        const due = Number(rep.totalDue);
        const paid = paidByRepaymentId.get(rep.id) ?? 0;

        if (rep.status !== 'PAID') {
          const remaining = safeSubtract(due, paid);
          loanOutstanding = safeAdd(loanOutstanding, remaining);

          // Check if overdue
          const daysOverdue = calculateDaysOverdueMalaysia(rep.dueDate, now);
          if (daysOverdue > 0 && remaining > 0) {
            overdueAmount = safeAdd(overdueAmount, remaining);
            maxDaysOverdue = Math.max(maxDaysOverdue, daysOverdue);
          }
        }
      }

      // PAR: if loan is active/in_arrears (and in range), use its outstanding for the calculation
      if (['ACTIVE', 'IN_ARREARS'].includes(loan.status)) {
        totalActiveOutstanding = safeAdd(totalActiveOutstanding, loanOutstanding);
        if (maxDaysOverdue >= 30) par30Outstanding = safeAdd(par30Outstanding, loanOutstanding);
        if (maxDaysOverdue >= 60) par60Outstanding = safeAdd(par60Outstanding, loanOutstanding);
        if (maxDaysOverdue >= 90) par90Outstanding = safeAdd(par90Outstanding, loanOutstanding);
      }
    }

    // Outstanding: all-time (from all loans, not filtered by disbursement date)
    for (const loan of loansForOutstanding) {
      if (loan.disbursementDate) {
        totalDisbursedAllTime = safeAdd(totalDisbursedAllTime, Number(loan.principalAmount));
      }
      const schedule = loan.scheduleVersions[0];
      if (!schedule) continue;
      let loanOutstanding = 0;
      for (const rep of schedule.repayments) {
        if (rep.status === 'CANCELLED') continue;
        const due = Number(rep.totalDue);
        const paid = paidByRepaymentId.get(rep.id) ?? 0;
        if (rep.status !== 'PAID') {
          loanOutstanding = safeAdd(loanOutstanding, safeSubtract(due, paid));
        }
      }
      totalOutstanding = safeAdd(totalOutstanding, loanOutstanding);
    }

    // Collection rate + chart data: run collection-rate queries and chart-data queries in parallel
    // Use Malaysia time for "today" so production servers in UTC don't misclassify due dates
    const todayEnd = getMalaysiaEndOfDay(now);
    const [
      repaymentsDueInRange,
      repaymentsDue,
      applicationStatusCounts,
      loansByProductRaw,
      recentLoansRaw,
      recentApplicationsRaw,
      loansReadyToCompleteRaw,
      allocationsInPeriod,
    ] = await Promise.all([
      prisma.loanRepayment.findMany({
        where: {
          status: { not: 'CANCELLED' },
          scheduleVersion: {
            loan: { tenantId },
          },
          OR: [
            // Repayments due in period (due date has passed or is today)
            { dueDate: { gte: fromDate, lte: todayEnd } },
            // Prepaid repayments: include future-due repayments that are already paid
            { status: 'PAID', dueDate: { gte: fromDate } },
          ],
        },
        select: { id: true, totalDue: true },
      }),
      prisma.loanRepayment.findMany({
        where: {
          dueDate: { gte: fromDate, lte: toDate },
          status: { not: 'CANCELLED' },
          scheduleVersion: { loan: { tenantId } },
        },
        select: { dueDate: true, totalDue: true },
      }),
      prisma.loanApplication.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.loan.groupBy({
        by: ['productId', 'status'],
        where: { tenantId },
        _count: { id: true },
        _sum: { principalAmount: true },
      }),
      prisma.loan.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { borrower: { select: { name: true } } },
      }),
      prisma.loanApplication.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { borrower: { select: { name: true } } },
      }),
      prisma.loan.findMany({
        where: {
          tenantId,
          status: { in: ['ACTIVE', 'IN_ARREARS'] },
        },
        select: {
          id: true,
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { repayments: { select: { status: true } } },
          },
        },
      }),
      prisma.paymentAllocation.findMany({
        where: {
          repayment: { scheduleVersion: { loan: { tenantId } } },
          allocatedAt: { gte: fromDate, lte: toDate },
        },
        include: {
          repayment: { select: { principal: true, interest: true } },
          transaction: { select: { paymentType: true } },
        },
        orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const repaymentIdsInPeriod = [...new Set(allocationsInPeriod.map((alloc) => alloc.repaymentId))];
    const paidBeforePeriodRows = repaymentIdsInPeriod.length > 0
      ? await prisma.paymentAllocation.groupBy({
          by: ['repaymentId'],
          _sum: { amount: true },
          where: {
            repaymentId: { in: repaymentIdsInPeriod },
            allocatedAt: { lt: fromDate },
          },
        })
      : [];
    const paidThroughByRepaymentId = new Map<string, number>();
    for (const row of paidBeforePeriodRows) {
      paidThroughByRepaymentId.set(row.repaymentId, toSafeNumber(row._sum.amount));
    }

    // Total earned = collected interest + fees (late fees from allocations + disbursement fees).
    // For normal payments, interest attribution must follow repayment allocation order:
    // late fee -> interest -> principal.
    // Early settlement allocations are distributed proportionally by design.
    let totalEarnedInterest = 0;
    let totalEarnedFees = 0;
    for (const alloc of allocationsInPeriod) {
      const lateFee = toSafeNumber(alloc.lateFee);
      const allocationAmount = toSafeNumber(alloc.amount);
      const interestDue = toSafeNumber(alloc.repayment.interest);
      const paidBeforeAllocation = paidThroughByRepaymentId.get(alloc.repaymentId) ?? 0;

      let interestPortion = 0;
      if (alloc.transaction?.paymentType === 'EARLY_SETTLEMENT') {
        const principalDue = toSafeNumber(alloc.repayment.principal);
        const principalPlusInterest = safeAdd(principalDue, interestDue);
        interestPortion = principalPlusInterest > 0
          ? safeMultiply(allocationAmount, safeDivide(interestDue, principalPlusInterest), 8)
          : 0;
      } else {
        const interestAlreadyCovered = Math.min(interestDue, paidBeforeAllocation);
        const interestRemaining = Math.max(0, safeSubtract(interestDue, interestAlreadyCovered));
        interestPortion = Math.min(allocationAmount, interestRemaining);
      }

      paidThroughByRepaymentId.set(
        alloc.repaymentId,
        safeAdd(paidBeforeAllocation, allocationAmount)
      );

      totalEarnedInterest = safeAdd(totalEarnedInterest, interestPortion);
      totalEarnedFees = safeAdd(totalEarnedFees, lateFee);
      totalEarned = safeAdd(totalEarned, lateFee, interestPortion);
    }
    // Add disbursement fees (legal + stamping) - same as Total Disbursed "Collected Fees"
    const disbursementFees = safeSubtract(totalDisbursed, totalNetDisbursed);
    totalEarnedFees = safeAdd(totalEarnedFees, disbursementFees);
    totalEarned = safeAdd(totalEarned, disbursementFees);

    const allocationSumsForDueRepayments = repaymentsDueInRange.length > 0
      ? await prisma.paymentAllocation.groupBy({
          by: ['repaymentId'],
          _sum: { amount: true },
          where: {
            repaymentId: { in: repaymentsDueInRange.map((r) => r.id) },
          },
        })
      : [];
    const paidForDueRepayment = new Map<string, number>();
    for (const row of allocationSumsForDueRepayments) {
      paidForDueRepayment.set(row.repaymentId, toSafeNumber(row._sum.amount));
    }
    let totalDueInPeriod = 0;
    let totalCollectedForDuePeriod = 0;
    for (const rep of repaymentsDueInRange) {
      totalDueInPeriod = safeAdd(totalDueInPeriod, Number(rep.totalDue));
      totalCollectedForDuePeriod = safeAdd(totalCollectedForDuePeriod, paidForDueRepayment.get(rep.id) ?? 0);
    }
    const collectionRate = safePercentage(totalCollectedForDuePeriod, totalDueInPeriod, 2);

    // Active loans and loans in arrears for date range (for KPI card subtitles)
    const activeLoansInRange = loansInRange.filter((l) => ['ACTIVE', 'IN_ARREARS'].includes(l.status)).length;
    const loansInArrearsInRange = loansInRange.filter((l) => l.status === 'IN_ARREARS').length;

    const defaultedCount = (statusCountMap['DEFAULTED'] || 0) + (statusCountMap['WRITTEN_OFF'] || 0);
    const defaultRate = safePercentage(defaultedCount, totalLoans, 2);

    const portfolioAtRisk = {
      par30: safePercentage(par30Outstanding, totalActiveOutstanding, 2),
      par60: safePercentage(par60Outstanding, totalActiveOutstanding, 2),
      par90: safePercentage(par90Outstanding, totalActiveOutstanding, 2),
      defaultRate,
    };

    const loansReadyToComplete = loansReadyToCompleteRaw.filter((loan) => {
      const schedule = loan.scheduleVersions[0];
      if (!schedule || schedule.repayments.length === 0) return false;
      return schedule.repayments.every((r) => r.status === 'PAID' || r.status === 'CANCELLED');
    }).length;

    // ========================================
    // 2. Loan status distribution (for pie chart)
    // ========================================
    const loansByStatus = loanStatusCounts.map((row) => ({
      status: row.status,
      count: row._count.id,
    }));

    // Group disbursement by month (use loansInRange - already fetched)
    const disbursementMap = new Map<string, { amount: number; count: number }>();
    for (const loan of loansInRange) {
      if (!loan.disbursementDate) continue;
      const monthKey = `${loan.disbursementDate.getFullYear()}-${String(loan.disbursementDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = disbursementMap.get(monthKey) || { amount: 0, count: 0 };
      existing.amount = safeAdd(existing.amount, Number(loan.principalAmount));
      existing.count += 1;
      disbursementMap.set(monthKey, existing);
    }

    // Group collection by month (use paymentsInRange - already fetched)
    const collectionMap = new Map<string, number>();
    for (const payment of paymentsInRange) {
      const monthKey = `${payment.paymentDate.getFullYear()}-${String(payment.paymentDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = collectionMap.get(monthKey) || 0;
      collectionMap.set(monthKey, safeAdd(existing, Number(payment.totalAmount)));
    }

    // Group due amounts by month
    const dueMap = new Map<string, number>();
    for (const rep of repaymentsDue) {
      const monthKey = `${rep.dueDate.getFullYear()}-${String(rep.dueDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = dueMap.get(monthKey) || 0;
      dueMap.set(monthKey, safeAdd(existing, Number(rep.totalDue)));
    }

    // Build month range array
    const months: string[] = [];
    const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    while (cursor <= toDate) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const disbursementTrend = months.map((month) => ({
      month,
      amount: disbursementMap.get(month)?.amount || 0,
      count: disbursementMap.get(month)?.count || 0,
    }));

    const collectionTrend = months.map((month) => ({
      month,
      collected: collectionMap.get(month) || 0,
      due: dueMap.get(month) || 0,
    }));

    const applicationsByStatus = applicationStatusCounts.map((row) => ({
      status: row.status,
      count: row._count.id,
    }));

    // Fetch product names
    const productIds = [...new Set(loansByProductRaw.map((r) => r.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: { id: true, name: true },
    });
    const productNameMap = new Map(products.map((p) => [p.id, p.name]));

    // Aggregate by product
    const productAggMap = new Map<string, { productName: string; totalLoans: number; activeLoans: number; completedLoans: number; defaultedLoans: number; totalDisbursed: number }>();
    for (const row of loansByProductRaw) {
      const productName = productNameMap.get(row.productId) || 'Unknown';
      const existing = productAggMap.get(row.productId) || {
        productName,
        totalLoans: 0,
        activeLoans: 0,
        completedLoans: 0,
        defaultedLoans: 0,
        totalDisbursed: 0,
      };
      existing.totalLoans += row._count.id;
      existing.totalDisbursed = safeAdd(existing.totalDisbursed, toSafeNumber(row._sum.principalAmount));
      if (row.status === 'ACTIVE' || row.status === 'IN_ARREARS') {
        existing.activeLoans += row._count.id;
      } else if (row.status === 'COMPLETED') {
        existing.completedLoans += row._count.id;
      } else if (row.status === 'DEFAULTED' || row.status === 'WRITTEN_OFF') {
        existing.defaultedLoans += row._count.id;
      }
      productAggMap.set(row.productId, existing);
    }

    const loansByProduct = [...productAggMap.values()].sort((a, b) => b.totalLoans - a.totalLoans);

    const recentLoans = recentLoansRaw.map((loan) => ({
      id: loan.id,
      borrowerName: loan.borrower.name,
      amount: Number(loan.principalAmount),
      status: loan.status,
      date: loan.disbursementDate?.toISOString() || loan.createdAt.toISOString(),
    }));

    const recentApplications = recentApplicationsRaw.map((app) => ({
      id: app.id,
      borrowerName: app.borrower.name,
      amount: Number(app.amount),
      status: app.status,
      date: app.createdAt.toISOString(),
    }));

    // ========================================
    // Build response
    // ========================================
    const canL1Apps = userHasPermission(req, 'applications.approve_l1');
    const canL2Apps = userHasPermission(req, 'applications.approve_l2');
    const canDisburseOrManageLoans =
      userHasPermission(req, 'loans.disburse') || userHasPermission(req, 'loans.manage');
    const canManageLoans = userHasPermission(req, 'loans.manage');
    const canManageCollections = userHasPermission(req, 'collections.manage');

    const pendingApplicationsKpi = pendingApplications + pendingL2ApprovalTotal;

    res.json({
      success: true,
      data: {
        kpiCards: {
          totalBorrowers,
          activeBorrowers,
          totalLoans,
          activeLoans,
          totalDisbursed: safeRound(totalDisbursed, 2),
          totalNetDisbursed: safeRound(totalNetDisbursed, 2),
          totalOutstanding: safeRound(totalOutstanding, 2),
          totalDisbursedAllTime: safeRound(totalDisbursedAllTime, 2),
          totalCollected: safeRound(totalCollected, 2),
          totalEarned: safeRound(totalEarned, 2),
          totalEarnedInterest: safeRound(totalEarnedInterest, 2),
          totalEarnedFees: safeRound(totalEarnedFees, 2),
          overdueAmount: safeRound(overdueAmount, 2),
          collectionRate,
          totalLateFees: safeRound(totalLateFees, 2),
          totalLateFeesPaid: safeRound(totalLateFeesPaid, 2),
          activeLoansInRange,
          loansInArrearsInRange,
          loansInArrears,
          pendingApplications: pendingApplicationsKpi,
        },
        loansByStatus,
        disbursementTrend,
        collectionTrend,
        applicationsByStatus,
        loansByProduct,
        recentLoans,
        recentApplications,
        portfolioAtRisk,
        actionNeeded: {
          submittedApplications: canL1Apps ? pendingApplications : 0,
          applicationsPendingL2: canL2Apps ? pendingL2ApprovalTotal : 0,
          loansPendingDisbursement: canDisburseOrManageLoans ? loansPendingDisbursement : 0,
          loansReadyToComplete: canManageLoans ? loansReadyToComplete : 0,
          loansReadyForDefault: canManageCollections ? loansReadyForDefault : 0,
        },
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
