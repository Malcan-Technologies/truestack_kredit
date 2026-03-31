/**
 * Human-readable loan status labels aligned with DB `Loan.status` and attestation context.
 * Title case (e.g. "Pending Attestation"), not raw enum or all-caps with spaces.
 */
export type LoanStatusLabelInput = {
  status: string;
  attestationCompletedAt?: string | null;
};

export function formatSnakeEnumTitle(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Primary label for admin/borrower badges: follows DB status; maps pre-disbursement attestation cases.
 */
export function formatLoanStatusLabelForDisplay(loan: LoanStatusLabelInput): string {
  return formatSnakeEnumTitle(loan.status);
}
