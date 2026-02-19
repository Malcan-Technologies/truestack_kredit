import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { AuditService } from '../compliance/auditService.js';
import { parseDocumentUpload, saveDocumentFile, deleteDocumentFile, ensureDocumentsDir } from '../../lib/upload.js';
import { ensureBorrowerPerformanceProjections } from './performanceProjectionService.js';

const router = Router();

// All routes require authentication and active subscription
router.use(authenticateToken);
router.use(requirePaidSubscription);

// Borrower type enum
const BORROWER_TYPE_VALUES = ['INDIVIDUAL', 'CORPORATE'] as const;

// Compliance field enums for validation
const DOCUMENT_TYPE_VALUES = ['IC', 'PASSPORT'] as const;
const GENDER_VALUES = ['MALE', 'FEMALE'] as const;
const RACE_VALUES = ['MELAYU', 'CINA', 'INDIA', 'LAIN_LAIN', 'BUMIPUTRA_SABAH_SARAWAK', 'BUKAN_WARGANEGARA'] as const;
const EDUCATION_LEVEL_VALUES = ['NO_FORMAL', 'PRIMARY', 'SECONDARY', 'DIPLOMA', 'DEGREE', 'POSTGRADUATE'] as const;
const EMPLOYMENT_STATUS_VALUES = ['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT'] as const;

// Malaysian banks list
const BANK_VALUES = [
  'MAYBANK', 'CIMB', 'PUBLIC_BANK', 'RHB', 'HONG_LEONG', 'AMBANK', 'BANK_RAKYAT',
  'BANK_ISLAM', 'AFFIN', 'ALLIANCE', 'OCBC', 'HSBC', 'UOB', 'STANDARD_CHARTERED',
  'CITIBANK', 'BSN', 'AGROBANK', 'MUAMALAT', 'MBSB', 'OTHER'
] as const;

// Document categories for individual borrowers
const INDIVIDUAL_DOCUMENT_CATEGORIES = [
  'IC_FRONT', 'IC_BACK', 'PASSPORT', 'WORK_PERMIT'
] as const;

// Document categories for corporate borrowers
const CORPORATE_DOCUMENT_CATEGORIES = [
  'SSM_CERT', 'FORM_9', 'FORM_13', 'FORM_24', 'FORM_49', 
  'COMPANY_PROFILE', 'DIRECTOR_IC_FRONT', 'DIRECTOR_IC_BACK', 'DIRECTOR_PASSPORT'
] as const;

// All valid document categories
const ALL_DOCUMENT_CATEGORIES = [...INDIVIDUAL_DOCUMENT_CATEGORIES, ...CORPORATE_DOCUMENT_CATEGORIES] as const;

// Individual borrower fields schema
const individualFieldsSchema = z.object({
  // Compliance fields (mandatory for regulatory reporting - Individual borrowers)
  dateOfBirth: z.string().datetime().optional().or(z.literal('')),
  gender: z.enum(GENDER_VALUES).optional(),
  race: z.enum(RACE_VALUES).optional(),
  educationLevel: z.enum(EDUCATION_LEVEL_VALUES).optional(),
  occupation: z.string().max(200).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUS_VALUES).optional(),
  bankName: z.enum(BANK_VALUES).optional(),
  bankNameOther: z.string().max(100).optional(),
  bankAccountNo: z.string().max(20).optional(),
  // Non-mandatory fields
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRelationship: z.string().max(100).optional(),
  monthlyIncome: z.number().min(0).optional().or(z.literal(null)),
});

// Corporate borrower fields schema
const corporateFieldsSchema = z.object({
  // Required corporate fields
  companyName: z.string().min(2).max(200).optional(),
  ssmRegistrationNo: z.string().max(50).optional(),
  businessAddress: z.string().max(500).optional(),
  authorizedRepName: z.string().max(200).optional(),
  authorizedRepIc: z.string().max(20).optional(),
  companyPhone: z.string().max(20).optional(),
  companyEmail: z.string().email().optional().or(z.literal('')),
  natureOfBusiness: z.string().max(200).optional(),
  bumiStatus: z.enum(['BUMI', 'BUKAN_BUMI', 'ASING']).optional(),
  // Optional corporate fields
  dateOfIncorporation: z.string().datetime().optional().or(z.literal('')),
  paidUpCapital: z.number().positive().optional().or(z.literal(null)),
  numberOfEmployees: z.number().int().positive().optional().or(z.literal(null)),
});

const directorSchema = z.object({
  name: z.string().min(2).max(200),
  icNumber: z
    .string()
    .min(1, 'Director IC is required')
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length === 12, 'Director IC must be exactly 12 digits'),
  position: z.string().max(100).optional(),
});

// Validation schemas
const createBorrowerSchema = z.object({
  borrowerType: z.enum(BORROWER_TYPE_VALUES).default('INDIVIDUAL'),
  name: z.string().min(2).max(200),
  icNumber: z.string().min(6).max(20),
  documentType: z.enum(DOCUMENT_TYPE_VALUES).default('IC'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  directors: z.array(directorSchema).min(1).max(10).optional(),
}).merge(individualFieldsSchema).merge(corporateFieldsSchema);

const updateBorrowerSchema = z.object({
  borrowerType: z.enum(BORROWER_TYPE_VALUES).optional(),
  name: z.string().min(2).max(200).optional(),
  icNumber: z.string().min(6).max(20).optional(),
  documentType: z.enum(DOCUMENT_TYPE_VALUES).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  directors: z.array(directorSchema).min(1).max(10).optional(),
}).merge(individualFieldsSchema).merge(corporateFieldsSchema);

/**
 * List borrowers
 * GET /api/borrowers
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, page = '1', pageSize = '20', borrowerType } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    const where = {
      tenantId: req.tenantId,
      ...(borrowerType && BORROWER_TYPE_VALUES.includes(borrowerType as typeof BORROWER_TYPE_VALUES[number]) && {
        borrowerType: borrowerType as string,
      }),
      ...(search && {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' as const } },
          { icNumber: { contains: search as string } },
          { phone: { contains: search as string } },
          { email: { contains: search as string, mode: 'insensitive' as const } },
        ],
      }),
    };

    const borrowerListQuery = {
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' as const },
      include: {
        _count: {
          select: { loans: true, applications: true },
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
    };

    let [borrowers, total] = await Promise.all([
      prisma.borrower.findMany(borrowerListQuery),
      prisma.borrower.count({ where }),
    ]);

    const missingProjectionBorrowerIds = borrowers
      .filter((borrower) => !borrower.performanceProjection)
      .map((borrower) => borrower.id);

    if (missingProjectionBorrowerIds.length > 0) {
      await ensureBorrowerPerformanceProjections(req.tenantId!, missingProjectionBorrowerIds);
      borrowers = await prisma.borrower.findMany(borrowerListQuery);
    }

    res.json({
      success: true,
      data: borrowers,
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
 * Get single borrower
 * GET /api/borrowers/:borrowerId
 */
router.get('/:borrowerId', async (req, res, next) => {
  try {
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
      include: {
        loans: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            principalAmount: true,
            createdAt: true,
            product: { select: { name: true } },
          },
        },
        applications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            amount: true,
            createdAt: true,
            product: { select: { name: true } },
          },
        },
        documents: {
          orderBy: { uploadedAt: 'desc' },
        },
        directors: {
          orderBy: { order: 'asc' },
        },
        performanceProjection: true,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    res.json({
      success: true,
      data: borrower,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get borrower activity timeline
 * GET /api/borrowers/:borrowerId/timeline
 */
router.get('/:borrowerId/timeline', async (req, res, next) => {
  try {
    // Pagination params
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const cursor = req.query.cursor as string | undefined;

    // Verify borrower belongs to tenant
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    // Fetch audit logs for this borrower with cursor-based pagination
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId!,
        entityType: 'Borrower',
        entityId: req.params.borrowerId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to check if there are more
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor itself
      }),
      include: {
        member: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Check if there are more items
    const hasMore = auditLogs.length > limit;
    const items = hasMore ? auditLogs.slice(0, limit) : auditLogs;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

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

/**
 * Create borrower
 * POST /api/borrowers
 */
router.post('/', async (req, res, next) => {
  try {
    const data = createBorrowerSchema.parse(req.body);

    // Check if IC number already exists for this tenant
    const existing = await prisma.borrower.findUnique({
      where: {
        tenantId_icNumber: {
          tenantId: req.tenantId!,
          icNumber: data.icNumber,
        },
      },
    });

    if (existing) {
      throw new ConflictError('Borrower with this IC number already exists');
    }

    const isCorporate = data.borrowerType === 'CORPORATE';
    const normalizedDirectors = (data.directors || []).map((director, index) => ({
      name: director.name.trim(),
      icNumber: director.icNumber.trim(),
      position: director.position?.trim() || null,
      order: index,
    }));

    // Prepare data for database
    const createData: Record<string, unknown> = {
      tenantId: req.tenantId!,
      borrowerType: data.borrowerType || 'INDIVIDUAL',
      name: data.name,
      icNumber: data.icNumber,
      documentType: data.documentType || 'IC',
      documentVerified: false, // Always false on create, will be updated by e-KYC integration
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
    };

    if (isCorporate) {
      // Corporate borrower fields
      createData.companyName = data.companyName || null;
      createData.ssmRegistrationNo = data.ssmRegistrationNo || null;
      createData.businessAddress = data.businessAddress || null;
      createData.authorizedRepName = normalizedDirectors[0]?.name || data.authorizedRepName || null;
      createData.authorizedRepIc = normalizedDirectors[0]?.icNumber || data.authorizedRepIc || null;
      createData.companyPhone = data.companyPhone || null;
      createData.companyEmail = data.companyEmail || null;
      createData.natureOfBusiness = data.natureOfBusiness || null;
      createData.bumiStatus = data.bumiStatus || null;
      // Optional corporate fields
      createData.dateOfIncorporation = data.dateOfIncorporation ? new Date(data.dateOfIncorporation) : null;
      createData.paidUpCapital = data.paidUpCapital ?? null;
      createData.numberOfEmployees = data.numberOfEmployees ?? null;
      // Bank details (also used for corporate)
      createData.bankName = data.bankName || null;
      createData.bankNameOther = data.bankName === 'OTHER' ? (data.bankNameOther || null) : null;
      createData.bankAccountNo = data.bankAccountNo || null;
      if (normalizedDirectors.length > 0) {
        createData.directors = {
          create: normalizedDirectors,
        };
      }
    } else {
      // Individual borrower fields
      createData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
      createData.gender = data.gender || null;
      createData.race = data.race || null;
      createData.educationLevel = data.educationLevel || null;
      createData.occupation = data.occupation || null;
      createData.employmentStatus = data.employmentStatus || null;
      createData.bankName = data.bankName || null;
      createData.bankNameOther = data.bankName === 'OTHER' ? (data.bankNameOther || null) : null;
      createData.bankAccountNo = data.bankAccountNo || null;
      // Non-mandatory fields
      createData.emergencyContactName = data.emergencyContactName || null;
      createData.emergencyContactPhone = data.emergencyContactPhone || null;
      createData.emergencyContactRelationship = data.emergencyContactRelationship || null;
      createData.monthlyIncome = data.monthlyIncome ?? null;
    }

    const borrower = await prisma.borrower.create({
      data: createData as Parameters<typeof prisma.borrower.create>[0]['data'],
      include: {
        directors: {
          orderBy: { order: 'asc' },
        },
      },
    });

    // Log to audit trail
    // For corporate borrowers, include companyName in the audit log
    const auditData: Record<string, unknown> = {
      borrowerType: borrower.borrowerType,
      name: borrower.name,
      icNumber: borrower.icNumber,
      documentType: borrower.documentType,
      phone: borrower.phone,
      email: borrower.email,
    };
    
    if (isCorporate && borrower.companyName) {
      auditData.companyName = borrower.companyName;
    }
    if (isCorporate) {
      auditData.directors = borrower.directors.map((director) => ({
        name: director.name,
        icNumber: director.icNumber,
        position: director.position,
      }));
    }
    
    await AuditService.logCreate(
      req.tenantId!,
      req.memberId!,
      'Borrower',
      borrower.id,
      auditData,
      req.ip
    );

    res.status(201).json({
      success: true,
      data: borrower,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update borrower
 * PATCH /api/borrowers/:borrowerId
 */
router.patch('/:borrowerId', async (req, res, next) => {
  try {
    const data = updateBorrowerSchema.parse(req.body);

    // Verify borrower belongs to tenant
    const existing = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
      include: {
        directors: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Borrower');
    }

    // If IC number is being changed, check for conflicts
    if (data.icNumber !== undefined && data.icNumber !== existing.icNumber) {
      const icConflict = await prisma.borrower.findUnique({
        where: {
          tenantId_icNumber: {
            tenantId: req.tenantId!,
            icNumber: data.icNumber,
          },
        },
      });
      if (icConflict) {
        throw new ConflictError('Another borrower with this IC number already exists');
      }
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    const effectiveBorrowerType = data.borrowerType ?? existing.borrowerType;
    const normalizedDirectors = (data.directors || []).map((director, index) => ({
      name: director.name.trim(),
      icNumber: director.icNumber.trim(),
      position: director.position?.trim() || null,
      order: index,
    }));
    
    // Base fields
    if (data.borrowerType !== undefined) updateData.borrowerType = data.borrowerType;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.icNumber !== undefined) updateData.icNumber = data.icNumber;
    if (data.documentType !== undefined) updateData.documentType = data.documentType;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.address !== undefined) updateData.address = data.address || null;

    // Individual borrower fields
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.gender !== undefined) updateData.gender = data.gender || null;
    if (data.race !== undefined) updateData.race = data.race || null;
    if (data.educationLevel !== undefined) updateData.educationLevel = data.educationLevel || null;
    if (data.occupation !== undefined) updateData.occupation = data.occupation || null;
    if (data.employmentStatus !== undefined) updateData.employmentStatus = data.employmentStatus || null;
    if (data.bankName !== undefined) {
      updateData.bankName = data.bankName || null;
      if (data.bankName !== 'OTHER') {
        updateData.bankNameOther = null;
      }
    }
    if (data.bankNameOther !== undefined) {
      const effectiveBankName = data.bankName !== undefined ? data.bankName : existing.bankName;
      updateData.bankNameOther = effectiveBankName === 'OTHER' ? (data.bankNameOther || null) : null;
    }
    if (data.bankAccountNo !== undefined) updateData.bankAccountNo = data.bankAccountNo || null;
    if (data.emergencyContactName !== undefined) updateData.emergencyContactName = data.emergencyContactName || null;
    if (data.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = data.emergencyContactPhone || null;
    if (data.emergencyContactRelationship !== undefined) updateData.emergencyContactRelationship = data.emergencyContactRelationship || null;
    if (data.monthlyIncome !== undefined) updateData.monthlyIncome = data.monthlyIncome ?? null;

    // Corporate borrower fields
    if (data.companyName !== undefined) updateData.companyName = data.companyName || null;
    if (data.ssmRegistrationNo !== undefined) updateData.ssmRegistrationNo = data.ssmRegistrationNo || null;
    if (data.businessAddress !== undefined) updateData.businessAddress = data.businessAddress || null;
    if (data.authorizedRepName !== undefined) updateData.authorizedRepName = data.authorizedRepName || null;
    if (data.authorizedRepIc !== undefined) updateData.authorizedRepIc = data.authorizedRepIc || null;
    if (data.companyPhone !== undefined) updateData.companyPhone = data.companyPhone || null;
    if (data.companyEmail !== undefined) updateData.companyEmail = data.companyEmail || null;
    if (data.natureOfBusiness !== undefined) updateData.natureOfBusiness = data.natureOfBusiness || null;
    if (data.bumiStatus !== undefined) updateData.bumiStatus = data.bumiStatus || null;
    if (data.dateOfIncorporation !== undefined) updateData.dateOfIncorporation = data.dateOfIncorporation ? new Date(data.dateOfIncorporation) : null;
    if (data.paidUpCapital !== undefined) updateData.paidUpCapital = data.paidUpCapital ?? null;
    if (data.numberOfEmployees !== undefined) updateData.numberOfEmployees = data.numberOfEmployees ?? null;
    if (data.directors !== undefined && effectiveBorrowerType === 'CORPORATE') {
      updateData.authorizedRepName = normalizedDirectors[0]?.name || null;
      updateData.authorizedRepIc = normalizedDirectors[0]?.icNumber || null;
    }

    const borrower = await prisma.$transaction(async (tx) => {
      const updatedBorrower = await tx.borrower.update({
        where: { id: req.params.borrowerId },
        data: updateData as Parameters<typeof prisma.borrower.update>[0]['data'],
      });

      if (data.directors !== undefined) {
        await tx.borrowerDirector.deleteMany({
          where: { borrowerId: req.params.borrowerId },
        });

        if (effectiveBorrowerType === 'CORPORATE' && normalizedDirectors.length > 0) {
          await tx.borrowerDirector.createMany({
            data: normalizedDirectors.map((director) => ({
              borrowerId: req.params.borrowerId,
              name: director.name,
              icNumber: director.icNumber,
              position: director.position,
              order: director.order,
            })),
          });
        }
      }

      return tx.borrower.findUniqueOrThrow({
        where: { id: updatedBorrower.id },
        include: {
          directors: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    // Log to audit trail - capture what changed
    await AuditService.logUpdate(
      req.tenantId!,
      req.memberId!,
      'Borrower',
      borrower.id,
      {
        borrowerType: existing.borrowerType,
        name: existing.name,
        icNumber: existing.icNumber,
        documentType: existing.documentType,
        phone: existing.phone,
        email: existing.email,
        address: existing.address,
        dateOfBirth: existing.dateOfBirth,
        gender: existing.gender,
        race: existing.race,
        educationLevel: existing.educationLevel,
        occupation: existing.occupation,
        employmentStatus: existing.employmentStatus,
        bankName: existing.bankName,
        bankNameOther: existing.bankNameOther,
        bankAccountNo: existing.bankAccountNo,
        emergencyContactName: existing.emergencyContactName,
        emergencyContactPhone: existing.emergencyContactPhone,
        emergencyContactRelationship: existing.emergencyContactRelationship,
        monthlyIncome: existing.monthlyIncome,
        companyName: existing.companyName,
        ssmRegistrationNo: existing.ssmRegistrationNo,
        businessAddress: existing.businessAddress,
        authorizedRepName: existing.authorizedRepName,
        authorizedRepIc: existing.authorizedRepIc,
        companyPhone: existing.companyPhone,
        companyEmail: existing.companyEmail,
        natureOfBusiness: existing.natureOfBusiness,
        bumiStatus: existing.bumiStatus,
        dateOfIncorporation: existing.dateOfIncorporation,
        paidUpCapital: existing.paidUpCapital,
        numberOfEmployees: existing.numberOfEmployees,
        directors: existing.directors.map((director) => ({
          name: director.name,
          icNumber: director.icNumber,
          position: director.position,
          order: director.order,
        })),
      },
      {
        borrowerType: borrower.borrowerType,
        name: borrower.name,
        icNumber: borrower.icNumber,
        documentType: borrower.documentType,
        phone: borrower.phone,
        email: borrower.email,
        address: borrower.address,
        dateOfBirth: borrower.dateOfBirth,
        gender: borrower.gender,
        race: borrower.race,
        educationLevel: borrower.educationLevel,
        occupation: borrower.occupation,
        employmentStatus: borrower.employmentStatus,
        bankName: borrower.bankName,
        bankNameOther: borrower.bankNameOther,
        bankAccountNo: borrower.bankAccountNo,
        emergencyContactName: borrower.emergencyContactName,
        emergencyContactPhone: borrower.emergencyContactPhone,
        emergencyContactRelationship: borrower.emergencyContactRelationship,
        monthlyIncome: borrower.monthlyIncome,
        companyName: borrower.companyName,
        ssmRegistrationNo: borrower.ssmRegistrationNo,
        businessAddress: borrower.businessAddress,
        authorizedRepName: borrower.authorizedRepName,
        authorizedRepIc: borrower.authorizedRepIc,
        companyPhone: borrower.companyPhone,
        companyEmail: borrower.companyEmail,
        natureOfBusiness: borrower.natureOfBusiness,
        bumiStatus: borrower.bumiStatus,
        dateOfIncorporation: borrower.dateOfIncorporation,
        paidUpCapital: borrower.paidUpCapital,
        numberOfEmployees: borrower.numberOfEmployees,
        directors: borrower.directors.map((director) => ({
          name: director.name,
          icNumber: director.icNumber,
          position: director.position,
          order: director.order,
        })),
      },
      req.ip
    );

    res.json({
      success: true,
      data: borrower,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete borrower
 * DELETE /api/borrowers/:borrowerId
 */
router.delete('/:borrowerId', async (req, res, next) => {
  try {
    // Verify borrower belongs to tenant and has no active loans
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
      include: {
        loans: {
          where: {
            status: { in: ['PENDING_DISBURSEMENT', 'ACTIVE'] },
          },
        },
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    if (borrower.loans.length > 0) {
      throw new ConflictError('Cannot delete borrower with active loans');
    }

    await prisma.borrower.delete({
      where: { id: req.params.borrowerId },
    });

    // Log to audit trail
    // For corporate borrowers, include companyName in the audit log
    const deleteAuditData: Record<string, unknown> = {
      borrowerType: borrower.borrowerType,
      name: borrower.name,
      icNumber: borrower.icNumber,
      documentType: borrower.documentType,
      phone: borrower.phone,
      email: borrower.email,
    };
    
    if (borrower.borrowerType === 'CORPORATE' && borrower.companyName) {
      deleteAuditData.companyName = borrower.companyName;
    }
    
    await AuditService.logDelete(
      req.tenantId!,
      req.memberId!,
      'Borrower',
      req.params.borrowerId,
      deleteAuditData,
      req.ip
    );

    res.json({
      success: true,
      message: 'Borrower deleted',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Borrower Document Endpoints
// ============================================

/**
 * List borrower documents
 * GET /api/borrowers/:borrowerId/documents
 */
router.get('/:borrowerId/documents', async (req, res, next) => {
  try {
    // Verify borrower belongs to tenant
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const documents = await prisma.borrowerDocument.findMany({
      where: {
        borrowerId: req.params.borrowerId,
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
 * Upload borrower document
 * POST /api/borrowers/:borrowerId/documents
 */
router.post('/:borrowerId/documents', async (req, res, next) => {
  try {
    // Verify borrower belongs to tenant
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    // Parse the multipart form data
    const { buffer, originalName, mimeType, category } = await parseDocumentUpload(req);

    // Validate category based on borrower type
    // Corporate borrowers only use corporate document categories (no individual IC/passport)
    const validCategories = borrower.borrowerType === 'CORPORATE' 
      ? CORPORATE_DOCUMENT_CATEGORIES
      : INDIVIDUAL_DOCUMENT_CATEGORIES;

    const validSet = new Set(validCategories as readonly string[]);
    if (!validSet.has(category)) {
      throw new ConflictError(`Invalid document category for ${borrower.borrowerType} borrower`);
    }

    // Check if document with this category already exists
    const existingDoc = await prisma.borrowerDocument.findFirst({
      where: {
        borrowerId: req.params.borrowerId,
        category,
      },
    });

    if (existingDoc) {
      // Delete the old file and record
      await deleteDocumentFile(existingDoc.path);
      await prisma.borrowerDocument.delete({
        where: { id: existingDoc.id },
      });
    }

    // Save the file
    ensureDocumentsDir();
    const ext = path.extname(originalName).toLowerCase();
    const { filename, path: filePath } = await saveDocumentFile(
      buffer,
      req.tenantId!,
      req.params.borrowerId,
      ext
    );

    // Create the document record
    const document = await prisma.borrowerDocument.create({
      data: {
        tenantId: req.tenantId!,
        borrowerId: req.params.borrowerId,
        filename,
        originalName,
        mimeType,
        size: buffer.length,
        path: filePath,
        category,
      },
    });

    // Log to borrower audit trail (shows in borrower timeline)
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.user!.memberId,
      action: 'DOCUMENT_UPLOAD',
      entityType: 'Borrower',
      entityId: req.params.borrowerId,
      newData: {
        documentId: document.id,
        category,
        filename: originalName,
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
 * Delete borrower document
 * DELETE /api/borrowers/:borrowerId/documents/:documentId
 */
router.delete('/:borrowerId/documents/:documentId', async (req, res, next) => {
  try {
    // Verify borrower belongs to tenant
    const borrower = await prisma.borrower.findFirst({
      where: {
        id: req.params.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    // Find the document
    const document = await prisma.borrowerDocument.findFirst({
      where: {
        id: req.params.documentId,
        borrowerId: req.params.borrowerId,
        tenantId: req.tenantId,
      },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Delete the file
    await deleteDocumentFile(document.path);

    // Delete the record
    await prisma.borrowerDocument.delete({
      where: { id: document.id },
    });

    // Log to borrower audit trail (shows in borrower timeline)
    await AuditService.log({
      tenantId: req.tenantId!,
      memberId: req.user!.memberId,
      action: 'DOCUMENT_DELETE',
      entityType: 'Borrower',
      entityId: req.params.borrowerId,
      previousData: {
        documentId: document.id,
        category: document.category,
        filename: document.originalName,
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

export default router;
