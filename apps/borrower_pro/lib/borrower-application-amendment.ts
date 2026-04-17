import type { LoanApplicationDetail } from "@kredit/borrower";

/** Appended to `notes` when the lender returns an online draft for amendments (backend). */
export const RETURNED_FOR_AMENDMENTS_NOTE_MARKER = "Returned for amendments:";

/**
 * True when the application was returned by the lender so the borrower can amend and resubmit.
 * Matches application detail behaviour: online drafts only (physical drafts are not editable here).
 *
 * Prefer `returnedForAmendment` from the API (driven by audit + notes). Notes alone miss returns when
 * the admin left the reason empty (legacy); audit still records `RETURN_TO_DRAFT`.
 */
export function isReturnedForAmendment(a: LoanApplicationDetail): boolean {
  if (a.status !== "DRAFT") return false;
  if (a.loanChannel === "PHYSICAL") return false;
  if (a.returnedForAmendment === true) return true;
  return Boolean(a.notes?.includes(RETURNED_FOR_AMENDMENTS_NOTE_MARKER));
}
