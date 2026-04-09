# Digital Signing Implementation

Technical reference for the PKI digital signing system in `truestack_kredit` (Pro edition). Covers the full implementation for borrower, company representative, and witness signing.

---

## 1. Overview

The platform uses PKI-based digital signing via **MTSA (MyTrustSigner Agent)**, a third-party Trustgate SOAP service deployed as a Docker container on each client's on-premises server. A custom **Signing Gateway** (Express/TypeScript) sits between the cloud backend (`backend_pro`) and MTSA, providing a REST API, local document storage, and S3 backup sync.

### Signing Roles

A loan agreement requires signatures from **three or more** parties:

| Role | Portal | Signer Identity | When |
|------|--------|-----------------|------|
| **Borrower** (1+) | `borrower_pro` | Individual: borrower IC. Corporate: each director's IC | After attestation + e-KYC |
| **Company Representative** | `admin_pro` | Staff member's IC (lender company rep) | After borrower signs, before disbursement |
| **Witness** | `admin_pro` | Witness staff member's IC | After borrower signs, before disbursement |

For corporate borrowers with multiple directors, there is one borrower signature field per director — all must sign before the loan proceeds.

### Agreement Structure

The loan agreement PDF (Jadual J or Jadual K, per KPKT template) has this signature page layout:

- **Page N** (varies by content length): Borrower signature block(s) — `DITANDATANGANI oleh Peminjam` with `)` brackets and a right-column signing area per signatory.
- **Page N+1** (always a new page): Lender (company representative) signature block — `DITANDATANGANI oleh Pemberi Pinjam`.
- **Same page, below lender**: Witness attestation block — `PENGAKUSAKSI` with a centered dotted line for the witness signature.
- **Final page**: Jadual Pertama (schedule table).

---

## 2. Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────────────────────┐
│ borrower_pro│──────│   backend_pro    │──────│  On-Prem Server (per client)    │
│  (Next.js)  │proxy │   (Express)      │ REST │  ┌───────────────┐             │
│             │──────│                  │──────│  │Signing Gateway│──SOAP──┐    │
│ admin_pro   │      │ /api/borrower-   │      │  │  (port 4010)  │        │    │
│  (Next.js)  │──────│   auth/signing/* │      │  └───────────────┘        ▼    │
└─────────────┘      │ /api/admin/      │      │  ┌──────────────────────────┐  │
                     │   signing/*      │      │  │ MTSA Container           │  │
                     └──────────────────┘      │  │ (Tomcat 9 / JDK 17:8080)│  │
                                               │  └──────────────────────────┘  │
                                               │  ┌────────────────┐            │
                                               │  │ Local Storage   │            │
                                               │  │ /signed-docs/  │───▶ S3     │
                                               │  └────────────────┘   backup   │
                                               └─────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `pdfService.ts` | `backend_pro/src/lib/` | Generates Jadual J/K PDFs with PDFKit. Tracks all signature field coordinates dynamically (borrower, company_rep, witness). |
| `loanAgreementPdfService.ts` | `backend_pro/src/modules/loans/` | Orchestrates PDF generation — fetches loan data from Prisma, invokes `pdfService`, returns buffer + filename + signature field metadata. |
| `borrower-signing/routes.ts` | `backend_pro/src/modules/borrower-signing/` | Borrower-facing signing API — certificate check, OTP, enrollment, agreement preview, sign agreement. Persists `agreementSignatureFields` on the Loan model. |
| `admin-signing/routes.ts` | `backend_pro/src/modules/admin-signing/` | Internal staff signing API — profile management, KYC, cert enrollment/revoke, PIN-based signing, tenant signers list. |
| `signingGatewayClient.ts` | `backend_pro/src/lib/` | HTTP client for the on-prem Signing Gateway. Includes `signAndStorePdf`, `verifyCertPin`, `revokeCertificate`, `resetCertPin`, `verifyPdfSignature`, `updateMtsaEmail`, and all certificate/OTP operations. |
| `borrower-signing-client.ts` | `borrower_pro/lib/` | Frontend API client for borrower signing operations (proxied through Next.js API routes). |
| `admin-signing-client.ts` | `admin_pro/lib/` | Frontend API client for admin signing operations — profile, KYC, cert management, PIN management, PDF signature verification, loan signing, tenant signers. |
| `digital-certificate-step.tsx` | `borrower_pro/components/loan-center/` | UI for borrower certificate check + enrollment (Step 6 in loan journey). |
| `agreement-signing-view.tsx` | `borrower_pro/components/loan-center/` | UI for drawing signature, OTP, and signing (Step 7 in loan journey). |
| `internal-signing-card.tsx` | `admin_pro/components/` | Reusable card for internal staff to draw signature + enter PIN for company rep or witness signing. |
| `signing-certificates/page.tsx` | `admin_pro/app/.../truekredit-pro/` | Unified page for staff signing profile management, cert enrollment/revoke, tenant signers table, and certificate lookup. |
| Signing Gateway | `apps/signing-gateway/` | On-prem Express service wrapping MTSA SOAP calls. Stores signed PDFs locally. |
| MTSA Container | `apps/signing-gateway/mtsa-pilot/` | Trustgate's MyTrustSigner Agent Docker image (Tomcat 9, JDK 17). |

---

## 3. Borrower Signing Flow (Implemented)

This is the current end-to-end flow for borrower digital signing, available in `borrower_pro`.

### 3.1 Digital Certificate Step

**Component**: `DigitalCertificateStep` in `loan-pending-agreement-page.tsx`

**Flow**:
1. Check signing gateway health → `GET /api/borrower-auth/signing/health`
2. If gateway offline → show error, allow retry
3. Check borrower's certificate status → `POST /api/borrower-auth/signing/cert-status`
   - Uses borrower's **IC number** as the MTSA `UserID`
4. If certificate is valid → auto-advance to signing step
5. If no certificate or expired:
   a. Request enrollment OTP → `POST /api/borrower-auth/signing/request-otp`
      - OTP usage: `NU` (New User)
      - Email: borrower's **profile email** (from `Borrower` model, not account email)
      - Response includes the `email` field so the frontend can tell the user exactly where the OTP was sent
   b. User enters OTP — the UI shows "A 6-digit code has been sent to **user@example.com**"
   c. Enroll certificate → `POST /api/borrower-auth/signing/enroll`
      - Attaches KYC images (IC front, IC back, selfie) from `BorrowerDocument` storage
      - Passes borrower name, IC, email, phone, nationality, ID type
   d. On success → auto-advance to signing step

### 3.2 Agreement Signing Step

**Component**: `AgreementSigningView` in `loan-pending-agreement-page.tsx`

**Phases**: `loading` → `review` → `otp_requesting` → `otp_sent` → `signing` → `signed`

**Flow**:
1. **Preview**: Generate agreement PDF → `POST /api/borrower-auth/signing/agreement-preview`
   - Agreement date is auto-set to today (no manual date entry)
   - PDF includes a footer: `Signed digitally at [gateway hostname]`
   - PDF is displayed in a native `<iframe>` with `#zoom=page-width`
2. **Draw signature**: User draws their signature on a `signature_pad` canvas
   - Responsive layout: signature pad + PDF preview side-by-side on large screens
   - Visual indicator shows where the signature will appear (mini Page N diagram)
3. **Request signing OTP**: → `POST /api/borrower-auth/signing/request-signing-otp`
   - OTP usage: `DS` (Digital Signing) — does NOT pass email (MTSA uses registered email)
   - Response includes the borrower's `email` so the frontend can display which address the OTP was sent to
   - OTP-sent state is persisted in `sessionStorage` to survive tab switches
   - Before requesting, the UI hints: "The OTP will be sent to **user@example.com**"
   - After sending, the UI shows: "A 6-digit code has been sent to **user@example.com**"
4. **Enter OTP**: User enters OTP received via email
5. **Sign**: → `POST /api/borrower-auth/signing/sign-agreement`
   - Generates the PDF fresh (same date, same content)
   - Retrieves dynamic signature field coordinates from PDF generation metadata
   - Calls signing gateway `sign-and-store` with PDF, signature image, OTP, and coordinates
   - Stores signed PDF: on-prem (signing gateway) + cloud (backend_pro storage, backed to S3)
   - Updates loan record: `agreementPath`, `agreementVersion`, `signedAgreementReviewStatus: 'PENDING'`
   - Saves borrower signature image to `borrower-signatures` storage
   - Audit log: `BORROWER_DIGITAL_SIGN_AGREEMENT` with signature path
   - Emails signed PDF to borrower (fire-and-forget via `TrueSendService`)
   - Audit log: `SIGNED_AGREEMENT_EMAILED` or `SIGNED_AGREEMENT_EMAIL_FAILED`
6. **Success UI**: Checkmark card with countdown, auto-redirects to loan page in 5 seconds

### 3.3 Signature Placement

Signature coordinates are **dynamically computed** during PDF generation, not hardcoded. This supports variable-length content and multiple signatories.

**Coordinate tracking**:
- `drawBorrowerSigBlock()` records each borrower signature block with `role: 'borrower'`
- `drawLenderSigBlock()` records the company representative block with `role: 'company_rep'`
- The `PENGAKUSAKSI` section records the witness block with `role: 'witness'`
- Page number is tracked via PDFKit's `pageAdded` event
- PDFKit coordinates (top-left origin) are converted to MTSA coordinates (bottom-left origin, PDF spec)
- All fields are persisted as `agreementSignatureFields` (JSON) on the `Loan` model after borrower signing

**`SignatureFieldMeta` structure**:
```typescript
interface SignatureFieldMeta {
  index: number;       // 0-based signatory index
  role: 'borrower' | 'company_rep' | 'witness';
  pageNo: number;      // 1-indexed page number
  x1: number;          // MTSA lower-left x
  y1: number;          // MTSA lower-left y
  x2: number;          // MTSA upper-right x
  y2: number;          // MTSA upper-right y
  signatoryName: string;
  signatoryIc: string;
}
```

**Coordinate conversion** (in `drawBorrowerSigBlock`):
```
mtsaX1 = BRACKET_COL + 8     (right of ) brackets)
mtsaX2 = 570                  (near right edge of page)
mtsaY2 = PAGE_HEIGHT - startY (top of block in MTSA coords)
mtsaY1 = mtsaY2 - 110         (110pt tall signature area)
```

The borrower signing route filters fields by `role: 'borrower'` and uses the first match. After signing, the full `SignatureFieldMeta[]` array is persisted on the `Loan` model as `agreementSignatureFields` (JSON), enabling internal signers to retrieve their coordinates later. For multiple signatories, each field in the array has its own page number and coordinates.

### 3.4 MTSA Email Synchronization

When a borrower changes their profile email, the system keeps the MTSA-registered email in sync. The MTSA certificate system stores the email used during enrollment, and signing OTPs are sent to that registered email — so if it becomes stale, the borrower cannot receive OTPs.

**Flow (in `BorrowerDetailCard`, triggered on profile save when email changes)**:

1. Frontend detects the email field changed before saving
2. Calls `POST /api/borrower-auth/signing/check-email-change` with `{ newEmail }`
3. Backend silently checks if the borrower has a valid MTSA certificate via `GetCertInfo`:
   - **No valid cert** → returns `{ requiresOtp: false }` → profile saves immediately (no extra step)
   - **Valid cert** → calls `RequestEmailOTP(OTPUsage='NU', EmailAddress=newEmail)` to send OTP to the **new** email → returns `{ requiresOtp: true, otpSent: true }`
4. Frontend shows a verification dialog: "Your email is linked to your digital signing certificate. An OTP has been sent to **new@example.com** to verify the change."
5. Borrower enters the OTP received at their new email
6. Frontend calls `POST /api/borrower-auth/signing/confirm-email-change` with `{ newEmail, otp }`
7. Backend calls MTSA `UpdateEmailAddress(UserID, NewEmailAddress, EmailOTP)` via the signing gateway
8. On success, backend updates the borrower's email in the database and creates an audit log (`BORROWER_MTSA_EMAIL_UPDATED`)
9. The normal profile save then proceeds with the rest of the fields

**Key design decisions**:
- The cert check is **silent** — the borrower never sees a loading state unless OTP is actually needed
- If signing is **not enabled** (`config.signing.enabled = false`), `check-email-change` always returns `{ requiresOtp: false }` — no MTSA interaction
- If the borrower has **no IC number** (edge case), the check is skipped and email saves normally
- The OTP is sent to the **new** email address (not the old one), verifying ownership of the new address
- The dialog includes a "Resend OTP" button that re-triggers the `check-email-change` flow

**Backend routes** (in `borrower-signing/routes.ts`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/check-email-change` | POST | Check cert + send OTP to new email if cert exists |
| `/confirm-email-change` | POST | Verify OTP with MTSA `UpdateEmailAddress` + update DB |

**Signing Gateway client** (`signingGatewayClient.ts`):

```typescript
updateMtsaEmail(userId, newEmail, emailOtp) → POST /api/email/update
```

---

## 4. Online vs Physical Origination

The system differentiates between two origination paths:

| Aspect | Online Origination | Physical Origination |
|--------|-------------------|---------------------|
| **Portal** | `borrower_pro` | `admin_pro` |
| **PDF generation** | With footer text, with signing | Without footer, no signing |
| **Agreement date** | Auto-set to today | Admin-specified via query param |
| **Signature** | PKI digital signature via MTSA | Printed, wet-ink signature |
| **Storage** | Signed PDF stored on-prem + S3 | Manually uploaded signed PDF |
| **Signing flow** | Certificate → OTP → Draw → Sign → Email | Generate PDF → Print → Sign → Scan → Upload |

**Implementation**:
- `buildLoanAgreementPdfBuffer({ footerText })` — when `footerText` is provided, the PDF gets the digital footer and signature field metadata is consumed. When omitted, it's a clean printable PDF.
- Admin routes (`modules/loans/routes.ts`, `modules/borrower-loans/routes.ts`) call without `footerText`
- Borrower signing route calls with `footerText: signingFooterText()`

---

## 5. Internal Signing (Company Rep & Witness)

See **Section 12** for the complete implementation details of the internal signing workflow, including data models, backend routes, signing certificates page, and the loan detail page integration.

---

## 6. MTSA Integration Details

### Certificate Operations

| Operation | Usage | Gateway Endpoint |
|-----------|-------|-----------------|
| `GetCertInfo` | Check if user has valid certificate | `POST /api/cert/info` |
| `RequestCertificate` | Enroll new certificate (with KYC docs) | `POST /api/cert/enroll` |
| `RequestRevokeCert` | Revoke a certificate | `POST /api/cert/revoke` |
| `VerifyCertPin` | Verify certificate PIN | `POST /api/cert/verify-pin` |
| `ResetCertificatePin` | Reset certificate PIN | `POST /api/cert/reset-pin` |

### OTP Operations

| Operation | Usage | Gateway Endpoint |
|-----------|-------|-----------------|
| `RequestEmailOTP` (NU) | OTP for certificate enrollment or email update | `POST /api/otp/request-email` |
| `RequestEmailOTP` (DS) | OTP for digital signing | `POST /api/otp/request-email` |
| `RequestSMSOTP` | SMS-based OTP (alternative) | `POST /api/otp/request-sms` |

**Important**: DS (signing) OTP does **not** require `EmailAddress` in the request — MTSA uses the email registered during certificate enrollment. NU (enrollment/update) OTP **does** require `EmailAddress`.

### Contact Update Operations

| Operation | Usage | Gateway Endpoint |
|-----------|-------|-----------------|
| `UpdateEmailAddress` | Update MTSA-registered email after OTP verification | `POST /api/email/update` |
| `UpdateMobileNo` | Update MTSA-registered mobile after SMS OTP | `POST /api/mobile/update` |

`UpdateEmailAddress` requires a prior `RequestEmailOTP(OTPUsage='NU', EmailAddress=newEmail)` — the OTP is sent to the **new** email address to verify ownership.

### Signing Operations

| Operation | Usage | Gateway Endpoint |
|-----------|-------|-----------------|
| `SignPDF` | Apply PKI signature to PDF | `POST /api/sign` |
| `SignPDF` + store | Sign and persist on-prem | `POST /api/sign-and-store` |
| `VerifyPDFSignature` | Verify existing signature | `POST /api/verify` |

### `SignatureInfo` Fields Passed to MTSA

| Field | Type | Description |
|-------|------|-------------|
| `pdfInBase64` | string | The PDF to sign, base64-encoded |
| `visibility` | boolean | Whether the signature stamp is visible |
| `pageNo` | number | 1-indexed page number for visible signature |
| `x1`, `y1` | number | Lower-left corner (MTSA bottom-left origin) |
| `x2`, `y2` | number | Upper-right corner (MTSA bottom-left origin) |
| `sigImageInBase64` | string | Drawn signature image (PNG, base64) |

The signature image is stamped visually at the specified coordinates, and MTSA embeds a PKI certificate seal alongside it for tamper-proof verification. `additionalInfo1` and `additionalInfo2` are not used — the implementation relies on MTSA's default signature metadata (signer name, cert details).

---

## 7. File Storage

### Signed Agreement PDFs

| Location | Path Pattern | Purpose |
|----------|-------------|---------|
| On-prem (Signing Gateway) | `/signed-docs/{loanId}/` | Primary storage, served to users |
| Cloud (backend_pro storage) | `agreements/{loanId}/` | Cloud copy, accessible via admin/borrower portals |
| S3 backup | Configured per client | Disaster recovery |

### Borrower Signature Images

| Location | Path Pattern |
|----------|-------------|
| Cloud (backend_pro storage) | `borrower-signatures/{loanId}/` |

### Audit Trail

All signing events are recorded via `AuditService.log()`:

| Action | Data Captured |
|--------|--------------|
| `BORROWER_DIGITAL_SIGN_AGREEMENT` | Agreement version, path, date, signer IC, signer name, signature image path, on-prem document metadata |
| `SIGNED_AGREEMENT_EMAILED` | Recipient email/name, attachment path/filename, success status |
| `SIGNED_AGREEMENT_EMAIL_FAILED` | Recipient email, error message |
| `BORROWER_MTSA_EMAIL_UPDATED` | Previous email, new email (triggered when email change requires MTSA sync) |
| `INTERNAL_SIGN_AGREEMENT` | Role (COMPANY_REP/WITNESS), signer IC/name, signature image path, agreement version |
| `LOAN_AUTO_APPROVED` | Loan ID, triggered by completion of all internal signatures |
| `STAFF_MTSA_EMAIL_UPDATED` | Previous email, new email (triggered when staff email change requires MTSA sync) |

---

## 8. Configuration

### Backend (`backend_pro`) Environment Variables

| Variable | Description |
|----------|-------------|
| `SIGNING_GATEWAY_URL` | URL of the on-prem Signing Gateway (e.g., `http://localhost:4010` for dev) |
| `SIGNING_GATEWAY_API_KEY` | API key for authenticating with the Signing Gateway |
| `SIGNING_ENABLED` | Feature flag — when `false`, all signing endpoints return graceful errors |

### Signing Gateway Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Gateway listen port (default `4010`) |
| `API_KEY` | Shared secret matching `SIGNING_GATEWAY_API_KEY` |
| `MTSA_BASE_URL` | MTSA SOAP endpoint (e.g., `http://mtsa:8080`) |
| `SIGNED_DOCS_DIR` | Local directory for signed PDFs |

---

## 9. Per-Client Deployment

Each client gets their own on-prem server with:

1. **MTSA Docker container** — provided by Trustgate, may have client-specific configuration
2. **Signing Gateway** — deployed via GitHub Actions, per-client config in `config/clients/{client}.yaml`
3. **Cloudflare Tunnel** — production networking (not used in dev)

The code structure mirrors `borrower_pro`'s per-client deployment pattern. Docker Compose files in `apps/signing-gateway/` define the dev and prod stacks.

Dev setup:
```bash
cd apps/signing-gateway
docker compose -f docker-compose.dev.yml up -d
```

This starts both the Signing Gateway and MTSA containers, with the gateway accessible at `http://localhost:4010`.

---

## 10. Error Handling

### OTP Errors

The signing gateway returns MTSA status codes, which are mapped to user-friendly messages in `statusCodes.ts`:

| Code | Message |
|------|---------|
| `DS112` | Invalid OTP — please check the code and try again |
| `DS113` | OTP has expired — please request a new OTP and try again |
| `DS114` | OTP verification failed — please request a new OTP and try again |

The frontend (`agreement-signing-view.tsx`) detects OTP-specific error codes and shows targeted error messages rather than a generic "signing failed".

### Gateway Offline

If the signing gateway is unreachable, the `DigitalCertificateStep` shows an error message and a retry button. The loan journey cannot proceed until the gateway is online.

### Session Persistence

OTP-sent state is stored in `sessionStorage` to survive tab switches (the Better Auth `useSession` hook no longer triggers refetch on window focus, preventing page reloads).

---

## 11. Frontend State Management

### Better Auth `refetchOnWindowFocus` Fix

All auth clients (`borrower_pro`, `admin_pro`, `admin`) have `sessionOptions: { refetchOnWindowFocus: false }` to prevent page reloads when users alt-tab to check email for OTP codes.

### Signing Phase Persistence

The `AgreementSigningView` stores OTP-sent state in `sessionStorage` keyed by `signing_otp_sent_{loanId}`. On mount, if this key exists, the component restores the `otp_sent` phase instead of restarting the flow.

---

## 12. Internal Signing (Company Rep & Witness)

### Overview

After the borrower digitally signs the agreement via the borrower portal, internal staff (company representative and witness) must counter-sign using their own PKI certificates. This replaces the previous manual "approve/reject" workflow for online-originated loans.

### Key Differences from Borrower Signing

| Aspect | Borrower | Internal (Staff) |
|--------|----------|-----------------|
| MTSA UserType | `1` (external) | `2` (internal) |
| AuthFactor | Email OTP (6 digits) | PIN (4-8 characters) |
| Enrollment extras | None | `OrganisationInfo` + `VerificationData` |
| Pre-signing step | `RequestEmailOTP` | `VerifyCertPin` |
| KYC images stored in | `BorrowerDocument` | `StaffDocument` |

### Data Models

Four new Prisma models support the internal signing workflow:

- **`StaffSigningProfile`** — MTSA identity (IC, name, email, cert status) per staff user, scoped to tenant + user. Includes `kycComplete` flag and `designation`.
- **`StaffDocument`** — KYC images for staff (IC front/back, selfie), linked to `StaffSigningProfile`.
- **`StaffKycSession`** — TrueStack KYC sessions for staff, parallel to `TruestackKycSession` but referencing `StaffSigningProfile` instead of `Borrower`.
- **`LoanInternalSignature`** — records each internal signature applied to a loan (role, signer details, coordinates, agreement version). Unique on `[loanId, role]`.

The `Loan` model gains `agreementSignatureFields` (JSON) to persist the `SignatureFieldMeta[]` array from PDF generation, enabling internal signers to use the correct coordinates later.

### Signature Field Coordinates

All signature positions (borrower, company rep, witness) are tracked dynamically during PDF generation using the same `SigBlockContext` mechanism:

- **Borrower**: recorded in `drawBorrowerSigBlock()` with `role: 'borrower'`
- **Company Rep**: recorded in `drawLenderSigBlock()` with `role: 'company_rep'` — space to the right of `)` brackets
- **Witness**: recorded in `PENGAKUSAKSI` section with `role: 'witness'` — 90pt space above the dotted signature line

Coordinates are converted from PDFKit's top-left origin to MTSA's bottom-left origin using `PAGE_HEIGHT - y`.

### Backend Routes (`/api/admin/signing/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/profile` | GET/POST | Get or upsert the staff signing profile. POST allows editing `phone`, `designation`, and `email` (email change triggers OTP if cert active). |
| `/kyc/start` | POST | Start TrueStack KYC session for staff |
| `/kyc/status` | GET | Get latest KYC status |
| `/health` | GET | Check signing gateway health |
| `/cert-status` | POST | Check own certificate via signing gateway |
| `/cert-check` | POST | Check any user's cert by IC number |
| `/check-email-change` | POST | Check cert + send OTP to new email if cert exists (mirrors borrower flow) |
| `/confirm-email-change` | POST | Verify OTP with MTSA `UpdateEmailAddress` + update staff profile email in DB |
| `/request-otp` | POST | Request enrollment OTP (usage `NU`) |
| `/enroll` | POST | Enroll certificate (UserType 2, with OrganisationInfo + VerificationData) |
| `/revoke` | POST | Revoke certificate |
| `/verify-pin` | POST | Verify the current user's certificate PIN against MTSA |
| `/reset-pin` | POST | Reset the current user's certificate PIN (requires current PIN for verification) |
| `/verify-pdf` | POST | Verify all digital signatures in an uploaded PDF via MTSA `VerifyPDFSignature` |
| `/sign-agreement` | POST | Sign a loan agreement (PIN-based, role-specific). Validates `agreementSignatureFields` exist. |
| `/loan-signatures/:loanId` | GET | Get internal signatures for a loan |
| `/signers` | GET | List all staff signing profiles within the tenant (for the signers table) |

### Signing Flow

1. Staff member sets up their signing profile (IC, name, email, phone, designation)
2. Staff completes TrueStack e-KYC (same flow as borrower, stored in `StaffDocument`; skipped if images already exist)
3. Staff enrolls for a certificate (chooses PIN, provides email OTP, includes `OrganisationInfo` and `VerificationData`)
4. When a loan needs internal signing:
   - Staff draws their signature on the signature pad
   - Enters their certificate PIN
   - Backend validates `agreementSignatureFields` exist on the loan (if missing, returns descriptive error asking borrower to re-sign)
   - Backend calls `VerifyCertPin` via signing gateway
   - Backend reads the current signed PDF, then calls `signAndStorePdf` with the PIN, signature image, and role-specific coordinates
   - Signed PDF stored on-prem + cloud, `LoanInternalSignature` record created
   - After both COMPANY_REP and WITNESS sign, loan auto-approves (`signedAgreementReviewStatus = APPROVED`)
   - The same staff member can sign as both Company Rep and Witness on the same loan if needed

### Staff MTSA Email Synchronization

When a staff member changes their email in the signing profile, the system keeps the MTSA-registered email in sync — identical to the borrower flow described in Section 3.4.

**Flow (in Signing Certificates page, triggered on profile save when email changes)**:

1. Frontend detects the email field changed before saving the profile
2. Calls `POST /api/admin/signing/check-email-change` with `{ newEmail }`
3. Backend checks if the staff member has a valid MTSA certificate via `GetCertInfo`:
   - **No valid cert** → returns `{ requiresOtp: false }` → profile saves immediately
   - **Valid cert** → calls `RequestEmailOTP(OTPUsage='NU', EmailAddress=newEmail)` → returns `{ requiresOtp: true, otpSent: true }`
4. Frontend shows a verification dialog: "An OTP has been sent to **new@example.com** to verify the change."
5. Staff enters the OTP received at their new email
6. Frontend calls `POST /api/admin/signing/confirm-email-change` with `{ newEmail, otp }`
7. Backend calls MTSA `UpdateEmailAddress` via the signing gateway, updates `StaffSigningProfile.email` in the database
8. Audit log: `STAFF_MTSA_EMAIL_UPDATED` with previous and new email

**Key design decisions**:
- The email field is always editable in the profile modal (unlike IC, name, and document type which lock with an active cert)
- A hint appears under the email field when a cert is active: "Changing your email will require OTP verification to the new address."
- If signing is not enabled, `check-email-change` returns `{ requiresOtp: false }` — no MTSA interaction
- The OTP dialog includes a "Resend OTP" button

### Frontend Pages

- **Signing Certificates** (`/dashboard/truekredit-pro/signing-certificates`) — unified table showing all tenant staff with signing profiles. The logged-in user is denoted with a "You" badge. Action buttons (Edit, Enroll, Verify PIN, Reset PIN, Revoke) appear inline. Modals handle profile creation/editing, multi-step enrollment (KYC → PIN/OTP → enroll), PIN verification, PIN reset (requires current PIN), revocation, and email change with OTP verification. A separate certificate lookup section allows checking any user's cert by IC. Profile editing is always allowed; identity fields (IC, full name, document type) are locked once a valid certificate exists. Email can be changed at any time — if a valid cert exists, the change requires OTP verification to the new email via MTSA `UpdateEmailAddress` (same flow as borrower email sync in Section 3.4). Phone and designation are always editable. Page layout and table style match `early-settlement-approvals` for consistency.
- **Verify Signatures** (`/dashboard/verify-signatures`) — tool page for uploading any signed PDF and verifying all embedded digital signatures via MTSA's `VerifyPDFSignature` operation. Displays a per-signature table with signer identity (CN), issuer, timestamp, certificate status, document coverage (full/partial), and signature validity. Available under the "Tools" sidebar section.
- **Loan Detail** (`/dashboard/loans/[loanId]`) — For online-originated loans, `InternalSigningCard` components (Company Rep + Witness) replace the previous approve/reject workflow. These appear only after the borrower has digitally signed. Auto-approval occurs when both internal signatures are complete.
- **Sidebar** — "Signing certificates" entry under TrueKredit Pro section (ShieldCheck icon). "Verify signatures" entry under Tools section (FileSearch icon).

### Webhook Extension

The `truestackKycWebhook.ts` handler checks both `TruestackKycSession` and `StaffKycSession` tables. Staff KYC completions ingest documents into `StaffDocument` and set `StaffSigningProfile.kycComplete = true`.

---

## 13. Signing Sequence (Full)

For online-originated loans, the complete signing sequence is:

```
1. Borrower signs   → signed PDF v1 stored (on-prem + S3), agreementSignatureFields persisted
2. Company rep signs → signed PDF v2 stored (overlays on v1, uses company_rep coordinates)
3. Witness signs     → signed PDF v3 stored (overlays on v2, uses witness coordinates, final)
4. Auto-approval     → signedAgreementReviewStatus = APPROVED, loan proceeds to disbursement
```

Each signing step produces a new PDF with an additional PKI signature embedded. MTSA handles multi-signature PDFs natively — each `SignPDF` call adds a new signature without invalidating existing ones.

---

## 14. Future Considerations

### Multi-Signatory Orchestration (Corporate Borrowers)

For corporate borrowers with multiple directors, `getBorrowerSignatories()` already generates one `Signatory` entry per director, and `drawBorrowerSigBlock()` records a `SignatureFieldMeta` for each. The backend signing route currently uses `borrowerSigFields[0]` (filtered by `role: 'borrower'`) — extending to all directors requires:

1. A signing orchestration model to track which directors have signed
2. Frontend flow to route the signing UI to each director's account
3. Sequential MTSA calls — each director signs the PDF output from the previous signature

### Signing Status Dashboard

Consider a dashboard view showing the complete signing status of each loan:
- Borrower(s): signed/pending
- Company rep: signed/pending
- Witness: signed/pending
- Overall: ready for disbursement / awaiting signatures

### Certificate Renewal

MTSA certificates have validity periods. The system should proactively check certificate expiry and prompt renewal before signing flows.
