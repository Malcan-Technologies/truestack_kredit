export interface TruestackKycSessionRow {
  id: string;
  externalSessionId: string;
  directorId: string | null;
  onboardingUrl: string;
  expiresAt: string | null;
  status: string;
  result: string | null;
  rejectMessage: string | null;
  lastWebhookAt: string | null;
  /** May be absent on older API responses; prefer `updatedAt` when sorting. */
  createdAt?: string | null;
  updatedAt: string;
}

export interface TruestackKycStatusData {
  borrowerType: string;
  sessions: TruestackKycSessionRow[];
  latest: TruestackKycSessionRow | null;
}

export interface BorrowerDocument {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  category: string;
  uploadedAt: string;
}

export interface BorrowerDirector {
  id: string;
  name: string;
  icNumber: string;
  position: string | null;
  order: number;
  isAuthorizedRepresentative?: boolean;
}

export interface BorrowerDetail {
  id: string;
  borrowerType: string;
  name: string;
  icNumber: string;
  documentType: string;
  documentVerified: boolean;
  verificationStatus?: string | null;
  trueIdentityStatus?: string | null;
  trueIdentityResult?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  race: string | null;
  educationLevel: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  bankName: string | null;
  bankNameOther: string | null;
  bankAccountNo: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  monthlyIncome: string | number | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  linkedin: string | null;
  xTwitter: string | null;
  companyName: string | null;
  ssmRegistrationNo: string | null;
  businessAddress: string | null;
  bumiStatus: string | null;
  authorizedRepName: string | null;
  authorizedRepIc: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  natureOfBusiness: string | null;
  dateOfIncorporation: string | null;
  paidUpCapital: string | number | null;
  numberOfEmployees: number | null;
  directors: BorrowerDirector[];
  documents: BorrowerDocument[];
}

export interface UpdateBorrowerPayload {
  name?: string;
  icNumber?: string;
  documentType?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  dateOfBirth?: string;
  gender?: string;
  race?: string;
  educationLevel?: string;
  occupation?: string;
  employmentStatus?: string;
  bankName?: string;
  bankNameOther?: string;
  bankAccountNo?: string;
  monthlyIncome?: number | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  linkedin?: string;
  xTwitter?: string;
  companyName?: string;
  ssmRegistrationNo?: string;
  businessAddress?: string;
  authorizedRepName?: string;
  authorizedRepIc?: string;
  companyPhone?: string;
  companyEmail?: string;
  natureOfBusiness?: string;
  dateOfIncorporation?: string;
  paidUpCapital?: number | null;
  numberOfEmployees?: number | null;
  bumiStatus?: string;
  directors?: Array<{
    name: string;
    icNumber: string;
    position?: string;
    id?: string;
    isAuthorizedRepresentative?: boolean;
  }>;
}
