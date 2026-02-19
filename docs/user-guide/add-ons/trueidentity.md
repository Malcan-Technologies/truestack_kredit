---
title: TrueIdentity (e-KYC)
order: 2
---

# TrueIdentity — e-KYC Verification

TrueIdentity is TrueKredit's integrated e-KYC (electronic Know Your Customer) verification system. It allows you to verify a borrower's identity digitally — directly from TrueKredit — ensuring the person applying for a loan is who they claim to be.

---

## How It Works

### 1. Generate QR Code

From TrueKredit, generate a unique QR code for the borrower during the application process. Each QR code is tied to the specific borrower and loan file.

### 2. Borrower Scans & Verifies

The borrower scans the QR code on their phone, takes a photo of their IC (MyKad), and completes a face liveness check. No app installation is required — the process runs entirely in the mobile browser.

### 3. IC OCR Extraction

The system automatically extracts data from the IC — name, IC number, address — and cross-checks it against the liveness photo to confirm the borrower is the IC holder.

### 4. Result Saved to Loan File

The verification result (pass or fail) is automatically saved into the borrower's loan file in TrueKredit for audit and compliance reference. No manual data entry needed.

---

## Benefits

- **Prevents identity fraud** — ensures the borrower is the actual IC holder through face liveness detection
- **Reduces manual verification effort** — no more photocopying ICs or manually checking documents
- **Creates a tamper-proof digital record** — verification results are stored for KPKT inspections and compliance audits
- **Borrowers can verify from anywhere** — no physical visit needed, everything is done via the borrower's phone
- **Fast and simple** — the entire process takes just a few minutes from QR scan to result

---

## Do I Need This Add-on?

TrueIdentity is **optional**. Without it, you can continue to verify borrower identities manually using your existing process. The add-on automates and digitises the verification step, saving time and creating a stronger audit trail.

If your business handles a high volume of loan applications or you want to strengthen compliance for KPKT inspections, TrueIdentity is highly recommended.

---

## Pricing

| Item | Price | Details |
|------|-------|---------|
| Per verification | **RM 4** | Charged per completed verification (pass or fail) |

- Charged **only** when the verification is completed.
- Borrowers get **up to 3 retries** per session at no extra cost.
- **No monthly commitment** — pay only for what you use.

---

## Frequently Asked Questions

### What if the borrower fails the verification?

A failed verification is still saved to the loan file. You can review the result and decide whether to proceed with the application, request the borrower to verify again with a new QR code, or handle it manually.

### Does the borrower need to install an app?

No. The entire verification flow runs in the borrower's mobile browser after scanning the QR code. No app download is required.

### How many retries does the borrower get?

Each QR session allows **up to 3 retries** at no extra cost. If all retries are exhausted, you can generate a new QR code for another session.

### Is the verification result stored permanently?

Yes. The verification result — including the pass/fail status and timestamp — is permanently stored in the borrower's loan file for audit and compliance purposes.

### Can I use TrueIdentity for existing borrowers?

Yes. You can generate a verification QR code for any borrower at any time, not just during the initial application.

### How do I subscribe to TrueIdentity?

Contact your TrueKredit account manager or visit the billing section in your admin dashboard to enable the add-on.

---

## Technical Integration (Kredit ↔ Admin)

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TRUEIDENTITY_ADMIN_BASE_URL` | Base URL of TrueStack Admin | `https://admin.truestack.my` |
| `KREDIT_TRUESTACK_WEBHOOK_SECRET` | Shared secret for signing Kredit→Admin requests | 32+ character secret |
| `TRUEIDENTITY_WEBHOOK_SHARED_SECRET` | Shared secret for Admin→Kredit callback verification | Same or separate 32+ char secret |
| `APP_BASE_URL` or `BACKEND_URL` | Kredit backend URL (for callback URL) | `https://kredit.example.com` |
| `TRUEIDENTITY_TIMESTAMP_MAX_AGE_MS` | Max age for timestamp in callback (replay protection) | `300000` (5 min) |

### API Contract

**Kredit → Admin** (`POST {ADMIN_BASE_URL}/api/webhooks/kredit/verification-request`):

- Headers: `x-kredit-signature`, `x-kredit-timestamp`
- Body: `{ tenantId, borrowerId, refId, name, icNumber, callbackUrl }`
- Response: `{ session_id, onboarding_url, status, expires_at }`

**Admin → Kredit** (`POST {KREDIT_URL}/api/webhooks/trueidentity`):

- Headers: `x-trueidentity-signature`, `x-trueidentity-timestamp` (optional)
- Events: `kyc.session.started`, `kyc.session.processing`, `kyc.session.completed`, `kyc.session.expired`
