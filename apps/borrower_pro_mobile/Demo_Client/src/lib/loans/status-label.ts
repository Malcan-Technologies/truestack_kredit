/**
 * Mirror of `apps/borrower_pro/lib/loan-status-label.ts` — borrower-facing loan status labels
 * and semantic badge tones.
 */
export type BorrowerLoanStatusLabelInput = {
  status: string;
  attestationCompletedAt?: string | null;
  loanChannel?: 'ONLINE' | 'PHYSICAL';
};

export type BorrowerStatusTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info';

export function loanStatusBadgeLabelFromDb(loan: BorrowerLoanStatusLabelInput): string {
  if (loan.status === 'PENDING_ATTESTATION') return 'Pending Attestation';
  if (
    loan.status === 'PENDING_DISBURSEMENT' &&
    loan.loanChannel !== 'PHYSICAL' &&
    !loan.attestationCompletedAt
  ) {
    return 'Pending Attestation';
  }
  return loan.status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function borrowerLoanStatusBadgeTone(loan: BorrowerLoanStatusLabelInput): BorrowerStatusTone {
  if (
    loan.status === 'PENDING_ATTESTATION' ||
    (loan.status === 'PENDING_DISBURSEMENT' &&
      loan.loanChannel !== 'PHYSICAL' &&
      !loan.attestationCompletedAt)
  ) {
    return 'warning';
  }
  const map: Partial<Record<string, BorrowerStatusTone>> = {
    PENDING_DISBURSEMENT: 'warning',
    ACTIVE: 'primary',
    IN_ARREARS: 'warning',
    COMPLETED: 'success',
    DEFAULTED: 'error',
    WRITTEN_OFF: 'error',
    CANCELLED: 'error',
  };
  return map[loan.status] ?? 'neutral';
}
