import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { AuditService } from './auditService.js';
import { toSafeNumber, safeRound, safeSubtract, safeAdd, safeDivide, safeMultiply } from '../../lib/math.js';
import archiver from 'archiver';
import {
  generateLampiranAPdf,
  getLoanStatusCode,
  getLoanNota,
  getBangsa,
  getPekerjaan,
  getMajikan,
  getJantina,
  type LampiranAData,
  type LampiranARepayment,
} from '../../lib/lampiranAService.js';

const router = Router();

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

/**
 * Get audit logs
 * GET /api/compliance/audit-logs
 */
router.get('/audit-logs', requireAdmin, async (req, res, next) => {
  try {
    const { 
      entityType, 
      entityId, 
      action, 
      memberId,
      startDate,
      endDate,
      page = '1', 
      pageSize = '50' 
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const whereClause = {
      tenantId: req.tenantId,
      ...(typeof entityType === 'string' && { entityType }),
      ...(typeof entityId === 'string' && { entityId }),
      ...(typeof action === 'string' && { action }),
      ...(typeof memberId === 'string' && { memberId }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(typeof startDate === 'string' && { gte: new Date(startDate) }),
          ...(typeof endDate === 'string' && { lte: new Date(endDate) }),
        },
      }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          member: {
            include: {
              user: {
                select: { id: true, email: true, name: true },
              },
            },
          },
        },
      }),
      prisma.auditLog.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: logs,
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
 * Get audit log for a specific entity
 * GET /api/compliance/audit-logs/entity/:entityType/:entityId
 */
router.get('/audit-logs/entity/:entityType/:entityId', requireAdmin, async (req, res, next) => {
  try {
    const entityType = req.params.entityType as string;
    const entityId = req.params.entityId as string;

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
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

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Export loans data as CSV
 * GET /api/compliance/exports/loans
 */
router.get('/exports/loans', requireAdmin, async (req, res, next) => {
  try {
    const { status, startDate, endDate } = req.query;

    const where: Record<string, unknown> = {
      tenantId: req.tenantId,
    };

    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate as string);
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate as string);
    }

    const loans = await prisma.loan.findMany({
      where,
      include: {
        borrower: true,
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Generate CSV
    const headers = [
      'Loan ID',
      'Borrower Name',
      'Borrower IC',
      'Borrower Type',
      'Product',
      'Principal',
      'Interest Rate',
      'Term (months)',
      'Status',
      'Arrears Since',
      'Default Ready',
      'Default Ready Date',
      'Disbursement Date',
      'Created At',
    ];

    const rows = loans.map(loan => {
      // For corporate borrowers, use companyName instead of rep name
      const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
        ? loan.borrower.companyName
        : loan.borrower.name;
      
      return [
        loan.id,
        borrowerName,
        loan.borrower.icNumber,
        loan.borrower.borrowerType,
        loan.product.name,
        loan.principalAmount.toString(),
        `${loan.interestRate}%`,
        loan.term.toString(),
        loan.status,
        loan.arrearsStartDate?.toISOString().split('T')[0] || '',
        loan.readyForDefault ? 'Yes' : 'No',
        loan.defaultReadyDate?.toISOString().split('T')[0] || '',
        loan.disbursementDate?.toISOString() || '',
        loan.createdAt.toISOString(),
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // Log export action
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Loan',
      entityId: 'bulk',
      newData: { count: loans.length, filters: { status, startDate, endDate } },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=loans-export-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * Export borrowers data as CSV
 * GET /api/compliance/exports/borrowers
 */
router.get('/exports/borrowers', requireAdmin, async (req, res, next) => {
  try {
    const { borrowerType, startDate, endDate } = req.query;

    const where: Record<string, unknown> = {
      tenantId: req.tenantId,
    };

    if (borrowerType && ['INDIVIDUAL', 'CORPORATE'].includes(borrowerType as string)) {
      where.borrowerType = borrowerType;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate as string);
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate as string);
    }

    const borrowers = await prisma.borrower.findMany({
      where,
      include: {
        _count: {
          select: { loans: true, applications: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Generate CSV - comprehensive borrower data (excluding audit trail)
    const headers = [
      // Core fields
      'Borrower ID',
      'Type',
      'Name',
      'IC/Passport Number',
      'Document Type',
      'Document Verified',
      'Verified At',
      'Phone',
      'Email',
      'Address',
      // Individual fields
      'Date of Birth',
      'Gender',
      'Race',
      'Education Level',
      'Occupation',
      'Employment Status',
      'Monthly Income',
      'Bank Name',
      'Bank Account No',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Relationship',
      // Corporate fields
      'Company Name',
      'SSM Registration No',
      'Business Address',
      'Authorized Rep Name',
      'Authorized Rep IC',
      'Company Phone',
      'Company Email',
      'Nature of Business',
      'Bumi Status (Taraf)',
      'Date of Incorporation',
      'Paid Up Capital',
      'Number of Employees',
      // Stats
      'Total Loans',
      'Total Applications',
      // Timestamps
      'Created At',
      'Updated At',
    ];

    const rows = borrowers.map(borrower => {
      // Format dates for CSV
      const formatCsvDate = (date: Date | null) => date ? date.toISOString().split('T')[0] : '';
      const formatCsvDateTime = (date: Date | null) => date ? date.toISOString() : '';
      
      // Format bank name for display
      const bankDisplay = borrower.bankName === 'OTHER' && borrower.bankNameOther 
        ? borrower.bankNameOther 
        : (borrower.bankName || '');

      return [
        borrower.id,
        borrower.borrowerType,
        borrower.name,
        borrower.icNumber,
        borrower.documentType,
        borrower.documentVerified ? 'Yes' : 'No',
        formatCsvDateTime(borrower.verifiedAt),
        borrower.phone || '',
        borrower.email || '',
        borrower.address || '',
        // Individual fields
        formatCsvDate(borrower.dateOfBirth),
        borrower.gender || '',
        borrower.race || '',
        borrower.educationLevel || '',
        borrower.occupation || '',
        borrower.employmentStatus || '',
        borrower.monthlyIncome?.toString() || '',
        bankDisplay,
        borrower.bankAccountNo || '',
        borrower.emergencyContactName || '',
        borrower.emergencyContactPhone || '',
        borrower.emergencyContactRelationship || '',
        // Corporate fields
        borrower.companyName || '',
        borrower.ssmRegistrationNo || '',
        borrower.businessAddress || '',
        borrower.authorizedRepName || '',
        borrower.authorizedRepIc || '',
        borrower.companyPhone || '',
        borrower.companyEmail || '',
        borrower.natureOfBusiness || '',
        borrower.bumiStatus || '',
        formatCsvDate(borrower.dateOfIncorporation),
        borrower.paidUpCapital?.toString() || '',
        borrower.numberOfEmployees?.toString() || '',
        // Stats
        borrower._count.loans.toString(),
        borrower._count.applications.toString(),
        // Timestamps
        formatCsvDateTime(borrower.createdAt),
        formatCsvDateTime(borrower.updatedAt),
      ];
    });

    // Escape CSV values properly
    const escapeCsvValue = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return `"${value}"`;
    };

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCsvValue(cell)).join(',')),
    ].join('\n');

    // Log export action
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Borrower',
      entityId: 'bulk',
      newData: { count: borrowers.length, filters: { borrowerType, startDate, endDate } },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=borrowers-export-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * Export repayment schedule as CSV
 * GET /api/compliance/exports/schedule/:loanId
 */
router.get('/exports/schedule/:loanId', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
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

    const schedule = loan.scheduleVersions[0];
    if (!schedule) {
      throw new NotFoundError('Schedule');
    }

    // Generate CSV
    const headers = [
      'Payment #',
      'Due Date',
      'Principal',
      'Interest',
      'Total Due',
      'Amount Paid',
      'Status',
    ];

    const rows = schedule.repayments.map((rep, idx) => {
      const paid = rep.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
      return [
        (idx + 1).toString(),
        rep.dueDate.toISOString().split('T')[0],
        rep.principal.toString(),
        rep.interest.toString(),
        rep.totalDue.toString(),
        paid.toFixed(2),
        rep.status,
      ];
    });

    // For corporate borrowers, use companyName instead of rep name
    const scheduleBorrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
      ? loan.borrower.companyName
      : loan.borrower.name;
    
    const csv = [
      `# Loan: ${loan.id}`,
      `# Borrower: ${scheduleBorrowerName} (${loan.borrower.icNumber})`,
      `# Product: ${loan.product.name}`,
      `# Principal: ${loan.principalAmount}`,
      `# Interest Rate: ${loan.interestRate}%`,
      `# Term: ${loan.term} months`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=schedule-${loan.id}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * Get loan portfolio summary (Schedule A style report)
 * GET /api/compliance/reports/portfolio
 */
router.get('/reports/portfolio', requireAdmin, async (req, res, next) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        tenantId: req.tenantId,
        status: { in: ['ACTIVE', 'IN_ARREARS', 'COMPLETED', 'DEFAULTED'] },
      },
      include: {
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

    // Calculate portfolio metrics
    let totalPrincipal = 0;
    let totalOutstanding = 0;
    let totalCollected = 0;
    let overdueAmount = 0;
    let activeCount = 0;
    let completedCount = 0;
    let defaultedCount = 0;
    let inArrearsCount = 0;

    const now = new Date();

    for (const loan of loans) {
      totalPrincipal += Number(loan.principalAmount);

      if (loan.status === 'ACTIVE') activeCount++;
      if (loan.status === 'IN_ARREARS') inArrearsCount++;
      if (loan.status === 'COMPLETED') completedCount++;
      if (loan.status === 'DEFAULTED') defaultedCount++;

      const schedule = loan.scheduleVersions[0];
      if (schedule) {
        for (const rep of schedule.repayments) {
          const paid = rep.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
          const due = Number(rep.totalDue);
          
          totalCollected += paid;
          
          if (rep.status !== 'PAID') {
            totalOutstanding += (due - paid);
            
            if (rep.dueDate < now) {
              overdueAmount += (due - paid);
            }
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalLoans: loans.length,
          activeLoans: activeCount,
          inArrearsLoans: inArrearsCount,
          completedLoans: completedCount,
          defaultedLoans: defaultedCount,
        },
        financials: {
          totalPrincipal: totalPrincipal.toFixed(2),
          totalCollected: totalCollected.toFixed(2),
          totalOutstanding: totalOutstanding.toFixed(2),
          overdueAmount: overdueAmount.toFixed(2),
          collectionRate: totalPrincipal > 0 
            ? ((totalCollected / (totalCollected + totalOutstanding)) * 100).toFixed(2) + '%'
            : '0%',
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Lampiran A PDF Export (per-loan & bulk)
// ============================================

// Prisma include shape for Lampiran A loan queries
const LAMPIRAN_A_LOAN_INCLUDE = {
  borrower: true as const,
  product: true as const,
  tenant: {
    select: {
      name: true,
      businessAddress: true,
      registrationNumber: true,
      licenseNumber: true,
    },
  },
  scheduleVersions: {
    orderBy: { version: 'desc' as const },
    take: 1,
    include: {
      repayments: {
        orderBy: { dueDate: 'asc' as const },
        include: {
          allocations: true,
        },
      },
    },
  },
  transactions: {
    where: { paymentType: { in: ['REGULAR', 'EARLY_SETTLEMENT'] } },
    orderBy: { paymentDate: 'asc' as const },
    include: {
      allocations: true,
    },
  },
};

/**
 * Build LampiranAData from a loaded loan record.
 * Shared by single-loan and bulk-zip endpoints.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLampiranAData(loan: any): LampiranAData {
  const principal = toSafeNumber(loan.principalAmount);
  const totalAmount = (() => {
    const schedule = loan.scheduleVersions[0];
    if (schedule) {
      return schedule.repayments.reduce((sum: number, rep: { totalDue: unknown }) => safeAdd(sum, toSafeNumber(rep.totalDue)), 0);
    }
    return principal;
  })();
  const totalInterest = safeSubtract(totalAmount, principal);

  const termInYears = safeDivide(loan.term, 12);
  const effectiveAnnualRate = principal > 0 && termInYears > 0
    ? safeMultiply(safeDivide(totalInterest, principal), safeDivide(100, termInYears))
    : toSafeNumber(loan.interestRate);
  const interestRateMonthly = safeRound(safeDivide(effectiveAnnualRate, 12), 2);

  const monthlyPayment = loan.term > 0
    ? safeRound(safeDivide(totalAmount, loan.term), 2)
    : 0;

  const hasDefaultRiskFlag = !!loan.readyForDefault || !!loan.arrearsStartDate;
  const finalLoanStatusCode = getLoanStatusCode(loan.status, hasDefaultRiskFlag);

  const schedule = loan.scheduleVersions[0];
  const scheduledRepayments = schedule?.repayments || [];
  const sortedScheduleReps = [...scheduledRepayments].sort(
    (a: { dueDate: Date }, b: { dueDate: Date }) => a.dueDate.getTime() - b.dueDate.getTime(),
  );

  const arrearsStartDate = loan.arrearsStartDate;
  const defaultReadyDate = loan.defaultReadyDate;

  // Early settlement discount from the loan record
  const earlySettlementDiscount = toSafeNumber(loan.earlySettlementDiscount);

  let runningBalance = totalAmount;
  const repayments: LampiranARepayment[] = loan.transactions.map((tx: {
    totalAmount: unknown;
    paymentDate: Date;
    paymentType: string;
    receiptNumber?: string | null;
    reference?: string | null;
    allocations?: Array<{ lateFee?: unknown; amount: unknown }>;
  }, index: number) => {
    const paymentAmount = toSafeNumber(tx.totalAmount);

    // Sum late fees from this transaction's allocations
    const txLateFee = (tx.allocations || []).reduce(
      (sum: number, alloc: { lateFee?: unknown }) => safeAdd(sum, toSafeNumber(alloc.lateFee)),
      0,
    );

    // Add late fee to the running balance before showing it (late fees increase what's owed)
    if (txLateFee > 0) {
      runningBalance = safeAdd(runningBalance, txLateFee);
    }

    // For early settlement transactions with a discount, subtract the discount from the
    // running balance so the final balance reaches zero
    const isEarlySettlement = tx.paymentType === 'EARLY_SETTLEMENT';
    const txDiscount = (isEarlySettlement && earlySettlementDiscount > 0) ? earlySettlementDiscount : 0;
    if (txDiscount > 0) {
      runningBalance = safeSubtract(runningBalance, txDiscount);
    }

    const balanceBeforePayment = runningBalance;
    runningBalance = safeSubtract(runningBalance, paymentAmount);
    const balanceAfterPayment = Math.max(0, runningBalance);
    const isLastPayment = index === loan.transactions.length - 1;
    const paymentDate = tx.paymentDate;

    let paymentStatusCode: number;

    if (isLastPayment) {
      if (finalLoanStatusCode === 1 || (balanceAfterPayment === 0 && finalLoanStatusCode <= 2)) {
        paymentStatusCode = 1;
      } else {
        paymentStatusCode = finalLoanStatusCode;
      }
    } else {
      if (defaultReadyDate && paymentDate >= defaultReadyDate) {
        paymentStatusCode = 4;
      } else if (arrearsStartDate && paymentDate >= arrearsStartDate) {
        paymentStatusCode = 3;
      } else {
        const correspondingScheduleRep = sortedScheduleReps[index];
        if (correspondingScheduleRep && paymentDate > correspondingScheduleRep.dueDate) {
          paymentStatusCode = 3;
        } else {
          paymentStatusCode = 2;
        }
      }
    }

    return {
      date: tx.paymentDate.toISOString(),
      totalAmount: balanceBeforePayment,
      paymentAmount,
      balanceAfter: balanceAfterPayment,
      receiptNumber: tx.receiptNumber || tx.reference || undefined,
      status: paymentStatusCode,
      lateFee: txLateFee > 0 ? txLateFee : undefined,
      discount: txDiscount > 0 ? txDiscount : undefined,
    };
  });

  return {
    borrower: {
      fullName: loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
        ? loan.borrower.companyName
        : loan.borrower.name,
      icNumber: loan.borrower.icNumber || undefined,
      race: loan.borrower.race || undefined,
      gender: loan.borrower.gender || undefined,
      occupation: loan.borrower.occupation || undefined,
      employmentStatus: loan.borrower.employmentStatus || undefined,
      monthlyIncome: loan.borrower.monthlyIncome?.toString() || undefined,
      address: loan.borrower.address || '',
      isCorporate: loan.borrower.borrowerType === 'CORPORATE',
      companyRegNo: loan.borrower.ssmRegistrationNo || undefined,
      bumiStatus: (() => {
        if (loan.borrower.borrowerType !== 'CORPORATE') return undefined;
        const stored = loan.borrower.bumiStatus;
        if (stored) {
          switch (stored) {
            case 'BUMI': return 'Bumi';
            case 'BUKAN_BUMI': return 'Bukan Bumi';
            case 'ASING': return 'Asing';
            default: return stored;
          }
        }
        const race = (loan.borrower.race || '').toUpperCase();
        if (race.includes('MALAY') || race === 'MELAYU' || race.includes('BUMIPUTRA')) return 'Bumi';
        if (race.includes('BUKAN')) return 'Bukan Bumi';
        if (race.includes('ASING') || race.includes('FOREIGN')) return 'Asing';
        return 'Bukan Bumi';
      })(),
    },
    loan: {
      disbursedAt: loan.disbursementDate?.toISOString() || loan.createdAt.toISOString(),
      principalAmount: principal,
      totalInterest,
      totalAmount,
      interestRateMonthly,
      isSecured: loan.product.loanScheduleType === 'JADUAL_K',
      collateralType: loan.collateralType || undefined,
      collateralValue: loan.collateralValue ? toSafeNumber(loan.collateralValue) : undefined,
      term: loan.term,
      monthlyPayment,
    },
    repayments,
    company: {
      name: loan.tenant.name,
      address: loan.tenant.businessAddress || '',
      regNo: loan.tenant.registrationNumber || undefined,
      licenseNo: loan.tenant.licenseNumber || undefined,
    },
    generatedAt: new Date().toISOString(),
    loanStatus: loan.status,
  };
}

/**
 * Generate Lampiran A (Borrower Account Ledger) PDF for a single loan
 * GET /api/compliance/exports/lampiran-a/:loanId
 */
router.get('/exports/lampiran-a/:loanId', requireAdmin, async (req, res, next) => {
  try {
    const loanId = req.params.loanId as string;
    const tenantId = req.tenantId as string;

    const loan = await prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: LAMPIRAN_A_LOAN_INCLUDE,
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    const lampiranAData = buildLampiranAData(loan);
    const pdfBuffer = await generateLampiranAPdf(lampiranAData);

    // Audit log
    await AuditService.log({
      tenantId,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Loan',
      entityId: loanId,
      newData: {
        documentType: 'LAMPIRAN_A',
        borrowerName: lampiranAData.borrower.fullName,
        borrowerIc: loan.borrower.icNumber,
        loanStatus: loan.status,
      },
      ipAddress: req.ip,
    });

    const icNumber = (loan.borrower.icNumber || 'unknown').replace(/[\s-]/g, '');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Lampiran-A-${icNumber}-${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Bulk export all Lampiran A PDFs as a ZIP archive, filtered by year
 * GET /api/compliance/exports/lampiran-a-bulk?year=2026
 */
router.get('/exports/lampiran-a-bulk', requireAdmin, async (req, res, next) => {
  try {
    const { year, status } = req.query;
    const tenantId = req.tenantId as string;

    const where: Record<string, unknown> = {
      tenantId,
      // Only include disbursed loans (not pending disbursement)
      status: { notIn: ['PENDING_DISBURSEMENT'] },
    };

    if (status) where.status = status;

    // Year filter on agreement/disbursement date
    if (year) {
      const yr = parseInt(year as string);
      if (!isNaN(yr)) {
        const yearStart = new Date(yr, 0, 1);
        const yearEnd = new Date(yr + 1, 0, 1);
        where.OR = [
          { agreementDate: { gte: yearStart, lt: yearEnd } },
          { agreementDate: null, disbursementDate: { gte: yearStart, lt: yearEnd } },
        ];
      }
    }

    const loans = await prisma.loan.findMany({
      where,
      include: LAMPIRAN_A_LOAN_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    if (loans.length === 0) {
      return res.status(404).json({
        success: false,
        error: year
          ? `No loans found for year ${year}`
          : 'No loans found',
      });
    }

    // Generate all PDFs first (before streaming), so errors can be caught cleanly
    const pdfEntries: { filename: string; buffer: Buffer }[] = [];
    for (const loan of loans) {
      try {
        const lampiranAData = buildLampiranAData(loan);
        const pdfBuffer = await generateLampiranAPdf(lampiranAData);

        const icNumber = (loan.borrower.icNumber || 'unknown').replace(/[\s-]/g, '');
        const borrowerName = (loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
          ? loan.borrower.companyName
          : loan.borrower.name
        ).replace(/[/\\?%*:|"<>]/g, '_').substring(0, 50);

        pdfEntries.push({
          filename: `Lampiran-A-${borrowerName}-${icNumber}.pdf`,
          buffer: pdfBuffer,
        });
      } catch (err) {
        console.error(`Failed to generate Lampiran A for loan ${loan.id}:`, err);
      }
    }

    if (pdfEntries.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate any Lampiran A PDFs',
      });
    }

    // Build ZIP in memory, then send as a single response
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      for (const entry of pdfEntries) {
        archive.append(entry.buffer, { name: entry.filename });
      }

      archive.finalize();
    });

    const yearLabel = year || 'All';
    const dateStr = new Date().toISOString().split('T')[0];
    const zipFilename = `Lampiran-A-${yearLabel}-${dateStr}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length.toString());
    res.send(zipBuffer);

    // Audit log (fire-and-forget after response sent)
    AuditService.log({
      tenantId,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Loan',
      entityId: 'bulk-lampiran-a',
      newData: {
        documentType: 'LAMPIRAN_A_BULK',
        year: year || 'all',
        totalLoans: loans.length,
        successCount: pdfEntries.length,
        format: 'ZIP',
      },
      ipAddress: req.ip,
    }).catch(err => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
});

// ============================================
// KPKT CSV Export (iDeal format)
// ============================================

/**
 * Export loans in KPKT format for portal upload
 * GET /api/compliance/exports/kpkt
 */
router.get('/exports/kpkt', requireAdmin, async (req, res, next) => {
  try {
    const { status, startDate, endDate, year } = req.query;

    const where: Record<string, unknown> = {
      tenantId: req.tenantId,
    };

    if (status) where.status = status;

    // Year filter: uses agreementDate (falling back to disbursementDate)
    // to determine which year the loan belongs to
    if (year) {
      const yr = parseInt(year as string);
      if (!isNaN(yr)) {
        const yearStart = new Date(yr, 0, 1);     // Jan 1
        const yearEnd = new Date(yr + 1, 0, 1);   // Jan 1 next year
        // Use OR to match either agreementDate or disbursementDate within the year
        where.OR = [
          { agreementDate: { gte: yearStart, lt: yearEnd } },
          { agreementDate: null, disbursementDate: { gte: yearStart, lt: yearEnd } },
        ];
      }
    } else if (startDate || endDate) {
      // Legacy date range filter (on createdAt)
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate as string);
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate as string);
    }

    const loans = await prisma.loan.findMany({
      where,
      include: {
        borrower: true,
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
      orderBy: { createdAt: 'desc' },
    });

    // KPKT CSV headers (exact column names from contoh_upload.csv template)
    const headers = [
      'JenisPemohon',
      'NamaPemohon',
      'JenisSyarikat',
      'NomborPerniagaan',
      'NoKp',
      'NomborTelefon',
      'Bangsa',
      'Jantina',
      'Pekerjaan',
      'Pendapatan',
      'Majikan',
      'Alamat',
      'StatusCagaran',
      'JenisCagaran',
      'NilaiCagaran',
      'TarikhPinjaman',
      'PinjamanPokok',
      'JumlahFaedahKeseluruhan',
      'JumlahPinjamanKeseluruhan',
      'KadarFaedah',
      'TempohBayaran',
      'BakiPinjamanKeseluruhan',
      'JumlahNpl',
      'Nota',
    ];

    // Helper: format date as DD/MM/YYYY for KPKT
    const formatKPKTDate = (date: Date | null): string => {
      if (!date) return '';
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Helper: format address
    const formatAddress = (address: string | null): string => {
      return address || '';
    };

    const rows = loans.map(loan => {
      const borrower = loan.borrower;
      const isCompany = borrower.borrowerType === 'CORPORATE';

      // Calculate financials
      const principal = toSafeNumber(loan.principalAmount);
      const schedule = loan.scheduleVersions[0];
      const totalAmount = schedule
        ? schedule.repayments.reduce((sum, rep) => safeAdd(sum, toSafeNumber(rep.totalDue)), 0)
        : principal;
      const totalInterest = safeSubtract(totalAmount, principal);

      // Calculate annualized interest rate
      const termInYears = safeDivide(loan.term, 12);
      const annualizedRate = principal > 0 && termInYears > 0
        ? safeRound(safeMultiply(safeDivide(totalInterest, principal), safeDivide(100, termInYears)), 0)
        : safeRound(toSafeNumber(loan.interestRate), 0);

      // Calculate outstanding balance from repayments
      let outstandingBalance = 0;
      if (schedule) {
        for (const rep of schedule.repayments) {
          if (rep.status !== 'PAID') {
            const paid = rep.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
            outstandingBalance = safeAdd(outstandingBalance, safeSubtract(toSafeNumber(rep.totalDue), paid));
          }
        }
      }

      // Determine NPL amount
      const hasDefaultRisk = !!loan.readyForDefault || !!loan.arrearsStartDate;
      const isNPL = loan.status === 'DEFAULTED' || hasDefaultRisk;
      const nplAmount = isNPL ? Math.round(outstandingBalance) : 0;

      // Get Nota
      const nota = getLoanNota(loan.status, hasDefaultRisk);

      // Determine bumiStatus for corporate borrowers
      const corporateBumiStatus = (() => {
        if (!isCompany) return '';
        const stored = borrower.bumiStatus;
        if (stored) {
          switch (stored) {
            case 'BUMI': return 'Bumi';
            case 'BUKAN_BUMI': return 'Bukan Bumi';
            case 'ASING': return 'Asing';
            default: return stored;
          }
        }
        // Fallback: derive from race
        const race = (borrower.race || '').toUpperCase();
        if (race.includes('MALAY') || race === 'MELAYU' || race.includes('BUMIPUTRA')) return 'Bumi';
        if (race.includes('BUKAN')) return 'Bukan Bumi';
        if (race.includes('ASING') || race.includes('FOREIGN')) return 'Asing';
        return 'Bukan Bumi';
      })();

      return [
        isCompany ? 'Syarikat' : 'Individu',                                    // JenisPemohon
        isCompany ? (borrower.companyName || borrower.name) : borrower.name,     // NamaPemohon
        isCompany ? corporateBumiStatus : '',                                    // JenisSyarikat
        isCompany ? (borrower.ssmRegistrationNo || '') : '',                     // NomborPerniagaan
        !isCompany ? borrower.icNumber : '',                                     // NoKp
        !isCompany ? (borrower.phone || '') : '',                                // NomborTelefon
        !isCompany ? getBangsa(borrower.race || undefined) : '',                   // Bangsa
        !isCompany ? getJantina(borrower.gender || undefined) : '',              // Jantina
        !isCompany ? getPekerjaan(borrower.occupation || undefined) : '',        // Pekerjaan
        !isCompany ? (borrower.monthlyIncome?.toString() || '') : '',            // Pendapatan
        !isCompany ? getMajikan(borrower.employmentStatus || undefined) : '',    // Majikan
        !isCompany ? formatAddress(borrower.address) : formatAddress(borrower.businessAddress), // Alamat
        loan.product.loanScheduleType === 'JADUAL_K' ? 'Bercagar' : 'Tidak Bercagar', // StatusCagaran
        loan.collateralType || '',                                               // JenisCagaran
        loan.collateralValue ? Math.round(toSafeNumber(loan.collateralValue)).toString() : '', // NilaiCagaran
        formatKPKTDate(loan.disbursementDate || loan.createdAt),                 // TarikhPinjaman
        Math.round(principal).toString(),                                        // PinjamanPokok
        Math.round(totalInterest).toString(),                                    // JumlahFaedahKeseluruhan
        Math.round(totalAmount).toString(),                                      // JumlahPinjamanKeseluruhan
        annualizedRate.toString(),                                               // KadarFaedah
        loan.term.toString(),                                                    // TempohBayaran
        Math.round(outstandingBalance).toString(),                               // BakiPinjamanKeseluruhan
        nplAmount.toString(),                                                    // JumlahNpl
        nota,                                                                    // Nota
      ];
    });

    // Escape CSV values properly
    const escapeCsvValue = (value: string): string => {
      const cellString = String(value || '');
      if (cellString.includes(',') || cellString.includes('"') || cellString.includes('\n')) {
        return '"' + cellString.replace(/"/g, '""') + '"';
      }
      return cellString;
    };

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCsvValue(cell)).join(',')),
    ].join('\n');

    // Log export action
    await AuditService.log({
      tenantId: req.tenantId as string,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Loan',
      entityId: 'bulk-kpkt',
      newData: { count: loans.length, format: 'KPKT', filters: { status, startDate, endDate } },
      ipAddress: req.ip,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="KPKT_Export_${dateStr}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

// ============================================
// Overdue / NPL Report
// ============================================

/**
 * Export overdue loans report as CSV
 * GET /api/compliance/exports/overdue
 */
router.get('/exports/overdue', requireAdmin, async (req, res, next) => {
  try {
    const now = new Date();
    const tenantId = req.tenantId as string;

    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'IN_ARREARS', 'DEFAULTED'] },
      },
      include: {
        borrower: true,
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              where: {
                status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
                dueDate: { lt: now },
              },
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Loan ID',
      'Borrower Name',
      'IC Number',
      'Phone',
      'Product',
      'Principal (RM)',
      'Outstanding (RM)',
      'Overdue Amount (RM)',
      'Days Overdue',
      'Late Fees (RM)',
      'Overdue Installments',
      'Loan Status',
      'Arrears Since',
      'Default Ready',
    ];

    const rows: string[][] = [];

    for (const loan of loans) {
      const schedule = loan.scheduleVersions[0];
      if (!schedule || schedule.repayments.length === 0) continue;

      const overdueRepayments = schedule.repayments;
      let overdueAmount = 0;
      let totalLateFees = 0;
      let earliestOverdueDate: Date | null = null;

      for (const rep of overdueRepayments) {
        const paid = rep.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
        const remaining = safeSubtract(toSafeNumber(rep.totalDue), paid);
        if (remaining > 0) {
          overdueAmount = safeAdd(overdueAmount, remaining);
          totalLateFees = safeAdd(totalLateFees, toSafeNumber(rep.lateFeeAccrued));
          if (!earliestOverdueDate || rep.dueDate < earliestOverdueDate) {
            earliestOverdueDate = rep.dueDate;
          }
        }
      }

      if (overdueAmount <= 0) continue;

      const daysOverdue = earliestOverdueDate
        ? Math.floor((now.getTime() - earliestOverdueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Calculate total outstanding
      const allRepayments = await prisma.loanRepayment.findMany({
        where: {
          scheduleVersion: { loanId: loan.id },
          status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
        },
        include: { allocations: true },
      });

      let totalOutstanding = 0;
      for (const rep of allRepayments) {
        const paid = rep.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
        totalOutstanding = safeAdd(totalOutstanding, safeSubtract(toSafeNumber(rep.totalDue), paid));
      }

      const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
        ? loan.borrower.companyName
        : loan.borrower.name;

      rows.push([
        loan.id,
        borrowerName,
        loan.borrower.icNumber,
        loan.borrower.phone || '',
        loan.product.name,
        Math.round(toSafeNumber(loan.principalAmount)).toString(),
        safeRound(totalOutstanding, 2).toString(),
        safeRound(overdueAmount, 2).toString(),
        daysOverdue.toString(),
        safeRound(totalLateFees, 2).toString(),
        overdueRepayments.length.toString(),
        loan.status,
        loan.arrearsStartDate?.toISOString().split('T')[0] || '',
        loan.readyForDefault ? 'Yes' : 'No',
      ]);
    }

    const escapeCsvValue = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return `"${value}"`;
    };

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCsvValue(cell)).join(',')),
    ].join('\n');

    await AuditService.log({
      tenantId,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Loan',
      entityId: 'bulk-overdue',
      newData: { count: rows.length, format: 'OVERDUE_REPORT' },
      ipAddress: req.ip,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Overdue_Report_${dateStr}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

// ============================================
// Collection Summary Report
// ============================================

/**
 * Export monthly collection summary as CSV
 * GET /api/compliance/exports/collection-summary
 */
router.get('/exports/collection-summary', requireAdmin, async (req, res, next) => {
  try {
    const { months = '12' } = req.query;
    const numMonths = Math.min(parseInt(months as string) || 12, 24);
    const tenantId = req.tenantId as string;

    // Get all repayments for this tenant's loans with allocations
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1);

    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'IN_ARREARS', 'COMPLETED', 'DEFAULTED'] },
      },
      include: {
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              where: {
                dueDate: { gte: startDate },
              },
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: true,
              },
            },
          },
        },
      },
    });

    // Aggregate by month
    const monthlyData: Record<string, {
      dueAmount: number;
      collectedAmount: number;
      overdueAmount: number;
      nplAmount: number;
      repaymentCount: number;
      paidCount: number;
    }> = {};

    for (const loan of loans) {
      const schedule = loan.scheduleVersions[0];
      if (!schedule) continue;

      const isDefaulted = loan.status === 'DEFAULTED' || !!loan.readyForDefault;

      for (const rep of schedule.repayments) {
        const monthKey = `${rep.dueDate.getFullYear()}-${(rep.dueDate.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { dueAmount: 0, collectedAmount: 0, overdueAmount: 0, nplAmount: 0, repaymentCount: 0, paidCount: 0 };
        }

        const due = toSafeNumber(rep.totalDue);
        const paid = rep.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
        const remaining = safeSubtract(due, paid);

        monthlyData[monthKey].dueAmount = safeAdd(monthlyData[monthKey].dueAmount, due);
        monthlyData[monthKey].collectedAmount = safeAdd(monthlyData[monthKey].collectedAmount, paid);
        monthlyData[monthKey].repaymentCount += 1;

        if (rep.status === 'PAID') {
          monthlyData[monthKey].paidCount += 1;
        }

        if (rep.dueDate < now && remaining > 0) {
          monthlyData[monthKey].overdueAmount = safeAdd(monthlyData[monthKey].overdueAmount, remaining);
          if (isDefaulted) {
            monthlyData[monthKey].nplAmount = safeAdd(monthlyData[monthKey].nplAmount, remaining);
          }
        }
      }
    }

    // Sort months and build CSV
    const sortedMonths = Object.keys(monthlyData).sort();

    const headers = [
      'Month',
      'Due Amount (RM)',
      'Collected Amount (RM)',
      'Collection Rate (%)',
      'Overdue Amount (RM)',
      'NPL Amount (RM)',
      'Total Installments',
      'Paid Installments',
    ];

    const rows = sortedMonths.map(month => {
      const d = monthlyData[month];
      const collectionRate = d.dueAmount > 0
        ? safeRound(safeMultiply(safeDivide(d.collectedAmount, d.dueAmount), 100), 2)
        : 0;

      return [
        month,
        safeRound(d.dueAmount, 2).toString(),
        safeRound(d.collectedAmount, 2).toString(),
        `${collectionRate}`,
        safeRound(d.overdueAmount, 2).toString(),
        safeRound(d.nplAmount, 2).toString(),
        d.repaymentCount.toString(),
        d.paidCount.toString(),
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    await AuditService.log({
      tenantId,
      memberId: req.user!.memberId,
      action: 'EXPORT',
      entityType: 'Loan',
      entityId: 'bulk-collection-summary',
      newData: { months: numMonths, format: 'COLLECTION_SUMMARY' },
      ipAddress: req.ip,
    });

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Collection_Summary_${dateStr}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
