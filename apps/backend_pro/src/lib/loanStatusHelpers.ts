/**
 * Pre-active loan workflow: attestation/signing (online) or signing (physical) before disbursement.
 */
export const PRE_DISBURSEMENT_LOAN_STATUSES = ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] as const;

export type PreDisbursementLoanStatus = (typeof PRE_DISBURSEMENT_LOAN_STATUSES)[number];

export function isPreDisbursementLoanStatus(status: string): boolean {
  return status === 'PENDING_ATTESTATION' || status === 'PENDING_DISBURSEMENT';
}
