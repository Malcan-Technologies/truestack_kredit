import type { BorrowerSemanticBadgeVariant } from "./loan-status-label";

/**
 * Derived UI phase for borrower loan journey (matches backend rules).
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
    if (!input.attestationCompletedAt) return "attestation";
    const review = input.signedAgreementReviewStatus ?? "NONE";
    if (!input.agreementPath || review === "NONE" || review === "REJECTED") return "signing";
    if (review === "PENDING") return "disbursement";
    if (review === "APPROVED") return "disbursement";
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

/** Journey phase badge colors aligned with admin semantic status styling. */
export function loanJourneyPhaseBadgeVariant(phase: LoanJourneyPhase): BorrowerSemanticBadgeVariant {
  switch (phase) {
    case "attestation":
    case "signing":
    case "disbursement":
      return "warning";
    case "application":
    case "approval":
      return "info";
    case "active":
      return "default";
    case "completed":
      return "success";
    case "cancelled":
      return "destructive";
    default:
      return "default";
  }
}
