import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { safeRound, safeAdd, safeSubtract, safeMultiply, safeDivide, safePercentage, toSafeNumber } from '../../lib/math.js';

const router = Router();

// All dashboard routes require authentication + active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

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

    // Parse date range (defaults to last 12 months)
    let fromDate: Date;
    let toDate: Date;

    if (req.query.from && typeof req.query.from === 'string') {
      fromDate = new Date(req.query.from);
      if (isNaN(fromDate.getTime())) {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // 12 months ago, start of month
      }
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    }

    if (req.query.to && typeof req.query.to === 'string') {
      toDate = new Date(req.query.to);
      if (isNaN(toDate.getTime())) {
        toDate = now;
      } else {
        // Set to end of day
        toDate.setHours(23, 59, 59, 999);
      }
    } else {
      toDate = now;
    }

    // ========================================
    // 1. KPI Cards - Aggregate counts & financials
    // ========================================

    // Borrower counts
    const [totalBorrowers, activeBorrowersResult] = await Promise.all([
      prisma.borrower.count({ where: { tenantId } }),
      prisma.borrower.findMany({
        where: {
          tenantId,
          loans: { some: { status: { in: ['ACTIVE', 'IN_ARREARS'] } } },
        },
        select: { id: true },
      }),
    ]);

    const activeBorrowers = activeBorrowersResult.length;

    // Loan counts by status (all time - not filtered by date range)
    const loanStatusCounts = await prisma.loan.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
    });

    const statusCountMap: Record<string, number> = {};
    let totalLoans = 0;
    for (const row of loanStatusCounts) {
      statusCountMap[row.status] = row._count.id;
      totalLoans += row._count.id;
    }

    const activeLoans = (statusCountMap['ACTIVE'] || 0) + (statusCountMap['IN_ARREARS'] || 0);
    const loansInArrears = statusCountMap['IN_ARREARS'] || 0;

    // Pending applications
    const pendingApplications = await prisma.loanApplication.count({
      where: {
        tenantId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      },
    });

    // Action needed counts
    const [submittedApplications, loansPendingDisbursement, loansReadyForDefault, readyToCompleteLoans] = await Promise.all([
      prisma.loanApplication.count({
        where: { tenantId, status: 'SUBMITTED' },
      }),
      prisma.loan.count({
        where: { tenantId, status: 'PENDING_DISBURSEMENT' },
      }),
      prisma.loan.count({
        where: { tenantId, readyForDefault: true, status: { not: 'DEFAULTED' } },
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
            select: {
              repayments: {
                select: { status: true },
              },
            },
          },
        },
      }),
    ]);

    // Count loans where every repayment in the latest schedule version is PAID/CANCELLED
    const loansReadyToComplete = readyToCompleteLoans.filter(loan => {
      const schedule = loan.scheduleVersions[0];
      if (!schedule || schedule.repayments.length === 0) return false;
      return schedule.repayments.every(r => r.status === 'PAID' || r.status === 'CANCELLED');
    }).length;

    // Financial aggregates - from loans with schedules
    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'IN_ARREARS', 'COMPLETED', 'DEFAULTED', 'WRITTEN_OFF'] },
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
            repayments: {
              include: {
                allocations: true,
              },
            },
          },
        },
      },
    });

    let totalDisbursed = 0;
    let totalNetDisbursed = 0;
    let totalOutstanding = 0;
    let totalCollected = 0;
    let overdueAmount = 0;
    let totalLateFees = 0;
    let totalLateFeesPaid = 0;

    // PAR calculation: outstanding balance of loans with payments X+ days overdue
    let par30Outstanding = 0;
    let par60Outstanding = 0;
    let par90Outstanding = 0;
    let totalActiveOutstanding = 0; // denominator for PAR

    for (const loan of loans) {
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
      let loanCollected = 0;
      let maxDaysOverdue = 0;

      for (const rep of schedule.repayments) {
        if (rep.status === 'CANCELLED') continue;

        const due = Number(rep.totalDue);
        const paid = rep.allocations.reduce((sum, a) => safeAdd(sum, Number(a.amount)), 0);

        loanCollected = safeAdd(loanCollected, paid);

        if (rep.status !== 'PAID') {
          const remaining = safeSubtract(due, paid);
          loanOutstanding = safeAdd(loanOutstanding, remaining);

          // Check if overdue
          if (rep.dueDate < now && remaining > 0) {
            overdueAmount = safeAdd(overdueAmount, remaining);
            const daysOverdue = Math.floor((now.getTime() - rep.dueDate.getTime()) / (1000 * 60 * 60 * 24));
            maxDaysOverdue = Math.max(maxDaysOverdue, daysOverdue);
          }
        }
      }

      totalOutstanding = safeAdd(totalOutstanding, loanOutstanding);
      totalCollected = safeAdd(totalCollected, loanCollected);

      // PAR: if loan is active/in_arrears, use its outstanding for the calculation
      if (['ACTIVE', 'IN_ARREARS'].includes(loan.status)) {
        totalActiveOutstanding = safeAdd(totalActiveOutstanding, loanOutstanding);
        if (maxDaysOverdue >= 30) par30Outstanding = safeAdd(par30Outstanding, loanOutstanding);
        if (maxDaysOverdue >= 60) par60Outstanding = safeAdd(par60Outstanding, loanOutstanding);
        if (maxDaysOverdue >= 90) par90Outstanding = safeAdd(par90Outstanding, loanOutstanding);
      }
    }

    const totalDue = safeAdd(totalCollected, totalOutstanding);
    const collectionRate = safePercentage(totalCollected, totalDue, 2);

    const portfolioAtRisk = {
      par30: safePercentage(par30Outstanding, totalActiveOutstanding, 2),
      par60: safePercentage(par60Outstanding, totalActiveOutstanding, 2),
      par90: safePercentage(par90Outstanding, totalActiveOutstanding, 2),
    };

    // ========================================
    // 2. Loan status distribution (for pie chart)
    // ========================================
    const loansByStatus = loanStatusCounts.map((row) => ({
      status: row.status,
      count: row._count.id,
    }));

    // ========================================
    // 3. Disbursement trend (monthly, within date range)
    // ========================================
    const disbursedLoans = await prisma.loan.findMany({
      where: {
        tenantId,
        disbursementDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        disbursementDate: true,
        principalAmount: true,
      },
    });

    // Group by month
    const disbursementMap = new Map<string, { amount: number; count: number }>();
    for (const loan of disbursedLoans) {
      if (!loan.disbursementDate) continue;
      const monthKey = `${loan.disbursementDate.getFullYear()}-${String(loan.disbursementDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = disbursementMap.get(monthKey) || { amount: 0, count: 0 };
      existing.amount = safeAdd(existing.amount, Number(loan.principalAmount));
      existing.count += 1;
      disbursementMap.set(monthKey, existing);
    }

    // ========================================
    // 4. Collection trend (monthly, based on payment transactions within date range)
    // ========================================
    const payments = await prisma.paymentTransaction.findMany({
      where: {
        tenantId,
        paymentDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        paymentDate: true,
        totalAmount: true,
      },
    });

    const collectionMap = new Map<string, number>();
    for (const payment of payments) {
      const monthKey = `${payment.paymentDate.getFullYear()}-${String(payment.paymentDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = collectionMap.get(monthKey) || 0;
      collectionMap.set(monthKey, safeAdd(existing, Number(payment.totalAmount)));
    }

    // Get expected due amounts per month (repayments due within range)
    const repaymentsDue = await prisma.loanRepayment.findMany({
      where: {
        dueDate: {
          gte: fromDate,
          lte: toDate,
        },
        status: { not: 'CANCELLED' },
        scheduleVersion: {
          loan: { tenantId },
        },
      },
      select: {
        dueDate: true,
        totalDue: true,
      },
    });

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

    // ========================================
    // 5. Application pipeline (by status)
    // ========================================
    const applicationStatusCounts = await prisma.loanApplication.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
    });

    const applicationsByStatus = applicationStatusCounts.map((row) => ({
      status: row.status,
      count: row._count.id,
    }));

    // ========================================
    // 6. Loans breakdown by product
    // ========================================
    const loansByProductRaw = await prisma.loan.groupBy({
      by: ['productId', 'status'],
      where: { tenantId },
      _count: { id: true },
      _sum: { principalAmount: true },
    });

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

    // ========================================
    // 7. Recent activity
    // ========================================
    const [recentLoansRaw, recentApplicationsRaw] = await Promise.all([
      prisma.loan.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          borrower: { select: { name: true } },
        },
      }),
      prisma.loanApplication.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          borrower: { select: { name: true } },
        },
      }),
    ]);

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
          totalCollected: safeRound(totalCollected, 2),
          overdueAmount: safeRound(overdueAmount, 2),
          collectionRate,
          totalLateFees: safeRound(totalLateFees, 2),
          totalLateFeesPaid: safeRound(totalLateFeesPaid, 2),
          loansInArrears,
          pendingApplications,
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
          submittedApplications,
          loansPendingDisbursement,
          loansReadyToComplete,
          loansReadyForDefault,
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
