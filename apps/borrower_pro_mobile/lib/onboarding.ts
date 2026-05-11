import { DEFAULT_COUNTRY_CODE } from '@/lib/address-options';
import type { BorrowerProfile, OnboardingPayload } from '@kredit/borrower';

import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage/app-storage';

export const ONBOARDING_DRAFT_KEY = 'onboarding_draft';
export const ONBOARDING_DISMISSED_KEY = 'onboarding_dismissed';

export type BorrowerType = 'INDIVIDUAL' | 'CORPORATE';
export type OnboardingMainStep = 0 | 1 | 2 | 3;
export type IndividualSubStep = 1 | 2 | 3;
export type CorporateSubStep = 1 | 2 | 3 | 4 | 5;
export type BorrowerDetailSubStep = IndividualSubStep | CorporateSubStep;

export type Option = {
  label: string;
  value: string;
};

export interface IndividualFormData {
  name: string;
  icNumber: string;
  documentType: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  dateOfBirth: string;
  gender: string;
  race: string;
  educationLevel: string;
  occupation: string;
  employmentStatus: string;
  bankName: string;
  bankNameOther: string;
  bankAccountNo: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  monthlyIncome: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  linkedin: string;
  xTwitter: string;
}

export interface CorporateDirector {
  id?: string;
  name: string;
  icNumber: string;
  position: string;
  isAuthorizedRepresentative: boolean;
}

export interface CorporateFormData {
  name: string;
  icNumber: string;
  phone: string;
  email: string;
  companyName: string;
  ssmRegistrationNo: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  bumiStatus: string;
  authorizedRepName: string;
  authorizedRepIc: string;
  companyPhone: string;
  companyEmail: string;
  natureOfBusiness: string;
  dateOfIncorporation: string;
  paidUpCapital: string;
  numberOfEmployees: string;
  bankName: string;
  bankNameOther: string;
  bankAccountNo: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  linkedin: string;
  xTwitter: string;
  directors: CorporateDirector[];
}

export interface OnboardingDraft {
  step: OnboardingMainStep;
  borrowerDetailSubStep: BorrowerDetailSubStep;
  borrowerType: BorrowerType;
  individualFormData: IndividualFormData;
  corporateFormData: CorporateFormData;
  noMonthlyIncome: boolean;
}

export const documentTypeOptions: Option[] = [
  { value: 'IC', label: 'IC (MyKad)' },
  { value: 'PASSPORT', label: 'Passport' },
];

export const genderOptions: Option[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
];

export const raceOptions: Option[] = [
  { value: 'MELAYU', label: 'Melayu' },
  { value: 'CINA', label: 'Cina' },
  { value: 'INDIA', label: 'India' },
  { value: 'LAIN_LAIN', label: 'Lain-lain' },
  { value: 'BUMIPUTRA_SABAH_SARAWAK', label: 'Bumiputra Sabah/Sarawak' },
  { value: 'BUKAN_WARGANEGARA', label: 'Bukan Warganegara' },
];

export const educationOptions: Option[] = [
  { value: 'NO_FORMAL', label: 'Tiada Pendidikan Formal' },
  { value: 'PRIMARY', label: 'Sekolah Rendah' },
  { value: 'SECONDARY', label: 'Sekolah Menengah' },
  { value: 'DIPLOMA', label: 'Diploma' },
  { value: 'DEGREE', label: 'Ijazah Sarjana Muda' },
  { value: 'POSTGRADUATE', label: 'Pasca Siswazah' },
];

export const employmentOptions: Option[] = [
  { value: 'EMPLOYED', label: 'Bekerja' },
  { value: 'SELF_EMPLOYED', label: 'Bekerja Sendiri' },
  { value: 'UNEMPLOYED', label: 'Tidak Bekerja' },
  { value: 'RETIRED', label: 'Bersara' },
  { value: 'STUDENT', label: 'Pelajar' },
];

export const bankOptions: Option[] = [
  { value: 'MAYBANK', label: 'Maybank' },
  { value: 'CIMB', label: 'CIMB Bank' },
  { value: 'PUBLIC_BANK', label: 'Public Bank' },
  { value: 'RHB', label: 'RHB Bank' },
  { value: 'HONG_LEONG', label: 'Hong Leong Bank' },
  { value: 'AMBANK', label: 'AmBank' },
  { value: 'BANK_ISLAM', label: 'Bank Islam' },
  { value: 'BANK_RAKYAT', label: 'Bank Rakyat' },
  { value: 'BSN', label: 'BSN' },
  { value: 'AFFIN', label: 'Affin Bank' },
  { value: 'ALLIANCE', label: 'Alliance Bank' },
  { value: 'OCBC', label: 'OCBC Bank' },
  { value: 'UOB', label: 'UOB' },
  { value: 'HSBC', label: 'HSBC' },
  { value: 'STANDARD_CHARTERED', label: 'Standard Chartered' },
  { value: 'AGROBANK', label: 'Agrobank' },
  { value: 'MUAMALAT', label: 'Bank Muamalat' },
  { value: 'OTHER', label: 'Lain-lain (Other)' },
];

export const relationshipOptions: Option[] = [
  { value: 'SPOUSE', label: 'Spouse' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'SIBLING', label: 'Sibling' },
  { value: 'CHILD', label: 'Child' },
  { value: 'FRIEND', label: 'Friend' },
  { value: 'OTHER', label: 'Other' },
];

export const bumiStatusOptions: Option[] = [
  { value: 'BUMI', label: 'Bumiputera' },
  { value: 'BUKAN_BUMI', label: 'Bukan Bumiputera' },
  { value: 'ASING', label: 'Asing' },
];

export const borrowerTypeCards = [
  {
    id: 'INDIVIDUAL' as const,
    title: 'Individual',
    description: 'For personal borrowing. Only one individual profile is allowed per account.',
  },
  {
    id: 'CORPORATE' as const,
    title: 'Corporate',
    description: 'For business borrowing. You can add multiple company profiles.',
  },
] as const;

export const initialIndividualFormData: IndividualFormData = {
  name: '',
  icNumber: '',
  documentType: 'IC',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postcode: '',
  country: DEFAULT_COUNTRY_CODE,
  dateOfBirth: '',
  gender: '',
  race: '',
  educationLevel: '',
  occupation: '',
  employmentStatus: '',
  bankName: '',
  bankNameOther: '',
  bankAccountNo: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  monthlyIncome: '',
  instagram: '',
  tiktok: '',
  facebook: '',
  linkedin: '',
  xTwitter: '',
};

export const initialCorporateFormData: CorporateFormData = {
  name: '',
  icNumber: '',
  phone: '',
  email: '',
  companyName: '',
  ssmRegistrationNo: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postcode: '',
  country: DEFAULT_COUNTRY_CODE,
  bumiStatus: '',
  authorizedRepName: '',
  authorizedRepIc: '',
  companyPhone: '',
  companyEmail: '',
  natureOfBusiness: '',
  dateOfIncorporation: '',
  paidUpCapital: '',
  numberOfEmployees: '',
  bankName: '',
  bankNameOther: '',
  bankAccountNo: '',
  instagram: '',
  tiktok: '',
  facebook: '',
  linkedin: '',
  xTwitter: '',
  directors: [{ name: '', icNumber: '', position: '', isAuthorizedRepresentative: true }],
};

const BANK_ACCOUNT_REGEX = /^\d{8,17}$/;
const POSTCODE_REGEX = /^\d+$/;

/**
 * Extract date of birth from Malaysian IC number (YYMMDD format).
 * Returns ISO date string (YYYY-MM-DD) or null if invalid.
 */
export function extractDateFromIC(icNumber: string): string | null {
  const cleanIC = icNumber.replace(/[-\s]/g, '');
  if (cleanIC.length < 6 || !/^\d{6}/.test(cleanIC)) {
    return null;
  }

  const yearPart = cleanIC.substring(0, 2);
  const monthPart = cleanIC.substring(2, 4);
  const dayPart = cleanIC.substring(4, 6);
  const month = Number.parseInt(monthPart, 10);
  const day = Number.parseInt(dayPart, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const yearNum = Number.parseInt(yearPart, 10);
  const fullYear = yearNum >= 0 && yearNum <= 30 ? 2000 + yearNum : 1900 + yearNum;
  return `${fullYear}-${monthPart}-${dayPart}`;
}

/**
 * Extract gender from Malaysian IC number (last digit: odd = male, even = female).
 * Returns "MALE" or "FEMALE" or null if invalid.
 */
export function extractGenderFromIC(icNumber: string): string | null {
  const cleanIC = icNumber.replace(/[-\s]/g, '');
  if (cleanIC.length < 12) {
    return null;
  }

  const lastDigit = Number.parseInt(cleanIC.charAt(cleanIC.length - 1), 10);
  if (Number.isNaN(lastDigit)) {
    return null;
  }

  return lastDigit % 2 === 1 ? 'MALE' : 'FEMALE';
}

export function normalizeIndividualDraftData(data: Partial<IndividualFormData>): IndividualFormData {
  const normalized = {
    ...initialIndividualFormData,
    ...data,
  };

  if (normalized.documentType !== 'IC') {
    return normalized;
  }

  return {
    ...normalized,
    dateOfBirth: normalized.dateOfBirth || extractDateFromIC(normalized.icNumber) || '',
    gender: normalized.gender || extractGenderFromIC(normalized.icNumber) || '',
  };
}

function parseStoredBoolean(value: string | null): boolean {
  return value === 'true';
}

function normalizeMainStep(value: number): OnboardingMainStep {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }

  return 0;
}

function normalizeIndividualSubStep(value: number): IndividualSubStep {
  if (value === 2 || value === 3) {
    return value;
  }

  return 1;
}

function normalizeCorporateSubStep(value: number): CorporateSubStep {
  if (value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }

  return 1;
}

export function normalizeCorporateDraftData(data: CorporateFormData): CorporateFormData {
  const directors = (data.directors ?? []).map((director, index) => ({
    name: director.name ?? '',
    icNumber: director.icNumber ?? '',
    position: director.position ?? '',
    isAuthorizedRepresentative:
      typeof director.isAuthorizedRepresentative === 'boolean'
        ? director.isAuthorizedRepresentative
        : index === 0,
  }));

  let nextDirectors = directors;
  if (nextDirectors.length === 0) {
    nextDirectors = [{ name: '', icNumber: '', position: '', isAuthorizedRepresentative: true }];
  } else if (!nextDirectors.some((director) => director.isAuthorizedRepresentative)) {
    nextDirectors = nextDirectors.map((director, index) => ({
      ...director,
      isAuthorizedRepresentative: index === 0,
    }));
  }

  return {
    ...initialCorporateFormData,
    ...data,
    directors: nextDirectors,
  };
}

export function normalizeOnboardingDraft(input: Partial<OnboardingDraft> | null): OnboardingDraft {
  const borrowerType = input?.borrowerType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL';

  return {
    step: normalizeMainStep(typeof input?.step === 'number' ? input.step : 0),
    borrowerType,
    borrowerDetailSubStep:
      borrowerType === 'CORPORATE'
        ? normalizeCorporateSubStep(
            typeof input?.borrowerDetailSubStep === 'number' ? input.borrowerDetailSubStep : 1,
          )
        : normalizeIndividualSubStep(
            typeof input?.borrowerDetailSubStep === 'number' ? input.borrowerDetailSubStep : 1,
          ),
    individualFormData: normalizeIndividualDraftData(input?.individualFormData ?? initialIndividualFormData),
    corporateFormData: normalizeCorporateDraftData(input?.corporateFormData ?? initialCorporateFormData),
    noMonthlyIncome: input?.noMonthlyIncome === true,
  };
}

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  const raw = await getStoredItem(ONBOARDING_DRAFT_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeOnboardingDraft(JSON.parse(raw) as Partial<OnboardingDraft>);
  } catch {
    return null;
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  await setStoredItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
}

export async function clearOnboardingDraft(): Promise<void> {
  await Promise.all([
    removeStoredItem(ONBOARDING_DRAFT_KEY),
    removeStoredItem(ONBOARDING_DISMISSED_KEY),
  ]);
}

export async function getOnboardingDismissed(): Promise<boolean> {
  return parseStoredBoolean(await getStoredItem(ONBOARDING_DISMISSED_KEY));
}

export async function setOnboardingDismissed(value: boolean): Promise<void> {
  if (value) {
    await setStoredItem(ONBOARDING_DISMISSED_KEY, 'true');
  } else {
    await removeStoredItem(ONBOARDING_DISMISSED_KEY);
  }
}

export function getOnboardingTotalSteps(borrowerType: BorrowerType): number {
  return borrowerType === 'INDIVIDUAL' ? 5 : 7;
}

export function getCurrentOnboardingStepIndex(
  step: OnboardingMainStep,
  borrowerType: BorrowerType,
  subStep: BorrowerDetailSubStep,
): number {
  if (step === 0) {
    return 0;
  }

  if (step === 1) {
    return 0;
  }

  if (step === 3) {
    return getOnboardingTotalSteps(borrowerType) - 1;
  }

  return subStep;
}

export function getSavedDraftProgressLabel(draft: OnboardingDraft): string | null {
  const totalSteps = getOnboardingTotalSteps(draft.borrowerType);
  const currentIndex = getCurrentOnboardingStepIndex(
    draft.step,
    draft.borrowerType,
    draft.borrowerDetailSubStep,
  );

  if (currentIndex <= 0) {
    return null;
  }

  return `Step ${currentIndex + 1} of ${totalSteps}`;
}

export function getBorrowerDisplayName(profile: BorrowerProfile): string {
  if (profile.borrowerType === 'CORPORATE' && profile.companyName?.trim()) {
    return profile.companyName.trim();
  }

  return profile.name?.trim() || 'Borrower';
}

export function validateIndividualFormStep(
  data: IndividualFormData,
  subStep: IndividualSubStep,
  noMonthlyIncome: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (subStep === 1) {
    if (!data.name.trim()) errors.name = 'Name is required';
    if (!data.icNumber.trim()) errors.icNumber = 'IC/Passport number is required';
    else if (data.documentType === 'IC' && data.icNumber.replace(/\D/g, '').length !== 12) {
      errors.icNumber = 'IC number must be exactly 12 digits';
    }
    if (!data.dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
    if (!data.gender) errors.gender = 'Gender is required';
    if (!data.race) errors.race = 'Race is required';
    if (!data.educationLevel) errors.educationLevel = 'Education level is required';
    if (!data.occupation.trim()) errors.occupation = 'Occupation is required';
    if (!data.employmentStatus) errors.employmentStatus = 'Employment status is required';
    if (!noMonthlyIncome) {
      if (!data.monthlyIncome.trim()) errors.monthlyIncome = 'Monthly income is required';
      else if (Number.isNaN(Number.parseFloat(data.monthlyIncome)) || Number.parseFloat(data.monthlyIncome) < 0) {
        errors.monthlyIncome = 'Enter a valid income amount';
      }
    }
  }

  if (subStep === 2) {
    if (!data.phone.trim()) errors.phone = 'Phone number is required';
    if (!data.email.trim()) errors.email = 'Email is required';
    if (!data.addressLine1.trim()) errors.addressLine1 = 'Address line 1 is required';
    if (!data.city.trim()) errors.city = 'City is required';
    if (!data.state.trim()) errors.state = 'State is required';
    if (!data.postcode.trim()) errors.postcode = 'Postcode is required';
    else if (!POSTCODE_REGEX.test(data.postcode)) errors.postcode = 'Postcode must contain numbers only';
    if (!data.country.trim()) errors.country = 'Country is required';
    if (!data.bankName) errors.bankName = 'Bank is required';
    if (data.bankName === 'OTHER' && !data.bankNameOther.trim()) {
      errors.bankNameOther = 'Bank name is required';
    }
    if (!data.bankAccountNo.trim()) errors.bankAccountNo = 'Account number is required';
    else if (!BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ''))) {
      errors.bankAccountNo = 'Account number must be 8-17 digits only';
    }
  }

  return errors;
}

export function validateCorporateFormStep(
  data: CorporateFormData,
  subStep: CorporateSubStep,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (subStep === 1) {
    if (!data.companyName.trim()) errors.companyName = 'Company name is required';
    if (!data.ssmRegistrationNo.trim()) errors.ssmRegistrationNo = 'SSM registration number is required';
    if (!data.addressLine1.trim()) errors.addressLine1 = 'Address line 1 is required';
    if (!data.city.trim()) errors.city = 'City is required';
    if (!data.state.trim()) errors.state = 'State is required';
    if (!data.postcode.trim()) errors.postcode = 'Postcode is required';
    else if (!POSTCODE_REGEX.test(data.postcode)) errors.postcode = 'Postcode must contain numbers only';
    if (!data.country.trim()) errors.country = 'Country is required';
    if (!data.bumiStatus) errors.bumiStatus = 'Taraf (Bumi status) is required for compliance';
  }

  if (subStep === 2) {
    if (!data.companyPhone.trim()) errors.companyPhone = 'Company phone is required';
    if (!data.companyEmail.trim()) errors.companyEmail = 'Company email is required';
  }

  if (subStep === 3) {
    if (!Array.isArray(data.directors) || data.directors.length < 1) {
      errors.directors = 'At least 1 director is required';
    } else if (data.directors.length > 10) {
      errors.directors = 'Maximum 10 directors allowed';
    } else {
      data.directors.forEach((director, index) => {
        if (!director.name.trim()) {
          errors[`directorName_${index}`] = `Director ${index + 1} name is required`;
        }
        if (!director.icNumber.trim()) {
          errors[`directorIc_${index}`] = `Director ${index + 1} IC number is required`;
        } else if (director.icNumber.replace(/\D/g, '').length !== 12) {
          errors[`directorIc_${index}`] = `Director ${index + 1} IC must be exactly 12 digits`;
        }
      });

      const authorizedCount = data.directors.filter((director) => director.isAuthorizedRepresentative).length;
      if (authorizedCount !== 1) {
        errors.authorizedRepresentative =
          authorizedCount === 0
            ? 'Select one director as the authorized representative'
            : 'Only one director can be the authorized representative';
      }
    }
  }

  if (subStep === 4) {
    if (!data.bankName) errors.bankName = 'Bank is required';
    if (data.bankName === 'OTHER' && !data.bankNameOther.trim()) {
      errors.bankNameOther = 'Bank name is required';
    }
    if (!data.bankAccountNo.trim()) errors.bankAccountNo = 'Account number is required';
    else if (!BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ''))) {
      errors.bankAccountNo = 'Account number must be 8-17 digits only';
    }
  }

  return errors;
}

export function validateIndividualForm(
  data: IndividualFormData,
  noMonthlyIncome: boolean,
): Record<string, string> {
  return {
    ...validateIndividualFormStep(data, 1, noMonthlyIncome),
    ...validateIndividualFormStep(data, 2, noMonthlyIncome),
  };
}

export function validateCorporateForm(data: CorporateFormData): Record<string, string> {
  return {
    ...validateCorporateFormStep(data, 1),
    ...validateCorporateFormStep(data, 2),
    ...validateCorporateFormStep(data, 3),
    ...validateCorporateFormStep(data, 4),
  };
}

/**
 * Per-card completeness helpers. Each returns true when every mandatory
 * field rendered inside that section card is valid. Optional cards
 * (emergency contact, social media, additional details) are not included
 * because they have no required fields and should not show a "Complete"
 * status even when partially filled.
 */
export function isIndividualPersonalSectionComplete(
  data: IndividualFormData,
  noMonthlyIncome: boolean,
): boolean {
  return Object.keys(validateIndividualFormStep(data, 1, noMonthlyIncome)).length === 0;
}

export function isIndividualContactSectionComplete(data: IndividualFormData): boolean {
  return Boolean(data.phone.trim()) && Boolean(data.email.trim());
}

export function isIndividualAddressSectionComplete(data: IndividualFormData): boolean {
  return (
    Boolean(data.addressLine1.trim()) &&
    Boolean(data.city.trim()) &&
    Boolean(data.state.trim()) &&
    Boolean(data.postcode.trim()) &&
    POSTCODE_REGEX.test(data.postcode) &&
    Boolean(data.country.trim())
  );
}

export function isIndividualBankSectionComplete(data: IndividualFormData): boolean {
  if (!data.bankName) return false;
  if (data.bankName === 'OTHER' && !data.bankNameOther.trim()) return false;
  if (!data.bankAccountNo.trim()) return false;
  return BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ''));
}

export function isCorporateCompanySectionComplete(data: CorporateFormData): boolean {
  return (
    Boolean(data.companyName.trim()) &&
    Boolean(data.ssmRegistrationNo.trim()) &&
    Boolean(data.bumiStatus)
  );
}

export function isCorporateAddressSectionComplete(data: CorporateFormData): boolean {
  return (
    Boolean(data.addressLine1.trim()) &&
    Boolean(data.city.trim()) &&
    Boolean(data.state.trim()) &&
    Boolean(data.postcode.trim()) &&
    POSTCODE_REGEX.test(data.postcode) &&
    Boolean(data.country.trim())
  );
}

export function isCorporateContactSectionComplete(data: CorporateFormData): boolean {
  return Boolean(data.companyPhone.trim()) && Boolean(data.companyEmail.trim());
}

export function isCorporateDirectorsSectionComplete(data: CorporateFormData): boolean {
  return Object.keys(validateCorporateFormStep(data, 3)).length === 0;
}

export function isCorporateBankSectionComplete(data: CorporateFormData): boolean {
  return Object.keys(validateCorporateFormStep(data, 4)).length === 0;
}

/**
 * Optional-section completeness helpers. Each returns true only when every
 * field in the section has a value, so the UI can flip the card status from
 * a neutral "Optional" badge to a green "Complete" badge.
 */
export function isIndividualEmergencyContactComplete(data: IndividualFormData): boolean {
  return (
    Boolean(data.emergencyContactName.trim()) &&
    Boolean(data.emergencyContactPhone.trim()) &&
    Boolean(data.emergencyContactRelationship.trim())
  );
}

export function isIndividualSocialMediaComplete(data: IndividualFormData): boolean {
  return (
    Boolean(data.instagram.trim()) &&
    Boolean(data.tiktok.trim()) &&
    Boolean(data.facebook.trim()) &&
    Boolean(data.linkedin.trim()) &&
    Boolean(data.xTwitter.trim())
  );
}

export function isCorporateSocialMediaComplete(data: CorporateFormData): boolean {
  return (
    Boolean(data.instagram.trim()) &&
    Boolean(data.tiktok.trim()) &&
    Boolean(data.facebook.trim()) &&
    Boolean(data.linkedin.trim()) &&
    Boolean(data.xTwitter.trim())
  );
}

export function isCorporateAdditionalDetailsComplete(data: CorporateFormData): boolean {
  return Boolean(data.paidUpCapital.trim()) && Boolean(data.numberOfEmployees.trim());
}

export function buildOnboardingPayload(params: {
  borrowerType: BorrowerType;
  individualFormData: IndividualFormData;
  corporateFormData: CorporateFormData;
  noMonthlyIncome: boolean;
}): OnboardingPayload {
  const { borrowerType, individualFormData, corporateFormData, noMonthlyIncome } = params;

  if (borrowerType === 'INDIVIDUAL') {
    const data = individualFormData;

    return {
      borrowerType: 'INDIVIDUAL',
      name: data.name.trim(),
      icNumber: data.icNumber.trim(),
      documentType: data.documentType,
      phone: data.phone.trim() || undefined,
      email: data.email.trim() || undefined,
      addressLine1: data.addressLine1.trim() || undefined,
      addressLine2: data.addressLine2.trim() || undefined,
      city: data.city.trim() || undefined,
      state: data.state.trim() || undefined,
      postcode: data.postcode.trim() || undefined,
      country: data.country.trim() || undefined,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : undefined,
      gender: data.gender.trim() || undefined,
      race: data.race.trim() || undefined,
      educationLevel: data.educationLevel.trim() || undefined,
      occupation: data.occupation.trim() || undefined,
      employmentStatus: data.employmentStatus.trim() || undefined,
      bankName: data.bankName.trim() || undefined,
      bankNameOther: data.bankName === 'OTHER' ? data.bankNameOther.trim() || undefined : undefined,
      bankAccountNo: data.bankAccountNo.trim() || undefined,
      monthlyIncome: noMonthlyIncome
        ? 0
        : data.monthlyIncome.trim() !== ''
          ? Number.parseFloat(data.monthlyIncome)
          : null,
      emergencyContactName: data.emergencyContactName.trim() || undefined,
      emergencyContactPhone: data.emergencyContactPhone.trim() || undefined,
      emergencyContactRelationship: data.emergencyContactRelationship.trim() || undefined,
      instagram: data.instagram.trim() || undefined,
      tiktok: data.tiktok.trim() || undefined,
      facebook: data.facebook.trim() || undefined,
      linkedin: data.linkedin.trim() || undefined,
      xTwitter: data.xTwitter.trim() || undefined,
    };
  }

  const data = corporateFormData;
  const authorizedDirector =
    data.directors.find((director) => director.isAuthorizedRepresentative) ?? data.directors[0];

  return {
    borrowerType: 'CORPORATE',
    name: authorizedDirector?.name.trim() || data.authorizedRepName.trim(),
    icNumber: data.ssmRegistrationNo.trim(),
    documentType: 'IC',
    phone: data.companyPhone.trim() || undefined,
    email: data.companyEmail.trim() || undefined,
    addressLine1: data.addressLine1.trim() || undefined,
    addressLine2: data.addressLine2.trim() || undefined,
    city: data.city.trim() || undefined,
    state: data.state.trim() || undefined,
    postcode: data.postcode.trim() || undefined,
    country: data.country.trim() || undefined,
    companyName: data.companyName.trim() || undefined,
    ssmRegistrationNo: data.ssmRegistrationNo.trim() || undefined,
    businessAddress: data.addressLine1.trim() || undefined,
    bumiStatus: data.bumiStatus.trim() || undefined,
    authorizedRepName:
      authorizedDirector?.name.trim() || data.authorizedRepName.trim() || undefined,
    authorizedRepIc:
      authorizedDirector?.icNumber.trim() || data.authorizedRepIc.trim() || undefined,
    companyPhone: data.companyPhone.trim() || undefined,
    companyEmail: data.companyEmail.trim() || undefined,
    natureOfBusiness: data.natureOfBusiness.trim() || undefined,
    dateOfIncorporation: data.dateOfIncorporation
      ? new Date(data.dateOfIncorporation).toISOString()
      : undefined,
    paidUpCapital: data.paidUpCapital ? Number.parseFloat(data.paidUpCapital) : undefined,
    numberOfEmployees: data.numberOfEmployees
      ? Number.parseInt(data.numberOfEmployees, 10)
      : undefined,
    bankName: data.bankName.trim() || undefined,
    bankNameOther: data.bankName === 'OTHER' ? data.bankNameOther.trim() || undefined : undefined,
    bankAccountNo: data.bankAccountNo.trim() || undefined,
    directors: data.directors
      .filter((director) => director.name.trim() && director.icNumber.trim())
      .map((director) => ({
        name: director.name.trim(),
        icNumber: director.icNumber.replace(/\D/g, ''),
        position: director.position.trim() || undefined,
        isAuthorizedRepresentative: director.isAuthorizedRepresentative === true,
      })),
    instagram: data.instagram.trim() || undefined,
    tiktok: data.tiktok.trim() || undefined,
    facebook: data.facebook.trim() || undefined,
    linkedin: data.linkedin.trim() || undefined,
    xTwitter: data.xTwitter.trim() || undefined,
  };
}
