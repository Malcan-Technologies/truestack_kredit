/**
 * Borrower-facing loan center types (aligned with /api/borrower-auth responses).
 */

export interface LoanCenterOverview {
  counts: {
    incompleteApplications: number;
    applicationsTab: number;
    rejectedApplications: number;
    pendingDisbursementLoans: number;
    activeLoans: number;
    dischargedLoans: number;
  };
  summary: {
    totalPaid: number;
    totalOutstanding: number;
    nextPaymentDue: string | null;
    nextPaymentAmount: number | null;
    activeLoanCount: number;
  };
  /**
   * Server-computed flag mirroring the client `isBorrowerKycComplete` helper.
   * Lets the loan-center UI skip a separate `/borrower` + `/kyc/status` round-trip.
   * `null` only if the borrower record cannot be loaded.
   */
  borrowerKycComplete?: boolean | null;
}

/** Admin review of borrower-uploaded signed agreement (pre-disbursement) */
export type SignedAgreementReviewStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/** Loan attestation (video / lawyer meeting) before agreement signing */
export type AttestationStatus =
  | "NOT_STARTED"
  | "VIDEO_COMPLETED"
  | "MEETING_REQUESTED"
  | "SLOT_PROPOSED"
  | "COUNTER_PROPOSED"
  | "PROPOSAL_EXPIRED"
  | "MEETING_SCHEDULED"
  | "COMPLETED";

export type LoanChannel = "ONLINE" | "PHYSICAL";

export interface BorrowerLoanListItem {
  id: string;
  principalAmount: string;
  interestRate: string;
  term: number;
  status: string;
  loanChannel?: LoanChannel;
  disbursementDate: string | null;
  createdAt: string;
  product: { id: string; name: string; loanScheduleType?: string | null };
  application?: { id: string; status: string };
  /** Present on list/detail from API for pending-disbursement workflow */
  agreementDate?: string | null;
  signedAgreementReviewStatus?: SignedAgreementReviewStatus;
  attestationStatus?: AttestationStatus;
  attestationCompletedAt?: string | null;
  attestationCancellationReason?: string | null;
  progress: {
    paidCount: number;
    totalRepayments: number;
    progressPercent: number;
    readyToComplete: boolean;
    totalPaid?: number;
    totalDue?: number;
    totalOutstanding?: number;
    overdueCount?: number;
    totalLateFees?: number;
    repaymentRate?: number;
    nextPaymentDue?: string | null;
  };
}

/** Snapshot from GET loan — mirrors admin loan detail borrower block. */
export interface BorrowerLoanBorrowerSnapshot {
  id: string;
  name: string | null;
  borrowerType: string | null;
  icNumber: string | null;
  documentType: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
}

export interface BorrowerLoanDetail {
  id: string;
  status: string;
  loanChannel?: LoanChannel;
  principalAmount: unknown;
  interestRate?: unknown;
  term: number;
  borrower?: BorrowerLoanBorrowerSnapshot | null;
  product: {
    id: string;
    name: string;
    loanScheduleType?: string | null;
    interestModel?: string;
    latePaymentRate?: unknown;
    arrearsPeriod?: number;
    defaultPeriod?: number;
    earlySettlementEnabled?: boolean;
    earlySettlementLockInMonths?: number;
    earlySettlementDiscountType?: string | null;
    earlySettlementDiscountValue?: unknown;
  };
  application?: { id: string; status: string };
  disbursementDate?: string | null;
  disbursementReference?: string | null;
  disbursementProofPath?: string | null;
  disbursementProofName?: string | null;
  stampCertPath?: string | null;
  stampCertOriginalName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  collateralType?: string | null;
  collateralValue?: unknown;
  agreementDate: string | null;
  agreementPath: string | null;
  agreementOriginalName: string | null;
  agreementUploadedAt: string | null;
  agreementVersion: number;
  borrowerSignedAgreementPath?: string | null;
  signedAgreementReviewStatus?: SignedAgreementReviewStatus;
  signedAgreementReviewedAt: string | null;
  signedAgreementReviewNotes: string | null;
  attestationStatus?: AttestationStatus;
  attestationVideoCompletedAt?: string | null;
  attestationVideoWatchedPercent?: number;
  attestationMeetingRequestedAt?: string | null;
  attestationProposalStartAt?: string | null;
  attestationProposalEndAt?: string | null;
  attestationProposalDeadlineAt?: string | null;
  attestationProposalSource?: "BORROWER" | "ADMIN_COUNTER" | null;
  attestationBorrowerProposalCount?: number;
  attestationMeetingScheduledAt?: string | null;
  attestationMeetingStartAt?: string | null;
  attestationMeetingEndAt?: string | null;
  attestationMeetingLink?: string | null;
  attestationMeetingNotes?: string | null;
  attestationGoogleCalendarEventId?: string | null;
  attestationCompletedAt?: string | null;
  attestationCancellationReason?: string | null;
  /**
   * Server-computed flag mirroring the client `isBorrowerKycComplete` helper.
   * Lets the loan-detail UI skip a separate `/borrower` + `/kyc/status`
   * round-trip when KYC is already done. `null` only if the borrower record
   * cannot be loaded.
   */
  borrowerKycComplete?: boolean | null;
}

export interface BorrowerLoanMetrics {
  loanId: string;
  status: string;
  hasSchedule: boolean;
  totalDue?: number;
  totalPaid?: number;
  totalOutstanding?: number;
  totalLateFees?: number;
  paidCount?: number;
  pendingCount?: number;
  overdueCount?: number;
  totalRepayments?: number;
  repaymentRate?: number;
  progressPercent?: number;
  nextPaymentDue?: string | null;
  oldestOverdueDays?: number;
}

export interface BorrowerLoanTimelineEvent {
  id: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export interface RecordBorrowerPaymentBody {
  amount: number;
  reference?: string;
  notes?: string;
  applyLateFee?: boolean;
  paymentDate?: string;
}

export interface LenderBankInfo {
  name: string;
  lenderBankCode?: string | null;
  lenderBankOtherName?: string | null;
  lenderAccountHolderName?: string | null;
  lenderAccountNumber?: string | null;
}

export interface EarlySettlementQuoteData {
  eligible: boolean;
  reason?: string;
  lockInEndDate?: string | null;
  remainingPrincipal?: number;
  remainingInterest?: number;
  remainingFutureInterest?: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  outstandingLateFees?: number;
  totalWithoutLateFees?: number;
  totalSettlement?: number;
  totalSavings?: number;
  unpaidInstallments?: number;
}

export interface BorrowerEarlySettlementRequest {
  id: string;
  status: string;
  borrowerNote?: string | null;
  reference?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  snapshotTotalSettlement?: unknown;
  paymentTransaction?: { id: string; receiptNumber?: string | null } | null;
}
