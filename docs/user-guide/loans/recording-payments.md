---
title: Recording Payments
order: 4
---

# Recording Payments

This guide explains how to record repayments against a loan, how the system allocates payments, and how to manage proof of payment.

---

## Overview

Payments are recorded at the **loan level**, and the system automatically allocates them to the appropriate repayments in chronological order. This means:

- A single payment can cover one or multiple installments
- Overpayments automatically spill over to the next installment
- Underpayments create a **partial** status on the current repayment
- Late fees are paid first before the repayment amount (when applicable)

---

## Recording a Payment

### Step 1: Open the Payment Dialog

From the loan detail page, click the **"Record Payment"** button. This can be found:

- In the **header** action buttons (for Active or In Arrears loans)
- In the **repayment schedule** card (next to "Next Payment Due")

The dialog pre-fills the next payment amount based on the outstanding balance of the first unpaid repayment (including any late fees).

### Step 2: Enter Payment Details

| Field | Description | Required |
|-------|-------------|----------|
| **Amount (RM)** | The payment amount received from the borrower | Yes |
| **Payment Date** | The date the payment was received. Defaults to today. | Yes |
| **Reference** | Bank transaction reference or ID | No |
| **Notes** | Additional notes about the payment | No |
| **Bank Slip** | File upload for proof of payment (PDF, JPG, PNG, WebP) | No |
| **Apply late fees** | Checkbox to include late fee allocation (shown when overdue) | Yes (default on) |

### Step 3: Confirm

Click **"Record Payment"** to process. A success message confirms the payment was recorded.

If the payment was allocated across multiple installments (prepayment), the message specifies how many installments were covered.

---

## Payment Allocation

When a payment is received, the system allocates it following a strict priority order for each repayment:

| Priority | Allocation | Description |
|----------|-----------|-------------|
| **1st** | Late Fees | Outstanding late fees on the repayment are paid first |
| **2nd** | Interest | Interest portion of the repayment |
| **3rd** | Principal | Principal portion of the repayment |

### Single Installment Payment

If the borrower pays exactly the next installment amount (plus any late fees), it is applied to that single repayment.

**Example:**

- Monthly repayment: RM 1,000 (RM 900 principal + RM 100 interest)
- Outstanding late fees: RM 15
- Borrower pays: RM 1,015

```
Allocation:
  Late Fees:  RM 15.00
  Interest:   RM 100.00
  Principal:  RM 900.00
  Status:     PAID
```

### Prepayment / Overpayment

If the borrower pays more than the current installment, the excess automatically spills over to the next installment(s).

**Example:**

- Monthly repayment: RM 1,000 each
- Borrower pays: RM 2,500

```
Installment 1: RM 1,000 → PAID
Installment 2: RM 1,000 → PAID
Installment 3: RM 500   → PARTIAL (RM 500 remaining)
```

The success message confirms: "Payment recorded and allocated across 3 installments."

### Partial Payment

If the borrower pays less than the full installment amount, the repayment is marked as **PARTIAL**.

**Example:**

- Monthly repayment: RM 1,000
- Outstanding late fees: RM 15
- Borrower pays: RM 500

```
Allocation:
  Late Fees:  RM 15.00
  Interest:   RM 100.00
  Principal:  RM 385.00
  Remaining:  RM 500.00
  Status:     PARTIAL
```

The remaining RM 500 stays outstanding and is visible in the repayment schedule.

### Late Fee Handling

When the **"Apply late fees"** checkbox is checked (default):

- Late fees are deducted first from the payment amount
- The remainder is applied to interest and principal

If the checkbox is unchecked:

- The payment is applied directly to the repayment (interest first, then principal)
- Late fees remain outstanding

This checkbox only appears when there are overdue repayments.

For full details on how late fees work, see [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default).

---

## Clearing a Defaulted Loan

When a payment is made on a **defaulted loan** that covers all overdue repayments (including late fees):

- The loan status automatically changes from **Defaulted** back to **Active**
- A success message confirms: "Payment recorded — default cleared! Loan is now active again."
- A status change event is recorded in the activity timeline

This is the standard way to recover a defaulted loan without needing a separate admin action.

---

## Proof of Payment

### Uploading During Payment

When recording a payment, you can attach a bank slip or proof document in the **"Bank Slip"** field. This is uploaded alongside the payment record.

### Uploading After Payment

If you didn't upload proof at the time of payment:

1. Find the repayment in the schedule table
2. Click the **three-dot menu** (⋯) in the Actions column
3. Click **"Upload Proof of Payment"**
4. Select the file and confirm

### Viewing Proof

1. Click the **three-dot menu** on the repayment row
2. Click **"View Proof of Payment"** to open it in a new tab

### Replacing Proof

1. Click the **three-dot menu**
2. Click **"Replace Proof of Payment"**
3. Select the new file

### Visual Indicators

The repayment schedule uses icons to indicate document status:

- **Receipt icon** — An auto-generated receipt exists for this payment
- **File check icon** — Proof of payment has been uploaded by an admin

---

## Payment Receipts

Every time a payment is recorded, the system **automatically generates a receipt** (PDF). Receipts are created without any additional admin action.

### Viewing Receipts

1. On the repayment schedule table, find the repayment with a recorded payment
2. Click the **three-dot menu** (⋯) in the Actions column
3. Click **"View Receipt"** to open the PDF in a new tab

### Multiple Payments Per Repayment

If multiple partial payments are made against the same repayment, each payment gets its own receipt. The dropdown menu lists all payments chronologically:

```
Payment 1: RM 500.00 — 15 Jan 2026
  → View Receipt
  → View Proof of Payment

Payment 2: RM 515.00 — 25 Jan 2026
  → View Receipt
  → Upload Proof of Payment
```

---

## Repayment Statuses

After payment allocation, each repayment can have one of these statuses:

| Status | Description |
|--------|-------------|
| **Pending** | Payment not yet due and no payment recorded |
| **Paid** | Full amount received (repayment is complete) |
| **Partial** | Some amount received but not the full repayment |
| **Overdue** | Past the due date with outstanding balance |
| **Settled** | Cancelled via early settlement (displayed as "SETTLED" instead of "CANCELLED") |

---

## Tips for Recording Payments

### Pre-filled Amount

The payment dialog pre-fills with the amount needed to fully pay the next unpaid installment, including any outstanding late fees. This is the most common scenario and saves time.

### Bulk Payments

If a borrower makes a lump sum covering multiple months, enter the full amount in a single payment. The system handles allocation across installments automatically.

### Backdated Payments

Use the **Payment Date** field to record payments received on past dates. This is useful when processing batch payments or when a payment was received but not immediately recorded.

### Reference Numbers

Always enter a bank reference number when available. This helps with reconciliation and creates a clear audit trail linking the payment to the bank transaction.

---

## Frequently Asked Questions

### What happens if I enter the wrong payment amount?

Currently, recorded payments cannot be reversed or deleted through the UI. Contact your system administrator if a correction is needed.

### Can I record a payment for a specific installment?

No. Payments are always recorded at the loan level and allocated chronologically starting from the oldest unpaid repayment. This ensures consistent and auditable allocation.

### What if the borrower pays more than the total outstanding?

The system allocates the payment across all remaining installments. If the payment exceeds the total remaining balance, the excess cannot be allocated.

### Are late fees always deducted first?

Yes, by default. Late fees take priority in the allocation order (late fees → interest → principal). You can uncheck the "Apply late fees" checkbox if you want to skip late fee allocation for a specific payment.

### Can I record payments on a completed loan?

No. Once a loan is completed, the payment recording system is disabled. No further payments can be accepted.

### How do I know the total outstanding for a loan?

The **Progress** card on the loan detail page shows the total due, total paid, and outstanding balance. The **Next Payment Due** section in the repayment schedule header shows the immediate next payment needed.
