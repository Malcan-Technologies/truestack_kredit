# Internal Billing Behavior

Date: 2026-03-10

This document records the intended billing behavior for TrueStack Kredit so future code changes do not accidentally alter it.

---

## Core Principles

1. Subscription and billing payments are approval-based.
2. Late or unpaid renewal invoices do not automatically cancel a subscription.
3. The billing cycle must not shift forward just because a renewal is paid late.
4. Cancellation is an explicit admin/manual action, not an automatic consequence of late payment.

---

## Intended Payment Behavior

### New subscriptions

- A new subscription creates:
  - an `Invoice`
  - a `SubscriptionPaymentRequest`
- The request is sent to the admin system for review.
- The tenant should not be treated as fully subscribed until the payment request is approved.

### Renewal payments

- Renewal invoices are generated automatically when the current billing period ends.
- If a tenant pays late, the renewal approval must preserve the invoice's original billing period.
- The renewal period should continue from the previous period end, not from the approval date.
- This ensures unpaid days are still counted as billable usage and are not given away for free.

### Add-on purchases

- Add-on purchases also follow the payment-request approval flow.
- First-time mid-cycle TrueSend activation is prorated against the current billing period.
- Re-subscribing to TrueSend after a previous cancellation is charged as a full period, not re-prorated.

### Manual payment recording

- `POST /api/billing/payments` is an admin-only/manual payment recording path.
- It is separate from the standard approval flow.
- It immediately creates a receipt and marks the invoice as paid.
- This route should be treated as an operational override/fallback, not the primary billing flow.

---

## Intended Late Payment Behavior

### Overdue handling

- When a renewal invoice is unpaid past its due window, the tenant becomes `OVERDUE`.
- Overdue status does not equal cancellation.
- The tenant can remain overdue until payment is settled or an authorized admin/manual cancellation is processed.

### No automatic cancellation for non-payment

- Non-payment does not automatically cancel the subscription.
- Late payment does not automatically cancel the subscription.
- Rejected proof of payment does not automatically cancel the subscription.
- The system may move invoices between `ISSUED`, `PENDING_APPROVAL`, and `OVERDUE`, but that alone must not cancel the tenant.

### Cancellation

- Cancellation happens only through explicit admin/manual action.
- The billing endpoint supporting this is `POST /api/billing/cancel`.
- Immediate cancellation is restricted and intentional.
- Future changes must not introduce auto-cancellation on overdue or rejected renewal payments unless product requirements change.

---

## Billing Cycle Rules

### Renewal cycle anchoring

- For renewals, the authoritative period is the invoice/request period.
- Admin approval for a renewal must keep:
  - `periodStart` = the renewal invoice period start
  - `periodEnd` = the renewal invoice period end
- Approval time must not become the new renewal anchor for overdue renewals.

### First subscription anchoring

- First subscription approval can anchor from the approval date.
- This rule applies only to first subscription behavior, not renewal behavior.

### Month-end handling

- Month additions must use end-of-month clamping.
- Examples:
  - Jan 31 -> Feb 28/29
  - Aug 31 -> Sep 30
- Raw `setMonth()` usage should not be used for billing-period transitions.

---

## What Was Verified During The 2026-03-10 Billing Fixes

- The renewal approval path still preserves the renewal period instead of shifting to approval date.
- The fixes only changed:
  - month-end safety
  - safe financial math
  - credit note precision
  - underpayment validation for manual payment recording
  - consistent overdue date-boundary handling
- The fixes did not introduce:
  - auto-cancellation for overdue accounts
  - renewal-cycle reset on late approval
  - removal of admin approval from the normal payment flow

---

## Guardrails For Future Changes

- Do not convert renewal approval to "start from approval date".
- Do not auto-cancel tenants simply because an invoice becomes overdue.
- Do not remove the admin approval step from subscription and add-on payment requests unless product requirements explicitly change.
- Keep user-facing docs aligned with this document whenever billing behavior changes.
