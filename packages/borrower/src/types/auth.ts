export interface BorrowerProfile {
  id: string;
  name: string;
  companyName?: string | null;
  borrowerType: string;
  icNumber: string | null;
  phone: string | null;
  email: string | null;
}

export interface BorrowerMeResponse {
  success: boolean;
  data: {
    user: { id: string; email: string; name: string | null };
    profileCount: number;
    profiles: BorrowerProfile[];
    activeBorrower: BorrowerProfile | null;
    activeBorrowerId: string | null;
  };
}

/** Lender (tenant) details for the borrower About page — mirrors admin tenant display fields. */
export interface LenderInfo {
  name: string;
  type: "PPW" | "PPG";
  licenseNumber: string | null;
  registrationNumber: string | null;
  email: string | null;
  contactNumber: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
}

export interface LenderInfoResponse {
  success: boolean;
  data: LenderInfo;
}

export interface CrossTenantInsights {
  hasHistory: boolean;
  otherLenderCount: number;
  lenderNames: string[];
  totalLoans: number;
  activeLoans: number;
  completedLoans: number;
  defaultedLoans: number;
  latePaymentsCount?: number;
  totalBorrowedRange: string | null;
  paymentPerformance: {
    rating: string;
    onTimeRateRange: string | null;
  };
  lastBorrowedAt: string | null;
  lastActivityAt: string | null;
  nameConsistency?: string;
  phoneConsistency?: string;
  addressConsistency?: string;
}

export interface OnboardingPayload {
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  name: string;
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
  directors?: Array<{ name: string; icNumber: string; position?: string }>;
}

/** Company org context for the active corporate borrower (Better Auth organization + roles). */
export interface CompanyMembersContext {
  isCorporate: boolean;
  organizationId: string | null;
  role: string | null;
  canManageMembers: boolean;
  canEditCompanyProfile: boolean;
  needsOrgBackfill?: boolean;
}
