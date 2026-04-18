import type { LoanApplicationDetail } from '@kredit/borrower';

/** Appended to `notes` when the lender returns an online draft for amendments (backend). */
export const RETURNED_FOR_AMENDMENTS_NOTE_MARKER = 'Returned for amendments:';

/**
 * Mirror of `apps/borrower_pro/lib/borrower-application-amendment.ts`.
 *
 * True when the application was returned by the lender so the borrower can amend and
 * resubmit. Only online drafts qualify (physical drafts are not editable here).
 */
export function isReturnedForAmendment(a: LoanApplicationDetail): boolean {
  if (a.status !== 'DRAFT') return false;
  if (a.loanChannel === 'PHYSICAL') return false;
  if (a.returnedForAmendment === true) return true;
  return Boolean(a.notes?.includes(RETURNED_FOR_AMENDMENTS_NOTE_MARKER));
}
