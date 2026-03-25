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

export interface BorrowerLoanListItem {
  id: string;
  principalAmount: string;
  interestRate: string;
  term: number;
  status: string;
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
  };
}

/** GET /api/borrower-auth/loans/:loanId — full loan row for agreement / detail screens */
export interface BorrowerLoanDetail {
  id: string;
  status: string;
  principalAmount: unknown;
  term: number;
  product: { id: string; name: string; loanScheduleType?: string | null };
  agreementDate: string | null;
  agreementPath: string | null;
  agreementOriginalName: string | null;
  agreementUploadedAt: string | null;
  agreementVersion: number;
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
  attestationGoogleCalendarEventId?: string | null;
  attestationCompletedAt?: string | null;
  attestationCancellationReason?: string | null;
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
}

export interface RecordBorrowerPaymentBody {
  amount: number;
  reference?: string;
  notes?: string;
  applyLateFee?: boolean;
  paymentDate?: string;
}
