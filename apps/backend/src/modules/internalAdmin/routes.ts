import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { safeAdd, safeDivide, safeMultiply, safeRound, safeSubtract, toSafeNumber } from '../../lib/math.js';
import { BillingCronService } from '../../lib/billingCronService.js';
import { refreshRenewalInvoiceCharges } from '../billing/routes.js';

const router = Router();

const LOAN_STATUSES_FOR_FINANCIALS: Array<'ACTIVE' | 'IN_ARREARS' | 'COMPLETED' | 'DEFAULTED' | 'WRITTEN_OFF'> = [
  'ACTIVE',
  'IN_ARREARS',
  'COMPLETED',
  'DEFAULTED',
  'WRITTEN_OFF',
];

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function verifyInternalAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  const expected = config.trueIdentity.kreditInternalSecret;
  return !!expected && token === expected;
}

router.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!verifyInternalAuth(authHeader)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

type TenantFinancialMetrics = {
  totalDisbursed: number;
  totalProfit: number;
};

async function computeTenantFinancials(tenantIds: string[]): Promise<Map<string, TenantFinancialMetrics>> {
  const metricsByTenant = new Map<string, TenantFinancialMetrics>();
  if (tenantIds.length === 0) return metricsByTenant;

  const disbursedLoans = await prisma.loan.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: { in: LOAN_STATUSES_FOR_FINANCIALS },
      disbursementDate: { not: null },
    },
    select: {
      tenantId: true,
      principalAmount: true,
      product: {
        select: {
          legalFeeType: true,
          legalFeeValue: true,
          stampingFeeType: true,
          stampingFeeValue: true,
        },
      },
    },
  });

  const disbursedByTenant = new Map<string, number>();
  const disbursementFeesByTenant = new Map<string, number>();

  for (const loan of disbursedLoans) {
    const tenantId = loan.tenantId;
    const principal = toSafeNumber(loan.principalAmount);
    const legalFeeVal = toSafeNumber(loan.product.legalFeeValue);
    const stampingFeeVal = toSafeNumber(loan.product.stampingFeeValue);

    const legalFee = loan.product.legalFeeType === 'PERCENTAGE'
      ? safeMultiply(principal, safeDivide(legalFeeVal, 100))
      : legalFeeVal;

    const stampingFee = loan.product.stampingFeeType === 'PERCENTAGE'
      ? safeMultiply(principal, safeDivide(stampingFeeVal, 100))
      : stampingFeeVal;

    disbursedByTenant.set(tenantId, safeAdd(disbursedByTenant.get(tenantId) ?? 0, principal));
    disbursementFeesByTenant.set(tenantId, safeAdd(disbursementFeesByTenant.get(tenantId) ?? 0, legalFee, stampingFee));
  }

  const allocations = await prisma.paymentAllocation.findMany({
    where: {
      repayment: {
        scheduleVersion: {
          loan: {
            tenantId: { in: tenantIds },
          },
        },
      },
    },
    include: {
      repayment: {
        select: {
          id: true,
          principal: true,
          interest: true,
          scheduleVersion: {
            select: {
              loan: {
                select: {
                  tenantId: true,
                },
              },
            },
          },
        },
      },
      transaction: {
        select: {
          paymentType: true,
        },
      },
    },
    orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }],
  });

  const paidThroughByRepaymentId = new Map<string, number>();
  const earnedInterestByTenant = new Map<string, number>();
  const earnedFeesByTenant = new Map<string, number>();

  for (const alloc of allocations) {
    const tenantId = alloc.repayment.scheduleVersion.loan.tenantId;
    const repaymentId = alloc.repayment.id;
    const allocationAmount = toSafeNumber(alloc.amount);
    const interestDue = toSafeNumber(alloc.repayment.interest);
    const paidBeforeAllocation = paidThroughByRepaymentId.get(repaymentId) ?? 0;

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
      repaymentId,
      safeAdd(paidBeforeAllocation, allocationAmount)
    );

    const lateFee = toSafeNumber(alloc.lateFee);
    earnedInterestByTenant.set(
      tenantId,
      safeAdd(earnedInterestByTenant.get(tenantId) ?? 0, interestPortion)
    );
    earnedFeesByTenant.set(
      tenantId,
      safeAdd(earnedFeesByTenant.get(tenantId) ?? 0, lateFee)
    );
  }

  for (const tenantId of tenantIds) {
    const totalDisbursed = disbursedByTenant.get(tenantId) ?? 0;
    const totalEarnedInterest = earnedInterestByTenant.get(tenantId) ?? 0;
    const totalEarnedFees = safeAdd(
      earnedFeesByTenant.get(tenantId) ?? 0,
      disbursementFeesByTenant.get(tenantId) ?? 0
    );
    const totalProfit = safeAdd(totalEarnedInterest, totalEarnedFees);

    metricsByTenant.set(tenantId, {
      totalDisbursed: safeRound(totalDisbursed, 2),
      totalProfit: safeRound(totalProfit, 2),
    });
  }

  return metricsByTenant;
}

async function computeTotalOutstanding(): Promise<number> {
  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'IN_ARREARS', 'COMPLETED', 'DEFAULTED', 'WRITTEN_OFF'] },
    },
    include: {
      scheduleVersions: {
        orderBy: { version: 'desc' },
        take: 1,
        include: { repayments: true },
      },
    },
  });

  const repaymentIds = loans.flatMap(
    (l) => (l.scheduleVersions[0]?.repayments ?? []).map((r) => r.id)
  );
  if (repaymentIds.length === 0) return 0;

  const allocationSums = await prisma.paymentAllocation.groupBy({
    by: ['repaymentId'],
    _sum: { amount: true },
    where: { repaymentId: { in: repaymentIds } },
  });
  const paidByRepaymentId = new Map<string, number>();
  for (const row of allocationSums) {
    paidByRepaymentId.set(row.repaymentId, toSafeNumber(row._sum.amount));
  }

  let totalOutstanding = 0;
  for (const loan of loans) {
    const schedule = loan.scheduleVersions[0];
    if (!schedule) continue;
    for (const rep of schedule.repayments) {
      if (rep.status === 'CANCELLED') continue;
      const due = toSafeNumber(rep.totalDue);
      const paid = paidByRepaymentId.get(rep.id) ?? 0;
      if (rep.status !== 'PAID') {
        totalOutstanding = safeAdd(totalOutstanding, Math.max(0, safeSubtract(due, paid)));
      }
    }
  }
  return safeRound(totalOutstanding, 2);
}

async function computeMonthlyGrowthChart(months: number = 12): Promise<Array<{ label: string; tenants: number; loanVolume: number }>> {
  const now = new Date();
  const buckets: Array<{ year: number; month: number; label: string; endDate: Date }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    buckets.push({
      year,
      month,
      label: `${monthNames[month]} ${year}`,
      endDate: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    });
  }

  const [tenants, loans] = await Promise.all([
    prisma.tenant.findMany({ select: { createdAt: true } }),
    prisma.loan.findMany({
      where: { disbursementDate: { not: null } },
      select: { principalAmount: true, disbursementDate: true },
    }),
  ]);

  return buckets.map((bucket) => {
    const bucketEnd = bucket.endDate.getTime();
    let cumTenants = 0;
    let cumLoanVolume = 0;
    for (const t of tenants) {
      if (new Date(t.createdAt).getTime() <= bucketEnd) cumTenants++;
    }
    for (const l of loans) {
      const disbDate = l.disbursementDate;
      if (disbDate && new Date(disbDate).getTime() <= bucketEnd) {
        cumLoanVolume = safeAdd(cumLoanVolume, toSafeNumber(l.principalAmount));
      }
    }
    return {
      label: bucket.label,
      tenants: cumTenants,
      loanVolume: safeRound(cumLoanVolume, 2),
    };
  });
}

/**
 * GET /api/internal/kredit/admin/overview
 * Internal admin overview for all tenants (Bearer protected).
 */
router.get('/overview', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const skip = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const tenantWhere = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [allTenantIdsRaw, tenants, totalTenants, totalBorrowers, totalApplications, totalLoans] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true } }),
      prisma.tenant.findMany({
        where: tenantWhere,
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          subscriptionStatus: true,
          createdAt: true,
          _count: {
            select: {
              borrowers: true,
              applications: true,
              loans: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.tenant.count({ where: tenantWhere }),
      prisma.borrower.count(),
      prisma.loanApplication.count(),
      prisma.loan.count(),
    ]);

    const allTenantIds = allTenantIdsRaw.map((t) => t.id);
    const [financialsByTenant, totalOutstanding, monthlyGrowthChart] = await Promise.all([
      computeTenantFinancials(allTenantIds),
      computeTotalOutstanding(),
      computeMonthlyGrowthChart(12),
    ]);

    let totalDisbursedFacilitated = 0;
    let totalProfit = 0;
    for (const tenantId of allTenantIds) {
      const financials = financialsByTenant.get(tenantId);
      totalDisbursedFacilitated = safeAdd(totalDisbursedFacilitated, financials?.totalDisbursed ?? 0);
      totalProfit = safeAdd(totalProfit, financials?.totalProfit ?? 0);
    }

    const rows = tenants.map((tenant) => {
      const financials = financialsByTenant.get(tenant.id) ?? { totalDisbursed: 0, totalProfit: 0 };
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        email: tenant.email,
        subscriptionStatus: tenant.subscriptionStatus,
        borrowerCount: tenant._count.borrowers,
        applicationCount: tenant._count.applications,
        loanCount: tenant._count.loans,
        totalDisbursed: financials.totalDisbursed,
        totalProfit: financials.totalProfit,
        createdAt: tenant.createdAt,
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          tenantCount: allTenantIds.length,
          totalBorrowers,
          totalApplications,
          totalLoans,
          totalDisbursedFacilitated: safeRound(totalDisbursedFacilitated, 2),
          totalOutstanding,
          totalProfit: safeRound(totalProfit, 2),
        },
        tenants: rows,
        monthlyGrowthChart,
        pagination: {
          page,
          pageSize,
          total: totalTenants,
          totalPages: Math.max(1, Math.ceil(totalTenants / pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/internal/kredit/admin/tenants
 * Internal admin tenants table with full tenant info (Bearer protected).
 */
router.get('/tenants', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const skip = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const tenantWhere = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { registrationNumber: { contains: search, mode: 'insensitive' as const } },
            { licenseNumber: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where: tenantWhere,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          licenseNumber: true,
          registrationNumber: true,
          email: true,
          contactNumber: true,
          businessAddress: true,
          status: true,
          subscriptionStatus: true,
          subscriptionAmount: true,
          subscribedAt: true,
          trueIdentityTenantSyncedAt: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              autoRenew: true,
              currentPeriodStart: true,
              currentPeriodEnd: true,
              gracePeriodEnd: true,
            },
          },
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              borrowers: true,
              applications: true,
              loans: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.tenant.count({ where: tenantWhere }),
    ]);

    const tenantIds = tenants.map((t) => t.id);

    // Refresh unpaid renewal invoices so amounts match Kredit billing page (RM 592.92 etc.)
    const unpaidRenewals = await prisma.invoice.findMany({
      where: {
        tenantId: { in: tenantIds },
        billingType: 'RENEWAL',
        status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
      },
      select: { id: true, tenantId: true },
    });
    await Promise.all(
      unpaidRenewals.map((inv) =>
        refreshRenewalInvoiceCharges({ tenantId: inv.tenantId, invoiceId: inv.id })
      )
    );

    const [financialsByTenant, latestInvoices] = await Promise.all([
      computeTenantFinancials(tenantIds),
      prisma.invoice.findMany({
        where: {
          tenantId: { in: tenantIds },
          billingType: 'RENEWAL',
        },
        orderBy: { issuedAt: 'desc' },
        distinct: ['tenantId'],
        select: {
          tenantId: true,
          amount: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          lineItems: {
            select: {
              itemType: true,
              description: true,
              amount: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      }),
    ]);

    const invoiceByTenant = new Map(latestInvoices.map((inv) => [inv.tenantId, inv]));

    const rows = tenants.map((tenant) => {
      const financials = financialsByTenant.get(tenant.id) ?? { totalDisbursed: 0, totalProfit: 0 };
      const inv = invoiceByTenant.get(tenant.id);
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        type: tenant.type,
        licenseNumber: tenant.licenseNumber,
        registrationNumber: tenant.registrationNumber,
        email: tenant.email,
        contactNumber: tenant.contactNumber,
        businessAddress: tenant.businessAddress,
        status: tenant.status,
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionAmount: tenant.subscriptionAmount,
        subscribedAt: tenant.subscribedAt,
        subscription: tenant.subscription
          ? {
              plan: tenant.subscription.plan,
              status: tenant.subscription.status,
              autoRenew: tenant.subscription.autoRenew,
              currentPeriodStart: tenant.subscription.currentPeriodStart,
              currentPeriodEnd: tenant.subscription.currentPeriodEnd,
              gracePeriodEnd: tenant.subscription.gracePeriodEnd,
            }
          : null,
        trueIdentityTenantSyncedAt: tenant.trueIdentityTenantSyncedAt,
        borrowerCount: tenant._count.borrowers,
        applicationCount: tenant._count.applications,
        loanCount: tenant._count.loans,
        totalDisbursed: financials.totalDisbursed,
        totalProfit: financials.totalProfit,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        latestInvoice: inv
          ? {
              amount: Number(inv.amount),
              status: inv.status,
              periodStart: inv.periodStart,
              periodEnd: inv.periodEnd,
              lineItems: inv.lineItems.map((li) => ({
                itemType: li.itemType,
                description: li.description,
                amount: Number(li.amount),
              })),
            }
          : null,
      };
    });

    res.json({
      success: true,
      data: {
        tenants: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/internal/kredit/admin/loans
 * Internal all-tenant loans table (Bearer protected).
 */
router.get('/loans', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const skip = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where = search
      ? {
          OR: [
            { borrower: { name: { contains: search, mode: 'insensitive' as const } } },
            { borrower: { icNumber: { contains: search, mode: 'insensitive' as const } } },
            { borrower: { email: { contains: search, mode: 'insensitive' as const } } },
            { tenant: { name: { contains: search, mode: 'insensitive' as const } } },
            { tenant: { slug: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          borrower: {
            select: {
              id: true,
              name: true,
              icNumber: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.loan.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        loans: loans.map((loan) => ({
          id: loan.id,
          tenantId: loan.tenantId,
          tenant: loan.tenant,
          borrowerId: loan.borrowerId,
          borrower: loan.borrower,
          principalAmount: toSafeNumber(loan.principalAmount),
          interestRate: toSafeNumber(loan.interestRate),
          term: loan.term,
          status: loan.status,
          disbursementDate: loan.disbursementDate,
          createdAt: loan.createdAt,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/internal/kredit/admin/borrowers
 * Internal all-tenant borrowers table (Bearer protected).
 */
router.get('/borrowers', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const skip = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { companyName: { contains: search, mode: 'insensitive' as const } },
            { icNumber: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { tenant: { name: { contains: search, mode: 'insensitive' as const } } },
            { tenant: { slug: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const [borrowers, total] = await Promise.all([
      prisma.borrower.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              loans: true,
            },
          },
          performanceProjection: {
            select: {
              riskLevel: true,
              onTimeRate: true,
              tags: true,
              defaultedLoans: true,
              inArrearsLoans: true,
              readyForDefaultLoans: true,
              totalLoans: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.borrower.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        borrowers: borrowers.map((borrower) => ({
          id: borrower.id,
          name: borrower.name,
          borrowerType: borrower.borrowerType,
          companyName: borrower.companyName,
          icNumber: borrower.icNumber,
          documentType: borrower.documentType,
          documentVerified: borrower.documentVerified,
          verificationStatus: borrower.verificationStatus,
          email: borrower.email,
          phone: borrower.phone,
          tenant: borrower.tenant,
          loanCount: borrower._count.loans,
          createdAt: borrower.createdAt,
          performanceProjection: borrower.performanceProjection
            ? {
                riskLevel: borrower.performanceProjection.riskLevel,
                onTimeRate: borrower.performanceProjection.onTimeRate != null
                  ? String(borrower.performanceProjection.onTimeRate)
                  : null,
                tags: borrower.performanceProjection.tags,
                defaultedLoans: borrower.performanceProjection.defaultedLoans,
                inArrearsLoans: borrower.performanceProjection.inArrearsLoans,
                readyForDefaultLoans: borrower.performanceProjection.readyForDefaultLoans,
                totalLoans: borrower.performanceProjection.totalLoans,
              }
            : null,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/internal/kredit/admin/referrals
 * Internal all-referrals list for admin (Bearer protected).
 */
router.get('/referrals', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const skip = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';

    // Build where clause
    const where: Record<string, unknown> = {};
    
    if (statusFilter === 'eligible') {
      where.isEligible = true;
      where.isPaid = false;
    } else if (statusFilter === 'paid') {
      where.isPaid = true;
    } else if (statusFilter === 'pending') {
      where.isEligible = false;
    }

    if (search) {
      (where as { OR: unknown[] }).OR = [
        { referralCode: { contains: search, mode: 'insensitive' as const } },
        { referrer: { email: { contains: search, mode: 'insensitive' as const } } },
        { referrer: { name: { contains: search, mode: 'insensitive' as const } } },
        { referredUser: { email: { contains: search, mode: 'insensitive' as const } } },
        { referredUser: { name: { contains: search, mode: 'insensitive' as const } } },
      ];
    }

    const [referrals, total] = (await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          referrer: {
            select: {
              id: true,
              email: true,
              name: true,
              referralBankAccountName: true,
              referralBankName: true,
              referralBankNameOther: true,
              referralBankAccountNo: true,
            },
          },
          referredUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        } as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.referral.count({ where }),
    ])) as [any[], number];

    // Calculate summary stats
    const [totalCount, eligibleCount, paidCount] = await Promise.all([
      prisma.referral.count(),
      prisma.referral.count({ where: { isEligible: true, isPaid: false } }),
      prisma.referral.count({ where: { isPaid: true } }),
    ]);

    res.json({
      success: true,
      data: {
        referrals: referrals.map((referral) => ({
          id: referral.id,
          referralCode: referral.referralCode,
          rewardAmount: referral.rewardAmount,
          rewardAmountMyr: safeDivide(referral.rewardAmount, 100),
          isEligible: referral.isEligible,
          isPaid: referral.isPaid,
          eligibleAt: referral.eligibleAt.toISOString(),
          paidAt: referral.paidAt?.toISOString() ?? null,
          createdAt: referral.createdAt.toISOString(),
          updatedAt: referral.updatedAt.toISOString(),
          referrer: {
            id: referral.referrer.id,
            email: referral.referrer.email,
            name: referral.referrer.name,
            referralBankAccountName: referral.referrer.referralBankAccountName,
            referralBankName: referral.referrer.referralBankName,
            referralBankNameOther: referral.referrer.referralBankNameOther,
            referralBankAccountNo: referral.referrer.referralBankAccountNo,
          },
          referredUser: {
            id: referral.referredUser.id,
            email: referral.referredUser.email,
            name: referral.referredUser.name,
          },
        })),
        summary: {
          total: totalCount,
          eligible: eligibleCount,
          paid: paidCount,
          unpaidEligible: eligibleCount,
          totalRewards: safeDivide(
            referrals.reduce((sum, r) => safeAdd(sum, r.rewardAmount), 0),
            100
          ),
          paidRewards: safeDivide(
            referrals.filter((r) => r.isPaid).reduce((sum, r) => safeAdd(sum, r.rewardAmount), 0),
            100
          ),
        },
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/kredit/admin/tenants/:tenantId/suspend
 * Manual suspension from Admin (overdue handling).
 */
router.post('/tenants/:tenantId/suspend', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Overdue payment';
    const suspendedBy = typeof req.body?.suspendedBy === 'string' ? req.body.suspendedBy : null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'SUSPENDED' },
      });

      await tx.billingEvent.create({
        data: {
          tenantId,
          eventType: 'TENANT_SUSPENDED',
          metadata: {
            reason,
            suspendedBy,
            suspendedAt: new Date().toISOString(),
          },
        },
      });
    });

    res.json({ success: true, data: { tenantId, status: 'SUSPENDED' } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/kredit/admin/tenants/:tenantId/revoke-to-free
 * Manual revoke access and return tenant to FREE subscription.
 */
router.post('/tenants/:tenantId/revoke-to-free', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Manual revoke to free';
    const revokedBy = typeof req.body?.revokedBy === 'string' ? req.body.revokedBy : null;
    const now = new Date();

    // Look up by id first, then by slug (in case Admin passes slug)
    let tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      tenant = await prisma.tenant.findUnique({
        where: { slug: tenantId },
        select: { id: true },
      });
    }
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    const resolvedTenantId = tenant.id;

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPaymentRequest.updateMany({
        where: {
          tenantId: resolvedTenantId,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          rejectedAt: now,
          rejectionReason: 'REVOKED_BY_ADMIN',
        },
      });

      await tx.invoice.updateMany({
        where: {
          tenantId: resolvedTenantId,
          status: { in: ['PENDING_APPROVAL', 'ISSUED', 'OVERDUE'] },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          subscriptionStatus: 'FREE',
          subscriptionAmount: null,
          subscribedAt: null,
        },
      });

      await tx.subscription.updateMany({
        where: { tenantId: resolvedTenantId },
        data: {
          status: 'CANCELLED',
          autoRenew: false,
          currentPeriodEnd: now,
          gracePeriodEnd: null,
        },
      });

      await tx.tenantAddOn.updateMany({
        where: {
          tenantId: resolvedTenantId,
          status: 'ACTIVE',
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
        },
      });

      await tx.billingEvent.create({
        data: {
          tenantId: resolvedTenantId,
          eventType: 'CANCELLATION_PROCESSED',
          metadata: {
            status: 'REVOKED',
            reason,
            revokedBy,
            revokedAt: now.toISOString(),
            source: 'admin_manual_revoke',
          },
        },
      });
    });

    res.json({ success: true, data: { tenantId: resolvedTenantId, subscriptionStatus: 'FREE' } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/kredit/admin/invoices/:invoiceId/refund
 * Manual refund request from Admin.
 */
router.post('/invoices/:invoiceId/refund', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const amountMyr = Number(req.body?.amountMyr ?? 0);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Manual refund';
    const refundedBy = typeof req.body?.refundedBy === 'string' ? req.body.refundedBy : null;

    if (!Number.isFinite(amountMyr) || amountMyr <= 0) {
      return res.status(400).json({ success: false, error: 'amountMyr must be positive' });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, tenantId: true },
    });
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const creditNote = await prisma.$transaction(async (tx) => {
      const created = await tx.creditNote.create({
        data: {
          tenantId: invoice.tenantId,
          sourceInvoiceId: invoice.id,
          amount: amountMyr,
          reason,
          isRefunded: true,
          refundedAt: new Date(),
        },
      });

      await tx.billingEvent.create({
        data: {
          tenantId: invoice.tenantId,
          eventType: 'REFUND_PROCESSED',
          metadata: {
            invoiceId,
            creditNoteId: created.id,
            amountMyr,
            reason,
            refundedBy,
          },
        },
      });
      return created;
    });

    res.json({
      success: true,
      data: {
        invoiceId,
        creditNoteId: creditNote.id,
        amountMyr: Number(creditNote.amount),
        refundedAt: creditNote.refundedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/internal/kredit/admin/billing/reconcile-now
 * Trigger billing reconciliation immediately (cron fallback remains active).
 */
router.post('/billing/reconcile-now', async (_req, res, next) => {
  try {
    await BillingCronService.run();
    res.json({
      success: true,
      data: {
        triggeredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
