# Admin ↔ Borrower Loan Alignment

Borrower-facing **My Loans** uses the same backend primitives as the admin console:

- **Application decisions** continue to use `/api/loans/applications/*` (admin session). Borrowers only see their own rows via `/api/borrower-auth/applications` and withdraw via `POST /api/borrower-auth/applications/:id/withdraw` for `SUBMITTED` / `UNDER_REVIEW`.
- **Loan servicing** uses the same Prisma `Loan`, `LoanRepayment`, and `PaymentTransaction` models.
- **Recording payments** (full, partial, spillover, within outstanding cap) is implemented once in `backend_pro/src/modules/schedules/recordLoanSpilloverPayment.ts`. Admin calls it via `POST /api/schedules/loan/:loanId/payments`; borrowers call `POST /api/borrower-auth/loans/:loanId/payments` with `borrowerIdFilter` enforcement.
- **Counts** in the admin sidebar (`applications-count-changed`, `loans-count-changed`) are unchanged; borrower actions do not need to notify the admin SPA (separate sessions). Ops dashboards refresh on navigation or existing refresh controls.

When extending either side, keep status enums and payment semantics aligned with this shared module.
