# Borrower Pro — TrueStack public KYC API

This documents the **standalone** TrueStack KYC integration for **Demo_Client** / `borrower_pro`, using the **public HTTP API** (`Authorization: Bearer <api_key>`). It is **not** the TrueKredit-internal flow (`/api/webhooks/trueidentity`, `POST /api/borrowers/:id/verify/start`, Admin HMAC).

**Canonical API reference:** [admin-truestack/docs/TrueStack_KYC_API_Documentation.md](../../admin-truestack/docs/TrueStack_KYC_API_Documentation.md)

## Components

| Piece | Location |
|-------|----------|
| Env + config | [`apps/backend_pro/src/lib/config.ts`](../apps/backend_pro/src/lib/config.ts) — `config.truestackKyc` |
| Outbound client | [`apps/backend_pro/src/modules/truestack-kyc/publicApiClient.ts`](../apps/backend_pro/src/modules/truestack-kyc/publicApiClient.ts) |
| Webhook | [`apps/backend_pro/src/modules/webhooks/truestackKycWebhook.ts`](../apps/backend_pro/src/modules/webhooks/truestackKycWebhook.ts) — `POST /api/webhooks/truestack-kyc` |
| Borrower session API | [`apps/backend_pro/src/modules/borrower-auth/routes.ts`](../apps/backend_pro/src/modules/borrower-auth/routes.ts) — `/kyc/sessions`, `/kyc/status`, `/kyc/refresh` |
| DB model | `TruestackKycSession` in [`apps/backend_pro/prisma/schema.prisma`](../apps/backend_pro/prisma/schema.prisma) |
| UI | [`apps/borrower_pro/components/truestack-kyc-card.tsx`](../apps/borrower_pro/components/truestack-kyc-card.tsx) — layout and styling aligned with Kredit admin `TrueIdentityBox` ([`apps/admin/components/trueidentity-box.tsx`](../apps/admin/components/trueidentity-box.tsx)): emerald outer card, header status badges, QR + copy link, nested neutral/emerald subcards, corporate per-director flow. |
| Front-end API helpers | [`apps/borrower_pro/lib/borrower-api-client.ts`](../apps/borrower_pro/lib/borrower-api-client.ts) |

## Environment variables (backend_pro only)

| Variable | Required | Description |
|----------|----------|-------------|
| `TRUESTACK_KYC_API_KEY` | Yes | Bearer key from TrueStack Admin (client API key). Never expose to the browser. |
| `TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL` | Yes | **Public** origin TrueStack can call for webhooks, e.g. `https://xxx.ngrok-free.app` in dev. Appended path: `/api/webhooks/truestack-kyc`. |
| `TRUESTACK_KYC_API_BASE_URL` | No | Default `https://api.truestack.my`. |
| `TRUESTACK_KYC_REDIRECT_URL` | No | Optional `redirect_url` after KYC (webhooks remain authoritative). |
| `TRUESTACK_KYC_WEBHOOK_SECRET` | No | Reserved for future `X-Webhook-Signature` verification when TrueStack documents the algorithm. |

See [`apps/backend_pro/.env.example`](../apps/backend_pro/.env.example).

## Flow

1. Logged-in user opens Profile; **TruestackKycCard** calls `GET /api/borrower-auth/kyc/status` (via Next proxy).
2. **Start verification** → `POST /api/borrower-auth/kyc/sessions` → backend calls TrueStack `POST /api/v1/kyc/sessions` with `webhook_url` and `metadata` (`borrowerId`, `tenantId`, optional `directorId`).
3. User completes KYC in TrueStack onboarding (new tab).
4. TrueStack calls `POST {PUBLIC_WEBHOOK_BASE}/api/webhooks/truestack-kyc`. Handler returns **200** quickly, then asynchronously **refreshes** the session via TrueStack API and updates `TruestackKycSession` and, for **approved individual** KYC, sets `Borrower.documentVerified` / `verifiedBy = TRUESTACK_KYC_API`.
5. **Sync status** in UI calls `POST /api/borrower-auth/kyc/refresh` if a webhook was missed.

### Borrower Documents (KYC images)

When a session is **completed** and **approved**, [`ingestKycDocuments.ts`](../apps/backend_pro/src/modules/truestack-kyc/ingestKycDocuments.ts) runs (from the webhook async handler and from `POST /borrower-auth/kyc/refresh`). It downloads presigned URLs from the TrueStack refresh payload (`images` / `documents` keys) and creates `BorrowerDocument` rows:

| TrueStack key   | Individual category   | Corporate category      |
|----------------|------------------------|-------------------------|
| `front_document` | `IC_FRONT`           | `DIRECTOR_IC_FRONT`     |
| `back_document`  | `IC_BACK`            | `DIRECTOR_IC_BACK`      |
| `face_image`     | `OTHER` (label: Face from IC) | same           |
| `best_frame`     | `SELFIE_LIVENESS`    | `SELFIE_LIVENESS`       |

Rows use `originalName` prefix `TrueStack KYC —`. A new approved ingest **replaces** previous imports with that prefix for the borrower (so re-verification overwrites auto-imported files). **Borrower Documents** on Profile defaults to **All documents** and refreshes when KYC shows a completed approved session.

## Corporate borrowers

`directorId` is required in the start-session body. Verification state is stored on `TruestackKycSession` rows (per director). `documentVerified` on `Borrower` is only auto-set for **individual** approvals today.

## Operations

- Apply migrations after pulling: `npm run db:migrate` in `backend_pro`.
- Production: `TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL` must be **https** (enforced when `NODE_ENV=production`).

## Related (internal TrueIdentity)

Do not confuse with:

- `POST /api/webhooks/trueidentity` — Admin → Kredit HMAC callbacks  
- `POST /api/borrowers/:borrowerId/verify/start` — requires `TRUEIDENTITY` tenant add-on and Admin integration  

Both can coexist; this public KYC path is independent.
