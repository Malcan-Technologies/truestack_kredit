import { z } from "zod";

export const LoanCenterOverviewSchema = z.object({
  counts: z.object({
    incompleteApplications: z.number(),
    applicationsTab: z.number(),
    rejectedApplications: z.number(),
    pendingDisbursementLoans: z.number(),
    activeLoans: z.number(),
    dischargedLoans: z.number(),
  }),
  summary: z.object({
    totalPaid: z.number(),
    totalOutstanding: z.number(),
    nextPaymentDue: z.string().nullable(),
    nextPaymentAmount: z.number().nullable(),
    activeLoanCount: z.number(),
  }),
  borrowerKycComplete: z.boolean().nullable().optional(),
});

export const SignedAgreementReviewStatusSchema = z.enum(["NONE", "PENDING", "APPROVED", "REJECTED"]);

export const AttestationStatusSchema = z.enum([
  "NOT_STARTED",
  "VIDEO_COMPLETED",
  "MEETING_REQUESTED",
  "SLOT_PROPOSED",
  "COUNTER_PROPOSED",
  "PROPOSAL_EXPIRED",
  "MEETING_SCHEDULED",
  "MEETING_COMPLETED",
  "COMPLETED",
]);

export const LoanChannelSchema = z.enum(["ONLINE", "PHYSICAL"]);

export const BorrowerLoanListItemSchema = z.object({
  id: z.string(),
  principalAmount: z.string(),
  interestRate: z.string(),
  term: z.number(),
  status: z.string(),
  loanChannel: LoanChannelSchema.optional(),
  disbursementDate: z.string().nullable(),
  createdAt: z.string(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    loanScheduleType: z.string().nullable().optional(),
  }),
  application: z.object({ id: z.string(), status: z.string() }).optional(),
  agreementDate: z.string().nullable().optional(),
  signedAgreementReviewStatus: SignedAgreementReviewStatusSchema.optional(),
  attestationStatus: AttestationStatusSchema.optional(),
  attestationCompletedAt: z.string().nullable().optional(),
  attestationCancellationReason: z.string().nullable().optional(),
  progress: z.object({
    paidCount: z.number(),
    totalRepayments: z.number(),
    progressPercent: z.number(),
    readyToComplete: z.boolean(),
    totalPaid: z.number().optional(),
    totalDue: z.number().optional(),
    totalOutstanding: z.number().optional(),
    overdueCount: z.number().optional(),
    totalLateFees: z.number().optional(),
    repaymentRate: z.number().optional(),
    nextPaymentDue: z.string().nullable().optional(),
  }),
});

export const BorrowerLoanBorrowerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  borrowerType: z.string().nullable(),
  icNumber: z.string().nullable(),
  documentType: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  companyName: z.string().nullable(),
});

export const BorrowerLoanDetailSchema = z.object({
  id: z.string(),
  status: z.string(),
  loanChannel: LoanChannelSchema.optional(),
  principalAmount: z.unknown(),
  interestRate: z.unknown().optional(),
  term: z.number(),
  borrower: BorrowerLoanBorrowerSnapshotSchema.nullable().optional(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    loanScheduleType: z.string().nullable().optional(),
    interestModel: z.string().optional(),
    latePaymentRate: z.unknown().optional(),
    arrearsPeriod: z.number().optional(),
    defaultPeriod: z.number().optional(),
    earlySettlementEnabled: z.boolean().optional(),
    earlySettlementLockInMonths: z.number().optional(),
    earlySettlementDiscountType: z.string().nullable().optional(),
    earlySettlementDiscountValue: z.unknown().optional(),
  }),
  application: z.object({ id: z.string(), status: z.string() }).optional(),
  disbursementDate: z.string().nullable().optional(),
  disbursementReference: z.string().nullable().optional(),
  disbursementProofPath: z.string().nullable().optional(),
  disbursementProofName: z.string().nullable().optional(),
  stampCertPath: z.string().nullable().optional(),
  stampCertOriginalName: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  collateralType: z.string().nullable().optional(),
  collateralValue: z.unknown().optional(),
  agreementDate: z.string().nullable(),
  agreementPath: z.string().nullable(),
  agreementOriginalName: z.string().nullable(),
  agreementUploadedAt: z.string().nullable(),
  agreementVersion: z.number(),
  borrowerSignedAgreementPath: z.string().nullable().optional(),
  signedAgreementReviewStatus: SignedAgreementReviewStatusSchema.optional(),
  signedAgreementReviewedAt: z.string().nullable(),
  signedAgreementReviewNotes: z.string().nullable(),
  attestationStatus: AttestationStatusSchema.optional(),
  attestationVideoCompletedAt: z.string().nullable().optional(),
  attestationVideoWatchedPercent: z.number().optional(),
  attestationMeetingRequestedAt: z.string().nullable().optional(),
  attestationProposalStartAt: z.string().nullable().optional(),
  attestationProposalEndAt: z.string().nullable().optional(),
  attestationProposalDeadlineAt: z.string().nullable().optional(),
  attestationProposalSource: z.enum(["BORROWER", "ADMIN_COUNTER"]).nullable().optional(),
  attestationBorrowerProposalCount: z.number().optional(),
  attestationMeetingScheduledAt: z.string().nullable().optional(),
  attestationMeetingStartAt: z.string().nullable().optional(),
  attestationMeetingEndAt: z.string().nullable().optional(),
  attestationMeetingLink: z.string().nullable().optional(),
  attestationMeetingNotes: z.string().nullable().optional(),
  attestationGoogleCalendarEventId: z.string().nullable().optional(),
  attestationMeetingAdminCompletedAt: z.string().nullable().optional(),
  attestationTermsAcceptedAt: z.string().nullable().optional(),
  attestationCompletedAt: z.string().nullable().optional(),
  attestationCancellationReason: z.string().nullable().optional(),
  borrowerKycComplete: z.boolean().nullable().optional(),
});

export const BorrowerLoanMetricsSchema = z.object({
  loanId: z.string(),
  status: z.string(),
  hasSchedule: z.boolean(),
  totalDue: z.number().optional(),
  totalPaid: z.number().optional(),
  totalOutstanding: z.number().optional(),
  totalLateFees: z.number().optional(),
  paidCount: z.number().optional(),
  pendingCount: z.number().optional(),
  overdueCount: z.number().optional(),
  totalRepayments: z.number().optional(),
  repaymentRate: z.number().optional(),
  progressPercent: z.number().optional(),
  nextPaymentDue: z.string().nullable().optional(),
  oldestOverdueDays: z.number().optional(),
});

export const BorrowerLoanTimelineEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  previousData: z.record(z.unknown()).nullable(),
  newData: z.record(z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }).nullable(),
});

export const RecordBorrowerPaymentBodySchema = z.object({
  amount: z.number(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  applyLateFee: z.boolean().optional(),
  paymentDate: z.string().optional(),
});

export const LenderBankInfoSchema = z.object({
  name: z.string(),
  lenderBankCode: z.string().nullable().optional(),
  lenderBankOtherName: z.string().nullable().optional(),
  lenderAccountHolderName: z.string().nullable().optional(),
  lenderAccountNumber: z.string().nullable().optional(),
});
