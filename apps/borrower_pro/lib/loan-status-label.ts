/**
 * Human-readable loan status for borrower UI — matches admin `formatLoanStatusLabelForDisplay` rules.
 */
export type BorrowerLoanStatusLabelInput = {
  status: string;
  attestationCompletedAt?: string | null;
};

/** Semantic badge variants aligned with `admin_pro` loan status colors. */
export type BorrowerSemanticBadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "info";

export function loanStatusBadgeLabelFromDb(loan: BorrowerLoanStatusLabelInput): string {
  if (loan.status === "PENDING_ATTESTATION") return "Pending Attestation";
  if (loan.status === "PENDING_DISBURSEMENT" && !loan.attestationCompletedAt) {
    return "Pending Attestation";
  }
  return loan.status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Matches admin `loanStatusDisplay` / `statusColors` semantics for list badges. */
export function borrowerLoanStatusBadgeVariant(
  loan: BorrowerLoanStatusLabelInput
): BorrowerSemanticBadgeVariant {
  if (
    loan.status === "PENDING_ATTESTATION" ||
    (loan.status === "PENDING_DISBURSEMENT" && !loan.attestationCompletedAt)
  ) {
    return "warning";
  }
  const map: Partial<Record<string, BorrowerSemanticBadgeVariant>> = {
    PENDING_DISBURSEMENT: "warning",
    ACTIVE: "default",
    IN_ARREARS: "warning",
    COMPLETED: "success",
    DEFAULTED: "destructive",
    WRITTEN_OFF: "destructive",
    CANCELLED: "destructive",
  };
  return map[loan.status] ?? "default";
}
