import type { BorrowerDetail, UpdateBorrowerPayload } from '@kredit/borrower';

import { DEFAULT_COUNTRY_CODE } from '@/lib/address-options';
import {
  type BorrowerType,
  type CorporateFormData,
  type IndividualFormData,
  initialCorporateFormData,
  normalizeCorporateDraftData,
  normalizeIndividualDraftData,
} from '@/lib/onboarding';

function toInputDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    return '';
  }

  return normalized.toISOString().slice(0, 10);
}

function toOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInt(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function borrowerToFormData(
  borrower: BorrowerDetail,
): { borrowerType: BorrowerType; individualFormData: IndividualFormData; corporateFormData: CorporateFormData } {
  if (borrower.borrowerType === 'CORPORATE') {
    return {
      borrowerType: 'CORPORATE',
      individualFormData: normalizeIndividualDraftData({}),
      corporateFormData: normalizeCorporateDraftData({
        name: borrower.name ?? '',
        icNumber: borrower.icNumber ?? '',
        phone: borrower.phone ?? '',
        email: borrower.email ?? '',
        companyName: borrower.companyName ?? '',
        ssmRegistrationNo: borrower.ssmRegistrationNo ?? '',
        addressLine1: borrower.addressLine1 ?? borrower.businessAddress ?? '',
        addressLine2: borrower.addressLine2 ?? '',
        city: borrower.city ?? '',
        state: borrower.state ?? '',
        postcode: borrower.postcode ?? '',
        country: borrower.country ?? DEFAULT_COUNTRY_CODE,
        bumiStatus: borrower.bumiStatus ?? '',
        authorizedRepName: borrower.authorizedRepName ?? '',
        authorizedRepIc: borrower.authorizedRepIc ?? '',
        companyPhone: borrower.companyPhone ?? '',
        companyEmail: borrower.companyEmail ?? '',
        natureOfBusiness: borrower.natureOfBusiness ?? '',
        dateOfIncorporation: toInputDate(borrower.dateOfIncorporation),
        paidUpCapital:
          borrower.paidUpCapital === null || borrower.paidUpCapital === undefined
            ? ''
            : String(borrower.paidUpCapital),
        numberOfEmployees:
          borrower.numberOfEmployees === null || borrower.numberOfEmployees === undefined
            ? ''
            : String(borrower.numberOfEmployees),
        bankName: borrower.bankName ?? '',
        bankNameOther: borrower.bankNameOther ?? '',
        bankAccountNo: borrower.bankAccountNo ?? '',
        instagram: borrower.instagram ?? '',
        tiktok: borrower.tiktok ?? '',
        facebook: borrower.facebook ?? '',
        linkedin: borrower.linkedin ?? '',
        xTwitter: borrower.xTwitter ?? '',
        directors: borrower.directors.map((director) => ({
          id: director.id,
          name: director.name ?? '',
          icNumber: director.icNumber ?? '',
          position: director.position ?? '',
          isAuthorizedRepresentative: director.isAuthorizedRepresentative === true,
        })),
      }),
    };
  }

  return {
    borrowerType: 'INDIVIDUAL',
    individualFormData: normalizeIndividualDraftData({
      name: borrower.name ?? '',
      icNumber: borrower.icNumber ?? '',
      documentType: borrower.documentType ?? 'IC',
      phone: borrower.phone ?? '',
      email: borrower.email ?? '',
      addressLine1: borrower.addressLine1 ?? '',
      addressLine2: borrower.addressLine2 ?? '',
      city: borrower.city ?? '',
      state: borrower.state ?? '',
      postcode: borrower.postcode ?? '',
      country: borrower.country ?? DEFAULT_COUNTRY_CODE,
      dateOfBirth: toInputDate(borrower.dateOfBirth),
      gender: borrower.gender ?? '',
      race: borrower.race ?? '',
      educationLevel: borrower.educationLevel ?? '',
      occupation: borrower.occupation ?? '',
      employmentStatus: borrower.employmentStatus ?? '',
      bankName: borrower.bankName ?? '',
      bankNameOther: borrower.bankNameOther ?? '',
      bankAccountNo: borrower.bankAccountNo ?? '',
      emergencyContactName: borrower.emergencyContactName ?? '',
      emergencyContactPhone: borrower.emergencyContactPhone ?? '',
      emergencyContactRelationship: borrower.emergencyContactRelationship ?? '',
      monthlyIncome:
        borrower.monthlyIncome === null || borrower.monthlyIncome === undefined
          ? ''
          : String(borrower.monthlyIncome),
      instagram: borrower.instagram ?? '',
      tiktok: borrower.tiktok ?? '',
      facebook: borrower.facebook ?? '',
      linkedin: borrower.linkedin ?? '',
      xTwitter: borrower.xTwitter ?? '',
    }),
    corporateFormData: normalizeCorporateDraftData(initialCorporateFormData),
  };
}

export function buildUpdateBorrowerPayload(params: {
  borrowerType: BorrowerType;
  individualFormData: IndividualFormData;
  corporateFormData: CorporateFormData;
  noMonthlyIncome: boolean;
  identityLocked?: boolean;
}): UpdateBorrowerPayload {
  const { borrowerType, corporateFormData, identityLocked = false, individualFormData, noMonthlyIncome } =
    params;

  if (borrowerType === 'INDIVIDUAL') {
    const data = individualFormData;

    return {
      ...(identityLocked
        ? {}
        : {
            name: toOptionalString(data.name),
            icNumber: toOptionalString(data.icNumber),
            documentType: toOptionalString(data.documentType),
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : undefined,
            gender: toOptionalString(data.gender),
          }),
      phone: toOptionalString(data.phone),
      email: toOptionalString(data.email),
      addressLine1: toOptionalString(data.addressLine1),
      addressLine2: toOptionalString(data.addressLine2),
      city: toOptionalString(data.city),
      state: toOptionalString(data.state),
      postcode: toOptionalString(data.postcode),
      country: toOptionalString(data.country),
      race: toOptionalString(data.race),
      educationLevel: toOptionalString(data.educationLevel),
      occupation: toOptionalString(data.occupation),
      employmentStatus: toOptionalString(data.employmentStatus),
      bankName: toOptionalString(data.bankName),
      bankNameOther: data.bankName === 'OTHER' ? toOptionalString(data.bankNameOther) : undefined,
      bankAccountNo: toOptionalString(data.bankAccountNo),
      monthlyIncome: noMonthlyIncome ? 0 : toOptionalNumber(data.monthlyIncome),
      emergencyContactName: toOptionalString(data.emergencyContactName),
      emergencyContactPhone: toOptionalString(data.emergencyContactPhone),
      emergencyContactRelationship: toOptionalString(data.emergencyContactRelationship),
      instagram: toOptionalString(data.instagram),
      tiktok: toOptionalString(data.tiktok),
      facebook: toOptionalString(data.facebook),
      linkedin: toOptionalString(data.linkedin),
      xTwitter: toOptionalString(data.xTwitter),
    };
  }

  const authorizedDirector =
    corporateFormData.directors.find((director) => director.isAuthorizedRepresentative) ??
    corporateFormData.directors[0];

  return {
    companyName: toOptionalString(corporateFormData.companyName),
    ssmRegistrationNo: toOptionalString(corporateFormData.ssmRegistrationNo),
    addressLine1: toOptionalString(corporateFormData.addressLine1),
    addressLine2: toOptionalString(corporateFormData.addressLine2),
    city: toOptionalString(corporateFormData.city),
    state: toOptionalString(corporateFormData.state),
    postcode: toOptionalString(corporateFormData.postcode),
    country: toOptionalString(corporateFormData.country),
    businessAddress: toOptionalString(corporateFormData.addressLine1),
    bumiStatus: toOptionalString(corporateFormData.bumiStatus),
    authorizedRepName:
      toOptionalString(authorizedDirector?.name ?? '') ??
      toOptionalString(corporateFormData.authorizedRepName),
    authorizedRepIc:
      toOptionalString(authorizedDirector?.icNumber ?? '') ??
      toOptionalString(corporateFormData.authorizedRepIc),
    companyPhone: toOptionalString(corporateFormData.companyPhone),
    companyEmail: toOptionalString(corporateFormData.companyEmail),
    natureOfBusiness: toOptionalString(corporateFormData.natureOfBusiness),
    dateOfIncorporation: corporateFormData.dateOfIncorporation
      ? new Date(corporateFormData.dateOfIncorporation).toISOString()
      : undefined,
    paidUpCapital: toOptionalNumber(corporateFormData.paidUpCapital),
    numberOfEmployees: toOptionalInt(corporateFormData.numberOfEmployees),
    bankName: toOptionalString(corporateFormData.bankName),
    bankNameOther:
      corporateFormData.bankName === 'OTHER'
        ? toOptionalString(corporateFormData.bankNameOther)
        : undefined,
    bankAccountNo: toOptionalString(corporateFormData.bankAccountNo),
    directors: corporateFormData.directors
      .filter((director) => director.name.trim() || director.icNumber.trim())
      .map((director) => ({
        id: director.id,
        name: director.name.trim(),
        icNumber: director.icNumber.replace(/\D/g, ''),
        position: toOptionalString(director.position),
        isAuthorizedRepresentative: director.isAuthorizedRepresentative === true,
      })),
    instagram: toOptionalString(corporateFormData.instagram),
    tiktok: toOptionalString(corporateFormData.tiktok),
    facebook: toOptionalString(corporateFormData.facebook),
    linkedin: toOptionalString(corporateFormData.linkedin),
    xTwitter: toOptionalString(corporateFormData.xTwitter),
  };
}
