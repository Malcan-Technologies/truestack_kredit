import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { requireBorrowerSession } from '../../middleware/authenticateBorrower.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { runCrossTenantLookup } from '../../lib/crossTenantLookupService.js';

const router = Router();
router.use(requireBorrowerSession);

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
  })).min(0).max(10).optional(),
}).merge(addressFieldsSchema);

async function resolveProTenant() {
  if (config.proTenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: config.proTenantId } });
    if (t) return t;
  }
  let t = await prisma.tenant.findFirst({ where: { slug: config.proTenantSlug } });
  if (!t) {
    // Auto-create pro tenant for borrower_pro when missing (no tenant for user account;
    // tenant is only used to host borrower profiles)
    t = await prisma.tenant.create({
      data: {
        name: 'Borrower Pro',
        slug: config.proTenantSlug,
        type: 'PPW',
      },
    });
  }
  return t;
}

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
        activeBorrowerId: activeBorrower?.id ?? null,
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
    if (!sessionToken) {
      throw new BadRequestError('Session token not found');
    }

    await prisma.session.updateMany({
      where: { userId, token: sessionToken },
      data: { activeBorrowerId: borrowerId },
    });

    res.json({
      success: true,
      data: { activeBorrowerId: borrowerId },
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
    const directors = (data.directors || []).map((d, i) => ({
      name: d.name.trim(),
      icNumber: d.icNumber.trim().replace(/\D/g, '') || d.icNumber.trim(),
      position: d.position?.trim() || null,
      order: i,
    }));

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
      createData.authorizedRepName = directors[0]?.name ?? optionalText(data.authorizedRepName);
      createData.authorizedRepIc = directors[0]?.icNumber ?? optionalText(data.authorizedRepIc);
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

    const borrower = await prisma.borrower.create({
      data: createData as Parameters<typeof prisma.borrower.create>[0]['data'],
      include: { directors: { orderBy: { order: 'asc' } } },
    });

    await prisma.borrowerProfileLink.create({
      data: {
        userId,
        borrowerId: borrower.id,
        tenantId: tenant.id,
        borrowerType: borrower.borrowerType,
      },
    });

    // Update session activeBorrowerId
    const sessionToken = req.borrowerUser!.sessionToken;
    if (sessionToken) {
      await prisma.session.updateMany({
        where: { userId, token: sessionToken },
        data: { activeBorrowerId: borrower.id },
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

/** GET /api/borrower-auth/account - account info for profile page */
router.get('/account', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.borrowerUser!.userId,
          email: req.borrowerUser!.email,
          name: req.borrowerUser!.name,
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

export default router;
