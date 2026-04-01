/**
 * Derived UI phase for loan journey (admin/borrower aligned).
 */
export type LoanJourneyPhase =
  | "application"
  | "approval"
  | "attestation"
  | "signing"
  | "disbursement"
  | "active"
  | "completed"
  | "cancelled";

export function deriveLoanJourneyPhase(input: {
  applicationStatus?: string | null;
  loanStatus?: string | null;
  attestationCompletedAt?: string | null;
  signedAgreementReviewStatus?: string | null;
  agreementPath?: string | null;
  loanChannel?: "ONLINE" | "PHYSICAL" | null;
}): LoanJourneyPhase {
  if (input.loanStatus === "CANCELLED") return "cancelled";
  const app = input.applicationStatus;
  if (app && ["DRAFT", "SUBMITTED", "UNDER_REVIEW"].includes(app)) {
    return app === "UNDER_REVIEW" ? "approval" : "application";
  }
  if (
    !input.loanStatus ||
    input.loanStatus === "PENDING_ATTESTATION" ||
    input.loanStatus === "PENDING_DISBURSEMENT"
  ) {
    if (input.loanChannel === "PHYSICAL") return "disbursement";
    if (!input.attestationCompletedAt) return "attestation";
    const review = input.signedAgreementReviewStatus ?? "NONE";
    if (!input.agreementPath || review === "NONE" || review === "REJECTED") return "signing";
    if (review === "PENDING" || review === "APPROVED") return "disbursement";
    return "signing";
  }
  if (["ACTIVE", "IN_ARREARS", "DEFAULTED"].includes(input.loanStatus ?? "")) return "active";
  if (input.loanStatus === "COMPLETED") return "completed";
  return "active";
}

export function loanJourneyPhaseLabel(phase: LoanJourneyPhase): string {
  const labels: Record<LoanJourneyPhase, string> = {
    application: "Application",
    approval: "Approval",
    attestation: "Attestation",
    signing: "Signing",
    disbursement: "Disbursement",
    active: "Active loan",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[phase];
}
