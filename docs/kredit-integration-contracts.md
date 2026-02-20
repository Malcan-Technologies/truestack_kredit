# TrueStack Kredit + TrueIdentity Integration – API Contracts

This document describes the webhook and API contracts between TrueStack Admin (TrueIdentity) and TrueStack Kredit.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `KREDIT_WEBHOOK_SECRET` | Shared secret for verifying inbound Kredit → Admin webhooks |
| `TRUEIDENTITY_WEBHOOK_SECRET` or `KREDIT_WEBHOOK_SECRET` | Shared secret for signing outbound Admin → Kredit webhooks |
| `KREDIT_BACKEND_URL` | Base URL for Kredit payment webhook (optional; can use `webhook_url` in client config) |
| `KREDIT_INTERNAL_SECRET` | Optional auth for usage API (falls back to `INTERNAL_API_KEY`) |

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
  "borrower_id": "string",
  "document_name": "string",
  "document_number": "string",
  "document_type": "1",
  "webhook_url": "https://kredit.example.com/webhooks/status",
  "metadata": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `tenant_id` | Yes | Kredit’s tenant identifier (ID, e.g. cuid). Admin looks up by this (stored as `tenant_slug`). Short labels (e.g. code) are for display only. |
| `borrower_id` | No | Borrower identifier in Kredit |
| `document_name` | Yes | Full name on document |
| `document_number` | Yes | Document number (IC/Passport) |
| `document_type` | No | Default `"1"` (IC) |
| `webhook_url` | Yes | URL for status callbacks |
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
  "timestamp": "2025-02-18T12:00:00.000Z"
}
```

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

---

## 5. Tenant Created Webhook (Kredit → Admin) – Phase 2

**Endpoint:** `POST /api/webhooks/kredit/tenant-created`

**Purpose:** Kredit calls this when a tenant pays for the first time (Core + TrueIdentity). Admin auto-creates the tenant client with idempotency.

### Headers

Same as Verification Request: `x-kredit-signature`, `x-kredit-timestamp`, `Content-Type: application/json`

### Request Body

```json
{
  "tenant_id": "string",
  "tenant_name": "string",
  "contact_email": "string",
  "contact_phone": "string",
  "company_registration": "string",
  "webhook_url": "https://...",
  "metadata": {}
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `tenant_id` | Yes | Kredit’s tenant identifier (ID). Admin stores as `tenant_slug` and uses for lookup; same ID as in verification-request. |
| `tenant_name` | No | Display name for Admin UI (default: "Kredit Tenant {tenant_id}") |
| `contact_email` | No | Contact email |
| `contact_phone` | No | Contact phone |
| `company_registration` | No | SSM number |
| `webhook_url` | No | Default webhook URL for status callbacks |
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
