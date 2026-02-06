import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import https from 'https';
import http from 'http';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';
import { generateSchedule } from '../schedules/service.js';
import { parseDocumentUpload, parseFileUpload, saveDocumentFile, deleteDocumentFile, UPLOAD_DIR } from '../../lib/upload.js';
import { AuditService } from '../compliance/auditService.js';
import { toSafeNumber, safeRound, safeMultiply, safeDivide, safeAdd, safeSubtract, calculateFlatInterest, calculateEMI } from '../../lib/math.js';
import { createHash } from 'crypto';

const router = Router();

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requireActiveSubscription);

// Validation schemas
const createApplicationSchema = z.object({
  borrowerId: z.string(),
  productId: z.string(),
  amount: z.number().positive(),
  term: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
  collateralType: z.string().max(200).optional(),
  collateralValue: z.number().positive().optional(),
});

const updateApplicationSchema = z.object({
  amount: z.number().positive().optional(),
  term: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
  collateralType: z.string().max(200).optional().nullable(),
  collateralValue: z.number().positive().optional().nullable(),
});

const disburseSchema = z.object({
  disbursementDate: z.string().datetime().optional(),
  reference: z.string().max(100).optional(), // Auto-generated or custom reference
});

const previewSchema = z.object({
  productId: z.string(),
  amount: z.number().positive(),
  term: z.number().int().positive(),
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

// Type definitions for discharge letter generation
interface DischargeLetterParams {
  loan: {
    id: string;
    principalAmount: unknown;
    interestRate: unknown;
    term: number;
    disbursementDate: Date | null;
    completedAt: Date;
  };
  borrower: {
    displayName: string;
    identificationNumber: string | null;
    address: string | null;
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
  totalPaid: number;
  totalLateFees: number;
  dischargeNotes: string | null;
}

// Generate and store discharge letter PDF
async function generateAndStoreDischargeLetteringLetter(params: DischargeLetterParams): Promise<string> {
  const { loan, borrower, tenant, totalPaid, totalLateFees, dischargeNotes } = params;
  
  // Ensure discharge letters directory exists
  const lettersDir = path.join(UPLOAD_DIR, 'discharge-letters');
  if (!fs.existsSync(lettersDir)) {
    fs.mkdirSync(lettersDir, { recursive: true });
  }

  // Generate filename with date
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `DIS-${dateStr}-${loan.id.substring(0, 8)}.pdf`;
  const filePath = path.join(lettersDir, filename);

  // Format currency helper
  const formatRM = (amount: unknown): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    return `RM ${num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date helper
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' });
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

      // Header - Company Info (right-aligned if logo present)
      const headerX = logoAdded ? 350 : 50;
      const headerAlign = logoAdded ? 'right' as const : 'center' as const;
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

      // Letter Title
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000')
         .text('LETTER OF DISCHARGE', 50, doc.y, { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#6B7280')
         .text(`Ref: ${loan.id}`, { align: 'center' });

      // Date
      doc.moveDown(1.5);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`Date: ${formatDate(loan.completedAt)}`, { align: 'left' });

      // Recipient
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').text(borrower.displayName);
      if (borrower.identificationNumber) {
        doc.font('Helvetica').text(`IC/SSM: ${borrower.identificationNumber}`);
      }
      if (borrower.address) {
        doc.text(borrower.address);
      }

      // Letter Body
      doc.moveDown(2);
      doc.font('Helvetica').text('Dear Sir/Madam,', { align: 'left' });

      doc.moveDown(1);
      doc.font('Helvetica-Bold').text('RE: FULL SETTLEMENT AND DISCHARGE OF LOAN', { align: 'left' });

      doc.moveDown(1);
      doc.font('Helvetica').text(
        `We are pleased to confirm that the loan facility extended to you has been fully settled and discharged.`,
        { align: 'justify' }
      );

      // Loan Details Box
      doc.moveDown(1.5);
      const boxY = doc.y;
      doc.rect(50, boxY, 500, 100).fill('#F9FAFB');
      
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
         .text('LOAN DETAILS', 70, boxY + 15);
      
      doc.moveDown(0.8);
      const detailsY = doc.y;
      doc.fontSize(9).font('Helvetica').fillColor('#6B7280');
      
      // Left column
      doc.text('Loan Reference:', 70, detailsY);
      doc.text('Principal Amount:', 70, detailsY + 15);
      doc.text('Interest Rate:', 70, detailsY + 30);
      doc.text('Term:', 70, detailsY + 45);
      
      // Left values
      doc.font('Helvetica-Bold').fillColor('#000000');
      doc.text(loan.id.substring(0, 12), 180, detailsY);
      doc.text(formatRM(loan.principalAmount), 180, detailsY + 15);
      doc.text(`${toSafeNumber(loan.interestRate)}% p.a.`, 180, detailsY + 30);
      doc.text(`${loan.term} months`, 180, detailsY + 45);
      
      // Right column
      doc.font('Helvetica').fillColor('#6B7280');
      doc.text('Disbursement Date:', 320, detailsY);
      doc.text('Settlement Date:', 320, detailsY + 15);
      doc.text('Total Amount Paid:', 320, detailsY + 30);
      if (totalLateFees > 0) {
        doc.text('Late Fees Paid:', 320, detailsY + 45);
      }
      
      // Right values
      doc.font('Helvetica-Bold').fillColor('#000000');
      doc.text(loan.disbursementDate ? formatDate(loan.disbursementDate) : 'N/A', 440, detailsY);
      doc.text(formatDate(loan.completedAt), 440, detailsY + 15);
      doc.text(formatRM(totalPaid), 440, detailsY + 30);
      if (totalLateFees > 0) {
        doc.text(formatRM(totalLateFees), 440, detailsY + 45);
      }

      // Move past the box
      doc.y = boxY + 115;

      // Confirmation paragraph
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(
           `This letter confirms that all obligations under the above loan facility have been fully satisfied. ` +
           `You are hereby released and discharged from any further liability in respect of this loan.`,
           50, doc.y, { align: 'justify' }
         );

      doc.moveDown(1);
      doc.text(
        `Please retain this letter for your records as proof of full settlement.`,
        { align: 'justify' }
      );

      // Notes if any
      if (dischargeNotes) {
        doc.moveDown(1.5);
        doc.font('Helvetica-Bold').text('Notes:', { align: 'left' });
        doc.font('Helvetica').text(dischargeNotes, { align: 'left' });
      }

      // Closing
      doc.moveDown(2);
      doc.font('Helvetica').text('Thank you for your patronage.', { align: 'left' });

      doc.moveDown(2);
      doc.text('Yours faithfully,', { align: 'left' });
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text(tenant.name, { align: 'left' });

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF');
      doc.text('This is a computer-generated letter. No signature required.', 50, 750, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica').fillColor('#3B82F6')
         .text('Powered by TrueKredit', 50, doc.y, { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        resolve(`/api/uploads/discharge-letters/${filename}`);
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * List loan applications
 * GET /api/loans/applications
 */
router.get('/applications', async (req, res, next) => {
  try {
    const { status, search, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(status && { status: status as 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED' }),
      ...(search && {
        borrower: {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' as const } },
            { icNumber: { contains: search as string } },
            { companyName: { contains: search as string, mode: 'insensitive' as const } },
          ],
        },
      }),
    };

    const [applications, total] = await Promise.all([
      prisma.loanApplication.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          borrower: { select: { id: true, name: true, borrowerType: true, icNumber: true, documentType: true, companyName: true } },
          product: { select: { id: true, name: true, interestModel: true, interestRate: true } },
        },
      }),
      prisma.loanApplication.count({ where }),
    ]);

    res.json({
      success: true,
      data: applications,
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
 * Preview loan calculation (fees, monthly payment, net disbursement)
 * POST /api/loans/applications/preview
 */
router.post('/applications/preview', async (req, res, next) => {
  try {
    const data = previewSchema.parse(req.body);

    // Verify product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        tenantId: req.tenantId,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    // Validate amount and term against product limits
    if (data.amount < toSafeNumber(product.minAmount) || data.amount > toSafeNumber(product.maxAmount)) {
      throw new BadRequestError(
        `Amount must be between ${product.minAmount} and ${product.maxAmount}`
      );
    }

    if (data.term < product.minTerm || data.term > product.maxTerm) {
      throw new BadRequestError(
        `Term must be between ${product.minTerm} and ${product.maxTerm} months`
      );
    }

    const loanAmount = data.amount;
    const term = data.term;
    const interestRate = toSafeNumber(product.interestRate);

    // Calculate fees
    const legalFeeValue = toSafeNumber(product.legalFeeValue);
    const stampingFeeValue = toSafeNumber(product.stampingFeeValue);

    const legalFee = product.legalFeeType === 'PERCENTAGE'
      ? safeMultiply(loanAmount, safeDivide(legalFeeValue, 100))
      : legalFeeValue;

    const stampingFee = product.stampingFeeType === 'PERCENTAGE'
      ? safeMultiply(loanAmount, safeDivide(stampingFeeValue, 100))
      : stampingFeeValue;

    const totalFees = safeAdd(legalFee, stampingFee);
    const netDisbursement = safeSubtract(loanAmount, totalFees);

    // Calculate monthly payment based on interest model
    let monthlyPayment: number;
    let totalInterest: number;
    let totalPayable: number;

    if (product.interestModel === 'FLAT') {
      // Flat interest: Principal × Rate × Term / 12
      totalInterest = calculateFlatInterest(loanAmount, interestRate, term);
      totalPayable = safeAdd(loanAmount, totalInterest);
      monthlyPayment = safeDivide(totalPayable, term);
    } else {
      // Declining balance EMI
      monthlyPayment = calculateEMI(loanAmount, interestRate, term);
      totalPayable = safeMultiply(monthlyPayment, term);
      totalInterest = safeSubtract(totalPayable, loanAmount);
    }

    res.json({
      success: true,
      data: {
        loanAmount,
        term,
        interestRate,
        interestModel: product.interestModel,
        // Fees
        legalFee,
        legalFeeType: product.legalFeeType,
        stampingFee,
        stampingFeeType: product.stampingFeeType,
        totalFees,
        netDisbursement,
        // Repayment
        monthlyPayment,
        totalInterest,
        totalPayable,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Create loan application
 * POST /api/loans/applications
 */
router.post('/applications', async (req, res, next) => {
  try {
    const data = createApplicationSchema.parse(req.body);

    // Verify borrower exists and belongs to tenant
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: data.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    // Verify product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        tenantId: req.tenantId,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    // Validate amount and term against product limits
    if (data.amount < Number(product.minAmount) || data.amount > Number(product.maxAmount)) {
      throw new BadRequestError(
        `Amount must be between ${product.minAmount} and ${product.maxAmount}`
      );
    }

    if (data.term < product.minTerm || data.term > product.maxTerm) {
      throw new BadRequestError(
        `Term must be between ${product.minTerm} and ${product.maxTerm} months`
      );
    }

    const application = await prisma.loanApplication.create({
      data: {
        tenantId: req.tenantId!,
        borrowerId: data.borrowerId,
        productId: data.productId,
        amount: data.amount,
        term: data.term,
        notes: data.notes,
        status: 'DRAFT',
        collateralType: data.collateralType,
        collateralValue: data.collateralValue,
      },
      include: {
        borrower: { select: { id: true, name: true, borrowerType: true, icNumber: true, documentType: true, companyName: true } },
        product: { select: { id: true, name: true, interestModel: true, interestRate: true, loanScheduleType: true } },
      },
    });

    // Log to audit trail
    // For corporate borrowers, use companyName instead of rep name
    const borrowerDisplayName = borrower.borrowerType === 'CORPORATE' && borrower.companyName
      ? borrower.companyName
      : borrower.name;
    
    await AuditService.logCreate(
      req.tenantId!,
      req.memberId!,
      'LoanApplication',
      application.id,
      {
        borrowerId: data.borrowerId,
        borrowerName: borrowerDisplayName,
        productId: data.productId,
        productName: product.name,
        amount: data.amount,
        term: data.term,
        status: 'DRAFT',
      },
      req.ip
    );

    res.status(201).json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single application
 * GET /api/loans/applications/:applicationId
 */
router.get('/applications/:applicationId', async (req, res, next) => {
  try {
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        product: true,
        loan: {
          include: {
            scheduleVersions: {
              orderBy: { version: 'desc' },
              take: 1,
              include: {
                repayments: {
                  orderBy: { dueDate: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    res.json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update application
 * PATCH /api/loans/applications/:applicationId
 */
router.patch('/applications/:applicationId', async (req, res, next) => {
  try {
    const data = updateApplicationSchema.parse(req.body);

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'DRAFT') {
      throw new BadRequestError('Can only update draft applications');
    }

    // Validate amount and term if provided
    if (data.amount !== undefined) {
      if (data.amount < Number(application.product.minAmount) || 
          data.amount > Number(application.product.maxAmount)) {
        throw new BadRequestError(
          `Amount must be between ${application.product.minAmount} and ${application.product.maxAmount}`
        );
      }
    }

    if (data.term !== undefined) {
      if (data.term < application.product.minTerm || 
          data.term > application.product.maxTerm) {
        throw new BadRequestError(
          `Term must be between ${application.product.minTerm} and ${application.product.maxTerm} months`
        );
      }
    }

    // Capture previous data for audit
    const previousData = {
      amount: application.amount,
      term: application.term,
      notes: application.notes,
    };

    const updated = await prisma.loanApplication.update({
      where: { id: req.params.applicationId },
      data,
      include: {
        borrower: { select: { id: true, name: true, borrowerType: true, icNumber: true, documentType: true, companyName: true } },
        product: { select: { id: true, name: true, interestModel: true, interestRate: true } },
      },
    });

    // Log to audit trail
    await AuditService.logUpdate(
      req.tenantId!,
      req.memberId!,
      'LoanApplication',
      application.id,
      previousData,
      data,
      req.ip
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Submit application for approval
 * POST /api/loans/applications/:applicationId/submit
 */
router.post('/applications/:applicationId/submit', async (req, res, next) => {
  try {
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'DRAFT') {
      throw new BadRequestError('Can only submit draft applications');
    }

    const updated = await prisma.loanApplication.update({
      where: { id: req.params.applicationId },
      data: { status: 'SUBMITTED' },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'SUBMIT',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: 'DRAFT' },
      newData: { status: 'SUBMITTED' },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Approve application and create loan with schedule
 * POST /api/loans/applications/:applicationId/approve
 */
router.post('/applications/:applicationId/approve', async (req, res, next) => {
  try {
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status !== 'SUBMITTED' && application.status !== 'UNDER_REVIEW') {
      throw new BadRequestError('Can only approve submitted applications');
    }

    const previousStatus = application.status;

    // Create loan with initial schedule in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update application status
      await tx.loanApplication.update({
        where: { id: application.id },
        data: { status: 'APPROVED' },
      });

      // Create loan (copy collateral fields for Jadual K products)
      const loan = await tx.loan.create({
        data: {
          tenantId: req.tenantId!,
          borrowerId: application.borrowerId,
          productId: application.productId,
          applicationId: application.id,
          principalAmount: application.amount,
          interestRate: application.product.interestRate,
          term: application.term,
          status: 'PENDING_DISBURSEMENT',
          collateralType: application.collateralType,
          collateralValue: application.collateralValue,
        },
      });

      return loan;
    });

    // Log application approval to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'APPROVE',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: previousStatus },
      newData: { status: 'APPROVED', loanId: result.id },
      ipAddress: req.ip,
    });

    // Log loan creation to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'CREATE',
      entityType: 'Loan',
      entityId: result.id,
      previousData: null,
      newData: {
        principalAmount: Number(application.amount),
        interestRate: Number(application.product.interestRate),
        term: application.term,
        status: 'PENDING_DISBURSEMENT',
        applicationId: application.id,
        borrowerId: application.borrowerId,
        productId: application.productId,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Reject application
 * POST /api/loans/applications/:applicationId/reject
 */
router.post('/applications/:applicationId/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;

    const application = await prisma.loanApplication.findFirst({
      where: {
        id: req.params.applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    if (application.status === 'APPROVED' || application.status === 'REJECTED') {
      throw new BadRequestError('Cannot reject this application');
    }

    const previousStatus = application.status;

    const updated = await prisma.loanApplication.update({
      where: { id: req.params.applicationId },
      data: {
        status: 'REJECTED',
        notes: reason ? `${application.notes || ''}\n\nRejection reason: ${reason}` : application.notes,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'REJECT',
      entityType: 'LoanApplication',
      entityId: application.id,
      previousData: { status: previousStatus },
      newData: { status: 'REJECTED', reason: reason || null },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Application Timeline
// ============================================

/**
 * Get application activity timeline
 * GET /api/loans/applications/:applicationId/timeline
 */
router.get('/applications/:applicationId/timeline', async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId;
    const { cursor, limit: limitStr = '10' } = req.query;
    const limit = Math.min(parseInt(limitStr as string, 10), 50);

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    // Fetch audit logs for this application with cursor-based pagination
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        entityType: 'LoanApplication',
        entityId: applicationId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine hasMore
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

    const hasMore = auditLogs.length > limit;
    const items = hasMore ? auditLogs.slice(0, limit) : auditLogs;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    // Transform to timeline format
    const timeline = items.map(log => ({
      id: log.id,
      action: log.action,
      previousData: log.previousData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.member?.user ? {
        id: log.member.user.id,
        email: log.member.user.email,
        name: log.member.user.name,
      } : null,
    }));

    res.json({
      success: true,
      data: timeline,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Application Documents
// ============================================

/**
 * Upload document to application
 * POST /api/loans/applications/:applicationId/documents
 */
router.post('/applications/:applicationId/documents', async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId;

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    // Parse the file upload
    const { buffer, originalName, mimeType, category } = await parseDocumentUpload(req);

    // Validate category against product's required documents
    const requiredDocs = application.product.requiredDocuments as Array<{ key: string; label: string; required: boolean }>;
    const validCategory = requiredDocs.some(doc => doc.key === category) || category === 'OTHER';
    
    if (!validCategory) {
      throw new BadRequestError(`Invalid document category: ${category}`);
    }

    // Save the file
    const extension = path.extname(originalName).toLowerCase();
    const { filename, path: filePath } = saveDocumentFile(buffer, req.tenantId!, applicationId, extension);

    // Create document record
    const document = await prisma.applicationDocument.create({
      data: {
        tenantId: req.tenantId!,
        applicationId,
        filename,
        originalName,
        mimeType,
        size: buffer.length,
        path: filePath,
        category,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'DOCUMENT_UPLOAD',
      entityType: 'LoanApplication',
      entityId: applicationId,
      newData: {
        documentId: document.id,
        category,
        originalName,
        mimeType,
        size: buffer.length,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List documents for application
 * GET /api/loans/applications/:applicationId/documents
 */
router.get('/applications/:applicationId/documents', async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId;

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    const documents = await prisma.applicationDocument.findMany({
      where: {
        applicationId,
        tenantId: req.tenantId,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete document from application
 * DELETE /api/loans/applications/:applicationId/documents/:documentId
 */
router.delete('/applications/:applicationId/documents/:documentId', async (req, res, next) => {
  try {
    const { applicationId, documentId } = req.params;

    // Verify application exists and belongs to tenant
    const application = await prisma.loanApplication.findFirst({
      where: {
        id: applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    // Find the document
    const document = await prisma.applicationDocument.findFirst({
      where: {
        id: documentId,
        applicationId,
        tenantId: req.tenantId,
      },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Delete the file from storage
    deleteDocumentFile(document.path);

    // Delete the document record
    await prisma.applicationDocument.delete({
      where: { id: documentId },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'DOCUMENT_DELETE',
      entityType: 'LoanApplication',
      entityId: applicationId,
      previousData: {
        documentId: document.id,
        category: document.category,
        originalName: document.originalName,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Document deleted',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Loans
// ============================================

/**
 * List loans
 * GET /api/loans
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, page = '1', pageSize = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(status && { status: status as 'PENDING_DISBURSEMENT' | 'ACTIVE' | 'IN_ARREARS' | 'COMPLETED' | 'DEFAULTED' | 'WRITTEN_OFF' }),
    };

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          borrower: { select: { id: true, name: true, borrowerType: true, icNumber: true, documentType: true, companyName: true } },
          product: { select: { id: true, name: true } },
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              repayments: {
                select: { status: true },
              },
            },
          },
        },
      }),
      prisma.loan.count({ where: where }),
    ]);

    // Transform loans to include progress data
    const loansWithProgress = loans.map(loan => {
      const schedule = loan.scheduleVersions[0];
      const repayments = schedule?.repayments || [];
      const totalRepayments = repayments.length;
      const paidCount = repayments.filter(r => r.status === 'PAID').length;
      const readyToComplete = totalRepayments > 0 && paidCount === totalRepayments && 
        (loan.status === 'ACTIVE' || loan.status === 'IN_ARREARS');
      
      // Remove scheduleVersions from response to keep it clean
      const { scheduleVersions, ...loanData } = loan;
      
      return {
        ...loanData,
        progress: {
          paidCount,
          totalRepayments,
          progressPercent: totalRepayments > 0 ? safeRound(safeDivide(paidCount, totalRepayments) * 100, 1) : 0,
          readyToComplete,
        },
      };
    });

    res.json({
      success: true,
      data: loansWithProgress,
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
 * Get single loan with schedule
 * GET /api/loans/:loanId
 */
router.get('/:loanId', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        product: true,
        application: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          include: {
            repayments: {
              orderBy: { dueDate: 'asc' },
              include: {
                allocations: {
                  include: {
                    transaction: true, // Include transaction with receipt and proof of payment
                  },
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

    res.json({
      success: true,
      data: loan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update loan status based on overdue repayments (arrears/default check)
 * POST /api/loans/:loanId/update-status
 * 
 * This endpoint checks overdue repayments and updates loan status:
 * - ACTIVE -> IN_ARREARS if any repayment is overdue past arrearsPeriod
 * - IN_ARREARS -> DEFAULTED if any repayment is overdue past defaultPeriod
 * - IN_ARREARS -> ACTIVE if all overdue repayments are now paid
 */
router.post('/:loanId/update-status', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Only check active or in-arrears loans
    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      return res.json({
        success: true,
        data: { 
          loanId: loan.id, 
          status: loan.status, 
          message: 'Status check not applicable for this loan status' 
        },
      });
    }

    const currentSchedule = loan.scheduleVersions[0];
    if (!currentSchedule) {
      return res.json({
        success: true,
        data: { 
          loanId: loan.id, 
          status: loan.status, 
          message: 'No schedule found' 
        },
      });
    }

    const now = new Date();
    const arrearsPeriod = loan.product.arrearsPeriod;
    const defaultPeriod = loan.product.defaultPeriod;
    let oldestOverdueDays = 0;
    let hasUnpaidOverdue = false;

    // Check each repayment for overdue status
    for (const repayment of currentSchedule.repayments) {
      if (repayment.status === 'PAID') continue;

      const dueDate = new Date(repayment.dueDate);
      if (now > dueDate) {
        const totalPaid = repayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
        const totalDue = toSafeNumber(repayment.totalDue);
        const remaining = totalDue - totalPaid;

        if (remaining > 0.01) { // Still has balance
          hasUnpaidOverdue = true;
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysOverdue > oldestOverdueDays) {
            oldestOverdueDays = daysOverdue;
          }
        }
      }
    }

    // Determine new status
    let newStatus: string = loan.status;
    let statusChanged = false;

    if (oldestOverdueDays > defaultPeriod) {
      newStatus = 'DEFAULTED';
    } else if (oldestOverdueDays > arrearsPeriod) {
      newStatus = 'IN_ARREARS';
    } else if (!hasUnpaidOverdue && loan.status === 'IN_ARREARS') {
      // No more overdue repayments, can return to ACTIVE
      newStatus = 'ACTIVE';
    }

    if (newStatus !== loan.status) {
      statusChanged = true;
      const previousStatus = loan.status;

      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: newStatus as 'ACTIVE' | 'IN_ARREARS' | 'DEFAULTED' },
      });

      // Log to audit trail
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'STATUS_UPDATE',
        entityType: 'Loan',
        entityId: loan.id,
        previousData: { status: previousStatus },
        newData: { 
          status: newStatus, 
          oldestOverdueDays,
          arrearsPeriod,
          defaultPeriod,
        },
        ipAddress: req.ip,
      });
    }

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        previousStatus: loan.status,
        newStatus,
        statusChanged,
        oldestOverdueDays,
        arrearsPeriod,
        defaultPeriod,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Bulk update loan statuses for all active/in-arrears loans (admin utility)
 * POST /api/loans/update-all-statuses
 */
router.post('/update-all-statuses', async (req, res, next) => {
  try {
    // Get all active and in-arrears loans for this tenant
    const loans = await prisma.loan.findMany({
      where: {
        tenantId: req.tenantId,
        status: { in: ['ACTIVE', 'IN_ARREARS'] },
      },
      include: {
        product: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: { allocations: true },
            },
          },
        },
      },
    });

    const results: Array<{
      loanId: string;
      status?: string;
      previousStatus?: string;
      newStatus?: string;
      changed: boolean;
      reason?: string;
      oldestOverdueDays?: number;
    }> = [];
    const now = new Date();

    for (const loan of loans) {
      const currentSchedule = loan.scheduleVersions[0];
      if (!currentSchedule) {
        results.push({ loanId: loan.id, status: loan.status, changed: false, reason: 'No schedule' });
        continue;
      }

      const arrearsPeriod = loan.product.arrearsPeriod;
      const defaultPeriod = loan.product.defaultPeriod;
      let oldestOverdueDays = 0;
      let hasUnpaidOverdue = false;

      for (const repayment of currentSchedule.repayments) {
        if (repayment.status === 'PAID') continue;

        const dueDate = new Date(repayment.dueDate);
        if (now > dueDate) {
          const totalPaid = repayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
          const totalDue = toSafeNumber(repayment.totalDue);
          if (totalDue - totalPaid > 0.01) {
            hasUnpaidOverdue = true;
            const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOverdue > oldestOverdueDays) {
              oldestOverdueDays = daysOverdue;
            }
          }
        }
      }

      let newStatus: string = loan.status;
      if (oldestOverdueDays > defaultPeriod) {
        newStatus = 'DEFAULTED';
      } else if (oldestOverdueDays > arrearsPeriod) {
        newStatus = 'IN_ARREARS';
      } else if (!hasUnpaidOverdue && loan.status === 'IN_ARREARS') {
        newStatus = 'ACTIVE';
      }

      if (newStatus !== loan.status) {
        const previousStatus = loan.status;
        await prisma.loan.update({
          where: { id: loan.id },
          data: { status: newStatus as 'ACTIVE' | 'IN_ARREARS' | 'DEFAULTED' },
        });

        await AuditService.log({
          tenantId: req.tenantId!,
          memberId: req.memberId,
          action: 'STATUS_UPDATE',
          entityType: 'Loan',
          entityId: loan.id,
          previousData: { status: previousStatus },
          newData: { status: newStatus, oldestOverdueDays },
          ipAddress: req.ip,
        });

        results.push({ loanId: loan.id, previousStatus, newStatus, changed: true, oldestOverdueDays });
      } else {
        results.push({ loanId: loan.id, status: loan.status, changed: false, oldestOverdueDays });
      }
    }

    res.json({
      success: true,
      data: {
        totalChecked: loans.length,
        totalUpdated: results.filter(r => r.changed).length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Preview schedule for a loan (before disbursement)
 * GET /api/loans/:loanId/schedule/preview
 */
router.get('/:loanId/schedule/preview', async (req, res, next) => {
  try {
    const { disbursementDate: disbursementDateStr } = req.query;
    const disbursementDate = disbursementDateStr 
      ? new Date(disbursementDateStr as string) 
      : new Date();

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Generate preview schedule
    const scheduleOutput = generateSchedule({
      principal: Number(loan.principalAmount),
      interestRate: Number(loan.interestRate),
      term: loan.term,
      disbursementDate,
      interestModel: loan.product.interestModel,
    });

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        principal: loan.principalAmount,
        interestRate: loan.interestRate,
        term: loan.term,
        interestModel: loan.product.interestModel,
        disbursementDate: disbursementDate.toISOString(),
        ...scheduleOutput,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get loan activity timeline
 * GET /api/loans/:loanId/timeline
 */
router.get('/:loanId/timeline', async (req, res, next) => {
  try {
    const loanId = req.params.loanId;
    const { cursor, limit: limitStr = '20' } = req.query;
    const limit = Math.min(parseInt(limitStr as string, 10), 50);

    // Verify loan exists and belongs to tenant
    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Fetch audit logs for this loan with cursor-based pagination
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId,
        entityType: 'Loan',
        entityId: loanId,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
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

    const hasMore = auditLogs.length > limit;
    const items = hasMore ? auditLogs.slice(0, limit) : auditLogs;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    const timeline = items.map(log => ({
      id: log.id,
      action: log.action,
      previousData: log.previousData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.member?.user ? {
        id: log.member.user.id,
        email: log.member.user.email,
        name: log.member.user.name,
      } : null,
    }));

    res.json({
      success: true,
      data: timeline,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get loan metrics (repayment rate, totals, etc.)
 * GET /api/loans/:loanId/metrics
 */
router.get('/:loanId/metrics', async (req, res, next) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
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

    for (const repayment of currentSchedule.repayments) {
      const repaymentTotalDue = toSafeNumber(repayment.totalDue);
      const repaymentPaid = repayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
      const remaining = repaymentTotalDue - repaymentPaid;

      totalDue += repaymentTotalDue;
      totalPaid += repaymentPaid;
      totalOutstanding += Math.max(0, remaining);

      if (repayment.status === 'PAID') {
        paidCount++;
        // Check if paid on time (before or on due date)
        const lastPaymentDate = repayment.allocations.length > 0
          ? repayment.allocations[repayment.allocations.length - 1].allocatedAt
          : null;
        if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
          paidOnTime++;
        } else {
          paidLate++;
        }
      } else if (repayment.dueDate < now && remaining > 0) {
        overdueCount++;
        const daysOverdue = Math.floor((now.getTime() - repayment.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > oldestOverdueDays) {
          oldestOverdueDays = daysOverdue;
        }
      } else {
        pendingCount++;
      }
    }

    const totalScheduled = paidCount + overdueCount + pendingCount;
    const repaymentRate = totalScheduled > 0 ? safeMultiply(safeDivide(paidOnTime, paidOnTime + paidLate + overdueCount), 100) : 0;

    // Determine arrears/default status
    const arrearsPeriod = loan.product.arrearsPeriod;
    const defaultPeriod = loan.product.defaultPeriod;
    const isInArrears = oldestOverdueDays > arrearsPeriod;
    const isDefaulted = oldestOverdueDays > defaultPeriod;

    res.json({
      success: true,
      data: {
        loanId: loan.id,
        status: loan.status,
        hasSchedule: true,
        // Totals
        totalDue: safeRound(totalDue, 2),
        totalPaid: safeRound(totalPaid, 2),
        totalOutstanding: safeRound(totalOutstanding, 2),
        totalLateFees: safeRound(totalLateFees, 2),
        // Counts
        paidCount,
        pendingCount,
        overdueCount,
        totalRepayments: currentSchedule.repayments.length,
        // Performance
        repaymentRate: safeRound(repaymentRate, 1),
        paidOnTime,
        paidLate,
        // Overdue status
        oldestOverdueDays,
        arrearsPeriod,
        defaultPeriod,
        isInArrears,
        isDefaulted,
        // Progress
        progressPercent: safeRound(safeDivide(totalPaid, totalDue) * 100, 1),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Complete/discharge loan after all payments
 * POST /api/loans/:loanId/complete
 */
router.post('/:loanId/complete', async (req, res, next) => {
  try {
    const { notes } = req.body;

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        tenant: true,
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            repayments: {
              include: { allocations: true },
            },
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'COMPLETED') {
      throw new BadRequestError('Loan is already completed');
    }

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Can only complete active or in-arrears loans');
    }

    // Verify all repayments are paid
    const currentSchedule = loan.scheduleVersions[0];
    if (currentSchedule) {
      const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== 'PAID');
      if (unpaidRepayments.length > 0) {
        throw new BadRequestError(`Cannot complete loan: ${unpaidRepayments.length} unpaid repayment(s) remaining`);
      }
    }

    // Calculate repayment rate for metrics
    let paidOnTime = 0;
    let paidLate = 0;
    let totalPaid = 0;
    if (currentSchedule) {
      for (const repayment of currentSchedule.repayments) {
        const lastPaymentDate = repayment.allocations.length > 0
          ? repayment.allocations[repayment.allocations.length - 1].allocatedAt
          : null;
        if (lastPaymentDate && lastPaymentDate <= repayment.dueDate) {
          paidOnTime++;
        } else {
          paidLate++;
        }
        // Sum up all payments
        totalPaid = safeAdd(totalPaid, repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0));
      }
    }
    const totalPayments = paidOnTime + paidLate;
    const repaymentRate = totalPayments > 0 ? safeMultiply(safeDivide(paidOnTime, totalPayments), 100) : 100;

    const previousStatus = loan.status;
    const completedAt = new Date();

    const updatedLoan = await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        dischargeNotes: notes || null,
        repaymentRate,
      },
    });

    // Generate discharge letter
    const borrower = loan.borrower;
    const totalLateFees = toSafeNumber(loan.totalLateFees);
    
    let dischargeLetterPath: string | null = null;
    try {
      dischargeLetterPath = await generateAndStoreDischargeLetteringLetter({
        loan: {
          id: loan.id,
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          term: loan.term,
          disbursementDate: loan.disbursementDate,
          completedAt,
        },
        borrower: {
          displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName 
            ? borrower.companyName 
            : borrower.name,
          identificationNumber: borrower.icNumber,
          address: borrower.address,
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
        totalPaid,
        totalLateFees,
        dischargeNotes: notes || null,
      });

      // Update loan with discharge letter path
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          dischargeLetterPath,
          dischargeLetterGenAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to generate discharge letter:', error);
      // Continue without failing - letter generation is not critical
    }

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'COMPLETE',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: previousStatus },
      newData: { 
        status: 'COMPLETED', 
        notes: notes || null, 
        repaymentRate,
        dischargeLetterGenerated: !!dischargeLetterPath,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        ...updatedLoan,
        dischargeLetterPath,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Download discharge letter for a completed loan
 * GET /api/loans/:loanId/discharge-letter
 */
router.get('/:loanId/discharge-letter', async (req, res, next) => {
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

    if (loan.status !== 'COMPLETED') {
      throw new BadRequestError('Discharge letter is only available for completed loans');
    }

    if (!loan.dischargeLetterPath) {
      throw new NotFoundError('Discharge letter not generated');
    }

    // Extract filename from path
    const filename = loan.dischargeLetterPath.split('/').pop();
    if (!filename) {
      throw new NotFoundError('Discharge letter file');
    }

    const filePath = path.join(UPLOAD_DIR, 'discharge-letters', filename);
    
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Discharge letter file');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Discharge-Letter-${loan.id.substring(0, 8)}.pdf"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * Mark loan as defaulted
 * POST /api/loans/:loanId/mark-default
 */
router.post('/:loanId/mark-default', async (req, res, next) => {
  try {
    const { reason } = req.body;

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'DEFAULTED' || loan.status === 'WRITTEN_OFF') {
      throw new BadRequestError('Loan is already defaulted or written off');
    }

    if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
      throw new BadRequestError('Can only default active or in-arrears loans');
    }

    const previousStatus = loan.status;

    const updatedLoan = await prisma.loan.update({
      where: { id: loan.id },
      data: {
        status: 'DEFAULTED',
        dischargeNotes: reason ? `Default reason: ${reason}` : null,
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'MARK_DEFAULT',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: previousStatus },
      newData: { status: 'DEFAULTED', reason: reason || null },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: updatedLoan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Disburse loan and generate schedule
 * POST /api/loans/:loanId/disburse
 * 
 * Supports multipart form data for optional proof of disbursement file upload
 */
router.post('/:loanId/disburse', async (req, res, next) => {
  try {
    // Check content type to determine if file upload
    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    
    let disbursementDate: Date;
    let reference: string | undefined;
    let proofFile: { buffer: Buffer; originalName: string; mimeType: string } | null = null;

    if (isMultipart) {
      // Parse multipart form data (use parseFileUpload which doesn't require category)
      const { buffer, originalName, mimeType, fields } = await parseFileUpload(req);
      
      // Get fields from form data
      disbursementDate = fields?.disbursementDate 
        ? new Date(fields.disbursementDate) 
        : new Date();
      reference = fields?.reference;
      
      // Store file info if file was uploaded
      if (buffer && buffer.length > 0) {
        proofFile = { buffer, originalName, mimeType };
      }
    } else {
      // Parse JSON body
      const data = disburseSchema.parse(req.body);
      disbursementDate = data.disbursementDate ? new Date(data.disbursementDate) : new Date();
      reference = data.reference;
    }

    const loan = await prisma.loan.findFirst({
      where: {
        id: req.params.loanId,
        tenantId: req.tenantId,
      },
      include: { product: true },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Loan is not pending disbursement');
    }

    // Check if signed agreement has been uploaded
    if (!loan.agreementPath) {
      throw new BadRequestError('A signed loan agreement must be uploaded before disbursement');
    }

    // Check if agreement date has been set (required for schedule generation)
    if (!loan.agreementDate) {
      throw new BadRequestError('Agreement date is not set. Please regenerate the loan agreement first.');
    }

    // Check if stamp certificate has been uploaded
    if (!loan.stampCertPath) {
      throw new BadRequestError('A stamp certificate must be uploaded before disbursement');
    }

    // Generate disbursement reference if not provided
    const dateStr = disbursementDate.toISOString().split('T')[0].replace(/-/g, '');
    const disbursementReference = reference || `DIS-${dateStr}-${loan.id.substring(0, 8).toUpperCase()}`;

    // Handle proof file upload
    let proofData: {
      disbursementProofPath: string;
      disbursementProofName: string;
      disbursementProofMime: string;
      disbursementProofSize: number;
      disbursementProofAt: Date;
    } | null = null;

    if (proofFile) {
      // Ensure disbursement-proofs directory exists
      const proofsDir = path.join(UPLOAD_DIR, 'disbursement-proofs');
      if (!fs.existsSync(proofsDir)) {
        fs.mkdirSync(proofsDir, { recursive: true });
      }

      // Save the file
      const extension = path.extname(proofFile.originalName).toLowerCase();
      const filename = `${loan.id}-${Date.now()}${extension}`;
      const filePath = path.join(proofsDir, filename);
      fs.writeFileSync(filePath, proofFile.buffer);

      proofData = {
        disbursementProofPath: `/api/uploads/disbursement-proofs/${filename}`,
        disbursementProofName: proofFile.originalName,
        disbursementProofMime: proofFile.mimeType,
        disbursementProofSize: proofFile.buffer.length,
        disbursementProofAt: new Date(),
      };
    }

    // Generate schedule using agreement date (the date agreed upon in the signed agreement)
    // This ensures the schedule matches what's in the signed agreement
    const scheduleOutput = generateSchedule({
      principal: Number(loan.principalAmount),
      interestRate: Number(loan.interestRate),
      term: loan.term,
      disbursementDate: loan.agreementDate, // Use agreement date, not actual disbursement date
      interestModel: loan.product.interestModel,
    });

    // Create schedule inputs hash for integrity
    const inputs = {
      principal: Number(loan.principalAmount),
      interestRate: Number(loan.interestRate),
      term: loan.term,
      agreementDate: loan.agreementDate.toISOString(), // Track agreement date used for schedule
      disbursementDate: disbursementDate.toISOString(), // Track actual disbursement date
      interestModel: loan.product.interestModel,
    };
    const outputsHash = createHash('sha256')
      .update(JSON.stringify(scheduleOutput))
      .digest('hex');

    // Update loan and create schedule in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update loan status with disbursement details
      const updatedLoan = await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: 'ACTIVE',
          disbursementDate,
          disbursementReference,
          ...(proofData || {}),
        },
      });

      // Create schedule version
      const scheduleVersion = await tx.loanScheduleVersion.create({
        data: {
          loanId: loan.id,
          version: 1,
          interestModel: loan.product.interestModel,
          inputs,
          outputsHash,
        },
      });

      // Create repayments
      await tx.loanRepayment.createMany({
        data: scheduleOutput.repayments.map(rep => ({
          scheduleVersionId: scheduleVersion.id,
          dueDate: rep.dueDate,
          principal: rep.principal,
          interest: rep.interest,
          totalDue: rep.totalDue,
          status: 'PENDING',
        })),
      });

      // Fetch the complete schedule
      const completeSchedule = await tx.loanScheduleVersion.findUnique({
        where: { id: scheduleVersion.id },
        include: {
          repayments: {
            orderBy: { dueDate: 'asc' },
          },
        },
      });

      return { loan: updatedLoan, schedule: completeSchedule };
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'DISBURSE',
      entityType: 'Loan',
      entityId: loan.id,
      previousData: { status: 'PENDING_DISBURSEMENT' },
      newData: { 
        status: 'ACTIVE', 
        disbursementDate: disbursementDate.toISOString(),
        disbursementReference,
        scheduleGenerated: true,
      },
      ipAddress: req.ip,
    });

    // Log separate audit entry for disbursement proof if uploaded
    if (proofData) {
      await AuditService.log({
        tenantId: req.tenantId!,
        memberId: req.memberId,
        action: 'UPLOAD_DISBURSEMENT_PROOF',
        entityType: 'Loan',
        entityId: loan.id,
        newData: {
          originalName: proofData.disbursementProofName,
          mimeType: proofData.disbursementProofMime,
          size: proofData.disbursementProofSize,
          disbursementReference,
        },
        ipAddress: req.ip,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload proof of disbursement for a loan
 * POST /api/loans/:loanId/disbursement-proof
 */
router.post('/:loanId/disbursement-proof', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status === 'PENDING_DISBURSEMENT') {
      throw new BadRequestError('Loan has not been disbursed yet');
    }

    // If proof already exists, delete old file first
    if (loan.disbursementProofPath) {
      const oldFilename = loan.disbursementProofPath.split('/').pop();
      if (oldFilename) {
        const oldFilePath = path.join(UPLOAD_DIR, 'disbursement-proofs', oldFilename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
    }

    // Parse the file upload (use parseFileUpload which doesn't require category)
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    // Ensure disbursement-proofs directory exists
    const proofsDir = path.join(UPLOAD_DIR, 'disbursement-proofs');
    if (!fs.existsSync(proofsDir)) {
      fs.mkdirSync(proofsDir, { recursive: true });
    }

    // Save the file
    const extension = path.extname(originalName).toLowerCase();
    const filename = `${loanId}-${Date.now()}${extension}`;
    const filePath = path.join(proofsDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Update loan with proof info
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        disbursementProofPath: `/api/uploads/disbursement-proofs/${filename}`,
        disbursementProofName: originalName,
        disbursementProofMime: mimeType,
        disbursementProofSize: buffer.length,
        disbursementProofAt: new Date(),
      },
    });

    // Log to audit trail
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_DISBURSEMENT_PROOF',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.disbursementProofPath ? { replacedProof: true } : undefined,
      newData: {
        originalName,
        mimeType,
        size: buffer.length,
        disbursementReference: loan.disbursementReference,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: updatedLoan,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View proof of disbursement for a loan
 * GET /api/loans/:loanId/disbursement-proof
 */
router.get('/:loanId/disbursement-proof', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.disbursementProofPath || !loan.disbursementProofName) {
      throw new NotFoundError('Proof of disbursement');
    }

    const filename = loan.disbursementProofPath.split('/').pop();
    if (!filename) {
      throw new NotFoundError('Proof of disbursement file');
    }

    const filePath = path.join(UPLOAD_DIR, 'disbursement-proofs', filename);
    
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Proof of disbursement file');
    }

    res.setHeader('Content-Type', loan.disbursementProofMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${loan.disbursementProofName}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

// ============================================
// Loan Agreement Endpoints
// ============================================

import { generateLoanAgreement, LoanForAgreement } from '../../lib/pdfService.js';
import { saveAgreementFile, getAgreementFile, deleteAgreementFile, getLocalPath, isS3Storage } from '../../lib/storage.js';

/**
 * Generate pre-filled loan agreement PDF (Jadual J)
 * GET /api/loans/:loanId/generate-agreement
 * 
 * Downloads a PDF with loan details pre-filled for printing and signing
 */
router.get('/:loanId/generate-agreement', async (req, res, next) => {
  try {
    const { loanId } = req.params;
    
    // Accept required query parameter for agreement date (the agreed disbursement date)
    const { agreementDate: agreementDateParam } = req.query;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
      include: {
        borrower: true,
        product: true,
        tenant: true,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Helper function to calculate first repayment date (1 month after agreement date)
    const calculateFirstRepaymentDate = (agreementDate: Date): Date => {
      const repaymentDate = new Date(agreementDate);
      repaymentDate.setMonth(repaymentDate.getMonth() + 1);
      return repaymentDate;
    };

    // Calculate dates from agreement date parameter or stored agreement date
    let agreementDate: Date | null = null;
    let firstRepaymentDate: Date | null = null;
    let monthlyRepaymentDay: number | null = null;
    
    // Use query parameter if provided
    if (agreementDateParam && typeof agreementDateParam === 'string') {
      const parsedDate = new Date(agreementDateParam);
      if (!isNaN(parsedDate.getTime())) {
        agreementDate = parsedDate;
        firstRepaymentDate = calculateFirstRepaymentDate(parsedDate);
        monthlyRepaymentDay = firstRepaymentDate.getDate();
        
        // Save the agreement date to the loan
        await prisma.loan.update({
          where: { id: loan.id },
          data: { agreementDate: parsedDate },
        });
      }
    }
    
    // If no query param, try to use existing agreement date
    if (!agreementDate && loan.agreementDate) {
      agreementDate = loan.agreementDate;
      firstRepaymentDate = calculateFirstRepaymentDate(loan.agreementDate);
      monthlyRepaymentDay = firstRepaymentDate.getDate();
    }

    // Prepare loan data for PDF generation
    const loanData: LoanForAgreement = {
      id: loan.id,
      principalAmount: loan.principalAmount,
      interestRate: loan.interestRate,
      term: loan.term,
      firstRepaymentDate,
      monthlyRepaymentDay,
      borrower: {
        name: loan.borrower.name,
        icNumber: loan.borrower.icNumber,
        address: loan.borrower.address,
        type: loan.borrower.borrowerType,
        borrowerType: loan.borrower.borrowerType,
        companyName: loan.borrower.companyName,
        companyRegistrationNumber: loan.borrower.ssmRegistrationNo,
      },
      tenant: {
        name: loan.tenant.name,
        registrationNumber: loan.tenant.registrationNumber,
        licenseNumber: loan.tenant.licenseNumber,
        businessAddress: loan.tenant.businessAddress,
      },
      product: {
        interestModel: loan.product.interestModel,
        loanScheduleType: loan.product.loanScheduleType,
      },
      collateralType: loan.collateralType,
      collateralValue: loan.collateralValue ? Number(loan.collateralValue) : null,
    };

    // Generate the PDF (automatically selects Jadual J or K template)
    const pdfBuffer = await generateLoanAgreement(loanData);

    // Generate filename with schedule type
    const scheduleLabel = loan.product.loanScheduleType === 'JADUAL_K' ? 'Jadual_K' : 'Jadual_J';
    const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
      ? loan.borrower.companyName
      : loan.borrower.name;
    const sanitizedName = borrowerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const filename = `${scheduleLabel}_Agreement_${sanitizedName}_${loanId.substring(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Upload signed loan agreement
 * POST /api/loans/:loanId/agreement
 * 
 * Uploads the signed agreement PDF with version control audit trail
 */
router.post('/:loanId/agreement', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Parse the file upload
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    // Validate PDF only
    if (mimeType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are allowed for loan agreements');
    }

    // If agreement already exists, delete old file first
    if (loan.agreementPath) {
      try {
        await deleteAgreementFile(loan.agreementPath);
      } catch (error) {
        console.error('Failed to delete old agreement file:', error);
        // Continue anyway - don't fail the upload
      }
    }

    // Save the new agreement file
    const { path: agreementPath, filename } = await saveAgreementFile(buffer, loanId, originalName);

    // Calculate new version
    const newVersion = loan.agreementVersion + 1;

    // Update loan with agreement info
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        agreementPath,
        agreementFilename: filename,
        agreementOriginalName: originalName,
        agreementMimeType: mimeType,
        agreementSize: buffer.length,
        agreementUploadedAt: new Date(),
        agreementVersion: newVersion,
      },
    });

    // Log to audit trail with version info
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_AGREEMENT',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.agreementPath ? {
        version: loan.agreementVersion,
        path: loan.agreementPath,
        filename: loan.agreementOriginalName,
        uploadedAt: loan.agreementUploadedAt,
      } : null,
      newData: {
        version: newVersion,
        path: agreementPath,
        filename: originalName,
        size: buffer.length,
        uploadedAt: new Date(),
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
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View/download signed loan agreement
 * GET /api/loans/:loanId/agreement
 */
router.get('/:loanId/agreement', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.agreementPath || !loan.agreementOriginalName) {
      throw new NotFoundError('Loan agreement');
    }

    // Try to get local file path for streaming (more efficient)
    const localPath = getLocalPath(loan.agreementPath);
    
    if (localPath && fs.existsSync(localPath)) {
      // Stream from local filesystem
      res.setHeader('Content-Type', loan.agreementMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.agreementOriginalName}"`);
      
      const fileStream = fs.createReadStream(localPath);
      fileStream.pipe(res);
    } else {
      // Get from storage (S3 or fallback)
      const fileBuffer = await getAgreementFile(loan.agreementPath);
      
      if (!fileBuffer) {
        throw new NotFoundError('Loan agreement file');
      }

      res.setHeader('Content-Type', loan.agreementMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.agreementOriginalName}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Upload stamp certificate
 * POST /api/loans/:loanId/stamp-certificate
 * 
 * Uploads the stamp certificate PDF with version control audit trail
 */
router.post('/:loanId/stamp-certificate', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    // Parse the uploaded file
    const { buffer, originalName, mimeType } = await parseFileUpload(req);

    if (!buffer || buffer.length === 0) {
      throw new BadRequestError('No file uploaded');
    }

    // Validate it's a PDF
    if (mimeType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are allowed for stamp certificates');
    }

    // If stamp certificate already exists, delete old file first
    if (loan.stampCertPath) {
      try {
        await deleteAgreementFile(loan.stampCertPath);
      } catch (error) {
        console.error('Failed to delete old stamp certificate file:', error);
        // Continue anyway - don't fail the upload
      }
    }

    // Save the new stamp certificate file (reuse agreement storage with different prefix)
    const stampCertFilename = `stamp-cert-${loanId}-${Date.now()}.pdf`;
    const { path: stampCertPath, filename } = await saveAgreementFile(buffer, `stamp-${loanId}`, originalName);

    // Calculate new version
    const newVersion = loan.stampCertVersion + 1;

    // Update loan with stamp certificate info
    const updatedLoan = await prisma.loan.update({
      where: { id: loanId },
      data: {
        stampCertPath,
        stampCertFilename: filename,
        stampCertOriginalName: originalName,
        stampCertMimeType: mimeType,
        stampCertSize: buffer.length,
        stampCertUploadedAt: new Date(),
        stampCertVersion: newVersion,
      },
    });

    // Log to audit trail with version info
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.memberId,
      action: 'UPLOAD_STAMP_CERTIFICATE',
      entityType: 'Loan',
      entityId: loanId,
      previousData: loan.stampCertPath ? {
        version: loan.stampCertVersion,
        path: loan.stampCertPath,
        filename: loan.stampCertOriginalName,
        uploadedAt: loan.stampCertUploadedAt,
      } : null,
      newData: {
        version: newVersion,
        path: stampCertPath,
        filename: originalName,
        size: buffer.length,
        uploadedAt: new Date(),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        stampCertPath: updatedLoan.stampCertPath,
        stampCertOriginalName: updatedLoan.stampCertOriginalName,
        stampCertVersion: updatedLoan.stampCertVersion,
        stampCertUploadedAt: updatedLoan.stampCertUploadedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * View/download stamp certificate
 * GET /api/loans/:loanId/stamp-certificate
 */
router.get('/:loanId/stamp-certificate', async (req, res, next) => {
  try {
    const { loanId } = req.params;

    const loan = await prisma.loan.findFirst({
      where: {
        id: loanId,
        tenantId: req.tenantId,
      },
    });

    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (!loan.stampCertPath || !loan.stampCertOriginalName) {
      throw new NotFoundError('Stamp certificate');
    }

    // Try to get local file path for streaming (more efficient)
    const localPath = getLocalPath(loan.stampCertPath);
    
    if (localPath && fs.existsSync(localPath)) {
      // Stream from local filesystem
      res.setHeader('Content-Type', loan.stampCertMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.stampCertOriginalName}"`);
      
      const fileStream = fs.createReadStream(localPath);
      fileStream.pipe(res);
    } else {
      // Get from storage (S3 or fallback)
      const fileBuffer = await getAgreementFile(loan.stampCertPath);
      
      if (!fileBuffer) {
        throw new NotFoundError('Stamp certificate file');
      }

      res.setHeader('Content-Type', loan.stampCertMimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${loan.stampCertOriginalName}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }
  } catch (error) {
    next(error);
  }
});

export default router;
