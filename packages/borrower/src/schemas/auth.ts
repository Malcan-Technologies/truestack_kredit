import { z } from "zod";

export const BorrowerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  companyName: z.string().nullable().optional(),
  borrowerType: z.string(),
  icNumber: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

export const BorrowerMeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }),
    profileCount: z.number(),
    profiles: z.array(BorrowerProfileSchema),
    activeBorrower: BorrowerProfileSchema.nullable(),
    activeBorrowerId: z.string().nullable(),
  }),
});

export const LenderInfoSchema = z.object({
  name: z.string(),
  type: z.enum(["PPW", "PPG"]),
  licenseNumber: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  email: z.string().nullable(),
  contactNumber: z.string().nullable(),
  businessAddress: z.string().nullable(),
  logoUrl: z.string().nullable(),
});

export const LenderInfoResponseSchema = z.object({
  success: z.boolean(),
  data: LenderInfoSchema,
});

export const CrossTenantInsightsSchema = z.object({
  hasHistory: z.boolean(),
  otherLenderCount: z.number(),
  lenderNames: z.array(z.string()),
  totalLoans: z.number(),
  activeLoans: z.number(),
  completedLoans: z.number(),
  defaultedLoans: z.number(),
  latePaymentsCount: z.number().optional(),
  totalBorrowedRange: z.string().nullable(),
  paymentPerformance: z.object({
    rating: z.string(),
    onTimeRateRange: z.string().nullable(),
  }),
  lastBorrowedAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  nameConsistency: z.string().optional(),
  phoneConsistency: z.string().optional(),
  addressConsistency: z.string().optional(),
});

export const OnboardingPayloadSchema = z.object({
  borrowerType: z.enum(["INDIVIDUAL", "CORPORATE"]),
  name: z.string(),
  icNumber: z.string().optional(),
  documentType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  race: z.string().optional(),
  educationLevel: z.string().optional(),
  occupation: z.string().optional(),
  employmentStatus: z.string().optional(),
  bankName: z.string().optional(),
  bankNameOther: z.string().optional(),
  bankAccountNo: z.string().optional(),
  monthlyIncome: z.number().nullable().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  instagram: z.string().optional(),
  tiktok: z.string().optional(),
  facebook: z.string().optional(),
  linkedin: z.string().optional(),
  xTwitter: z.string().optional(),
  companyName: z.string().optional(),
  ssmRegistrationNo: z.string().optional(),
  businessAddress: z.string().optional(),
  authorizedRepName: z.string().optional(),
  authorizedRepIc: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  natureOfBusiness: z.string().optional(),
  dateOfIncorporation: z.string().optional(),
  paidUpCapital: z.number().nullable().optional(),
  numberOfEmployees: z.number().nullable().optional(),
  bumiStatus: z.string().optional(),
  directors: z.array(z.object({
    name: z.string(),
    icNumber: z.string(),
    position: z.string().optional(),
    isAuthorizedRepresentative: z.boolean().optional(),
  })).optional(),
});

export const CompanyMembersContextSchema = z.object({
  isCorporate: z.boolean(),
  organizationId: z.string().nullable(),
  role: z.string().nullable(),
  canManageMembers: z.boolean(),
  canEditCompanyProfile: z.boolean(),
  needsOrgBackfill: z.boolean().optional(),
});
