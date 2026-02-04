import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { AuditService } from './auditService.js';

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
      'Product',
      'Principal',
      'Interest Rate',
      'Term (months)',
      'Status',
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
        loan.product.name,
        loan.principalAmount.toString(),
        `${loan.interestRate}%`,
        loan.term.toString(),
        loan.status,
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
        status: { in: ['ACTIVE', 'COMPLETED', 'DEFAULTED'] },
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

    const now = new Date();

    for (const loan of loans) {
      totalPrincipal += Number(loan.principalAmount);

      if (loan.status === 'ACTIVE') activeCount++;
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

export default router;
