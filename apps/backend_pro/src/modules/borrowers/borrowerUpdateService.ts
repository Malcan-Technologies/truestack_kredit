import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { normalizeIdentityNumber } from '../../lib/crossTenantLookupService.js';
import { getBorrowerVerificationSummary } from '../../lib/verification.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

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

const ADDRESS_LINE_MAX_LENGTH = 200;
const CITY_MAX_LENGTH = 100;
const STATE_MAX_LENGTH = 100;
const POSTCODE_MAX_LENGTH = 20;
const POSTCODE_DIGITS_ONLY = /^\d+$/;

const optionalAddressField = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().or(z.literal(''));

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

const individualFieldsSchema = z.object({
  dateOfBirth: z.string().optional().or(z.literal('')),
  gender: z.enum(GENDER_VALUES).optional(),
  race: z.enum(RACE_VALUES).optional(),
  educationLevel: z.enum(EDUCATION_LEVEL_VALUES).optional(),
  occupation: z.string().max(200).optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUS_VALUES).optional(),
  bankName: z.enum(BANK_VALUES).optional(),
  bankNameOther: z.string().max(100).optional(),
  bankAccountNo: z.string().max(20).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRelationship: z.string().max(100).optional(),
  monthlyIncome: z.number().min(0).optional().or(z.literal(null)),
  instagram: z.string().max(500).optional().or(z.literal('')),
  tiktok: z.string().max(500).optional().or(z.literal('')),
  facebook: z.string().max(500).optional().or(z.literal('')),
  linkedin: z.string().max(500).optional().or(z.literal('')),
  xTwitter: z.string().max(500).optional().or(z.literal('')),
});

const corporateFieldsSchema = z.object({
  companyName: z.string().min(2).max(200).optional(),
  ssmRegistrationNo: z.string().max(50).optional(),
  businessAddress: z.string().max(500).optional(),
  authorizedRepName: z.string().max(200).optional(),
  authorizedRepIc: z.string().max(20).optional(),
  companyPhone: z.string().max(20).optional(),
  companyEmail: z.string().email().optional().or(z.literal('')),
  natureOfBusiness: z.string().max(200).optional(),
  bumiStatus: z.enum(['BUMI', 'BUKAN_BUMI', 'ASING']).optional(),
  dateOfIncorporation: z.string().optional().or(z.literal('')),
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

export const updateBorrowerSchema = z.object({
  borrowerType: z.enum(BORROWER_TYPE_VALUES).optional(),
  name: z.string().min(2).max(200).optional(),
  icNumber: z.string().min(6).max(20).optional(),
  documentType: z.enum(DOCUMENT_TYPE_VALUES).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  directors: z.array(updateDirectorSchema).min(1).max(10).optional(),
}).merge(individualFieldsSchema).merge(corporateFieldsSchema).merge(addressFieldsSchema);

export type UpdateBorrowerInput = z.infer<typeof updateBorrowerSchema>;

export async function performBorrowerUpdate(
  prisma: PrismaClient,
  borrowerId: string,
  tenantId: string,
  data: UpdateBorrowerInput
) {
  const existing = await prisma.borrower.findFirst({
    where: { id: borrowerId, tenantId },
    include: { directors: { orderBy: { order: 'asc' } } },
  });

  if (!existing) {
    throw new NotFoundError('Borrower');
  }

  if (data.icNumber !== undefined && data.icNumber !== existing.icNumber) {
    const icConflict = await prisma.borrower.findUnique({
      where: {
        tenantId_icNumber: { tenantId, icNumber: data.icNumber },
      },
    });
    if (icConflict) {
      throw new ConflictError('Another borrower with this IC number already exists');
    }
  }

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
    const resolvedAddress = resolveUpdatedAddressFields(
      {
        address: existing.address,
        businessAddress: existing.businessAddress,
        addressLine1: existing.addressLine1,
        addressLine2: existing.addressLine2,
        city: existing.city,
        state: existing.state,
        postcode: existing.postcode,
        country: existing.country,
      },
      data
    );
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

  if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  if (data.gender !== undefined) updateData.gender = data.gender || null;
  if (data.race !== undefined) updateData.race = data.race || null;
  if (data.educationLevel !== undefined) updateData.educationLevel = data.educationLevel || null;
  if (data.occupation !== undefined) updateData.occupation = data.occupation || null;
  if (data.employmentStatus !== undefined) updateData.employmentStatus = data.employmentStatus || null;
  if (data.bankName !== undefined) {
    updateData.bankName = data.bankName || null;
    if (data.bankName !== 'OTHER') updateData.bankNameOther = null;
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

  if (data.instagram !== undefined) updateData.instagram = normalizeOptionalText(data.instagram) ?? null;
  if (data.tiktok !== undefined) updateData.tiktok = normalizeOptionalText(data.tiktok) ?? null;
  if (data.facebook !== undefined) updateData.facebook = normalizeOptionalText(data.facebook) ?? null;
  if (data.linkedin !== undefined) updateData.linkedin = normalizeOptionalText(data.linkedin) ?? null;
  if (data.xTwitter !== undefined) updateData.xTwitter = normalizeOptionalText(data.xTwitter) ?? null;

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
      where: { id: borrowerId },
      data: updateData as Parameters<PrismaClient['borrower']['update']>[0]['data'],
    });

    if (data.directors !== undefined) {
      if (effectiveBorrowerType !== 'CORPORATE') {
        await tx.borrowerDirector.deleteMany({
          where: { borrowerId },
        });
      } else if (normalizedDirectors.length > 0) {
        const existingDirectors = await tx.borrowerDirector.findMany({
          where: { borrowerId },
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
              normalizeIdentityNumber(director.icNumber) !== normalizeIdentityNumber(matchedExisting.icNumber);
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
                borrowerId,
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
            where: { borrowerId, id: { notIn: Array.from(retainedIds) } },
          });
        } else {
          await tx.borrowerDirector.deleteMany({
            where: { borrowerId },
          });
        }
      } else {
        await tx.borrowerDirector.deleteMany({
          where: { borrowerId },
        });
      }

      if (effectiveBorrowerType === 'CORPORATE') {
        const directorStates = await tx.borrowerDirector.findMany({
          where: { borrowerId },
          select: { trueIdentityStatus: true, trueIdentityResult: true },
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
        directors: { orderBy: { order: 'asc' } },
      },
    });
  });

  return borrower;
}
