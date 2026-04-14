import path from 'path';
import { randomBytes } from 'crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { requireBorrowerSession } from '../../middleware/authenticateBorrower.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { runCrossTenantLookup } from '../../lib/crossTenantLookupService.js';
import { parseDocumentUpload, saveDocumentFile, deleteDocumentFile, ensureDocumentsDir } from '../../lib/upload.js';
import { assertIdentityDocumentMutationAllowed } from '../../lib/identityLock.js';
import { performBorrowerUpdate, updateBorrowerSchema } from '../borrowers/borrowerUpdateService.js';
import { createKycSession, refreshKycSession } from '../truestack-kyc/publicApiClient.js';
import { ingestTruestackKycDocuments } from '../truestack-kyc/ingestKycDocuments.js';
import { pickBestTruestackKycSession } from '../../lib/truestackKycSessionPick.js';
import { resolveProTenant, requireActiveBorrower } from './borrowerContext.js';
import { subscribeBorrowerTruestackKyc } from '../../lib/truestackKycSseHub.js';
import { normalizeCorporateDirectorFlags } from '../../lib/borrowerDirectorAuthorizedRep.js';
import {
  canManageCompanyProfile,
  canManageCompanyMembers,
  createBorrowerCompanyOrgAndLink,
  getOrgRoleForBorrower,
  isOpenInviteEmail,
  lazyEnsureBorrowerCompanyOrganization,
  orgDisplayNameFromBorrower,
  resolveOrgIdForBorrower,
  syntheticOpenInviteEmail,
} from './borrowerCompanyOrg.js';

const router = Router();

// Document categories - align with borrowers module
const INDIVIDUAL_DOCUMENT_CATEGORIES = [
  'IC_FRONT', 'IC_BACK', 'PASSPORT', 'WORK_PERMIT', 'SELFIE_LIVENESS', 'OTHER',
] as const;
const CORPORATE_DOCUMENT_CATEGORIES = [
  'SSM_CERT', 'FORM_9', 'FORM_13', 'FORM_24', 'FORM_49',
  'COMPANY_PROFILE', 'COMPANY_RESOLUTION', 'DIRECTOR_IC_FRONT', 'DIRECTOR_IC_BACK', 'DIRECTOR_PASSPORT', 'SELFIE_LIVENESS', 'OTHER',
] as const;
const MAX_DOCUMENTS_PER_CATEGORY = 3;

const BORROWER_TYPE_VALUES = ['INDIVIDUAL', 'CORPORATE'] as const;
const DOCUMENT_TYPE_VALUES = ['IC', 'PASSPORT'] as const;
const GENDER_VALUES = ['MALE', 'FEMALE'] as const;
const RACE_VALUES = ['MELAYU', 'CINA', 'INDIA', 'LAIN_LAIN', 'BUMIPUTRA_SABAH_SARAWAK', 'BUKAN_WARGANEGARA'] as const;
const EDUCATION_LEVEL_VALUES = ['NO_FORMAL', 'PRIMARY', 'SECONDARY', 'DIPLOMA', 'DEGREE', 'POSTGRADUATE'] as const;
const EMPLOYMENT_STATUS_VALUES = ['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT'] as const;
const BANK_VALUES = [
  'MAYBANK', 'CIMB', 'PUBLIC_BANK', 'RHB', 'HONG_LEONG', 'AMBANK', 'BANK_RAKYAT',
  'BANK_ISLAM', 'AFFIN', 'ALLIANCE', 'OCBC', 'HSBC', 'UOB', 'STANDARD_CHARTERED',
  'CITIBANK', 'BSN', 'AGROBANK', 'MUAMALAT', 'MBSB', 'OTHER',
] as const;

const optionalText = (v: string | undefined) => (v?.trim() || null);
const optionalCountry = (v: string | undefined) => (v?.trim().toUpperCase() || null);

const addressFieldsSchema = z.object({
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postcode: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
});

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

const onboardingSchema = z.object({
  borrowerType: z.enum(BORROWER_TYPE_VALUES),
  name: z.string().min(2).max(200),
  icNumber: z.string().min(6).max(20).optional(), // Required for INDIVIDUAL; for CORPORATE can use ssmRegistrationNo
  documentType: z.enum(DOCUMENT_TYPE_VALUES).default('IC'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postcode: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
  // Individual
  dateOfBirth: z.string().optional().or(z.literal('')),
  gender: z.enum(GENDER_VALUES).optional(),
  race: z.enum(RACE_VALUES).optional(),
  educationLevel: z.enum(EDUCATION_LEVEL_VALUES).optional(),
  occupation: z.string().max(200).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUS_VALUES).optional(),
  bankName: z.enum(BANK_VALUES).optional(),
  bankNameOther: z.string().max(100).optional(),
  bankAccountNo: z.string().max(20).optional(),
  monthlyIncome: z.number().min(0).optional().or(z.literal(null)),
  emergencyContactName: z.string().max(200).optional().or(z.literal('')),
  emergencyContactPhone: z.string().max(20).optional().or(z.literal('')),
  emergencyContactRelationship: z.string().max(100).optional().or(z.literal('')),
  instagram: z.string().max(500).optional().or(z.literal('')),
  tiktok: z.string().max(500).optional().or(z.literal('')),
  facebook: z.string().max(500).optional().or(z.literal('')),
  linkedin: z.string().max(500).optional().or(z.literal('')),
  xTwitter: z.string().max(500).optional().or(z.literal('')),
  // Corporate
  companyName: z.string().max(200).optional(),
  ssmRegistrationNo: z.string().max(50).optional(),
  businessAddress: z.string().max(500).optional(),
  authorizedRepName: z.string().max(200).optional(),
  authorizedRepIc: z.string().max(20).optional(),
  companyPhone: z.string().max(20).optional(),
  companyEmail: z.string().email().optional().or(z.literal('')),
  natureOfBusiness: z.string().max(200).optional().or(z.literal('')),
  dateOfIncorporation: z.string().optional().or(z.literal('')),
  paidUpCapital: z.number().min(0).optional().or(z.literal(null)),
  numberOfEmployees: z.number().int().min(0).optional().or(z.literal(null)),
  bumiStatus: z.enum(['BUMI', 'BUKAN_BUMI', 'ASING']).optional(),
  directors: z.array(z.object({
    name: z.string().min(2).max(200),
    icNumber: z.string().min(6).max(20),
    position: z.string().max(100).optional(),
    isAuthorizedRepresentative: z.boolean().optional(),
  })).min(0).max(10).optional(),
}).merge(addressFieldsSchema);

function buildLegacyAddress(data: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}): string | null {
  const parts = [
    data.addressLine1,
    data.addressLine2,
    data.city,
    data.state,
    data.postcode,
    data.country,
  ].filter((p): p is string => Boolean(p?.trim()));
  return parts.length > 0 ? parts.join(', ') : null;
}

/** GET /api/borrower-auth/lender — company (tenant) details for the borrower-facing About page */
router.get('/lender', async (req, res, next) => {
  try {
    const tenant = await resolveProTenant();
    res.json({
      success: true,
      data: {
        name: tenant.name,
        type: tenant.type,
        licenseNumber: tenant.licenseNumber,
        registrationNumber: tenant.registrationNumber,
        email: tenant.email,
        contactNumber: tenant.contactNumber,
        businessAddress: tenant.businessAddress,
        logoUrl: tenant.logoUrl,
        lenderBankCode: tenant.lenderBankCode,
        lenderBankOtherName: tenant.lenderBankOtherName,
        lenderAccountHolderName: tenant.lenderAccountHolderName,
        lenderAccountNumber: tenant.lenderAccountNumber,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.use(requireBorrowerSession);

/** GET /api/borrower-auth/me - current user, profiles, active borrower */
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const tenant = await resolveProTenant();

    const links = await prisma.borrowerProfileLink.findMany({
      where: { userId, tenantId: tenant.id },
      include: {
        borrower: {
          select: {
            id: true,
            name: true,
            borrowerType: true,
            icNumber: true,
            phone: true,
            email: true,
            companyName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const profiles = links.map((l) => ({
      id: l.borrowerId,
      name: l.borrower.name,
      companyName: l.borrower.companyName ?? null,
      borrowerType: l.borrowerType,
      icNumber: l.borrower.icNumber,
      phone: l.borrower.phone,
      email: l.borrower.email,
    }));

    const activeBorrowerId = req.borrowerUser!.activeBorrowerId;
    const activeBorrower = activeBorrowerId && profiles.some((p) => p.id === activeBorrowerId)
      ? profiles.find((p) => p.id === activeBorrowerId)!
      : profiles[0] ?? null;

    res.json({
      success: true,
      data: {
        user: {
          id: userId,
          email: req.borrowerUser!.email,
          name: req.borrowerUser!.name,
        },
        profileCount: profiles.length,
        profiles,
        activeBorrower,
        // Return actual session value so frontend knows when to call switch-profile
        activeBorrowerId: activeBorrowerId ?? null,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/profiles - list linked borrower profiles */
router.get('/profiles', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const tenant = await resolveProTenant();

    const links = await prisma.borrowerProfileLink.findMany({
      where: { userId, tenantId: tenant.id },
      include: {
        borrower: {
          select: {
            id: true,
            name: true,
            borrowerType: true,
            icNumber: true,
            phone: true,
            email: true,
            companyName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: links.map((l) => ({
        id: l.borrowerId,
        name: l.borrower.name,
        companyName: l.borrower.companyName ?? null,
        borrowerType: l.borrowerType,
        icNumber: l.borrower.icNumber,
        phone: l.borrower.phone,
        email: l.borrower.email,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/borrower-auth/switch-profile - set active borrower */
router.post('/switch-profile', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const { borrowerId } = z.object({ borrowerId: z.string().cuid() }).parse(req.body);

    const link = await prisma.borrowerProfileLink.findFirst({
      where: { userId, borrowerId },
    });

    if (!link) {
      throw new BadRequestError('Borrower profile not found or not linked to you');
    }

    const sessionToken = req.borrowerUser!.sessionToken;
    const sessionId = req.borrowerUser!.sessionId;

    const borrowerRow = await prisma.borrower.findFirst({
      where: { id: borrowerId },
      select: { borrowerType: true },
    });
    if (borrowerRow?.borrowerType === 'CORPORATE') {
      await lazyEnsureBorrowerCompanyOrganization(borrowerId);
    }
    const orgId =
      borrowerRow?.borrowerType === 'CORPORATE'
        ? await resolveOrgIdForBorrower(borrowerId)
        : null;

    const sessionPatch = {
      activeBorrowerId: borrowerId,
      activeOrganizationId: orgId,
    };

    if (sessionToken) {
      const updated = await prisma.session.updateMany({
        where: { userId, token: sessionToken },
        data: sessionPatch,
      });
      // Fallback when token lookup misses (e.g. encoded token mismatch).
      if (updated.count === 0 && sessionId) {
        await prisma.session.update({
          where: { id: sessionId },
          data: sessionPatch,
        });
      }
    } else if (sessionId) {
      await prisma.session.update({
        where: { id: sessionId },
        data: sessionPatch,
      });
    } else {
      throw new BadRequestError('Session token not found');
    }

    res.json({
      success: true,
      data: { activeBorrowerId: borrowerId, activeOrganizationId: orgId },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/borrower-auth/onboarding - create borrower, link to user, set active */
router.post('/onboarding', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const tenant = await resolveProTenant();
    const data = onboardingSchema.parse(req.body);

    // Enforce: only one INDIVIDUAL per user per tenant
    if (data.borrowerType === 'INDIVIDUAL') {
      const existingIndividual = await prisma.borrowerProfileLink.findFirst({
        where: {
          userId,
          tenantId: tenant.id,
          borrowerType: 'INDIVIDUAL',
        },
      });
      if (existingIndividual) {
        throw new ConflictError('You can only have one individual borrower profile');
      }
    }

    // IC/SSM uniqueness per tenant (for corporate, icNumber can be SSM)
    const icVal = optionalText(data.icNumber);
    const ssmVal = optionalText(data.ssmRegistrationNo);
    const icForUnique =
      data.borrowerType === 'CORPORATE' && ssmVal && !icVal
        ? ssmVal
        : icVal ?? '';
    if (!icForUnique || icForUnique.length < 6) {
      throw new BadRequestError('IC number or SSM registration number is required');
    }
    const existing = await prisma.borrower.findUnique({
      where: {
        tenantId_icNumber: {
          tenantId: tenant.id,
          icNumber: icForUnique,
        },
      },
    });
    if (existing) {
      throw new ConflictError('Borrower with this IC/SSM number already exists');
    }

    const isCorporate = data.borrowerType === 'CORPORATE';
    const directors = normalizeCorporateDirectorFlags(
      (data.directors || []).map((d, i) => ({
        name: d.name.trim(),
        icNumber: d.icNumber.trim().replace(/\D/g, '') || d.icNumber.trim(),
        position: d.position?.trim() || null,
        order: i,
        isAuthorizedRepresentative: d.isAuthorizedRepresentative === true,
      })),
    );

    const addrLine1 = optionalText(data.addressLine1) ?? optionalText(data.businessAddress);
    const addrLine2 = optionalText(data.addressLine2);
    const city = optionalText(data.city);
    const state = optionalText(data.state);
    const postcode = optionalText(data.postcode);
    const country = optionalCountry(data.country);
    const legacyAddr = buildLegacyAddress({
      addressLine1: addrLine1,
      addressLine2: addrLine2,
      city,
      state,
      postcode,
      country,
    });

    const createData: Record<string, unknown> = {
      tenantId: tenant.id,
      borrowerType: data.borrowerType,
      name: data.name,
      icNumber: icForUnique,
      documentType: data.documentType || 'IC',
      documentVerified: false,
      phone: optionalText(data.phone),
      email: optionalText(data.email),
      address: legacyAddr,
      addressLine1: addrLine1,
      addressLine2: addrLine2,
      city,
      state,
      postcode,
      country,
    };

    if (isCorporate) {
      createData.companyName = optionalText(data.companyName);
      createData.ssmRegistrationNo = optionalText(data.ssmRegistrationNo);
      createData.businessAddress = legacyAddr;
      const ar = directors.find((d) => d.isAuthorizedRepresentative);
      createData.authorizedRepName = ar?.name ?? optionalText(data.authorizedRepName);
      createData.authorizedRepIc = ar?.icNumber ?? optionalText(data.authorizedRepIc);
      createData.companyPhone = optionalText(data.companyPhone);
      createData.companyEmail = optionalText(data.companyEmail);
      createData.bumiStatus = data.bumiStatus ?? null;
      createData.bankName = data.bankName ?? null;
      createData.bankNameOther = data.bankName === 'OTHER' ? (data.bankNameOther ?? null) : null;
      createData.bankAccountNo = optionalText(data.bankAccountNo);
      createData.natureOfBusiness = optionalText(data.natureOfBusiness);
      createData.dateOfIncorporation = data.dateOfIncorporation ? new Date(data.dateOfIncorporation) : null;
      createData.paidUpCapital = data.paidUpCapital != null ? data.paidUpCapital : null;
      createData.numberOfEmployees = data.numberOfEmployees != null ? data.numberOfEmployees : null;
      createData.instagram = optionalText(data.instagram);
      createData.tiktok = optionalText(data.tiktok);
      createData.facebook = optionalText(data.facebook);
      createData.linkedin = optionalText(data.linkedin);
      createData.xTwitter = optionalText(data.xTwitter);
      if (directors.length > 0) {
        createData.directors = { create: directors };
      }
    } else {
      createData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
      createData.gender = data.gender ?? null;
      createData.race = data.race ?? null;
      createData.educationLevel = data.educationLevel ?? null;
      createData.occupation = optionalText(data.occupation);
      createData.employmentStatus = data.employmentStatus ?? null;
      createData.bankName = data.bankName ?? null;
      createData.bankNameOther = data.bankName === 'OTHER' ? (data.bankNameOther ?? null) : null;
      createData.bankAccountNo = optionalText(data.bankAccountNo);
      createData.monthlyIncome = data.monthlyIncome ?? null;
      createData.emergencyContactName = optionalText(data.emergencyContactName);
      createData.emergencyContactPhone = optionalText(data.emergencyContactPhone);
      createData.emergencyContactRelationship = optionalText(data.emergencyContactRelationship);
      createData.instagram = optionalText(data.instagram);
      createData.tiktok = optionalText(data.tiktok);
      createData.facebook = optionalText(data.facebook);
      createData.linkedin = optionalText(data.linkedin);
      createData.xTwitter = optionalText(data.xTwitter);
    }

    const { borrower, activeOrganizationId } = await prisma.$transaction(async (tx) => {
      const createdBorrower = await tx.borrower.create({
        data: createData as Parameters<typeof tx.borrower.create>[0]['data'],
        include: { directors: { orderBy: { order: 'asc' } } },
      });

      await tx.borrowerProfileLink.create({
        data: {
          userId,
          borrowerId: createdBorrower.id,
          tenantId: tenant.id,
          borrowerType: createdBorrower.borrowerType,
        },
      });

      let createdOrganizationId: string | null = null;
      if (isCorporate) {
        const org = await createBorrowerCompanyOrgAndLink({
          borrowerId: createdBorrower.id,
          ownerUserId: userId,
          tenantId: tenant.id,
          displayName: orgDisplayNameFromBorrower(createdBorrower),
          prismaClient: tx,
        });
        createdOrganizationId = org.id;
      }

      return { borrower: createdBorrower, activeOrganizationId: createdOrganizationId };
    });

    // Update session activeBorrowerId (so /me and /borrower work immediately)
    const sessionToken = req.borrowerUser!.sessionToken;
    const sessionId = req.borrowerUser!.sessionId;
    const sessionData = {
      activeBorrowerId: borrower.id,
      ...(activeOrganizationId ? { activeOrganizationId } : { activeOrganizationId: null }),
    };
    if (sessionToken) {
      await prisma.session.updateMany({
        where: { userId, token: sessionToken },
        data: sessionData,
      });
    } else if (sessionId) {
      await prisma.session.update({
        where: { id: sessionId },
        data: sessionData,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        borrower: {
          id: borrower.id,
          name: borrower.name,
          borrowerType: borrower.borrowerType,
          icNumber: borrower.icNumber,
          phone: borrower.phone,
          email: borrower.email,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/account - account info for profile page (includes createdAt for "Member since") */
router.get('/account', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.borrowerUser!.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundError('User');
    }
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/cross-tenant-insights - cross-tenant lookup for borrower session */
router.get('/cross-tenant-insights', async (req, res, next) => {
  try {
    const parsed = crossTenantLookupQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid lookup query');
    }

    const tenant = await resolveProTenant();
    const data = await runCrossTenantLookup(tenant.id, parsed.data);

    res.json({
      success: true,
      data,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/borrower - fetch full borrower details for active borrower */
router.get('/borrower', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      include: {
        documents: { orderBy: { uploadedAt: 'desc' } },
        directors: { orderBy: { order: 'asc' } },
      },
    });

    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    res.json({
      success: true,
      data: borrower,
    });
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/borrower-auth/borrower - update borrower */
router.patch('/borrower', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const userId = req.borrowerUser!.userId;

    const existingBorrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true },
    });
    if (!existingBorrower) {
      throw new NotFoundError('Borrower');
    }
    if (existingBorrower.borrowerType === 'CORPORATE') {
      const role = await getOrgRoleForBorrower(userId, borrowerId);
      if (!canManageCompanyProfile(role)) {
        throw new ForbiddenError('You do not have permission to edit this company profile');
      }
    }

    const data = updateBorrowerSchema.parse(req.body);

    const borrower = await performBorrowerUpdate(prisma, borrowerId, tenant.id, data);

    if (borrower.borrowerType === 'CORPORATE') {
      const bol = await prisma.borrowerOrganizationLink.findUnique({
        where: { borrowerId },
        select: { organizationId: true },
      });
      if (bol) {
        const nextName = orgDisplayNameFromBorrower(borrower);
        await prisma.organization.update({
          where: { id: bol.organizationId },
          data: { name: nextName },
        });
      }
    }

    res.json({
      success: true,
      data: borrower,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/borrower/documents - list documents for active borrower */
router.get('/borrower/documents', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const documents = await prisma.borrowerDocument.findMany({
      where: { borrowerId, tenantId: tenant.id },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: documents,
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/borrower-auth/borrower/documents - upload document (multipart) */
router.post('/borrower/documents', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
    });
    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    const { buffer, originalName, mimeType, category } = await parseDocumentUpload(req);

    const BORROWER_ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
    const BORROWER_ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(originalName).toLowerCase();
    if (!BORROWER_ALLOWED_MIME_TYPES.includes(mimeType) || !BORROWER_ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestError(
        'Invalid file type for borrower documents. Allowed: PDF, PNG, JPG only.'
      );
    }

    const validCategories = borrower.borrowerType === 'CORPORATE'
      ? CORPORATE_DOCUMENT_CATEGORIES
      : INDIVIDUAL_DOCUMENT_CATEGORIES;
    const validSet = new Set(validCategories as readonly string[]);
    if (!validSet.has(category)) {
      throw new ConflictError(`Invalid document category for ${borrower.borrowerType} borrower`);
    }

    const existingCount = await prisma.borrowerDocument.count({
      where: { borrowerId, category },
    });
    if (existingCount >= MAX_DOCUMENTS_PER_CATEGORY) {
      throw new BadRequestError(
        `Maximum ${MAX_DOCUMENTS_PER_CATEGORY} documents per category allowed. This category already has ${existingCount} document(s).`
      );
    }

    await assertIdentityDocumentMutationAllowed(prisma, borrowerId, category);

    ensureDocumentsDir();
    const { filename, path: filePath } = await saveDocumentFile(
      buffer,
      tenant.id,
      borrowerId,
      ext
    );

    const document = await prisma.borrowerDocument.create({
      data: {
        tenantId: tenant.id,
        borrowerId,
        filename,
        originalName,
        mimeType,
        size: buffer.length,
        path: filePath,
        category,
      },
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (e) {
    next(e);
  }
});

const startKycBodySchema = z.object({
  directorId: z.string().cuid().optional(),
});

const refreshKycBodySchema = z.object({
  externalSessionId: z.string().min(10).max(64),
});

function assertKycConfigured(res: Response): boolean {
  const base = config.truestackKyc.publicWebhookBaseUrl;
  const key = config.truestackKyc.apiKey;
  if (!key || !base) {
    res.status(503).json({
      success: false,
      error:
        'TrueStack KYC is not configured. Set TRUESTACK_KYC_API_KEY and TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL on the server.',
    });
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    res.status(503).json({
      success: false,
      error:
        'TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL must be a full URL, e.g. https://your-name.ngrok-free.dev (no quotes, no spaces, include https://).',
    });
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(503).json({
      success: false,
      error: 'TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL must start with http:// or https://',
    });
    return false;
  }
  if (config.nodeEnv === 'production' && parsed.protocol !== 'https:') {
    res.status(503).json({
      success: false,
      error: 'TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL must use https in production.',
    });
    return false;
  }
  return true;
}

/** POST /api/borrower-auth/kyc/sessions — start public API KYC (TrueStack Bearer key) */
router.post('/kyc/sessions', async (req, res, next) => {
  try {
    if (!assertKycConfigured(res)) return;

    const parsed = startKycBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid body' });
      return;
    }
    const { directorId } = parsed.data;

    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      include: { directors: { orderBy: { order: 'asc' } } },
    });
    if (!borrower) {
      throw new NotFoundError('Borrower');
    }

    let documentName: string;
    let documentNumber: string;
    let targetDirectorId: string | null = null;

    if (borrower.borrowerType === 'CORPORATE') {
      if (!directorId) {
        res.status(400).json({
          success: false,
          error: 'directorId is required for corporate borrowers.',
        });
        return;
      }
      const director = borrower.directors.find((d) => d.id === directorId);
      if (!director) {
        res.status(404).json({ success: false, error: 'Director not found.' });
        return;
      }
      documentName = director.name;
      documentNumber = director.icNumber;
      targetDirectorId = directorId;
    } else {
      if (directorId) {
        res.status(400).json({
          success: false,
          error: 'directorId must not be sent for individual borrowers.',
        });
        return;
      }
      documentName = borrower.name;
      documentNumber = borrower.icNumber;
    }

    const webhookBase = config.truestackKyc.publicWebhookBaseUrl;
    const webhookUrl = new URL('/api/webhooks/truestack-kyc', webhookBase).href;
    const documentType = borrower.documentType === 'PASSPORT' ? '2' : '1';

    const metadata: Record<string, unknown> = {
      borrowerId,
      tenantId: tenant.id,
    };
    if (targetDirectorId) metadata.directorId = targetDirectorId;

    let ts: Awaited<ReturnType<typeof createKycSession>>;
    try {
      const createBody = {
        document_name: documentName,
        document_number: documentNumber,
        webhook_url: webhookUrl,
        document_type: documentType,
        platform: 'Web' as const,
        metadata,
      } as const;
      ts = await createKycSession({
        ...createBody,
        ...(config.truestackKyc.redirectUrl ? { redirect_url: config.truestackKyc.redirectUrl } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TrueStack KYC create session failed';
      res.status(502).json({ success: false, error: msg });
      return;
    }

    const expiresAt = ts.expires_at ? new Date(ts.expires_at) : null;

    await prisma.$transaction(async (tx) => {
      await tx.truestackKycSession.updateMany({
        where: {
          tenantId: tenant.id,
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
          tenantId: tenant.id,
          borrowerId,
          directorId: targetDirectorId,
          externalSessionId: ts.id,
          onboardingUrl: ts.onboarding_url,
          expiresAt,
          status: ts.status || 'pending',
        },
      });
    });

    res.status(201).json({
      success: true,
      data: {
        externalSessionId: ts.id,
        onboardingUrl: ts.onboarding_url,
        status: ts.status || 'pending',
        expiresAt: expiresAt?.toISOString() ?? null,
        directorId: targetDirectorId ?? undefined,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/kyc/stream — SSE when TrueStack KYC updates for active borrower */
router.get('/kyc/stream', async (req, res, next) => {
  try {
    const { borrowerId } = await requireActiveBorrower(req);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25_000);

    const unsub = subscribeBorrowerTruestackKyc(borrowerId, (payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* client gone */
      }
    });

    req.on('close', () => {
      clearInterval(keepAlive);
      unsub();
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/kyc/status */
router.get('/kyc/status', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const sessions = await prisma.truestackKycSession.findMany({
      where: { borrowerId, tenantId: tenant.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        externalSessionId: true,
        directorId: true,
        onboardingUrl: true,
        expiresAt: true,
        status: true,
        result: true,
        rejectMessage: true,
        lastWebhookAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
      select: { borrowerType: true },
    });

    const individualRows = sessions.filter((s) => s.directorId === null);
    const latest = pickBestTruestackKycSession(individualRows) ?? sessions[0] ?? null;

    res.json({
      success: true,
      data: {
        borrowerType: borrower?.borrowerType ?? 'INDIVIDUAL',
        sessions,
        latest,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/borrower-auth/kyc/refresh — pull latest from TrueStack (e.g. missed webhook) */
router.post('/kyc/refresh', async (req, res, next) => {
  try {
    if (!assertKycConfigured(res)) return;

    const parsed = refreshKycBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'externalSessionId required' });
      return;
    }

    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const { externalSessionId } = parsed.data;

    const row = await prisma.truestackKycSession.findFirst({
      where: {
        externalSessionId,
        borrowerId,
        tenantId: tenant.id,
      },
    });
    if (!row) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    const refreshed = await refreshKycSession(externalSessionId);
    const status = refreshed.status || row.status;
    const result =
      refreshed.result === 'approved' || refreshed.result === 'rejected'
        ? refreshed.result
        : row.result;

    await prisma.truestackKycSession.update({
      where: { id: row.id },
      data: {
        status,
        result: result ?? undefined,
        rejectMessage: refreshed.reject_message ?? undefined,
        lastWebhookAt: new Date(),
      },
    });

    if (status === 'completed' && result === 'approved' && !row.directorId) {
      await prisma.borrower.update({
        where: { id: borrowerId },
        data: {
          documentVerified: true,
          verifiedAt: new Date(),
          verifiedBy: 'TRUESTACK_KYC_API',
          verificationStatus: 'FULLY_VERIFIED',
        },
      });
    }

    let documentsIngested = 0;
    if (status === 'completed' && result === 'approved') {
      const borrower = await prisma.borrower.findUnique({
        where: { id: borrowerId },
        select: { borrowerType: true },
      });
      if (borrower) {
        try {
          const ingestRes = await ingestTruestackKycDocuments(
            prisma,
            tenant.id,
            borrowerId,
            borrower.borrowerType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
            refreshed
          );
          documentsIngested = ingestRes.created;
          if (ingestRes.errors.length > 0) {
            console.warn('[borrower-auth/kyc/refresh] Ingest issues:', ingestRes.errors);
          }
        } catch (ingestErr) {
          console.error('[borrower-auth/kyc/refresh] Document ingest failed:', ingestErr);
        }
      }
    }

    res.json({
      success: true,
      data: {
        externalSessionId,
        status,
        result,
        rejectMessage: refreshed.reject_message ?? null,
        documentsIngested,
        raw: refreshed,
      },
    });
  } catch (e) {
    next(e);
  }
});

const COMPANY_INVITE_EXPIRES_SEC = 60 * 60 * 24 * 7;

/** GET /api/borrower-auth/company-members/invitation-preview?invitationId= — kind + expiry for signed-in invitee */
router.get('/company-members/invitation-preview', async (req, res, next) => {
  try {
    const userEmail = req.borrowerUser!.email.trim().toLowerCase();
    const raw = req.query.invitationId;
    const invitationId = z.string().min(1).parse(Array.isArray(raw) ? raw[0] : raw);
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, status: 'pending' },
      select: { inviteKind: true, expiresAt: true, email: true },
    });
    if (!invitation || invitation.expiresAt < new Date()) {
      throw new BadRequestError('Invitation not found or expired');
    }
    const canPreview =
      invitation.inviteKind === 'open_link' || invitation.email.trim().toLowerCase() === userEmail;
    if (!canPreview) {
      throw new BadRequestError('Invitation not found or expired');
    }
    res.json({
      success: true,
      data: {
        inviteKind: invitation.inviteKind === 'open_link' ? 'open_link' : 'email',
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/borrower-auth/company-members/context — org + role for active corporate borrower */
router.get('/company-members/context', async (req, res, next) => {
  try {
    const { borrowerId } = await requireActiveBorrower(req);
    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId },
      select: { id: true, borrowerType: true, companyName: true, name: true },
    });
    if (!borrower || borrower.borrowerType !== 'CORPORATE') {
      return res.json({
        success: true,
        data: {
          isCorporate: false,
          organizationId: null,
          role: null,
          canManageMembers: false,
          canEditCompanyProfile: false,
        },
      });
    }
    let bol = await prisma.borrowerOrganizationLink.findUnique({
      where: { borrowerId },
      select: { organizationId: true },
    });
    if (!bol) {
      await lazyEnsureBorrowerCompanyOrganization(borrowerId);
      bol = await prisma.borrowerOrganizationLink.findUnique({
        where: { borrowerId },
        select: { organizationId: true },
      });
    }
    if (!bol) {
      return res.json({
        success: true,
        data: {
          isCorporate: true,
          organizationId: null,
          role: null,
          canManageMembers: false,
          canEditCompanyProfile: false,
          needsOrgBackfill: true,
        },
      });
    }
    const role = await getOrgRoleForBorrower(req.borrowerUser!.userId, borrowerId);
    return res.json({
      success: true,
      data: {
        isCorporate: true,
        organizationId: bol.organizationId,
        role,
        canManageMembers: canManageCompanyMembers(role),
        canEditCompanyProfile: canManageCompanyProfile(role),
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/borrower-auth/company-members/open-invitation
 * Create a shareable invite (open_link). Invitee binds email via bind-open-invitation, then uses Better Auth accept.
 */
router.post('/company-members/open-invitation', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const { borrowerId, tenant } = await requireActiveBorrower(req);
    const body = z
      .object({
        role: z.enum(['member', 'admin']).default('member'),
      })
      .parse(req.body ?? {});

    const borrower = await prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId: tenant.id },
    });
    if (!borrower || borrower.borrowerType !== 'CORPORATE') {
      throw new BadRequestError('Company invitations apply to corporate profiles only');
    }
    const role = await getOrgRoleForBorrower(userId, borrowerId);
    if (!canManageCompanyMembers(role)) {
      throw new ForbiddenError('You do not have permission to invite members');
    }
    let bol = await prisma.borrowerOrganizationLink.findUnique({ where: { borrowerId } });
    if (!bol) {
      await lazyEnsureBorrowerCompanyOrganization(borrowerId);
      bol = await prisma.borrowerOrganizationLink.findUnique({ where: { borrowerId } });
    }
    if (!bol) {
      throw new BadRequestError('This company is not set up for member invitations yet');
    }

    const token = randomBytes(24).toString('hex');
    const email = syntheticOpenInviteEmail(token);
    const expiresAt = new Date(Date.now() + COMPANY_INVITE_EXPIRES_SEC * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        organizationId: bol.organizationId,
        email,
        role: body.role,
        status: 'pending',
        expiresAt,
        inviterId: userId,
        inviteKind: 'open_link',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        invitationId: invitation.id,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/borrower-auth/company-members/bind-open-invitation — set invitation email to signed-in user (open_link only) */
router.post('/company-members/bind-open-invitation', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const email = req.borrowerUser!.email.trim().toLowerCase();
    const { invitationId } = z.object({ invitationId: z.string().min(1) }).parse(req.body ?? {});

    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, status: 'pending' },
    });
    if (!invitation || invitation.expiresAt < new Date()) {
      throw new BadRequestError('Invitation not found or expired');
    }
    if (invitation.inviteKind !== 'open_link') {
      throw new BadRequestError('This invitation cannot be bound');
    }
    if (!isOpenInviteEmail(invitation.email)) {
      if (invitation.email === email) {
        return res.json({ success: true, data: { invitationId: invitation.id } });
      }
      throw new BadRequestError('This invitation has already been bound to another email');
    }

    const existingSameEmail = await prisma.invitation.findFirst({
      where: {
        organizationId: invitation.organizationId,
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
        NOT: { id: invitation.id },
      },
    });
    if (existingSameEmail) {
      throw new ConflictError('You already have a pending invitation for this organization');
    }

    const bound = await prisma.invitation.updateMany({
      where: {
        id: invitation.id,
        email: invitation.email,
      },
      data: { email },
    });
    if (bound.count === 0) {
      throw new ConflictError('This invitation was claimed by another user');
    }

    res.json({ success: true, data: { invitationId: invitation.id } });
  } catch (e) {
    next(e);
  }
});

/** POST /api/borrower-auth/company-members/leave — leave company org and remove borrower profile link */
router.post('/company-members/leave', async (req, res, next) => {
  try {
    const userId = req.borrowerUser!.userId;
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(req.body ?? {});

    const member = await prisma.member.findFirst({
      where: { organizationId, userId },
    });
    if (!member) {
      throw new BadRequestError('You are not a member of this organization');
    }

    const creatorRole = 'owner';
    const roleParts = member.role.split(',').map((r) => r.trim());
    if (roleParts.includes(creatorRole)) {
      const allMembers = await prisma.member.findMany({ where: { organizationId } });
      const ownerCount = allMembers.filter((m) =>
        m.role.split(',').map((r) => r.trim()).includes(creatorRole)
      ).length;
      if (ownerCount <= 1) {
        throw new BadRequestError('The sole owner cannot leave the organization');
      }
    }

    const bol = await prisma.borrowerOrganizationLink.findUnique({
      where: { organizationId },
    });
    if (!bol) {
      throw new BadRequestError('Organization is not linked to a borrower company');
    }

    await prisma.member.delete({ where: { id: member.id } });
    await prisma.borrowerProfileLink.deleteMany({
      where: { userId, borrowerId: bol.borrowerId },
    });

    const nextLink = await prisma.borrowerProfileLink.findFirst({
      where: { userId, tenantId: bol.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    const nextOrgId = nextLink?.borrowerType === 'CORPORATE'
      ? await resolveOrgIdForBorrower(nextLink.borrowerId)
      : null;

    await prisma.session.updateMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        OR: [
          { activeBorrowerId: bol.borrowerId },
          { activeOrganizationId: organizationId },
        ],
      },
      data: {
        activeBorrowerId: nextLink?.borrowerId ?? null,
        activeOrganizationId: nextOrgId,
      },
    });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/borrower-auth/borrower/documents/:documentId */
router.delete('/borrower/documents/:documentId', async (req, res, next) => {
  try {
    const { borrowerId, tenant } = await requireActiveBorrower(req);

    const document = await prisma.borrowerDocument.findFirst({
      where: {
        id: req.params.documentId,
        borrowerId,
        tenantId: tenant.id,
      },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    await assertIdentityDocumentMutationAllowed(prisma, borrowerId, document.category);

    await deleteDocumentFile(document.path);

    await prisma.borrowerDocument.delete({
      where: { id: document.id },
    });

    res.json({
      success: true,
      message: 'Document deleted',
    });
  } catch (e) {
    next(e);
  }
});

export default router;
