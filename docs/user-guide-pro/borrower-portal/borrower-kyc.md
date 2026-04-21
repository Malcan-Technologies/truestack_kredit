---
title: Borrower KYC (TrueStack KYC)
order: 3
---

# Borrower KYC (TrueStack KYC)

TrueKredit Pro integrates with the **TrueStack public KYC API** for borrower identity verification. The borrower scans their IC, completes a face-liveness check, and the result is recorded on the borrower record along with the captured IC and selfie images.

This is a different integration from SaaS TrueIdentity (which uses the Admin-provisioned tenant add-on). Pro uses the standalone TrueStack public API directly.

---

## When KYC Runs

KYC can be initiated from two places:

1. **Borrower portal (self-service)** — borrowers open their profile and start verification
2. **Admin app** — an admin can initiate KYC for a borrower if needed

KYC must be complete (and approved) before the borrower can digitally sign the loan agreement.

---

## What the Borrower Does

1. **Start verification** from the TrueStack KYC card on their profile
2. A new tab opens the TrueStack onboarding flow
3. The borrower:
   - Scans the **front** of their IC
   - Scans the **back** of their IC
   - Takes a short **selfie / liveness** capture
4. The TrueStack system processes the submission and returns a status
5. The borrower returns to the portal and sees the updated status

If the backend misses the webhook, the borrower can click **Sync status** to force a refresh.

---

## Corporate Borrowers

For corporate borrowers, KYC is tracked **per director**. Each director that must be verified has their own KYC session tied to their `directorId`. The borrower's corporate record stays in "pending verification" until each required director is approved.

`Borrower.documentVerified` is auto-set only for **individual** approvals today. Corporate-level verification is determined by aggregating director-level KYC state.

---

## What Gets Saved

When TrueStack returns an **approved** session, the backend:

1. Updates the `TruestackKycSession` record with the session status
2. Sets `Borrower.documentVerified = true` and `verifiedBy = TRUESTACK_KYC_API` (individuals only)
3. Downloads the session's image assets and creates `BorrowerDocument` rows

| TrueStack image | Individual category | Corporate category |
|-----------------|---------------------|--------------------|
| `front_document` | `IC_FRONT` | `DIRECTOR_IC_FRONT` |
| `back_document` | `IC_BACK` | `DIRECTOR_IC_BACK` |
| `face_image` | `OTHER` (label: *Face from IC*) | same |
| `best_frame` | `SELFIE_LIVENESS` | `SELFIE_LIVENESS` |

Imported documents carry the `originalName` prefix **"TrueStack KYC —"**. Re-verifying a borrower **replaces** previously imported documents (with that prefix) — the borrower's own manually-uploaded documents are never overwritten.

The **Borrower Documents** tab on the profile refreshes automatically when a completed approved session is detected.

---

## KYC Statuses

| Status | Meaning |
|--------|---------|
| `NOT_STARTED` | No session created yet |
| `PENDING` | Session created; waiting for the borrower to complete it |
| `IN_PROGRESS` | Borrower is actively submitting |
| `PROCESSING` | Submission received, TrueStack is evaluating |
| `APPROVED` | Passed — `documentVerified = true` for individuals |
| `REJECTED` | Failed — see reject reason on the session |
| `EXPIRED` | Session expired without completion |

A failed or expired session does **not** clear the borrower's prior verification. Admins can always start a new session.

---

## Admin Controls

Admin users with `kyc.manage` can:

- Start a KYC session for any borrower (or specific director)
- Refresh a session's status
- Mark a borrower as manually verified when KYC cannot be used (fallback)

Admin users with `kyc.view` can see session status and reject reasons.

---

## Webhooks

The borrower portal / admin app does not need to wait for the user to come back. TrueStack sends a webhook to your deployment (`POST /api/webhooks/truestack-kyc`) to notify completion. The handler:

1. Returns **200** quickly
2. Asynchronously refreshes the session via the TrueStack API
3. Updates `TruestackKycSession`
4. Ingests images for approved sessions

If the webhook is missed (rare), the borrower's **Sync status** button and the admin's refresh action call the same refresh path.

---

## Operations & Environment

This is a deployment-level integration configured via environment variables on the backend:

| Variable | Purpose |
|----------|---------|
| `TRUESTACK_KYC_API_KEY` | Bearer key for the TrueStack public API |
| `TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL` | Public origin TrueStack can call back |
| `TRUESTACK_KYC_API_BASE_URL` | Override if not using the production URL |
| `TRUESTACK_KYC_REDIRECT_URL` | Optional redirect after KYC completion |

The full technical reference lives in `docs/borrower-pro-truestack-public-kyc.md` and the TrueStack KYC API docs.

---

## Frequently Asked Questions

### What happens if a borrower fails KYC three times?

The session records the rejection. The borrower can start a new session. There is no hard retry cap in TrueKredit itself — retries depend on TrueStack's side.

### Can KYC be skipped entirely?

KYC can be deferred until signing, and admins can mark a borrower as manually verified as a fallback, but most deployments require approved KYC before signing for compliance reasons.

### Does KYC cost money?

Yes — TrueStack KYC is billed per completed verification under your TrueStack agreement. This is **not** part of the TrueKredit Pro subscription model because Pro does not have an in-app subscription; KYC billing is handled outside the app.

### What about SaaS TrueIdentity?

SaaS TrueIdentity (per-verification, HMAC-signed, billed through the TrueStack Admin surface) is a **different** integration from this one. Pro uses the public TrueStack KYC API, not TrueIdentity. Both can theoretically coexist, but Pro deployments default to the public API.

### Where can I see which documents came from KYC?

On the borrower's **Documents** tab. Documents with `TrueStack KYC —` prefix in their original filename were imported automatically by the KYC ingestion step.

---

## Related Documentation

- [Borrower Portal Overview](?doc=borrower-portal/overview)
- [Online Applications](?doc=borrower-portal/online-applications)
- [Managing Borrowers](?doc=loan-management/managing-borrowers)
- [Digital Signing Overview](?doc=digital-signing/signing-overview)
