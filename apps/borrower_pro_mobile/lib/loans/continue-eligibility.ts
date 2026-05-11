import type { BorrowerLoanListItem } from '@kredit/borrower';

/**
 * Mirror of `apps/borrower_pro/lib/borrower-loan-continue-eligibility.ts`.
 *
 * True when the borrower still has attestation, agreement download/sign, or signed PDF upload
 * work before admin review / disbursement. False when waiting on lender (e.g. signed agreement
 * pending review).
 */
export function borrowerLoanNeedsContinueAction(loan: BorrowerLoanListItem): boolean {
  if (loan.status !== 'PENDING_ATTESTATION' && loan.status !== 'PENDING_DISBURSEMENT') {
    return false;
  }
  const isPhysicalLoan = loan.loanChannel === 'PHYSICAL';
  if (isPhysicalLoan) {
    return false;
  }
  const requiresAttestation = !isPhysicalLoan;
  if (requiresAttestation && !loan.attestationCompletedAt) {
    return true;
  }
  const review = loan.signedAgreementReviewStatus ?? 'NONE';
  if (review === 'NONE' || review === 'REJECTED') {
    return true;
  }
  if (review === 'PENDING') {
    return false;
  }
  return false;
}
