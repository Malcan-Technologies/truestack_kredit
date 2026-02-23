# TrueStack Kredit + TrueIdentity Integration – API Contracts

This document describes the webhook and API contracts between TrueStack Admin (TrueIdentity) and TrueStack Kredit.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `KREDIT_WEBHOOK_SECRET` | Shared secret for verifying inbound Kredit → Admin webhooks |
| `TRUEIDENTITY_WEBHOOK_SECRET` or `KREDIT_WEBHOOK_SECRET` | Shared secret for signing outbound Admin → Kredit webhooks |
| `KREDIT_BACKEND_URL` | **Admin only.** Base URL for Kredit backend. Admin uses this to resolve `webhook_url` when Kredit sends a path (e.g. `/api/webhooks/trueidentity`). Kredit does not send its own URL. |
| `KREDIT_INTERNAL_SECRET` | Optional auth for usage API (falls back to `INTERNAL_API_KEY`) |
| _(No extra secret required)_ | Subscription payment request + decision webhooks reuse the same HMAC secrets above |

---

## 1. Verification Request Webhook (Kredit → Admin)

**Endpoint:** `POST /api/webhooks/kredit/verification-request`

**Purpose:** Kredit triggers verification creation. Admin creates session, calls Innovatif, and returns `session_id` + `onboarding_url` in the same HTTP response (sync).

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-kredit-signature` | Yes | Raw base64 of HMAC-SHA256 (no algorithm prefix; 44 chars for 32-byte digest) |
| `x-kredit-timestamp` | Yes | Unix timestamp in milliseconds (replay protection: 5-minute window) |
| `Content-Type` | Yes | `application/json` |

### HMAC Verification

- Payload: `{timestamp}.{rawBody}` (timestamp + `.` + raw request body)
- Algorithm: HMAC-SHA256
- Encoding: Base64
- Replay window: 5 minutes (timestamp must be within ±5 min of server time)

### Request Body

```json
{
  "tenant_id": "string",
  "tenant_slug": "string",
  "tenant_name": "string",
  "borrower_id": "string",
  "document_name": "string",
  "document_number": "string",
  "document_type": "1",
  "webhook_url": "/api/webhooks/trueidentity",
  "metadata": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `tenant_id` | Yes | Kredit’s tenant identifier (ID, e.g. cuid). Admin looks up by this. |
| `tenant_slug` | Yes | Tenant slug (e.g. demo-company) for display in Admin. |
| `tenant_name` | Yes | Tenant name for display in Admin. |
| `borrower_id` | No | Borrower identifier in Kredit |
| `document_name` | Yes | Full name on document |
| `document_number` | Yes | Document number (IC/Passport) |
| `document_type` | No | Default `"1"` (IC) |
| `webhook_url` | Yes | Path-only (e.g. `/api/webhooks/trueidentity`). Admin prepends `KREDIT_BACKEND_URL` (set in Admin's env) to resolve the full delivery URL. Kredit does not send its own backend URL. |
| `metadata` | No | Additional context |

### Response (200 OK)

```json
{
  "session_id": "uuid",
  "onboarding_url": "https://...",
  "status": "pending",
  "expires_at": "2025-02-19T12:00:00.000Z"
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | BAD_REQUEST | Invalid JSON, missing required fields, invalid webhook_url |
| 401 | UNAUTHORIZED | Missing/invalid HMAC or timestamp outside replay window |
| 402 | INSUFFICIENT_CREDITS | Tenant has insufficient credits |
| 403 | FORBIDDEN | TrueIdentity not enabled for tenant |
| 404 | NOT_FOUND | Tenant not found |
| 502 | GATEWAY_ERROR | Innovatif API error |
| 503 | CONFIG_ERROR | Kredit parent client not configured |

### Retry / Restart KYC

When a session fails or expires, Kredit can retry by:

1. Marking the existing KYC session as expired in Kredit (internal state)
2. Calling `POST /api/webhooks/kredit/verification-request` with the same payload format and HMAC signing (`x-kredit-signature`, `x-kredit-timestamp`)
3. Using the new `session_id` and `onboarding_url` from the response

---

## 2. Status Callback Webhook (Admin → Kredit)

**Purpose:** Admin sends lifecycle updates to Kredit when Innovatif webhook is received.

**Events:** `kyc.session.started`, `kyc.session.processing`, `kyc.session.completed`, `kyc.session.expired`

### Headers

| Header | Description |
|--------|-------------|
| `x-trueidentity-signature` | HMAC-SHA256 (base64) of `{timestamp}.{rawBody}` |
| `x-trueidentity-timestamp` | Unix timestamp in milliseconds |
| `Content-Type` | `application/json` |
| `X-TrueStack-Event` | Event type (e.g. `kyc.session.completed`) |

### Payload

```json
{
  "event": "kyc.session.completed",
  "session_id": "uuid",
  "tenant_id": "string",
  "borrower_id": "string",
  "status": "completed",
  "result": "approved",
  "reject_message": null,
  "timestamp": "2025-02-18T12:00:00.000Z",
  "ic_front_url": "https://...",
  "ic_back_url": "https://...",
  "selfie_url": "https://...",
  "verification_detail_url": "https://..."
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | Event type (e.g. `kyc.session.completed`) |
| `session_id` | Yes | Admin/Innovatif session ID |
| `tenant_id` | Yes | Kredit tenant ID |
| `borrower_id` | Yes | Kredit borrower ID |
| `status` | Yes | `pending`, `processing`, `completed`, `expired`, `failed` |
| `result` | No | `approved` or `rejected` (when status=completed) |
| `reject_message` | No | Rejection reason when result=rejected |
| `timestamp` | Yes | ISO 8601 timestamp |
| `ic_front_url` | No | URL to IC front image in Admin storage |
| `ic_back_url` | No | URL to IC back image in Admin storage |
| `selfie_url` | No | URL to selfie image in Admin storage |
| `verification_detail_url` | No | URL to view full verification details in Admin |

---

## 3. Usage API (Kredit → Admin)

**Endpoint:** `GET /api/internal/kredit/usage`

**Purpose:** Kredit queries verification count and usage total for billing.

### Auth

- Header: `Authorization: Bearer {INTERNAL_API_KEY}` or `Authorization: Bearer {KREDIT_INTERNAL_SECRET}`

### Query Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `tenant_id` | Yes | Kredit tenant identifier |
| `period_start` | Yes | ISO date or timestamp |
| `period_end` | Yes | ISO date or timestamp |

### Response

```json
{
  "tenant_id": "string",
  "client_id": "uuid",
  "period_start": "...",
  "period_end": "...",
  "verification_count": 42,
  "usage_credits": 1680,
  "usage_amount_myr": 168.0
}
```

---

## 4. Payment Sync Callback (Admin → Kredit)

**Purpose:** Triggered when Admin marks a Kredit-source tenant billing period as paid.

**Event:** `payment.recorded`

### Headers

| Header | Description |
|--------|-------------|
| `x-trueidentity-signature` | HMAC-SHA256 (base64) |
| `x-trueidentity-timestamp` | Unix timestamp (ms) |
| `Content-Type` | `application/json` |
| `X-TrueStack-Event` | `payment.recorded` |

### Payload

```json
{
  "event": "payment.recorded",
  "tenant_id": "string",
  "client_id": "uuid",
  "period_start": "2025-02-01",
  "period_end": "2025-02-28",
  "paid_at": "2025-02-18T12:00:00.000Z",
  "paid_amount_myr": 168.0,
  "timestamp": "2025-02-18T12:00:00.000Z"
}
```

### Webhook URL

- From `webhook_url` in client product config, or
- `{KREDIT_BACKEND_URL}/payment`

---

## 5. Subscription Payment Request Webhook (Kredit → Admin)

**Endpoint:** `POST /api/webhooks/kredit/subscription-payment-request`

**Purpose:** Triggered when tenant clicks “I’ve Made the Transfer” in Kredit subscription payment page. Admin stores request as `pending` for approve/reject workflow.

### Headers

Same as Verification Request: `x-kredit-signature`, `x-kredit-timestamp`, `Content-Type: application/json`

### Request Body

```json
{
  "event": "subscription.payment.requested",
  "request_id": "SPR-ABCDEFG123",
  "tenant_id": "string",
  "tenant_slug": "string",
  "tenant_name": "string",
  "plan": "CORE",
  "amount_cents": 49900,
  "amount_myr": 499.0,
  "payment_reference": "TKCLIENT240223",
  "period_start": "2026-02-23",
  "period_end": "2026-03-23",
  "requested_at": "2026-02-23T01:00:00.000Z",
  "requested_add_ons": ["TRUEIDENTITY"],
  "decision_webhook_url": "/api/webhooks/kredit/subscription-payment-decision"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | `subscription.payment.requested` |
| `request_id` | Yes | Idempotency key for this payment request |
| `tenant_id` | Yes | Kredit tenant ID |
| `tenant_slug` | No | Tenant slug for display |
| `tenant_name` | No | Tenant name for display |
| `plan` | Yes | `CORE` or `CORE_TRUESEND` |
| `amount_cents` | Yes | Amount in cents |
| `amount_myr` | Yes | Amount in MYR |
| `payment_reference` | Yes | Tenant-entered transfer reference |
| `period_start` | Yes | Requested subscription period start date (YYYY-MM-DD) |
| `period_end` | Yes | Requested subscription period end date (YYYY-MM-DD) |
| `requested_at` | Yes | ISO timestamp for request creation |
| `requested_add_ons` | No | Optional requested add-ons |
| `decision_webhook_url` | No | Path/full URL for Admin decision callback (default path recommended) |

---

## 6. Subscription Payment Decision Callback (Admin → Kredit)

**Endpoint:** `POST /api/webhooks/kredit/subscription-payment-decision`

**Purpose:** Admin sends approve/reject result for a pending subscription payment request. Kredit updates tenant subscription and validity only on approved.

### Headers

| Header | Description |
|--------|-------------|
| `x-trueidentity-signature` | HMAC-SHA256 (base64) |
| `x-trueidentity-timestamp` | Unix timestamp (ms) |
| `Content-Type` | `application/json` |
| `X-TrueStack-Event` | `subscription.payment.decision` |

### Payload

```json
{
  "event": "subscription.payment.decision",
  "request_id": "SPR-ABCDEFG123",
  "tenant_id": "string",
  "status": "approved",
  "plan": "CORE",
  "amount_cents": 49900,
  "amount_myr": 499.0,
  "payment_reference": "TKCLIENT240223",
  "period_start": "2026-02-23",
  "period_end": "2026-03-23",
  "rejection_reason": null,
  "decided_at": "2026-02-23T02:00:00.000Z",
  "decided_by": "admin_user_id"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | `subscription.payment.decision` |
| `request_id` | Yes | Must match pending request ID |
| `tenant_id` | Yes | Kredit tenant ID |
| `status` | Yes | `approved` or `rejected` |
| `rejection_reason` | No | Required when status is rejected |
| `decided_at` | Yes | ISO decision timestamp |
| `decided_by` | No | Admin user id or identifier |

---

## 7. Tenant Created Webhook (Kredit → Admin) – Phase 2

**Endpoint:** `POST /api/webhooks/kredit/tenant-created`

**Purpose:** Kredit calls this when a tenant pays for the first time (Core + TrueIdentity). Admin auto-creates the tenant client with idempotency.

### Headers

Same as Verification Request: `x-kredit-signature`, `x-kredit-timestamp`, `Content-Type: application/json`

### Request Body

```json
{
  "tenant_id": "string",
  "tenant_slug": "string",
  "tenant_name": "string",
  "contact_email": "string",
  "contact_phone": "string",
  "company_registration": "string",
  "webhook_url": "/api/webhooks/trueidentity",
  "metadata": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `tenant_id` | Yes | Kredit’s tenant identifier (ID). Admin stores and uses for lookup; same ID as in verification-request. |
| `tenant_slug` | Yes | Tenant slug (e.g. demo-company) for display in Admin. |
| `tenant_name` | Yes | Tenant name for display in Admin. |
| `contact_email` | No | Contact email |
| `contact_phone` | No | Contact phone |
| `company_registration` | No | SSM number |
| `webhook_url` | No | Path-only (e.g. `/api/webhooks/trueidentity`). Admin prepends `KREDIT_BACKEND_URL` for delivery. |
| `metadata` | No | Additional context |

### Response (200 OK)

**Created:**
```json
{
  "created": true,
  "client_id": "uuid",
  "tenant_id": "string",
  "code": "KREDIT_xxx",
  "name": "string",
  "message": "Tenant client created"
}
```

**Already exists (idempotent):**
```json
{
  "created": false,
  "client_id": "uuid",
  "tenant_id": "string",
  "message": "Tenant already exists"
}
```

---

## Idempotency and Replay Protection

- **Inbound (Kredit → Admin):** 5-minute replay window via `x-kredit-timestamp`. Requests with timestamps outside this window are rejected.
- **Outbound (Admin → Kredit):** Kredit should verify `x-trueidentity-signature` and optionally enforce replay protection using `x-trueidentity-timestamp`.

---

## Troubleshooting: Signature verification failed (Kredit → Admin)

When Admin returns `401 UNAUTHORIZED` with "Signature verification failed" for `POST /api/webhooks/kredit/verification-request`:

1. **Same secret on both sides**  
   Admin’s secret used to **verify** incoming Kredit requests must be **exactly** the same as Kredit’s secret used to **sign** (e.g. Kredit: `KREDIT_WEBHOOK_SECRET` or `kredit_webhook_secret`; Admin: same variable). No extra spaces, newlines, or different encoding.

2. **Verify with the raw body**  
   Admin must compute the HMAC over the **raw HTTP request body** (as received, before parsing JSON). Do **not** verify using `JSON.stringify(parsedBody)` — key order may differ and the signature will fail.

3. **Payload format**  
   Signed payload is: `{x-kredit-timestamp}.{rawBody}` (timestamp string + `.` + exact raw body). Algorithm: HMAC-SHA256; encoding: base64. Header `x-kredit-signature` must be the **raw base64** string only (no `HMAC-SHA256 ` prefix); length 44 for a 32-byte digest.

4. **Timestamp**  
   `x-kredit-timestamp` is **milliseconds** (e.g. from JavaScript `Date.now()`). Replay window is typically ±5 minutes.
