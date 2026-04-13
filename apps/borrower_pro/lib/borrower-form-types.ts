/**
 * Shared types for borrower onboarding forms (individual & corporate).
 */

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
  name: string;
  icNumber: string;
  position: string;
  /** Exactly one director must be flagged as the authorized representative for KYC and agreements. */
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
