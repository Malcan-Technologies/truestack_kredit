import type { BorrowerLoanListItem } from "./borrower-loan-types";

/**
 * True when the borrower still has attestation, agreement download/sign, or signed PDF upload work
 * before admin review / disbursement. False when waiting on lender (e.g. signed agreement pending review).
 */
export function borrowerLoanNeedsContinueAction(loan: BorrowerLoanListItem): boolean {
  if (loan.status !== "PENDING_ATTESTATION" && loan.status !== "PENDING_DISBURSEMENT") {
    return false;
  }
  if (!loan.attestationCompletedAt) {
    return true;
  }
  const review = loan.signedAgreementReviewStatus ?? "NONE";
  // No signed PDF uploaded yet, or rejected and must re-upload
  if (review === "NONE" || review === "REJECTED") {
    return true;
  }
  // PENDING = waiting admin — no continue CTA
  if (review === "PENDING") {
    return false;
  }
  // APPROVED but still pre-disbursement: borrower may be waiting; no attestation/signing step left
  return false;
}
