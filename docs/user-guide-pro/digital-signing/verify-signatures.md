---
title: Verify Signatures
order: 3
---

# Verify Signatures

The **Verify Signatures** page (`/dashboard/verify-signatures`) lets anyone with admin access validate a signed loan-agreement PDF against the digital signatures embedded in it. This is useful when:

- A third party (court, auditor, regulator) asks whether a specific PDF is genuinely the signed agreement
- A borrower forwards a PDF and you want to confirm it has not been altered since signing
- You need to confirm which certificates (borrower, admin, witness) signed the document

---

## How It Works

1. Go to **Dashboard → Verify Signatures**
2. Upload the PDF you want to check
3. The backend extracts the embedded signatures and verifies them against the issuing certificates
4. The page displays the result

The verification is **offline-safe** in the sense that it does not require the original loan record — you can verify any signed PDF you possess, even from outside your tenant (for example, an old agreement from an older deployment snapshot, or a PDF someone forwarded to you).

---

## What You See After Verification

For each signature found in the PDF, the page shows:

| Field | Description |
|-------|-------------|
| Signer name | Human-readable identity bound to the certificate |
| Role | Borrower / Admin / Witness |
| Signed at | Timestamp of the signature |
| Certificate | Certificate fingerprint / identifier |
| Status | Valid / Invalid / Expired / Revoked |

And an overall document status:

| Status | Meaning |
|--------|---------|
| `VALID` | All signatures verified; the PDF has not been altered |
| `INVALID` | At least one signature does not match (content changed, wrong key, or malformed) |
| `PARTIALLY_VALID` | Some signatures valid, but the PDF is incomplete or other signatures failed |
| `NO_SIGNATURES` | The PDF contains no recognised signatures |

If the PDF originated from your deployment, the page may also link back to the source loan / agreement.

---

## When Verification Can Fail

| Symptom | Likely cause |
|---------|--------------|
| Content mismatch | The PDF was edited after signing (even a metadata change can invalidate signatures) |
| Unknown signer | The certificate is not from this deployment's signing gateway |
| Expired / revoked certificate | The signer's certificate was revoked after signing — the signature itself may still be valid as of the signing time; the UI will indicate whether time-of-signing was still within validity |
| Corrupted PDF | The file is not a valid PDF or was damaged in transit |

---

## Who Can Use This Page

**Permission:** a view permission that gives access to the dashboard (typically everyone with an admin login sees the Verify Signatures entry). The page itself is read-only — no data mutates as a result of verifying.

Some deployments may restrict the page to specific roles (e.g. Compliance Officer, Auditor Read-only). Check with your deployment owner if you cannot see the menu entry.

---

## Frequently Asked Questions

### Does verification prove the PDF was never edited?

Yes — any modification (including saving with a different PDF writer that normalises content) will invalidate at least one signature. The page will report `INVALID` and show which signature broke.

### Can I verify PDFs from another TrueKredit Pro deployment?

Only if the signing certificates are resolvable. Pro deployments are isolated — a certificate issued on deployment A is not known to deployment B. In that case the page shows the signatures exist but the signers are `UNKNOWN`.

### Does verification cost anything per-check?

No. Verification is a local cryptographic operation. It does not call any external billable service.

### Is the uploaded PDF stored?

Only transiently for the verification operation. It is not attached to any loan or kept beyond the response.

### Can borrowers verify their own signed agreements?

Through the portal, borrowers can download their signed PDF. If they need to re-verify it independently, they can open it in any PDF reader that supports PDF signatures (e.g. Adobe Acrobat), or ask your team to verify on their behalf.

---

## Related Documentation

- [Digital Signing Overview](?doc=digital-signing/signing-overview)
- [Agreements & Attestation](?doc=digital-signing/agreements-and-attestation)
- [Admin Logs](?doc=administration/admin-logs)
