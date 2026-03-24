# Borrower Loan Center (My Loans)

## Shared vs Demo_Client

- **Shared UI and logic**: [`components/loan-center/`](../components/loan-center/) — tabs, summary cards, loan/application cards, borrower payment panel.
- **Thin shell**: [`Demo_Client/app/(dashboard)/loans/page.tsx`](../Demo_Client/app/(dashboard)/loans/page.tsx) imports `LoanCenterPage` only. Duplicate another branded client by reusing `components/` + `lib/` and swapping theme tokens in the client `app/` tree.

## API surface (`/api/borrower-auth`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/loan-center/overview` | Tab badge counts + dashboard KPIs (total paid, outstanding, next due, active loan count). |
| GET | `/loans?tab=active\|discharged\|pending_disbursement` | Paginated loans for the active borrower. |
| GET | `/loans/:loanId` | Loan detail + schedule (borrower-owned). |
| GET | `/loans/:loanId/schedule` | Schedule + summary (mirrors admin schedule shape, borrower-scoped). |
| GET | `/loans/:loanId/metrics` | Repayment metrics (aligned with admin loan metrics). |
| GET | `/loans/:loanId/payments` | Payment transaction history. |
| POST | `/loans/:loanId/payments` | Record payment / overpayment — uses `handleRecordLoanSpilloverPayment` with `borrowerIdFilter` (same allocation rules as `POST /api/schedules/loan/:loanId/payments`). |
| POST | `/applications/:id/withdraw` | Withdraw `SUBMITTED` / `UNDER_REVIEW` → `CANCELLED`. |
| GET | `/applications/:id/timeline` | Audit timeline for borrower-owned application. |

## Lifecycle mapping (borrower ↔ admin)

- **Applications**: statuses `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED` — same strings as admin.
- **Loans**: `PENDING_DISBURSEMENT`, `ACTIVE`, `IN_ARREARS`, `COMPLETED`, `DEFAULTED`, `WRITTEN_OFF`.
- **Payments**: Borrower and admin both use the shared spillover payment implementation in [`backend_pro/src/modules/schedules/recordLoanSpilloverPayment.ts`](../../backend_pro/src/modules/schedules/recordLoanSpilloverPayment.ts).

## Client modules

- [`lib/borrower-loan-types.ts`](../lib/borrower-loan-types.ts)
- [`lib/borrower-loans-client.ts`](../lib/borrower-loans-client.ts) — all calls go through `/api/proxy/borrower-auth` like applications.

## Profile switching

`LoanCenterPage` and the dashboard listen to `BORROWER_PROFILE_SWITCHED_EVENT` and refetch so data matches the active borrower.
