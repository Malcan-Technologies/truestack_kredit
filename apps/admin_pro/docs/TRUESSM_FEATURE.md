# TrueSSM™ — Internal Feature Context

> **Brand:** Always render as **TrueSSM™** in user-visible UI, PDFs, and docs (note the trademark mark).
> **Partnership:** TrueSSM™ is delivered in partnership with **ssmsearch.com**, which proxies the SSM (Suruhanjaya Syarikat Malaysia) registry through the TrueStack public API.

This document captures the v1 design, contracts, and operational notes for the TrueSSM™ integration on the corporate borrower detail page. Pair this with:

- [TRUESSM_API.md](./TRUESSM_API.md) — upstream provider contract (auth, endpoints, billing, error codes).
- [docs/user-guide-pro/tools/truessm.md](../../../docs/user-guide-pro/tools/truessm.md) — user-facing help article shown in `Dashboard → Help`.

---

## 1. Scope (v1)

- **Entry point:** corporate borrower detail page only (`apps/admin_pro/app/(dashboard)/dashboard/borrowers/[id]/page.tsx`).
- **Report:** `POST /api/v1/ssm/reports/company-profile` only (154 credits / RM 15.40 per pull on the default template).
- **No auto-update** of borrower data. Every pull saves a PDF + raw JSON snapshot. Applying fields is a separate, confirmed action.
- **Director KYC pipeline untouched** in v1. We do not overwrite director records from the SSM officers list.
- **Single platform API key** in `backend_pro` env, mirroring the TrueIdentity pattern.

### Explicit non-goals for v1

- Officers/shareholders/charges/documents endpoints.
- Entity search UI (we always pull by the borrower's stored `ssmRegistrationNo`).
- Onboarding-page autofill.
- Individual borrowers, sole proprietorships, LLPs, business profiles.
- Per-tenant API keys or per-tenant billing meters.

---

## 2. Architecture

```
UI (TrueSsmBox + field badges)
   │  /api/proxy → backend_pro
   ▼
backend_pro/src/modules/truessm/
   ├── client.ts        ── POST api.truestack.my/api/v1/ssm/reports/company-profile
   ├── mapper.ts        ── raw JSON → typed diff (10 mappable fields)
   ├── pdfRenderer.ts   ── pdfkit company profile PDF
   └── routes.ts        ── /api/borrowers/:id/ssm/{pull,pulls,pulls/:id,sync}
            │
            ├── prisma.trueSsmPull           — every pull (billable, rawData snapshot)
            ├── prisma.borrowerDocument      — saved PDF in COMPANY_PROFILE category
            ├── prisma.borrower              — ssmFieldProvenance JSON + applied fields
            └── AuditService.log             — SSM_PULL / SSM_PULL_FAILED / SSM_SYNC
```

---

## 3. Database Schema

Both additions live in `apps/backend_pro/prisma/schema.prisma`. Migration name: `add_truessm_pull_and_provenance`.

### 3.1 `Borrower.ssmFieldProvenance Json?`

Per-field provenance, only set when a field has been applied from a TrueSSM™ pull:

```jsonc
{
  "companyName":        { "syncedAt": "...", "usageId": "...", "pullId": "...", "sourceValue": "..." },
  "ssmRegistrationNo":  { ... },
  "dateOfIncorporation":{ ... },
  "paidUpCapital":      { ... },
  "addressLine1":       { ... },
  "addressLine2":       { ... },
  "city":               { ... },
  "state":              { ... },
  "postcode":           { ... },
  "country":            { ... }
}
```

When a provenanced field is **manually edited** through the borrower update service, that field's entry is **removed** in the same transaction. This mirrors the e-KYC pattern (changing director name/IC resets KYC state) — the verified badge falls back to the dashed "available" state.

### 3.2 `TrueSsmPull`

Append-only log of every pull (successful pulls only — failures are audited but not stored as `TrueSsmPull` rows).

| Column | Notes |
|----|----|
| `id`, `tenantId`, `borrowerId` | Cascade delete from `Borrower`. |
| `usageType` | `company_profile` for v1; reserved for future report types. |
| `usageId` | `acknowledgement.usage_id` from TrueStack. |
| `requestRefNo` | Provider request ID when available. |
| `regNo` | The SSM Registration No used for the pull. |
| `billedCredits` | Cents-of-truth credit cost, copied from acknowledgement. |
| `idempotencyKey` | `ssm-profile-<borrowerId>-<timestamp>` (unique). |
| `rawData` | Provider data block, stored verbatim. |
| `documentId` | FK to the `BorrowerDocument` generated for this pull (nullable, `SetNull`). |
| `createdByMemberId` | Initiating `TenantMember.id`. |
| `createdAt` | Defaulted. |

Indexes: `[tenantId, borrowerId]`, `[borrowerId, createdAt]`.

---

## 4. API Surface

All endpoints are tenant-scoped, require an authenticated session, and gate by `truessm.view` / `truessm.manage`.

| Method | Path | Permission | Description |
|----|----|----|----|
| `POST` | `/api/borrowers/:borrowerId/ssm/pull` | `truessm.manage` | Billable pull. Validates `CORPORATE` + `ssmRegistrationNo`, generates idempotency key, calls TrueSSM, renders PDF, persists everything in a transaction, audits `SSM_PULL`. Returns `{ pull, diff }`. |
| `GET`  | `/api/borrowers/:borrowerId/ssm/pulls` | `truessm.view` | Newest-first list of pulls (cap 20). |
| `GET`  | `/api/borrowers/:borrowerId/ssm/pulls/:pullId` | `truessm.view` | Returns one pull with the freshly-computed diff against the current borrower record. |
| `POST` | `/api/borrowers/:borrowerId/ssm/sync` | `truessm.manage` | Body: `{ pullId, fields: string[] }`. Applies only the selected fields, stamps `ssmFieldProvenance`, recomputes verification when identity fields change, audits `SSM_SYNC`. |

`GET /api/borrowers/:id` was extended to include:

- `ssmFieldProvenance` (Json) — passed through verbatim for the UI.
- `lastSsmPullAt` (ISO string) — derived from the latest `TrueSsmPull.createdAt`.
- `lastSsmPull` (summary) — `{ id, usageId, usageType, regNo, billedCredits, createdAt, documentId }`.

### Idempotency

The client generates `ssm-profile-<borrowerId>-<Date.now()>`. Provider retries within the documented idempotency window return the same response without rebilling. We **do not** reuse old idempotency keys for "re-pull" — that is intentionally a new billable request.

---

## 5. Provider Client (`client.ts`)

- Auth: `Authorization: Bearer ${config.truessm.apiKey}` + `Idempotency-Key` header.
- Timeout: 30s, with caller-cancellation propagated through an `AbortController`.
- All non-2xx responses throw `SsmApiError(statusCode, errorCode, message, acknowledgement?, extra?)`.
- Mapped provider error codes:
 - `ENTITY_NOT_FOUND` — entity does not exist in SSM.
 - `ENTITY_TYPE_MISMATCH` — entity is not an ROC.
 - `INSUFFICIENT_CREDITS` — balance too low.
 - `REPORT_NOT_FOUND` — registry has no current profile.
 - `REGISTRY_UNAVAILABLE` / `REGISTRY_ERROR` — upstream registry hiccup; no billing.
 - `IDEMPOTENCY_KEY_MISMATCH` / `REQUEST_IN_PROGRESS` — duplicate in-flight request.

The frontend maps these to user-friendly toasts in `components/true-ssm-box.tsx` (`describeSsmError`). When extending the client, keep the friendly-copy mapping in sync.

---

## 6. Mapper (`mapper.ts`)

`mapCompanyProfileToBorrowerDiff(rawData, borrower)` returns:

```ts
{
  summary: { entityName, regNo, status },
  fields: Array<{
    field, label, current, incoming,
    action: 'overwrite' | 'fill' | 'unchanged' | 'no_data'
  }>
}
```

Field actions drive the Apply modal's UI:

- **`fill`** — current is empty/null, incoming has a value → pre-checked by default.
- **`overwrite`** — both differ → unchecked by default (opt-in to avoid accidental overwrites).
- **`unchanged`** — values match → not selectable, badge shows "Unchanged".
- **`no_data`** — incoming is null → not selectable, badge shows "No SSM data".

The mapper reads provider fields **defensively** — `rocCompanyInfo.companyName` and `rocCompanyInfo.companyNo` are the only locked field names per [TRUESSM_API.md](./TRUESSM_API.md). For everything else (incorporation date, paid-up capital, addresses) the mapper accepts several common spellings and falls back to a Malaysian-address splitter when only a free-text address is returned. When the upstream contract stabilises further, prune the alternate keys.

---

## 7. PDF Renderer (`pdfRenderer.ts`)

A `pdfkit`-based renderer that produces an A4 PDF with:

1. Header — "TrueSSM™ Company Profile" + entity name + reg no + pulled-at + usage ID.
2. Company identity (key/value grid from `rocCompanyInfo`, address/officer/shareholder keys filtered out).
3. Registered address (structured grid if present, otherwise free-text fallback).
4. Officers table (Name / IC / Position / Appointed).
5. Shareholders table (Name / IC / Shares / Last Change).
6. Share capital grid.
7. Charges table.
8. Page footer on every page: `Generated via TrueSSM™ (in partnership with ssmsearch.com) · Usage ID … · Billed credits …`.

The PDF is the **immutable evidence** of the pull — even if the borrower record drifts, the registry snapshot stays attached to the borrower documents.

---

## 8. Frontend

| File | Role |
|----|----|
| `components/true-ssm-box.tsx` | Main panel. Three states (no reg no / never pulled / pulled), cost confirmation modal, Apply-to-borrower modal with diff checkboxes, friendly error toasts. |
| `components/ssm-verified-badge.tsx` | Per-field badge. Solid blue (verified) vs dashed grey (available, click to scroll to the panel). |
| `components/ui/copy-field.tsx` | `badge` slot wired so corporate field labels can show provenance. |
| `app/(dashboard)/dashboard/borrowers/[id]/page.tsx` | Hosts the panel, adds the badge slot to `Field`, wires `renderSsmBadge` to all mappable fields, renders `SSM_PULL` / `SSM_PULL_FAILED` / `SSM_SYNC` in the timeline, shows the "From TrueSSM™" pill on COMPANY_PROFILE documents. |

The panel always sits **above** `TrueIdentityBox` in the right column. Clicking a dashed "available" badge calls `scrollToTrueSsmBox` so users can act immediately.

### Visual language

- Distinct from e-KYC: **Building2** icon and **blue** tint (vs Fingerprint / emerald for TrueIdentity).
- Brand mark always rendered as `TrueSSM&trade;` in JSX or `\u2122` in TS strings/toasts. Don't introduce plain "TrueSSM" or "SSM" labels in user-visible UI.

---

## 9. RBAC

In `packages/shared/src/rbac.ts`:

- New permissions: `truessm.view`, `truessm.manage`.
- Auto-granted by `withBorrowerPageTrueIdentityDefaults` — any role with `borrowers.view` gets `truessm.view`; any role with `borrowers.create|edit` gets both. This mirrors the TrueIdentity pattern so we don't have to update role presets one by one.
- Explicit listing in `OPS_ADMIN`, `COMPLIANCE_OFFICER`, `AUDITOR_READONLY` keeps the role detail UI accurate.

Admin_pro convenience helpers live in `apps/admin_pro/lib/permissions.ts`: `canViewTrueSsm`, `canManageTrueSsm`.

---

## 10. Auditing

| Action | When | Payload |
|----|----|----|
| `SSM_PULL` | Successful pull. | `{ pullId, usageId, usageType, regNo, billedCredits, documentId }` |
| `SSM_PULL_FAILED` | TrueSSM returned an error. | `{ errorCode, message, regNo, billedCredits }` |
| `SSM_SYNC` | Apply succeeded. | `{ pullId, usageId, regNo, fields: string[] }`, previousData = prior values |

These appear in the borrower timeline through `TimelineItem`'s action-info map.

---

## 11. Configuration

Add to backend env (`apps/backend_pro/.env` + `.env.example`):

```dotenv
TRUESTACK_SSM_API_BASE_URL=https://api.truestack.my
TRUESTACK_SSM_API_KEY=<bearer key>   # production: JSON key `truestack_ssm_api_key` in the client app Secrets Manager secret
```

Surfaced as `config.truessm.{ apiBaseUrl, apiKey }`. Missing values surface a 502 `PROVIDER_NOT_CONFIGURED` on the first pull attempt rather than failing silently.

---

## 12. Operational Notes

- **Billing dispute flow:** if a tenant disputes a charge, look up the pull by `usageId` in `TrueSsmPull` and cross-reference against the TrueStack billing dashboard.
- **Provider migration:** the partnership is with **ssmsearch.com**, surfaced through TrueStack's API. If we move providers, the seam is `client.ts` plus the mapper's defensive key-name handling — no UI changes required as long as the diff shape stays stable.
- **Failed pulls are not billable** for the documented `ENTITY_NOT_FOUND` / `ENTITY_TYPE_MISMATCH` / `REGISTRY_*` codes; the acknowledgement (when present) is preserved on the `SsmApiError.acknowledgement` so support tooling can confirm.
- **Re-pulls always bill.** If a user wants to re-open the Apply preview without billing, they click **Apply to borrower** on the existing pull, not **Re-pull**.

---

## 13. Future Work

- Director overwrite from SSM officers list (deferred — would require forced director re-KYC; out of scope for v1).
- Re-pull diff against previous pull (show what changed in the registry between two pulls).
- Onboarding-page autofill: pull during borrower creation so the form starts from registry data.
- Additional reports: officers detail, shareholders detail, charges, business profiles, LLPs.
- Per-tenant API keys / metered billing for resellers.
