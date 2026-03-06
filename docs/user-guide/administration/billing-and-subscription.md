---
title: Billing & Subscription
order: 3
---

# Billing & Subscription

Manage your TrueKredit subscription, add-ons, invoices, and payments. Billing is available to **Owner** and **Admin** roles only.

---

## Overview

TrueKredit uses a monthly subscription model:

- **Core plan** — Base loan management, compliance, and schedules (RM 499/month)
- **Add-ons** — TrueSend™ (automated emails) and TrueIdentity™ (e-KYC verification)
- **Extra loan blocks** — For tenants with more than 500 active loans

Billing periods use **same-day boundaries** (e.g. 3 Mar – 3 Apr). The last day of your subscription is the day before the renewal date; payment is due on the renewal date.

---

## Where to Manage Billing

| Page | Purpose |
|------|---------|
| **Billing** | View subscription status, invoices, payment history, and download receipts |
| **Plan** | Overview of your Core plan, loan usage, and add-on status |
| **Subscription** | Choose plan, toggle add-ons (TrueSend, TrueIdentity), and proceed to payment |

### Quick Links

- **Billing** → Sidebar under **Administration**
- **Plan** → Sidebar under **Administration**, or from Billing card
- **Subscription** → From Billing ("Choose plan") or Plan ("Manage" add-ons)

---

## Subscription Statuses

| Status | Meaning |
|--------|---------|
| **FREE** | Not yet subscribed. Choose a plan to get started. |
| **PAID** | Subscription active. Full access to all features. |
| **OVERDUE** | Payment past due. Reactivate by making payment. |
| **SUSPENDED** | Access restricted. Contact support. |

---

## Summary Card (Receipt Style)

The Subscription page shows a **summary card** that displays only what you need to pay:

### When Payment Is Due (Renewal or Overdue)

The summary shows a receipt-style breakdown:

- **Core plan** — Base subscription amount
- **TrueSend™** — If selected (not yet on invoice)
- **Subtotal** — Sum of line items
- **SST (8%)** — Service tax
- **Due now** — Total amount to pay

Click **Make payment now** to proceed.

### When Already Paid (Active Subscription)

- **No payment required right now** — Your subscription is active
- Next billing date and amount shown for reference

### When Adding TrueSend Mid-Cycle

If you enable TrueSend during an active period:

- **First time** (never had TrueSend before): Prorated amount (remaining days / total days)
- **Re-subscribing** (had TrueSend before, then cancelled): Full month charge (RM 50)

The summary shows **TrueSend™**, **Subtotal**, **SST**, and **Due now**.

### New Subscribers (FREE)

The summary shows your selection: Core plan, add-ons, Subtotal, SST, Total. Click **Proceed to payment** to subscribe.

---

## Add-Ons

### TrueSend™

- **Price:** RM 50/month (billed with Core plan)
- **Coverage:** Up to 500 active loans per block
- **Toggle:** Subscription page — switch reflects backend status. If activated in the system, the switch shows as on.

Enable or disable from the Subscription page. Changes take effect after payment (or at period end if disabling).

### TrueIdentity™

- **Price:** RM 4 per verification (pay-per-use)
- **Toggle:** Subscription page — switch reflects backend status. If activated in the system, the switch shows as on.

No monthly fee. Enable or disable from the Subscription page. Usage is charged per completed verification.

---

## Invoices & Payment

### Invoice Types

| Type | When |
|------|------|
| **First subscription** | Initial sign-up |
| **Renewal** | Monthly renewal at period end |
| **Add-on purchase** | Adding TrueSend mid-cycle |

### Payment Flow

1. Go to **Billing** or **Subscription**
2. Click **Choose plan** (if not subscribed) or **Make payment now** (if renewal/overdue)
3. Complete payment via the payment page
4. For bank transfer: submit proof; Admin verifies within 1 business day

### Downloading Invoices & Receipts

1. Go to **Billing**
2. In the **Invoices** table, click **Download** for the invoice or receipt you need

---

## Billing Period & Renewal

- Billing periods align to **Malaysia time (MYT)**
- Example: 3 Mar – 3 Apr means 2 Apr is the last day of access; 3 Apr is when payment is due
- Renewal invoices are generated automatically when the period ends
- A **14-day grace period** may apply before the account is marked overdue

---

## Frequently Asked Questions

### How do I add TrueSend or TrueIdentity?

Go to **Subscription** (from Billing or Plan). Toggle the add-on on, then click **Proceed to payment** or **Make payment now** as applicable.

### Why doesn't the summary show amounts when I'm already paid?

The summary only shows **what you need to pay**. When your subscription is active and nothing is due, it shows "No payment required right now" instead of a breakdown.

### How do add-on switches work?

The TrueSend and TrueIdentity switches reflect the **backend/DB status**. If an add-on is active in the system, the switch is on. Toggle to enable or disable; changes require payment or take effect at period end.

### Is TrueSend prorated when I add it mid-cycle?

**First time only.** When you add TrueSend for the first time during an active billing period, you pay a prorated amount (remaining days in the period). If you had TrueSend before and cancelled it, re-subscribing mid-cycle charges the full month (RM 50). This prevents abuse of the unsubscribe–resubscribe cycle.

### Where do I see my invoices?

Go to **Billing** and scroll to the **Invoices** section. Download PDFs from there.

### What if my subscription is overdue?

Go to **Billing** or **Subscription**. You'll see an overdue notice with a **Go to payment** or **Make payment now** button. Payment will include Core plan plus any selected add-ons.

---

## Related Documentation

- [TrueSend™](?doc=add-ons/automated-emails) — Automated email delivery
- [TrueIdentity](?doc=add-ons/trueidentity) — e-KYC verification
- [Dashboard Overview](?doc=dashboard/dashboard-overview) — Billing status card
- [Roles & Permissions](?doc=getting-started/roles-and-permissions) — Who can access billing
