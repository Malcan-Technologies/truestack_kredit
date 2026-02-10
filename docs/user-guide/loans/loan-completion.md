---
title: Loan Completion
order: 7
---

# Loan Completion

This guide explains how loans are completed in TrueKredit, including the standard completion process, what happens after completion, and how it relates to early settlement.

---

## Overview

A loan can be completed in two ways:

| Method | Trigger | Discount | Result |
|--------|---------|----------|--------|
| **Standard Completion** | All repayments fully paid, admin clicks "Complete Loan" | None | Loan status → Completed, discharge letter generated |
| **Early Settlement** | Admin initiates early settlement while loan is active | Yes (product-configured) | Remaining installments cancelled, loan status → Completed |

Both methods result in a **Completed** loan with a **Discharge Letter**.

---

## Standard Completion

### When Is a Loan Ready to Complete?

A loan is ready for standard completion when:

- All repayments in the schedule have **Paid** status
- The loan is currently **Active** or **In Arrears**

When these conditions are met:

- The **Progress** card shows a **"Ready to complete"** badge
- The **"Complete Loan"** button appears in the header
- On the loans list page, the row has a green tint and a **"Ready"** badge

### How to Complete a Loan

1. Navigate to the loan detail page
2. Verify that the **Progress** card shows "Ready to complete"
3. Click **"Complete Loan"** in the header
4. The completion dialog appears, confirming all repayments are paid
5. Optionally enter **Discharge Notes** (e.g., reason for completion, special notes)
6. Click **"Complete Loan"** to confirm

### What Happens

When you confirm:

1. Loan status changes to **Completed**
2. A **Discharge Letter** (PDF) is automatically generated
3. The loan's **repayment rate** is calculated and stored (percentage of on-time payments)
4. A completion event is recorded in the **activity timeline**
5. No further payments can be recorded

---

## After Completion

### Completed Loan Card

A green **"Loan Completed"** card appears at the top of the loan detail page showing:

- **Completion date**
- **Discharge Letter** download button
- **Repayment Rate** — The percentage of payments made on or before their due date
- **Discharge Notes** — Any notes provided during completion

### Discharge Letter

The discharge letter is generated automatically and can be downloaded from:

- The green "Loan Completed" card → **"Discharge Letter"** button
- The document is a PDF containing:
  - Company letterhead
  - Borrower details
  - Loan summary
  - Confirmation that the loan is fully settled
  - Completion date

### Loans List

On the Loans page, completed loans:

- Show a green **"COMPLETED"** status badge
- Can be filtered using the **Completed** filter button
- Show 100% progress in the progress donut

---

## Early Settlement Completion

For loans completed through early settlement, the process and result are different. The full details are covered in [Early Settlement](?doc=loans/early-settlement).

In summary:

- The admin clicks **"Early Settlement"** instead of "Complete Loan"
- The borrower receives a discount on remaining future interest
- All unpaid repayments are cancelled (shown as "Settled")
- The loan is immediately completed

### Identifying Early-Settled Loans

Early-settled loans are easily identified:

- The completed loan card shows **"Early Settlement Completed"** instead of "Loan Completed"
- An **"Early Settled"** badge appears on the loans list page
- The card shows settlement amount, discount given, and whether late fees were waived
- The activity timeline has a detailed **"Early Settlement"** event

---

## Default Recovery

If a loan is in **Defaulted** status, it cannot be directly completed or early settled. The borrower must first clear all overdue repayments (including late fees) to return the loan to **Active** status. From there, the standard completion or early settlement process can proceed.

See [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) for details on the default process and recovery.

---

## Completion Checklist

Before completing a loan, verify:

- [ ] All repayments show **Paid** status in the schedule
- [ ] The Progress card shows **"Ready to complete"**
- [ ] All outstanding late fees have been paid (included in payment allocation)
- [ ] Proof of payment is uploaded for key payments (optional but recommended)
- [ ] Discharge notes are prepared if needed

---

## What Happens to a Completed Loan

### No Further Changes

Once completed, a loan is effectively read-only:

- No new payments can be recorded
- No status changes can occur
- Late fees stop accruing
- The loan is excluded from late fee processing

### Documents Remain Available

All documents generated during the loan's lifecycle remain accessible:

- Signed agreement and stamp certificate
- Payment receipts and proof of payment
- Arrears/default letters (if any were generated)
- Discharge letter
- Lampiran A can still be generated on-demand

### Activity Timeline

The complete history of the loan remains visible in the activity timeline, providing a full audit trail from creation to completion.

---

## Frequently Asked Questions

### Can I "uncomplete" a loan?

No. Loan completion is a permanent action. Once completed, the status cannot be reversed.

### What if there are still outstanding late fees when all repayments are paid?

Late fees are included in the payment allocation process. When you record a payment with the "Apply late fees" checkbox enabled, late fees are paid first. All late fees must be cleared before repayments can reach "Paid" status, so this typically resolves itself during normal payment processing.

### Can I complete a loan that was previously defaulted?

Yes, but only after the borrower clears all overdue payments (which automatically returns the loan to Active status). Once back to Active with all repayments paid, you can proceed with standard completion.

### Is a discharge letter required by regulation?

The discharge letter serves as official confirmation that the loan obligation is fulfilled. It's best practice to provide this to borrowers and is required for proper compliance records.

### What's the difference between "Complete Loan" and "Early Settlement"?

**Complete Loan** is for loans where all repayments have been fully paid on schedule (no discount). **Early Settlement** is for loans where the borrower wants to pay off the remaining balance before all installments are due, receiving a discount on future interest. See [Early Settlement](?doc=loans/early-settlement) for the full early settlement process.
