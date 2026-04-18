import type { LoanApplicationDetail } from '@kredit/borrower';

/**
 * Mirror of `apps/borrower_pro/lib/borrower-application-navigation.ts`.
 *
 * Borrower application detail route (documents, summary). For loan-hub navigation
 * use `/loans/{id}` instead.
 */
export function borrowerApplicationDetailPath(app: LoanApplicationDetail): string {
  return `/applications/${app.id}`;
}
