---
title: Agreements & Attestation
order: 2
---

# Agreements & Attestation

This page covers the operational flow for managing loan agreements and the attestation step in TrueKredit Pro. Both are accessed from the **Dashboard → TrueKredit Pro** menu.

---

## Agreements

**Location:** Dashboard → TrueKredit Pro → **Agreements**

**Permission:** `agreements.manage`

### What an Agreement Is

Once an application is approved at L2, a loan record is created and an **agreement** (PDF) is generated for signing. The agreement carries:

- Borrower details
- Loan terms (principal, term, interest rate, legal/stamping fees, schedule type)
- Your organisation info (from Settings)
- The loan schedule
- Space for the three signatures: borrower, admin, witness

### Lifecycle

| Status | Meaning |
|--------|---------|
| `PENDING_BORROWER_SIGN` | Waiting for the borrower (after KYC and certificate) |
| `PENDING_ADMIN_SIGN` | Borrower has signed; waiting for admin |
| `PENDING_WITNESS_SIGN` | Admin has signed; waiting for witness |
| `SIGNED` | All three signatures applied; downloadable as a signed PDF |
| `VOIDED` | Cancelled before completion; no further signing possible |

The backend enforces the order (borrower → admin → witness). Out-of-order requests are rejected.

### Managing Agreements

On the Agreements page you can:

- Filter by loan, borrower, or status
- Open an agreement's detail view
- Download the current PDF state
- Apply the admin signature (if you hold `agreements.manage`)
- Void an agreement before it is fully signed (records the reason)
- Re-generate a new agreement after voiding, if needed

### Signed PDF

After the witness signs, a final **signed PDF** is produced. This is the artefact that:

- Is delivered to the borrower via the portal
- Is available for download on the loan detail
- Can be independently verified at **Verify Signatures** — see [Verify Signatures](?doc=digital-signing/verify-signatures)

Any edit to this PDF after signing invalidates the signatures.

---

## Signing Certificates

**Location:** Dashboard → TrueKredit Pro → **Signing Certificates**

**Permission:** `signing_certificates.manage`

### What a Certificate Is

A signing certificate binds a signing key to a user identity (admin or witness; borrowers obtain theirs through the portal). Certificates are required to apply a signature to an agreement.

### Managing Admin / Witness Certificates

From this page you can:

- View issued certificates and their expiry
- Issue a new certificate for a staff member
- Revoke a certificate (e.g. user offboarding)

Certificate lifecycle is important — an expired or revoked certificate cannot be used to sign new agreements.

### Borrower Certificates

Borrower certificates are managed through the **borrower portal's** guided flow. They are not issued from this admin page.

---

## Attestation

**Location:** Dashboard → TrueKredit Pro → **Attestation Meetings**

**Permissions:** `attestation.schedule` (scheduling), `attestation.witness_sign` (actually witnessing and signing)

### What Attestation Is

Attestation is the step where an authorised witness confirms the borrower understands the loan and is proceeding intentionally. Depending on the deployment, attestation can be:

- **Video-based** — borrower watches an attestation video in the portal
- **Meeting-based** — borrower attends a scheduled session (online or in-person)
- Another deployment-specific confirmation step

### Scheduling an Attestation Meeting

1. Open the loan or application detail
2. Click **Schedule Attestation**
3. Pick a time, the assigned attestor, and any meeting metadata
4. Confirm

The borrower is notified in the portal (and by email if TrueSend is configured).

### Witnessing

The attestor attends the session. After confirming the borrower, they apply the **witness signature** on the agreement (which also requires `attestation.witness_sign`).

### Availability

**Location:** Dashboard → TrueKredit Pro → **Availability**

**Permission:** `availability.manage`

Attestors set their availability windows so borrowers can self-book suitable slots from the portal. Availability blocks:

- When an attestor can take meetings
- Length of a slot
- Buffers between slots
- Blackout dates

---

## Payment Approvals & Early Settlement Approvals

Also accessible from the **Dashboard → TrueKredit Pro** menu:

- **Payment Approvals** — review and approve borrower-submitted payments (e.g. bank transfer proofs)
- **Early Settlement Approvals** — review and approve early-settlement requests

These are not part of the signing workflow itself, but they live in the same Pro-specific menu. See:

- [Recording Payments](?doc=loans/recording-payments)
- [Early Settlement](?doc=loans/early-settlement)

---

## Frequently Asked Questions

### Can the admin and witness be the same person?

Not by design. Admin and witness are distinct signing roles. Your deployment may grant both permissions to one user in exceptional setups, but this undermines the witness's independence and is generally discouraged.

### What if the borrower's certificate expired before they could sign?

The borrower starts the certificate flow again in the portal to get a new one. Older certificates cannot be used for new signatures.

### Can we re-sign an agreement after voiding?

Void the old agreement and issue a new one. Do not try to reuse signatures across agreements — they are tied to a specific document and will not validate on a different PDF.

### How long are certificates valid?

Certificate validity depends on the signing gateway's configuration (typically a year or more). The Signing Certificates page shows each certificate's expiry.

### Where do attestation meetings appear for the borrower?

In the borrower portal — on their loan journey / application detail, with a link to join or attend at the scheduled time.

---

## Related Documentation

- [Digital Signing Overview](?doc=digital-signing/signing-overview)
- [Verify Signatures](?doc=digital-signing/verify-signatures)
- [Loan Disbursement](?doc=loans/loan-disbursement)
- [Recording Payments](?doc=loans/recording-payments)
- [Early Settlement](?doc=loans/early-settlement)
