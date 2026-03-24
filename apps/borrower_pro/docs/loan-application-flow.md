# Borrower loan application flow

This describes the self-service loan application feature for `borrower_pro` (e.g. Demo_Client): multi-step apply flow, shared UI, and borrower-scoped backend APIs.

## Shared vs client app

| Area | Location |
|------|----------|
| Reusable wizard, types, API client, validation | `apps/borrower_pro/components/application-form/`, `apps/borrower_pro/lib/application-form-*.ts`, `borrower-applications-client.ts` |
| Theme, layout, routes | Per-client app under `apps/borrower_pro/<ClientName>/` (e.g. `Demo_Client/`) |
| Backend | `apps/backend_pro/src/modules/borrower-applications/routes.ts` (mounted under `/api/borrower-auth`) |

Duplicating **Demo_Client** for a new lender: copy the client folder, keep `globals.css` / theme provider, and **do not** copy shared modules—import from `@borrower_pro/components` and `@borrower_pro/lib` (see `Demo_Client/tsconfig.json` path aliases).

## Routes (Demo_Client)

| Path | Purpose |
|------|---------|
| `/applications` | Lists the signed-in borrower’s applications; CTA to start a new one |
| `/applications/apply` | Full application wizard (`ApplicationFlowWizard`) |

## Frontend flow (steps)

1. **Select product** — `GET /api/borrower-auth/products` (active products filtered by borrower type).
2. **Application details** — Amount, term, optional Jadual K collateral; live preview via `POST /api/borrower-auth/applications/preview`. On continue: `POST /api/borrower-auth/applications` (creates `DRAFT`) or `PATCH` if an application id already exists in-session.
3. **Personal information** — Loads `GET /api/borrower-auth/borrower`, edits via existing `PATCH /api/borrower-auth/borrower` using shared borrower form cards and validation.
4. **Supporting documents** — Uploads to `POST /api/borrower-auth/applications/:id/documents` with `category` matching `product.requiredDocuments[].key` or `OTHER`. Required categories must have at least one file before continue. If **all** configured categories are optional and none are uploaded, a confirmation dialog is shown before continuing.
5. **Review & submit** — Refetches preview for display; `POST /api/borrower-auth/applications/:id/submit` after consent checkbox.

## Backend endpoints (borrower session)

All require `requireBorrowerSession` and resolve the **active borrower** from the session (no `borrowerId` in the request body).

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/borrower-auth/products` | Active products for pro tenant, filtered by `eligibleBorrowerTypes` |
| POST | `/api/borrower-auth/applications/preview` | Same math as staff preview (`loanApplicationPreviewService`) |
| POST | `/api/borrower-auth/applications` | Create draft application |
| GET | `/api/borrower-auth/applications` | List for active borrower |
| GET | `/api/borrower-auth/applications/:id` | Detail + product + documents |
| PATCH | `/api/borrower-auth/applications/:id` | Update draft only |
| POST | `/api/borrower-auth/applications/:id/submit` | Requires all **required** document categories to have an upload |
| POST/GET/DELETE | `/api/borrower-auth/applications/:id/documents` | Same storage rules as staff application documents |

Session helpers live in `borrower-auth/borrowerContext.ts` (`resolveProTenant`, `requireActiveBorrower`).

## Preview math

Shared implementation: `apps/backend_pro/src/modules/loans/loanApplicationPreviewService.ts`, used by both `POST /api/loans/applications/preview` and borrower preview.
