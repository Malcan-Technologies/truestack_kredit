import { z } from "zod";

export const ApplicationStepSchema = z.enum([
  "product",
  "loan_details",
  "personal",
  "documents",
  "review",
]);

export const RequiredDocumentItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
});

export const BorrowerProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  interestModel: z.string(),
  interestRate: z.unknown(),
  latePaymentRate: z.unknown(),
  arrearsPeriod: z.number(),
  defaultPeriod: z.number(),
  minAmount: z.unknown(),
  maxAmount: z.unknown(),
  minTerm: z.number(),
  maxTerm: z.number(),
  termInterval: z.number().optional(),
  allowedTerms: z.array(z.number()).nullable().optional(),
  legalFeeType: z.string(),
  legalFeeValue: z.unknown(),
  stampingFeeType: z.string(),
  stampingFeeValue: z.unknown(),
  requiredDocuments: z.array(RequiredDocumentItemSchema).nullable(),
  eligibleBorrowerTypes: z.string(),
  loanScheduleType: z.string(),
  isActive: z.boolean(),
  earlySettlementEnabled: z.boolean().optional(),
  earlySettlementLockInMonths: z.number().optional(),
  earlySettlementDiscountType: z.string().optional(),
  earlySettlementDiscountValue: z.unknown().optional(),
});

export const LoanPreviewDataSchema = z.object({
  loanAmount: z.number(),
  term: z.number(),
  interestRate: z.number(),
  interestModel: z.string(),
  legalFee: z.number(),
  legalFeeType: z.string(),
  stampingFee: z.number(),
  stampingFeeType: z.string(),
  totalFees: z.number(),
  netDisbursement: z.number(),
  monthlyPayment: z.number(),
  totalInterest: z.number(),
  totalPayable: z.number(),
});

export const ApplicationDocumentRowSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  category: z.string(),
  uploadedAt: z.string(),
  path: z.string().optional(),
});

export const LoanApplicationDetailSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  borrowerId: z.string(),
  productId: z.string(),
  amount: z.unknown(),
  term: z.number(),
  status: z.string(),
  loanChannel: z.enum(["ONLINE", "PHYSICAL"]).optional(),
  notes: z.string().nullable(),
  collateralType: z.string().nullable(),
  collateralValue: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
  product: BorrowerProductSchema,
  documents: z.array(ApplicationDocumentRowSchema),
  borrower: z.record(z.unknown()).optional(),
  loan: z.object({ id: z.string(), status: z.string() }).nullable().optional(),
  offerRounds: z.array(z.object({
    id: z.string(),
    amount: z.unknown().optional(),
    term: z.number().optional(),
    fromParty: z.string(),
    status: z.string(),
    createdAt: z.string().optional(),
  })).optional(),
  returnedForAmendment: z.boolean().optional(),
});
