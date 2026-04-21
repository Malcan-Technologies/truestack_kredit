---
title: Borrower Portal Overview
order: 1
---

# Borrower Portal Overview

TrueKredit Pro ships with a first-class **borrower portal** (`borrower_pro`), deployed as your own branded application. Borrowers sign in, complete KYC, submit loan applications, receive counter-offers, digitally sign agreements, and track repayments — all without involving admin staff for routine steps.

This is a fundamental difference from TrueKredit SaaS, which has no borrower-facing portal.

---

## What the Portal Provides

| Feature | Description |
|---------|-------------|
| Self-registration | Borrowers create their own account with email / password |
| Profile & company members | Individual or corporate profile; corporate shows directors and company members |
| KYC | Integrated TrueStack KYC (scan IC, face liveness) — see [Borrower KYC](?doc=borrower-portal/borrower-kyc) |
| Borrower documents | Upload and view supporting documents; KYC result images auto-imported |
| Loan applications | Online submission with document upload; counter-offer negotiation |
| Attestation | Attestation video / meeting as configured |
| Digital signing | Obtain signing certificate and sign the loan agreement |
| Loan centre | View schedules, outstanding balance, record-of-payment, download receipts |
| Notifications | In-portal notifications for approvals, counter-offers, reminders |

The portal is **branded per client** — the logo, name, and colours come from your organisation info and per-client configuration.

---

## Who the Portal Is For

- **Individual borrowers** — personal loans
- **Corporate borrowers** — company account with one or more **company members** (directors, representatives); each director has their own KYC session tracked under the company

---

## Where the Portal Lives

The portal is a separate Next.js app inside the repo (`apps/borrower_pro/<client>`) and is deployed with its own URL, typically on a subdomain of your brand (e.g. `loans.example.com`). The admin app (`apps/admin_pro`) and borrower portal share the same backend (`apps/backend_pro`), so data is consistent between them in real time.

---

## How It Connects to the Admin App

| Event in portal | Surfaces in admin |
|-----------------|-------------------|
| Borrower registers | New borrower record with `self_registered` provenance |
| KYC completed | Borrower's KYC status updated; IC/selfie documents auto-imported |
| Application submitted | Lands in the **L1 queue** with `loanChannel = ONLINE` |
| Counter-offer responded | Updates application timeline; admin can re-review |
| Agreement signed | Loan moves into "ready for disbursement" (pending admin + witness signatures) |
| Payment recorded by borrower | Appears as a payment entry; may require approval (see Payment Approvals) |
| Document uploaded | Shows in borrower / application document list |

Admins never have to approve basic actions like "borrower registered" or "document uploaded" — those happen transparently. What requires admin action is still the approval, disbursement, and signing workflow.

---

## Permissions Required on the Admin Side

Admin users don't need special permissions to **see** online applications — they follow the same L1 / L2 permission gates as manual applications:

- `applications.view` to see them
- `applications.approve_l1`, `applications.approve_l2`, `applications.reject` to act on them

The borrower themselves is authenticated through the borrower-auth module and does not consume an admin seat.

---

## Frequently Asked Questions

### Can borrowers log in to the admin app?

No. Borrowers log in only to the borrower portal. Admin staff log in only to the admin app. The authentication namespaces are separate.

### What if a borrower can't complete KYC?

Admin staff can still manually mark a borrower as verified if the KYC flow fails. See [Managing Borrowers](?doc=loan-management/managing-borrowers).

### What happens to a borrower's portal access if we deactivate their loans?

Borrower portal access is tied to the borrower record, not the loan status. Closed or completed loans still appear in the borrower's history, but no further applications can be submitted if your deployment blocks it.

### Can one email submit applications to multiple tenants?

No. Pro is single-tenant per deployment, and the borrower portal is deployed per client. An email registered on client A's portal has nothing to do with client B.

### Does the portal have a mobile app?

Yes — `apps/borrower_pro_mobile/<client>` provides native Expo builds for clients that opt in to mobile. See your deployment's documentation for availability.

---

## Next Steps

- [Online Applications](?doc=borrower-portal/online-applications) — End-to-end online submission flow
- [Borrower KYC (TrueStack KYC)](?doc=borrower-portal/borrower-kyc) — How the KYC integration works
- [Digital Signing Overview](?doc=digital-signing/signing-overview) — What happens after approval
