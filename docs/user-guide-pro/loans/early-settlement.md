---
title: Early Settlement
order: 6
---

# Early Settlement

This guide explains how the early settlement feature works in TrueKredit Pro, allowing borrowers to pay off their loan balance early in exchange for a discount on remaining interest.

> **Pro-specific:** in Pro, borrowers can **request** an early settlement from the borrower portal. These requests land in **Dashboard → TrueKredit Pro → Early Settlement Approvals** and need a user with `early_settlement.approve` to finalise the settlement. Admin-initiated early settlements (the flow below) apply the same rules but skip the approval queue when the caller holds both `early_settlement.request` and `early_settlement.approve`.

---

## Overview

Early settlement lets an authorised user trigger a one-time full repayment of all outstanding loan balance, offering the borrower a discount on future interest as an incentive. When confirmed, the loan is immediately marked as **Completed** and a discharge letter is generated.

| Step | What Happens | Who Acts |
|------|-------------|----------|
| **Configure Product** | Enable early settlement and set discount terms | Admin (one-time setup) |
| **Request Quote** | System calculates the settlement amount with discount | Admin clicks "Early Settlement" on loan |
| **Review & Confirm** | Admin reviews breakdown, optionally waives late fees | Admin confirms settlement |
| **Loan Completed** | All remaining repayments are cancelled, loan is completed | Automatic |

---

## Product Configuration

Early settlement must be enabled per loan product. You configure the terms when creating or editing a product.

### Settings

| Setting | Description | Example |
|---------|-------------|---------|
| **Enable Early Settlement** | Master toggle to allow early settlement for loans under this product | On / Off |
| **Lock-in Period** | Minimum number of months the loan must exist before early settlement is available | 3 months |
| **Discount Type** | How the discount is calculated — as a percentage of remaining future interest, or a fixed RM amount | Percentage / Fixed Amount |
| **Discount Value** | The discount percentage (0–100%) or fixed RM amount | 20% or RM 500 |

### How to Configure

1. Navigate to **Products** in the sidebar
2. Click **"Create Product"** or edit an existing product
3. In **Step 2: Rates & Fees**, scroll to the **"Early Settlement Configuration"** section
4. Toggle **"Enable Early Settlement"** on
5. Set the **Lock-in Period** (e.g., 3 months — leave at 0 for no lock-in)
6. Choose the **Discount Type**: Percentage or Fixed Amount
7. Enter the **Discount Value**
8. Continue through the remaining steps and save

Once configured, all new and existing loans under this product will be eligible for early settlement (subject to the lock-in period and loan status).

---

## Eligibility

A loan is eligible for early settlement when **all** of the following conditions are met:

- The loan product has **early settlement enabled**
- The loan status is **Active** or **In Arrears**
- The loan has at least one **unpaid repayment** remaining
- The **lock-in period has expired** (if one is configured)

If any condition is not met, the "Early Settlement" button will not appear on the loan detail page.

### Lock-in Period

The lock-in period is calculated from the loan's **disbursement date**. For example, if a loan was disbursed on 1 January 2026 with a 3-month lock-in, early settlement becomes available from 1 April 2026 onwards.

If the loan is still within the lock-in period, the settlement dialog will show a message indicating when the lock-in expires.

---

## How to Perform Early Settlement

### Step 1: Navigate to the Loan

1. Go to **Loans** in the sidebar
2. Click on the loan you want to settle early
3. The loan must be in **Active** or **In Arrears** status

### Step 2: Click "Early Settlement"

In the action buttons area at the top of the loan detail page, click the **"Early Settlement"** button. This opens the settlement dialog and automatically fetches a quote.

### Step 3: Review the Quote

The settlement dialog displays a detailed breakdown:

| Line Item | Description |
|-----------|-------------|
| **Remaining Principal** | Total outstanding principal across all unpaid repayments |
| **Remaining Interest** | Total outstanding interest across all unpaid repayments |
| **Discount** | The discount applied to future interest (based on product configuration) |
| **Outstanding Late Fees** | Any accrued late fees not yet paid |
| **Total Settlement** | The final amount the borrower needs to pay |
| **Total Savings** | How much the borrower saves through early settlement |

### Step 4: Choose Late Fees Handling

If there are outstanding late fees, you'll see a **"Waive late fees"** checkbox. When checked:

- Outstanding late fees are excluded from the settlement amount
- The late fees are marked as paid (waived) in the system
- This reduces the total amount the borrower needs to pay

This gives you flexibility to either include or waive late fees as part of the settlement negotiation.

### Step 5: Enter Payment Details

Fill in the following fields:

- **Payment Date** — Defaults to today, but can be set to a past date if the payment was already received
- **Payment Reference** — Bank reference, transaction ID, or any identifier for the payment
- **Notes** — Optional notes about the settlement (e.g., reason, special arrangements)

### Step 6: Confirm

Click **"Confirm Early Settlement"** to process the settlement. This action:

1. Creates a payment transaction for the full settlement amount
2. Allocates the payment across all remaining unpaid repayments
3. Changes all unpaid repayments to **Cancelled** (settled) status
4. If late fees are waived, marks them as paid
5. Updates the loan status to **Completed**
6. Generates a **Discharge Letter** (PDF)
7. Records an **audit trail** entry with the full settlement breakdown

This action cannot be undone — once confirmed, the loan is completed.

---

## After Settlement

### Loan Status

The loan immediately moves to **Completed** status. On the loans list page, completed loans that were settled early display an **"Early Settled"** badge next to their status.

### Repayment Table

After early settlement, the repayment schedule table shows:

- **Previously paid** repayments retain their **Paid** status
- **Remaining unpaid** repayments are changed to **Settled** status (displayed with dimmed styling)
- The settled repayments show the original amounts but are clearly marked as no longer outstanding

### Discharge Letter

A discharge letter is automatically generated when the settlement is confirmed. It can be downloaded from the loan detail page under **Quick Info → Letters → Discharge Letter**.

### Audit Trail

The loan's timeline/audit trail shows a detailed **Early Settlement** event including:

- Settlement amount
- Discount amount and type
- Number of repayments settled
- Whether late fees were waived
- Payment reference and date
- Admin notes

### Completed Loan Info

The loan detail page shows an **"Early Settlement Completed"** section with:

- Settlement date
- Total settlement amount paid
- Discount received
- Whether late fees were waived
- Admin notes (if any)

---

## How the Discount is Calculated

The discount is applied to **future interest only** — that is, interest on repayments that have not yet reached their due date. Interest on overdue repayments (already past due) is not discounted.

### Percentage Discount

If the product is configured with a percentage discount:

```
Discount = Remaining Future Interest × (Discount Percentage ÷ 100)
```

**Example:**

- Remaining future interest: RM 2,000
- Discount: 20%
- Discount amount: RM 2,000 × 20% = **RM 400**

### Fixed Amount Discount

If the product is configured with a fixed discount:

```
Discount = min(Fixed Amount, Remaining Future Interest)
```

The fixed amount is capped at the total remaining future interest to prevent negative settlement amounts.

**Example:**

- Remaining future interest: RM 2,000
- Fixed discount: RM 500
- Discount amount: **RM 500**

### Complete Settlement Calculation

```
Settlement = Remaining Principal + Remaining Interest − Discount + Late Fees (if not waived)
```

**Full Example:**

- Remaining principal: RM 8,000
- Remaining interest: RM 2,500
- Discount (20% of RM 2,000 future interest): RM 400
- Outstanding late fees: RM 50
- Late fees waived: No

```
Settlement = RM 8,000 + RM 2,500 − RM 400 + RM 50 = RM 10,150
Savings = RM 400
```

If late fees are waived:

```
Settlement = RM 8,000 + RM 2,500 − RM 400 + RM 0 = RM 10,100
Savings = RM 400 + RM 50 (waived) = RM 450 effective savings
```

---

## Impact on Other Features

### Late Fees

- After early settlement, **no more late fees** are accrued on the loan
- Cancelled repayments are excluded from the daily late fee processing
- If late fees were waived, they are recorded as paid in the system

### Arrears & Default

- After early settlement, the loan is no longer considered in arrears or default
- Cancelled repayments are excluded from arrears/default calculations
- If a loan was in arrears, the early settlement clears this status

### Normal Payments

- Once a loan is completed via early settlement, no further payments can be recorded
- The payment recording system correctly skips cancelled repayments

### Loan Metrics

- Cancelled repayments are counted as "settled" in the loan's progress bar
- The loans list shows 100% progress after early settlement
- On-time/late payment metrics only count actually-paid repayments, not cancelled ones

---

## Frequently Asked Questions

### Can I early settle a defaulted loan?

No. Early settlement is only available for **Active** and **In Arrears** loans. Defaulted loans must first be managed through the standard default recovery process. If you wish to settle a defaulted loan early, you would need to reactivate it first by clearing the overdue payments.

### What if the borrower is still in the lock-in period?

The "Early Settlement" button will appear but the dialog will show a message indicating the lock-in end date. You cannot proceed until the lock-in period has passed.

### Can I change the discount after confirming?

No. Once confirmed, the early settlement is final and cannot be modified. The settlement amount and discount are locked at the time of confirmation. Always review the quote carefully before confirming.

### What happens to partial payments already made?

Partial payments are fully accounted for. The settlement quote calculates the remaining balance after deducting all previous payments. The borrower only pays what is still outstanding (minus the discount).

### Does the discount apply to all interest?

No. The discount applies only to **future interest** — interest on repayments that have not yet reached their due date. Interest on repayments that are already overdue is not discounted, as it is considered earned interest.

### Can I waive late fees separately from early settlement?

The late fee waiver is part of the early settlement process. There is no standalone late fee waiver feature. If you want to waive late fees on a loan that is not being settled early, the borrower must pay the regular amount.

### Will the borrower receive a notification?

Currently, the early settlement process does not automatically send notifications to the borrower. The admin should communicate the settlement terms directly and provide the discharge letter once the settlement is confirmed.

### What if two admins try to settle the same loan simultaneously?

The system processes the settlement in a database transaction. If two requests arrive simultaneously, only the first one will succeed. The second will fail because the loan status has already changed to Completed.

### Where can I see all early-settled loans?

On the **Loans** list page, completed loans that were settled early display an **"Early Settled"** badge. You can filter by **Completed** status to see all completed loans and identify the early-settled ones by their badge.

### How does early settlement appear in Lampiran A?

The [Lampiran A](?doc=compliance/lampiran-a) repayment table shows the final settlement payment with an annotation indicating the interest rebate amount (e.g., "rebat faedah: -RM 400.00"). The running balance correctly reaches zero after accounting for the discount.

---

## Related Documentation

- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — How the early settlement discount is reflected in the Lampiran A ledger
- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all compliance and data export features
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — How late fees interact with early settlement
