import type { LoanApplicationDetail } from "./application-form-types";

/** Borrower application detail (documents, summary). List row clicks use this; use loan routes for loan hub. */
export function borrowerApplicationDetailPath(app: LoanApplicationDetail): string {
  return `/applications/${app.id}`;
}
