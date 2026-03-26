import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../lib/errors.js';
import { toSafeNumber } from '../../lib/math.js';
import {
  runCrossTenantLookup,
  normalizeIdentityNumber,
  getTotalBorrowedBucketLabel,
  toPercentageRange,
  buildAddressString,
  aggregateConsistency,
  computeNameConsistency,
  computePhoneConsistency,
  computeAddressConsistency,
  resolveCrossTenantRiskRating,
  CROSS_TENANT_RECENT_LOANS_LIMIT,
  type DataConsistencyLevel,
  type CrossTenantPerformanceRating,
} from '../../lib/crossTenantLookupService.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requirePaidSubscription } from '../../middleware/billingGuard.js';
import { AuditService } from '../compliance/auditService.js';
import { parseDocumentUpload, saveDocumentFile, deleteDocumentFile, ensureDocumentsDir } from '../../lib/upload.js';
import { ensureBorrowerPerformanceProjections } from './performanceProjectionService.js';
import { config } from '../../lib/config.js';
import { AddOnService } from '../../lib/addOnService.js';
import { requestVerificationSession } from '../trueidentity/adminWebhookClient.js';
import { createKycSession } from '../truestack-kyc/publicApiClient.js';
import { getBorrowerVerificationSummary } from '../../lib/verification.js';
import { pickBestTruestackKycSession } from '../../lib/truestackKycSessionPick.js';

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

const ADDRESS_LINE_MAX_LENGTH = 200;
const CITY_MAX_LENGTH = 100;
const STATE_MAX_LENGTH = 100;
const POSTCODE_MAX_LENGTH = 20;

// Document categories for individual borrowers
const INDIVIDUAL_DOCUMENT_CATEGORIES = [
  'IC_FRONT', 'IC_BACK', 'PASSPORT', 'WORK_PERMIT', 'SELFIE_LIVENESS', 'OTHER'
] as const;

// Document categories for corporate borrowers
const CORPORATE_DOCUMENT_CATEGORIES = [
  'SSM_CERT', 'FORM_9', 'FORM_13', 'FORM_24', 'FORM_49', 
  'COMPANY_PROFILE', 'DIRECTOR_IC_FRONT', 'DIRECTOR_IC_BACK', 'DIRECTOR_PASSPORT', 'SELFIE_LIVENESS', 'OTHER'
] as const;

// All valid document categories
const ALL_DOCUMENT_CATEGORIES = [...INDIVIDUAL_DOCUMENT_CATEGORIES, ...CORPORATE_DOCUMENT_CATEGORIES] as const;

const optionalAddressField = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().or(z.literal(''));

const POSTCODE_DIGITS_ONLY = /^\d+$/;

const addressFieldsSchema = z.object({
  addressLine1: optionalAddressField(ADDRESS_LINE_MAX_LENGTH),
  addressLine2: optionalAddressField(ADDRESS_LINE_MAX_LENGTH),
  city: optionalAddressField(CITY_MAX_LENGTH),
  state: optionalAddressField(STATE_MAX_LENGTH),
  postcode: optionalAddressField(POSTCODE_MAX_LENGTH).refine(
    (val) => !val || val === '' || POSTCODE_DIGITS_ONLY.test(val),
    'Postcode must contain numbers only'
  ),
  country: z.string().trim().length(2).optional().or(z.literal('')),
});

type AddressInput = {
  address?: string;
  businessAddress?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

type ExistingAddressData = {
  address: string | null;
  businessAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
};

const normalizeOptionalText = (value: string | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCountryCode = (value: string | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
};

const buildLegacyAddress = (data: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}): string | null => {
  const parts = [
    data.addressLine1,
    data.addressLine2,
    data.city,
    data.state,
    data.postcode,
    data.country,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0));

  return parts.length > 0 ? parts.join(', ') : null;
};

const resolveCreateAddressFields = (data: AddressInput) => {
  const legacyAddressInput = normalizeOptionalText(data.businessAddress) ?? normalizeOptionalText(data.address);
  const addressLine1 = normalizeOptionalText(data.addressLine1) ?? legacyAddressInput ?? null;
  const addressLine2 = normalizeOptionalText(data.addressLine2) ?? null;
  const city = normalizeOptionalText(data.city) ?? null;
  const state = normalizeOptionalText(data.state) ?? null;
  const postcode = normalizeOptionalText(data.postcode) ?? null;
  const country = normalizeCountryCode(data.country) ?? null;

  const legacyAddress = buildLegacyAddress({
    addressLine1,
    addressLine2,
    city,
    state,
    postcode,
    country,
  }) ?? legacyAddressInput ?? null;

  return {
    addressLine1,
    addressLine2,
    city,
    state,
    postcode,
    country,
    legacyAddress,
  };
};

const resolveUpdatedAddressFields = (existing: ExistingAddressData, data: AddressInput) => {
  const legacyAddressInput = data.businessAddress !== undefined
    ? normalizeOptionalText(data.businessAddress)
    : data.address !== undefined
      ? normalizeOptionalText(data.address)
      : undefined;

  const addressLine1 = data.addressLine1 !== undefined
    ? normalizeOptionalText(data.addressLine1)
    : legacyAddressInput !== undefined
      ? legacyAddressInput
      : existing.addressLine1;
  const addressLine2 = data.addressLine2 !== undefined ? normalizeOptionalText(data.addressLine2) : existing.addressLine2;
  const city = data.city !== undefined ? normalizeOptionalText(data.city) : existing.city;
  const state = data.state !== undefined ? normalizeOptionalText(data.state) : existing.state;
  const postcode = data.postcode !== undefined ? normalizeOptionalText(data.postcode) : existing.postcode;
  const country = data.country !== undefined ? normalizeCountryCode(data.country) : existing.country;

  const legacyAddress = buildLegacyAddress({
    addressLine1: addressLine1 ?? null,
    addressLine2: addressLine2 ?? null,
    city: city ?? null,
    state: state ?? null,
    postcode: postcode ?? null,
    country: country ?? null,
  }) ?? legacyAddressInput ?? existing.businessAddress ?? existing.address ?? null;

  return {
    addressLine1: addressLine1 ?? null,
    addressLine2: addressLine2 ?? null,
    city: city ?? null,
    state: state ?? null,
    postcode: postcode ?? null,
    country: country ?? null,
    legacyAddress,
  };
};

type BorrowerVerificationSummary = 'FULLY_VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';

function resolveVerificationStatus(borrower: {
  borrowerType: string;
  documentVerified: boolean;
  verificationStatus?: string | null;
  trueIdentityStatus: string | null;
  trueIdentityResult: string | null;
  directors?: Array<{
    trueIdentityStatus: string | null;
    trueIdentityResult: string | null;
  }>;
}): BorrowerVerificationSummary {
  if (
    borrower.verificationStatus === 'FULLY_VERIFIED' ||
    borrower.verificationStatus === 'PARTIALLY_VERIFIED' ||
    borrower.verificationStatus === 'UNVERIFIED'
  ) {
    return borrower.verificationStatus;
  }
  return getBorrowerVerificationSummary(borrower);
}

export type { DataConsistencyLevel };

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
  // Optional social media profile links (URLs or usernames)
  instagram: z.string().max(500).optional().or(z.literal('')),
  tiktok: z.string().max(500).optional().or(z.literal('')),
  facebook: z.string().max(500).optional().or(z.literal('')),
  linkedin: z.string().max(500).optional().or(z.literal('')),
  xTwitter: z.string().max(500).optional().or(z.literal('')),
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
const updateDirectorSchema = directorSchema.extend({
  id: z.string().cuid().optional(),
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
}).merge(individualFieldsSchema).merge(corporateFieldsSchema).merge(addressFieldsSchema);

const updateBorrowerSchema = z.object({
  borrowerType: z.enum(BORROWER_TYPE_VALUES).optional(),
  name: z.string().min(2).max(200).optional(),
  icNumber: z.string().min(6).max(20).optional(),
  documentType: z.enum(DOCUMENT_TYPE_VALUES).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  directors: z.array(updateDirectorSchema).min(1).max(10).optional(),
}).merge(individualFieldsSchema).merge(corporateFieldsSchema).merge(addressFieldsSchema);

const crossTenantLookupQuerySchema = z.object({
  borrowerType: z.enum(BORROWER_TYPE_VALUES),
  identifier: z.string().trim().min(3).max(64),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(500).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postcode: z.string().trim().max(20).optional(),
});

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
        directors: {
          select: {
            trueIdentityStatus: true,
            trueIdentityResult: true,
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

    const borrowersWithVerification = borrowers.map((borrower) => ({
      ...borrower,
      verificationStatus: resolveVerificationStatus(borrower),
    }));

    res.json({
      success: true,
      data: borrowersWithVerification,
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
    const borrowerId = req.params.borrowerId;
    const [borrower, totalBorrowedRes, totalPaidRes, guarantorCount] = await Promise.all([
      prisma.borrower.findFirst({
        where: {
          id: borrowerId,
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
          documents: {
            orderBy: { uploadedAt: 'desc' },
          },
          directors: {
            orderBy: { order: 'asc' },
          },
          performanceProjection: true,
          trueIdentitySessions: {
            where: { status: 'completed', result: 'approved' },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { verificationDocumentUrls: true },
          },
        },
      }),
      prisma.loan.aggregate({
        where: {
          borrowerId,
          tenantId: req.tenantId!,
          disbursementDate: { not: null },
        },
        _sum: { principalAmount: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: {
          tenantId: req.tenantId!,
          loan: { borrowerId },
        },
        _sum: { totalAmount: true },
      }),
      prisma.loanGuarantor.count({
        where: {
          tenantId: req.tenantId!,
          borrowerId,
        },
      }),
    ]);

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const resolvedVerificationStatus = resolveVerificationStatus(borrower);
    const loanSummary = {
      totalBorrowed: toSafeNumber(totalBorrowedRes._sum.principalAmount),
      totalPaid: toSafeNumber(totalPaidRes._sum.totalAmount),
    };

    res.json({
      success: true,
      data: {
        ...borrower,
        verificationStatus: resolvedVerificationStatus,
        loanSummary,
        guarantorCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get cross-tenant borrower insights (lookup by identifier).
 * Includes lender names and aggregated risk/payment signals.
 * GET /api/borrowers/cross-tenant-insights/lookup
 */
router.get('/cross-tenant-insights/lookup', async (req, res, next) => {
  try {
    const parsed = crossTenantLookupQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid lookup query');
    }

    const {
      borrowerType,
      identifier,
      name,
      phone,
      address,
      addressLine1,
      addressLine2,
      city,
      state,
      postcode,
    } = parsed.data;

    const data = await runCrossTenantLookup(req.tenantId!, {
      borrowerType,
      identifier,
      name,
      phone,
      address,
      addressLine1,
      addressLine2,
      city,
      state,
      postcode,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get cross-tenant borrower insights for an existing borrower.
 * Includes lender names and aggregated risk/payment signals.
 * GET /api/borrowers/:borrowerId/cross-tenant-insights
 */
router.get('/:borrowerId/cross-tenant-insights', async (req, res, next) => {
  try {
    const borrowerId = req.params.borrowerId;
    const buildEmptyInsights = () => ({
      hasHistory: false,
      otherLenderCount: 0,
      lenderNames: [] as string[],
      recentLoans: [] as Array<{
        id: string;
        lenderName: string | null;
        loanAmountRange: string | null;
        status: string;
        paymentPerformance: {
          onTimeRateRange: string | null;
        };
        agreementDate: string | null;
        disbursementDate: string | null;
        createdAt: string;
        updatedAt: string;
        lastActivityAt: string | null;
      }>,
      totalLoans: 0,
      activeLoans: 0,
      completedLoans: 0,
      defaultedLoans: 0,
      latePaymentsCount: 0,
      totalBorrowedRange: null as string | null,
      paymentPerformance: {
        rating: 'NO_HISTORY' as CrossTenantPerformanceRating,
        onTimeRateRange: null as string | null,
      },
      lastBorrowedAt: null as string | null,
      lastActivityAt: null as string | null,
      nameConsistency: 'NOT_AVAILABLE' as DataConsistencyLevel,
      phoneConsistency: 'NOT_AVAILABLE' as DataConsistencyLevel,
      addressConsistency: 'NOT_AVAILABLE' as DataConsistencyLevel,
    });

    const borrower = await prisma.borrower.findFirst({
      where: {
        id: borrowerId,
        tenantId: req.tenantId,
      },
      select: {
        borrowerType: true,
        icNumber: true,
        ssmRegistrationNo: true,
        name: true,
        phone: true,
        companyPhone: true,
        companyName: true,
        address: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postcode: true,
        businessAddress: true,
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const isCorporate = borrower.borrowerType === 'CORPORATE';
    const ssmValue = borrower.ssmRegistrationNo?.trim() || '';
    const icValue = borrower.icNumber?.trim() || '';
    // For corporate borrowers, prioritize SSM and avoid digit-only normalization
    // to prevent accidental collisions across different SSM formats.
    const useSsmMatch = isCorporate && ssmValue.length > 0;
    const rawMatchValue = useSsmMatch ? ssmValue : icValue;

    const matchValuesSet = new Set<string>();
    if (rawMatchValue.length > 0) {
      matchValuesSet.add(rawMatchValue);
    }

    // Only apply IC-style normalization when matching by IC/fallback IC.
    if (!useSsmMatch) {
      const normalizedMatchValue = normalizeIdentityNumber(rawMatchValue);
      if (normalizedMatchValue.length > 0) {
        matchValuesSet.add(normalizedMatchValue);
      }
      if (normalizedMatchValue.length === 12 && /^\d{12}$/.test(normalizedMatchValue)) {
        matchValuesSet.add(
          `${normalizedMatchValue.slice(0, 6)}-${normalizedMatchValue.slice(6, 8)}-${normalizedMatchValue.slice(8)}`
        );
      }
    }
    const matchValues = Array.from(matchValuesSet);

    if (matchValues.length === 0) {
      res.json({
        success: true,
        data: buildEmptyInsights(),
      });
      return;
    }

    const matchWhere: Prisma.BorrowerWhereInput = borrower.borrowerType === 'CORPORATE'
      ? (
          useSsmMatch
            ? {
                tenantId: { not: req.tenantId! },
                borrowerType: 'CORPORATE',
                ssmRegistrationNo: { in: matchValues },
              }
            : {
                tenantId: { not: req.tenantId! },
                borrowerType: 'CORPORATE',
                OR: [
                  { icNumber: { in: matchValues } },
                  { ssmRegistrationNo: { in: matchValues } },
                ],
              }
        )
      : {
          tenantId: { not: req.tenantId! },
          borrowerType: 'INDIVIDUAL',
          icNumber: { in: matchValues },
        };

    const matchedBorrowers = await prisma.borrower.findMany({
      where: matchWhere,
      select: {
        id: true,
        name: true,
        phone: true,
        companyPhone: true,
        companyName: true,
        address: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postcode: true,
        businessAddress: true,
        performanceProjection: {
          select: {
            riskLevel: true,
            paidOnTimeCount: true,
            paidLateCount: true,
            overdueCount: true,
            lastPaymentAt: true,
          },
        },
      },
    });

    if (matchedBorrowers.length === 0) {
      res.json({
        success: true,
        data: buildEmptyInsights(),
      });
      return;
    }

    const matchedBorrowerIds = matchedBorrowers.map((item) => item.id);

    const loanWhere = {
      borrowerId: { in: matchedBorrowerIds },
      tenantId: { not: req.tenantId! },
      disbursementDate: { not: null },
      principalAmount: { gt: 0 },
    };

    const [loanAggregate, loanStatusGroups, loansByTenant, recentLoans] = await Promise.all([
      prisma.loan.aggregate({
        where: loanWhere,
        _max: { disbursementDate: true },
        _count: { id: true },
      }),
      prisma.loan.groupBy({
        by: ['status'],
        where: loanWhere,
        _count: { _all: true },
      }),
      prisma.loan.groupBy({
        by: ['tenantId'],
        where: loanWhere,
        _sum: { principalAmount: true },
      }),
      prisma.loan.findMany({
        where: loanWhere,
        orderBy: [
          { disbursementDate: 'desc' },
          { agreementDate: 'desc' },
          { createdAt: 'desc' },
        ],
        take: CROSS_TENANT_RECENT_LOANS_LIMIT,
        select: {
          id: true,
          tenantId: true,
          principalAmount: true,
          repaymentRate: true,
          status: true,
          agreementDate: true,
          disbursementDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const totalLoans = loanAggregate._count.id ?? 0;
    if (totalLoans === 0) {
      res.json({
        success: true,
        data: buildEmptyInsights(),
      });
      return;
    }

    const statusCounts = loanStatusGroups.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    const activeLoans = (statusCounts.ACTIVE ?? 0) + (statusCounts.IN_ARREARS ?? 0);
    const completedLoans = statusCounts.COMPLETED ?? 0;
    const defaultedLoans = (statusCounts.DEFAULTED ?? 0) + (statusCounts.WRITTEN_OFF ?? 0);

    const projectionAggregate = matchedBorrowers.reduce(
      (acc, item) => {
        const projection = item.performanceProjection;
        if (!projection) return acc;

        acc.paidOnTime += projection.paidOnTimeCount;
        acc.paidLate += projection.paidLateCount;
        acc.overdue += projection.overdueCount;
        acc.riskLevels.push(projection.riskLevel);
        if (!acc.lastPaymentAt || (projection.lastPaymentAt && projection.lastPaymentAt > acc.lastPaymentAt)) {
          acc.lastPaymentAt = projection.lastPaymentAt;
        }
        return acc;
      },
      {
        paidOnTime: 0,
        paidLate: 0,
        overdue: 0,
        riskLevels: [] as Array<string | null>,
        lastPaymentAt: null as Date | null,
      }
    );

    const projectionSampleSize =
      projectionAggregate.paidOnTime + projectionAggregate.paidLate + projectionAggregate.overdue;
    const onTimeRate = projectionSampleSize > 0
      ? (projectionAggregate.paidOnTime / projectionSampleSize) * 100
      : null;
    let rating = resolveCrossTenantRiskRating(projectionAggregate.riskLevels);
    if (rating === 'NO_HISTORY' && defaultedLoans > 0) {
      rating = 'DEFAULTED';
    }

    const totalBorrowedPerLender = loansByTenant
      .map((row) => toSafeNumber(row._sum.principalAmount))
      .filter((v) => v > 0);
    const totalBorrowedRange =
      totalBorrowedPerLender.length > 0
        ? (() => {
            const minVal = Math.min(...totalBorrowedPerLender);
            const maxVal = Math.max(...totalBorrowedPerLender);
            const minLabel = getTotalBorrowedBucketLabel(minVal);
            const maxLabel = getTotalBorrowedBucketLabel(maxVal);
            return minLabel === maxLabel ? minLabel : `${minLabel} to ${maxLabel}`;
          })()
        : null;
    const lenders = await prisma.tenant.findMany({
      where: { id: { in: loansByTenant.map((row) => row.tenantId) } },
      select: { id: true, name: true },
    });
    const lenderNameById = new Map(lenders.map((l) => [l.id, l.name]));
    const lenderNames = loansByTenant
      .map((row) => lenderNameById.get(row.tenantId))
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => a.localeCompare(b));
    const recentLoanLastPaymentRows = recentLoans.length > 0
      ? await prisma.paymentTransaction.groupBy({
          by: ['loanId'],
          where: {
            tenantId: { not: req.tenantId! },
            loanId: { in: recentLoans.map((loan) => loan.id) },
          },
          _max: { paymentDate: true },
        })
      : [];
    const recentLoanLastPaymentByLoanId = new Map(
      recentLoanLastPaymentRows.map((row) => [row.loanId, row._max.paymentDate ?? null])
    );

    const recentLoanDetails = recentLoans.map((loan) => ({
      id: loan.id,
      lenderName: lenderNameById.get(loan.tenantId) ?? null,
      loanAmountRange: getTotalBorrowedBucketLabel(toSafeNumber(loan.principalAmount)),
      status: loan.status,
      paymentPerformance: {
        onTimeRateRange: toPercentageRange(
          loan.repaymentRate === null ? null : toSafeNumber(loan.repaymentRate)
        ),
      },
      agreementDate: loan.agreementDate?.toISOString() ?? null,
      disbursementDate: loan.disbursementDate?.toISOString() ?? null,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
      lastActivityAt: recentLoanLastPaymentByLoanId.get(loan.id)?.toISOString() ?? null,
    }));

    const currentDisplayName =
      borrower.borrowerType === 'CORPORATE'
        ? (borrower.companyName || borrower.name) || ''
        : (borrower.name || '');
    const currentPhone =
      borrower.borrowerType === 'CORPORATE'
        ? (borrower.companyPhone || borrower.phone)
        : borrower.phone;
    const currentAddress = buildAddressString(borrower);
    const nameConsistency = aggregateConsistency(
      matchedBorrowers.map((m) => {
        const matchedName = borrower.borrowerType === 'CORPORATE' ? (m.companyName || m.name) || '' : (m.name || '');
        return computeNameConsistency(currentDisplayName, matchedName);
      })
    );
    const phoneConsistency = aggregateConsistency(
      matchedBorrowers.map((m) => {
        const matchedPhone = borrower.borrowerType === 'CORPORATE' ? (m.companyPhone || m.phone) : m.phone;
        return computePhoneConsistency(currentPhone, matchedPhone);
      })
    );
    const addressConsistency = aggregateConsistency(
      matchedBorrowers.map((m) => computeAddressConsistency(currentAddress, buildAddressString(m)))
    );

    res.json({
      success: true,
      data: {
        hasHistory: true,
        otherLenderCount: loansByTenant.length,
        lenderNames,
        recentLoans: recentLoanDetails,
        totalLoans,
        activeLoans,
        completedLoans,
        defaultedLoans,
        latePaymentsCount: projectionAggregate.paidLate,
        totalBorrowedRange,
        paymentPerformance: {
          rating,
          onTimeRateRange: toPercentageRange(onTimeRate),
        },
        lastBorrowedAt: loanAggregate._max.disbursementDate?.toISOString() ?? null,
        lastActivityAt: projectionAggregate.lastPaymentAt?.toISOString() ?? null,
        nameConsistency,
        phoneConsistency,
        addressConsistency,
      },
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

const verifyStartSchema = z.object({
  directorId: z.string().cuid().optional(),
});

/**
 * Start TrueIdentity verification
 * POST /api/borrowers/:borrowerId/verify/start
 * Body: { directorId?: string } - Required for CORPORATE borrowers (KYC is per director)
 */
router.post('/:borrowerId/verify/start', async (req, res, next) => {
  try {
    const borrowerId = req.params.borrowerId;
    const body = verifyStartSchema.safeParse(req.body ?? {});
    const directorId = body.success ? body.data.directorId : undefined;

    const borrower = await prisma.borrower.findFirst({
      where: {
        id: borrowerId,
        tenantId: req.tenantId,
      },
      include: {
        directors: { orderBy: { order: 'asc' } },
        tenant: { select: { slug: true, name: true } },
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    let name: string;
    let icNumber: string;
    let targetDirectorId: string | undefined;

    if (borrower.borrowerType === 'CORPORATE') {
      if (!directorId) {
        res.status(400).json({
          success: false,
          error: 'directorId is required for corporate borrowers. KYC is per director.',
        });
        return;
      }
      const director = borrower.directors.find((d) => d.id === directorId);
      if (!director) {
        res.status(404).json({
          success: false,
          error: 'Director not found for this borrower',
        });
        return;
      }
      name = director.name;
      icNumber = director.icNumber;
      targetDirectorId = directorId;
    } else {
      if (directorId) {
        res.status(400).json({
          success: false,
          error: 'directorId should not be provided for individual borrowers',
        });
        return;
      }
      name = borrower.name;
      icNumber = borrower.icNumber;
    }

    /** Pro: public TrueStack KYC API (same model as borrower self-service) — no TrueStack Admin client provisioning. */
    if (config.productMode === 'pro') {
      const base = config.truestackKyc.publicWebhookBaseUrl;
      const key = config.truestackKyc.apiKey;
      if (!key || !base) {
        res.status(503).json({
          success: false,
          error:
            'TrueStack KYC is not configured. Set TRUESTACK_KYC_API_KEY and TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL on the server.',
        });
        return;
      }
      const webhookUrl = new URL('/api/webhooks/truestack-kyc', base).href;
      const documentType = borrower.documentType === 'PASSPORT' ? '2' : '1';
      const metadata: Record<string, unknown> = {
        borrowerId,
        tenantId: req.tenantId!,
      };
      if (targetDirectorId) metadata.directorId = targetDirectorId;

      let ts: Awaited<ReturnType<typeof createKycSession>>;
      try {
        ts = await createKycSession({
          document_name: name,
          document_number: icNumber,
          webhook_url: webhookUrl,
          document_type: documentType,
          platform: 'Web',
          redirect_url: config.truestackKyc.redirectUrl,
          metadata,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'TrueStack KYC create session failed';
        res.status(502).json({ success: false, error: msg });
        return;
      }

      const expiresAt = ts.expires_at ? new Date(ts.expires_at) : null;

      await prisma.$transaction(async (tx) => {
        // Do not expire completed+approved rows (audit + status API can prefer them after retries)
        await tx.truestackKycSession.updateMany({
          where: {
            tenantId: req.tenantId!,
            borrowerId,
            directorId: targetDirectorId,
            NOT: {
              AND: [{ status: 'completed' }, { result: 'approved' }],
            },
          },
          data: {
            status: 'expired',
            result: null,
          },
        });

        if (borrower.borrowerType === 'INDIVIDUAL') {
          await tx.borrower.update({
            where: { id: borrowerId },
            data: {
              documentVerified: false,
              verifiedAt: null,
              verifiedBy: null,
              verificationStatus: 'UNVERIFIED',
              trueIdentityStatus: null,
              trueIdentityResult: null,
              trueIdentityRejectMessage: null,
              trueIdentitySessionId: null,
              trueIdentityOnboardingUrl: null,
              trueIdentityExpiresAt: null,
              trueIdentityLastWebhookAt: null,
            },
          });
        }

        await tx.truestackKycSession.create({
          data: {
            tenantId: req.tenantId!,
            borrowerId,
            directorId: targetDirectorId,
            externalSessionId: ts.id,
            onboardingUrl: ts.onboarding_url,
            expiresAt,
            status: ts.status || 'pending',
          },
        });
      });

      res.status(200).json({
        success: true,
        data: {
          sessionId: ts.id,
          onboardingUrl: ts.onboarding_url,
          status: ts.status || 'pending',
          expiresAt: (expiresAt ?? new Date()).toISOString(),
          directorId: targetDirectorId ?? undefined,
        },
      });
      return;
    }

    const hasAddOn = await AddOnService.hasActiveAddOn(req.tenantId!, 'TRUEIDENTITY');
    if (!hasAddOn) {
      res.status(403).json({
        success: false,
        error: 'TrueIdentity add-on is not active for this tenant',
      });
      return;
    }

    // Admin uses KREDIT_BACKEND_URL to resolve webhook delivery. Kredit sends path-only.
    const WEBHOOK_PATH = '/api/webhooks/trueidentity';

    const documentType = borrower.documentType === 'PASSPORT' ? '2' : '1';

    // Mark any existing non-completed KYC sessions as expired before creating a new one (retry/restart flow)
    await prisma.trueIdentitySession.updateMany({
      where: {
        borrowerId,
        ...(targetDirectorId ? { directorId: targetDirectorId } : { directorId: null }),
        status: { not: 'completed' },
      },
      data: { status: 'expired', updatedAt: new Date() },
    });

    const adminRes = await requestVerificationSession({
      tenantId: req.tenantId!,
      tenantSlug: borrower.tenant.slug,
      tenantName: borrower.tenant.name,
      borrowerId,
      name,
      icNumber,
      documentType,
      webhookUrl: WEBHOOK_PATH,
    });

    const expiresAt = adminRes.expires_at ? new Date(adminRes.expires_at) : new Date(Date.now() + 15 * 60 * 1000);

    const sessionPayload = {
      tenantId: req.tenantId!,
      borrowerId,
      name,
      icNumber,
      webhookUrl: WEBHOOK_PATH,
      ...(targetDirectorId && { directorId: targetDirectorId }),
    };

    if (targetDirectorId) {
      await prisma.$transaction([
        prisma.trueIdentitySession.upsert({
          where: { adminSessionId: adminRes.session_id },
          create: {
            tenantId: req.tenantId!,
            borrowerId,
            directorId: targetDirectorId,
            adminSessionId: adminRes.session_id,
            onboardingUrl: adminRes.onboarding_url,
            status: adminRes.status || 'pending',
            expiresAt,
            requestPayload: sessionPayload,
          },
          update: {
            onboardingUrl: adminRes.onboarding_url,
            status: adminRes.status || 'pending',
            expiresAt,
            updatedAt: new Date(),
          },
        }),
        prisma.borrowerDirector.update({
          where: { id: targetDirectorId },
          data: {
            trueIdentityStatus: adminRes.status || 'pending',
            trueIdentitySessionId: adminRes.session_id,
            trueIdentityOnboardingUrl: adminRes.onboarding_url,
            trueIdentityExpiresAt: expiresAt,
          },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.trueIdentitySession.upsert({
          where: { adminSessionId: adminRes.session_id },
          create: {
            tenantId: req.tenantId!,
            borrowerId,
            adminSessionId: adminRes.session_id,
            onboardingUrl: adminRes.onboarding_url,
            status: adminRes.status || 'pending',
            expiresAt,
            requestPayload: sessionPayload,
          },
          update: {
            onboardingUrl: adminRes.onboarding_url,
            status: adminRes.status || 'pending',
            expiresAt,
            updatedAt: new Date(),
          },
        }),
        prisma.borrower.update({
          where: { id: borrowerId },
          data: {
            trueIdentityStatus: adminRes.status || 'pending',
            trueIdentitySessionId: adminRes.session_id,
            trueIdentityOnboardingUrl: adminRes.onboarding_url,
            trueIdentityExpiresAt: expiresAt,
          },
        }),
      ]);
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: adminRes.session_id,
        onboardingUrl: adminRes.onboarding_url,
        status: adminRes.status || 'pending',
        expiresAt: expiresAt.toISOString(),
        directorId: targetDirectorId ?? undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get TrueIdentity verification status
 * GET /api/borrowers/:borrowerId/verify/status
 * For INDIVIDUAL: returns single status
 * For CORPORATE: returns directors array with per-director status
 */
router.get('/:borrowerId/verify/status', async (req, res, next) => {
  try {
    const borrowerId = req.params.borrowerId;

    const borrower = await prisma.borrower.findFirst({
      where: {
        id: borrowerId,
        tenantId: req.tenantId,
      },
      include: { directors: { orderBy: { order: 'asc' } } },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    if (borrower.borrowerType === 'CORPORATE') {
      if (config.productMode === 'pro') {
        const kycRows = await prisma.truestackKycSession.findMany({
          where: { borrowerId, tenantId: req.tenantId! },
          orderBy: { createdAt: 'desc' },
        });
        const directors = borrower.directors.map((d) => {
          const rowsForDirector = kycRows.filter((r) => r.directorId === d.id);
          const row = pickBestTruestackKycSession(rowsForDirector);
          return {
            id: d.id,
            name: d.name,
            icNumber: d.icNumber,
            position: d.position,
            status: row?.status ?? d.trueIdentityStatus ?? null,
            result: row?.result ?? d.trueIdentityResult ?? null,
            rejectMessage: row?.rejectMessage ?? d.trueIdentityRejectMessage ?? null,
            onboardingUrl: row?.onboardingUrl ?? d.trueIdentityOnboardingUrl ?? null,
            expiresAt: (row?.expiresAt ?? d.trueIdentityExpiresAt)?.toISOString() ?? null,
            lastWebhookAt: (row?.lastWebhookAt ?? d.trueIdentityLastWebhookAt)?.toISOString() ?? null,
          };
        });
        res.json({
          success: true,
          data: { borrowerType: 'CORPORATE' as const, directors },
        });
        return;
      }
      const directors = borrower.directors.map((d) => ({
        id: d.id,
        name: d.name,
        icNumber: d.icNumber,
        position: d.position,
        status: d.trueIdentityStatus ?? null,
        result: d.trueIdentityResult ?? null,
        rejectMessage: d.trueIdentityRejectMessage ?? null,
        onboardingUrl: d.trueIdentityOnboardingUrl ?? null,
        expiresAt: d.trueIdentityExpiresAt?.toISOString() ?? null,
        lastWebhookAt: d.trueIdentityLastWebhookAt?.toISOString() ?? null,
      }));
      res.json({
        success: true,
        data: { borrowerType: 'CORPORATE' as const, directors },
      });
      return;
    }

    if (config.productMode === 'pro') {
      const individualRows = await prisma.truestackKycSession.findMany({
        where: { borrowerId, tenantId: req.tenantId!, directorId: null },
        orderBy: { createdAt: 'desc' },
      });
      const latest = pickBestTruestackKycSession(individualRows);
      res.json({
        success: true,
        data: {
          borrowerType: 'INDIVIDUAL' as const,
          status: latest?.status ?? borrower.trueIdentityStatus ?? null,
          // Prefer session row (updated by webhook) so admin UI matches borrower self-service
          result: latest?.result ?? borrower.trueIdentityResult ?? null,
          rejectMessage: latest?.rejectMessage ?? borrower.trueIdentityRejectMessage ?? null,
          onboardingUrl: latest?.onboardingUrl ?? borrower.trueIdentityOnboardingUrl ?? null,
          expiresAt: (latest?.expiresAt ?? borrower.trueIdentityExpiresAt)?.toISOString() ?? null,
          lastWebhookAt: (latest?.lastWebhookAt ?? borrower.trueIdentityLastWebhookAt)?.toISOString() ?? null,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        borrowerType: 'INDIVIDUAL' as const,
        status: borrower.trueIdentityStatus ?? null,
        result: borrower.trueIdentityResult ?? null,
        rejectMessage: borrower.trueIdentityRejectMessage ?? null,
        onboardingUrl: borrower.trueIdentityOnboardingUrl ?? null,
        expiresAt: borrower.trueIdentityExpiresAt?.toISOString() ?? null,
        lastWebhookAt: borrower.trueIdentityLastWebhookAt?.toISOString() ?? null,
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
      id: 'id' in director ? director.id : undefined,
      name: director.name.trim(),
      icNumber: director.icNumber.trim(),
      position: director.position?.trim() || null,
      order: index,
    }));
    const normalizedAddress = resolveCreateAddressFields(data);

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
      address: normalizedAddress.legacyAddress,
      addressLine1: normalizedAddress.addressLine1,
      addressLine2: normalizedAddress.addressLine2,
      city: normalizedAddress.city,
      state: normalizedAddress.state,
      postcode: normalizedAddress.postcode,
      country: normalizedAddress.country,
    };

    if (isCorporate) {
      // Corporate borrower fields
      createData.companyName = data.companyName || null;
      createData.ssmRegistrationNo = data.ssmRegistrationNo || null;
      createData.businessAddress = normalizedAddress.legacyAddress;
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

    // Optional social media (both individual and corporate)
    createData.instagram = normalizeOptionalText(data.instagram) ?? null;
    createData.tiktok = normalizeOptionalText(data.tiktok) ?? null;
    createData.facebook = normalizeOptionalText(data.facebook) ?? null;
    createData.linkedin = normalizeOptionalText(data.linkedin) ?? null;
    createData.xTwitter = normalizeOptionalText(data.xTwitter) ?? null;

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
      address: borrower.address,
      addressLine1: borrower.addressLine1,
      addressLine2: borrower.addressLine2,
      city: borrower.city,
      state: borrower.state,
      postcode: borrower.postcode,
      country: borrower.country,
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
      id: 'id' in director ? director.id : undefined,
      name: director.name.trim(),
      icNumber: director.icNumber.trim(),
      position: director.position?.trim() || null,
      order: index,
    }));
    const hasIndividualNameChange =
      data.name !== undefined && data.name.trim() !== existing.name.trim();
    const hasIndividualIcChange =
      data.icNumber !== undefined &&
      normalizeIdentityNumber(data.icNumber) !== normalizeIdentityNumber(existing.icNumber);
    const shouldInvalidateIndividualKyc =
      effectiveBorrowerType === 'INDIVIDUAL' &&
      (hasIndividualNameChange || hasIndividualIcChange);
    
    // Base fields
    if (data.borrowerType !== undefined) updateData.borrowerType = data.borrowerType;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.icNumber !== undefined) updateData.icNumber = data.icNumber;
    if (data.documentType !== undefined) updateData.documentType = data.documentType;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.email !== undefined) updateData.email = data.email || null;
    const hasAddressMutation = [
      data.address,
      data.businessAddress,
      data.addressLine1,
      data.addressLine2,
      data.city,
      data.state,
      data.postcode,
      data.country,
    ].some((value) => value !== undefined);
    if (hasAddressMutation) {
      const resolvedAddress = resolveUpdatedAddressFields(existing, data);
      updateData.addressLine1 = resolvedAddress.addressLine1;
      updateData.addressLine2 = resolvedAddress.addressLine2;
      updateData.city = resolvedAddress.city;
      updateData.state = resolvedAddress.state;
      updateData.postcode = resolvedAddress.postcode;
      updateData.country = resolvedAddress.country;
      updateData.address = resolvedAddress.legacyAddress;
      if (effectiveBorrowerType === 'CORPORATE' || data.businessAddress !== undefined) {
        updateData.businessAddress = resolvedAddress.legacyAddress;
      }
    }

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

    // Optional social media
    if (data.instagram !== undefined) updateData.instagram = normalizeOptionalText(data.instagram) ?? null;
    if (data.tiktok !== undefined) updateData.tiktok = normalizeOptionalText(data.tiktok) ?? null;
    if (data.facebook !== undefined) updateData.facebook = normalizeOptionalText(data.facebook) ?? null;
    if (data.linkedin !== undefined) updateData.linkedin = normalizeOptionalText(data.linkedin) ?? null;
    if (data.xTwitter !== undefined) updateData.xTwitter = normalizeOptionalText(data.xTwitter) ?? null;

    // Corporate borrower fields
    if (data.companyName !== undefined) updateData.companyName = data.companyName || null;
    if (data.ssmRegistrationNo !== undefined) updateData.ssmRegistrationNo = data.ssmRegistrationNo || null;
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
    if (shouldInvalidateIndividualKyc) {
      updateData.trueIdentityStatus = null;
      updateData.trueIdentityResult = null;
      updateData.trueIdentityRejectMessage = null;
      updateData.trueIdentitySessionId = null;
      updateData.trueIdentityOnboardingUrl = null;
      updateData.trueIdentityExpiresAt = null;
      updateData.trueIdentityLastWebhookAt = null;
      updateData.documentVerified = false;
      updateData.verifiedAt = null;
      updateData.verifiedBy = null;
      updateData.verificationStatus = 'UNVERIFIED';
    }

    const borrower = await prisma.$transaction(async (tx) => {
      const updatedBorrower = await tx.borrower.update({
        where: { id: req.params.borrowerId },
        data: updateData as Parameters<typeof prisma.borrower.update>[0]['data'],
      });

      if (data.directors !== undefined) {
        if (effectiveBorrowerType !== 'CORPORATE') {
          await tx.borrowerDirector.deleteMany({
            where: { borrowerId: req.params.borrowerId },
          });
        } else if (normalizedDirectors.length > 0) {
          const existingDirectors = await tx.borrowerDirector.findMany({
            where: { borrowerId: req.params.borrowerId },
            select: { id: true, name: true, icNumber: true },
          });

          const existingById = new Map(existingDirectors.map((d) => [d.id, d]));
          const existingByIc = new Map(existingDirectors.map((d) => [d.icNumber, d]));
          const retainedIds = new Set<string>();

          for (const director of normalizedDirectors) {
            const matchedExisting =
              (director.id ? existingById.get(director.id) : undefined) ??
              existingByIc.get(director.icNumber);

            if (matchedExisting) {
              retainedIds.add(matchedExisting.id);
              const hasDirectorIdentityChange =
                director.name.trim() !== matchedExisting.name.trim() ||
                normalizeIdentityNumber(director.icNumber) !==
                  normalizeIdentityNumber(matchedExisting.icNumber);
              await tx.borrowerDirector.update({
                where: { id: matchedExisting.id },
                data: {
                  name: director.name,
                  icNumber: director.icNumber,
                  position: director.position,
                  order: director.order,
                  ...(hasDirectorIdentityChange && {
                    trueIdentityStatus: null,
                    trueIdentityResult: null,
                    trueIdentityRejectMessage: null,
                    trueIdentitySessionId: null,
                    trueIdentityOnboardingUrl: null,
                    trueIdentityExpiresAt: null,
                    trueIdentityLastWebhookAt: null,
                    trueIdentityDocumentUrls: Prisma.JsonNull,
                  }),
                },
              });
            } else {
              const created = await tx.borrowerDirector.create({
                data: {
                  borrowerId: req.params.borrowerId,
                  name: director.name,
                  icNumber: director.icNumber,
                  position: director.position,
                  order: director.order,
                },
                select: { id: true },
              });
              retainedIds.add(created.id);
            }
          }

          if (retainedIds.size > 0) {
            await tx.borrowerDirector.deleteMany({
              where: {
                borrowerId: req.params.borrowerId,
                id: { notIn: Array.from(retainedIds) },
              },
            });
          } else {
            await tx.borrowerDirector.deleteMany({
              where: { borrowerId: req.params.borrowerId },
            });
          }
        } else {
          await tx.borrowerDirector.deleteMany({
            where: { borrowerId: req.params.borrowerId },
          });
        }

        if (effectiveBorrowerType === 'CORPORATE') {
          const directorStates = await tx.borrowerDirector.findMany({
            where: { borrowerId: req.params.borrowerId },
            select: {
              trueIdentityStatus: true,
              trueIdentityResult: true,
            },
          });
          const verificationStatus = getBorrowerVerificationSummary({
            borrowerType: 'CORPORATE',
            documentVerified: false,
            trueIdentityStatus: null,
            trueIdentityResult: null,
            directors: directorStates,
          });
          const allDirectorsVerified =
            directorStates.length > 0 &&
            directorStates.every(
              (d) => d.trueIdentityStatus === 'completed' && d.trueIdentityResult === 'approved'
            );

          await tx.borrower.update({
            where: { id: updatedBorrower.id },
            data: {
              verificationStatus,
              documentVerified: allDirectorsVerified,
              ...(!allDirectorsVerified && {
                verifiedAt: null,
                verifiedBy: null,
                trueIdentityStatus: null,
                trueIdentityResult: null,
                trueIdentityRejectMessage: null,
                trueIdentitySessionId: null,
                trueIdentityOnboardingUrl: null,
                trueIdentityExpiresAt: null,
                trueIdentityLastWebhookAt: null,
              }),
            },
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
        addressLine1: existing.addressLine1,
        addressLine2: existing.addressLine2,
        city: existing.city,
        state: existing.state,
        postcode: existing.postcode,
        country: existing.country,
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
        instagram: existing.instagram,
        tiktok: existing.tiktok,
        facebook: existing.facebook,
        linkedin: existing.linkedin,
        xTwitter: existing.xTwitter,
      },
      {
        borrowerType: borrower.borrowerType,
        name: borrower.name,
        icNumber: borrower.icNumber,
        documentType: borrower.documentType,
        phone: borrower.phone,
        email: borrower.email,
        address: borrower.address,
        addressLine1: borrower.addressLine1,
        addressLine2: borrower.addressLine2,
        city: borrower.city,
        state: borrower.state,
        postcode: borrower.postcode,
        country: borrower.country,
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
        instagram: borrower.instagram,
        tiktok: borrower.tiktok,
        facebook: borrower.facebook,
        linkedin: borrower.linkedin,
        xTwitter: borrower.xTwitter,
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

    // Borrower documents: only PDF, PNG, JPG allowed (both individual and corporate)
    const BORROWER_ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
    const BORROWER_ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(originalName).toLowerCase();
    if (!BORROWER_ALLOWED_MIME_TYPES.includes(mimeType) || !BORROWER_ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestError(
        'Invalid file type for borrower documents. Allowed: PDF, PNG, JPG only.'
      );
    }

    // Validate category based on borrower type
    // Corporate borrowers only use corporate document categories (no individual IC/passport)
    const validCategories = borrower.borrowerType === 'CORPORATE' 
      ? CORPORATE_DOCUMENT_CATEGORIES
      : INDIVIDUAL_DOCUMENT_CATEGORIES;

    const validSet = new Set(validCategories as readonly string[]);
    if (!validSet.has(category)) {
      throw new ConflictError(`Invalid document category for ${borrower.borrowerType} borrower`);
    }

    const MAX_DOCUMENTS_PER_CATEGORY = 3;
    const existingCount = await prisma.borrowerDocument.count({
      where: {
        borrowerId: req.params.borrowerId,
        category,
      },
    });
    if (existingCount >= MAX_DOCUMENTS_PER_CATEGORY) {
      throw new BadRequestError(
        `Maximum ${MAX_DOCUMENTS_PER_CATEGORY} documents per category allowed. This category already has ${existingCount} document(s).`
      );
    }

    // Save the file
    ensureDocumentsDir();
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
