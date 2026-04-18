/**
 * Derived UI phase for borrower loan journey (matches backend rules).
 * Mirror of `apps/borrower_pro/lib/loan-journey-phase.ts`.
 */
export type LoanJourneyPhase =
  | 'application'
  | 'approval'
  | 'attestation'
  | 'ekyc'
  | 'signing'
  | 'disbursement'
  | 'active'
  | 'completed'
  | 'cancelled';

export function deriveLoanJourneyPhase(input: {
  applicationStatus?: string | null;
  loanStatus?: string | null;
  attestationCompletedAt?: string | null;
  kycComplete?: boolean | null;
  signedAgreementReviewStatus?: string | null;
  agreementPath?: string | null;
  loanChannel?: 'ONLINE' | 'PHYSICAL' | null;
}): LoanJourneyPhase {
  if (input.loanStatus === 'CANCELLED') return 'cancelled';
  const app = input.applicationStatus;
  if (app && ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'].includes(app)) {
    return app === 'UNDER_REVIEW' ? 'approval' : 'application';
  }
  if (
    !input.loanStatus ||
    input.loanStatus === 'PENDING_ATTESTATION' ||
    input.loanStatus === 'PENDING_DISBURSEMENT'
  ) {
    const isPhysicalLoan = input.loanChannel === 'PHYSICAL';
    if (isPhysicalLoan) return 'disbursement';
    const requiresAttestation = !isPhysicalLoan;
    if (requiresAttestation && !input.attestationCompletedAt) return 'attestation';
    if (input.kycComplete === false) return 'ekyc';
    const review = input.signedAgreementReviewStatus ?? 'NONE';
    if (review === 'PENDING') return 'disbursement';
    if (review === 'APPROVED') return 'disbursement';
    if (!input.agreementPath || review === 'NONE' || review === 'REJECTED') return 'signing';
    return 'signing';
  }
  if (['ACTIVE', 'IN_ARREARS', 'DEFAULTED'].includes(input.loanStatus ?? '')) return 'active';
  if (input.loanStatus === 'COMPLETED') return 'completed';
  return 'active';
}

export function loanJourneyPhaseLabel(phase: LoanJourneyPhase): string {
  const labels: Record<LoanJourneyPhase, string> = {
    application: 'Application',
    approval: 'Approval',
    attestation: 'Attestation',
    ekyc: 'e-KYC',
    signing: 'Signing',
    disbursement: 'Disbursement',
    active: 'Active loan',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[phase];
}

export const PRE_DISBURSEMENT_PHASES: LoanJourneyPhase[] = [
  'approval',
  'attestation',
  'ekyc',
  'signing',
  'disbursement',
];

export const PHASE_HINTS: Partial<Record<LoanJourneyPhase, string>> = {
  approval: 'Lender reviews your application',
  attestation: 'Confirm loan terms & conditions',
  ekyc: 'Verify your identity online',
  signing: 'Sign the loan agreement',
  disbursement: 'Funds transferred to your account',
};
