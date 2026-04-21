---
title: The Loan Detail Page
order: 2
---

# The Loan Detail Page

This guide explains the layout and features of the loan detail page — your central hub for managing an individual loan.

---

## Overview

The loan detail page is divided into two main sections:

- **Left column (2/3 width)** — Borrower info, loan details, progress, repayment schedule, and status-specific cards
- **Right column (1/3 width)** — Quick info, letters, and activity timeline

At the top of the page, you'll find the **loan status badge** and **action buttons** relevant to the current loan state.

---

## Header & Action Buttons

The header displays:

- **Loan title** with the current status badge (e.g., Active, In Arrears, Completed)
- **Borrower name** and **product name** for quick identification

The available action buttons change depending on the loan status:

| Loan Status | Available Actions |
|-------------|-------------------|
| **Pending Disbursement** | Disburse Loan (requires agreement + stamp cert) |
| **Active** | Record Payment, Early Settlement, Complete Loan (if all paid) |
| **In Arrears** | Record Payment, Early Settlement, Mark Default |
| **Defaulted** | Record Payment |
| **Completed** | None (read-only) |

A **Refresh** button is always available to reload the latest loan data.

---

## Information Cards

Three summary cards appear at the top of the main content area:

### Borrower Card

Shows key borrower details at a glance:

- **Name** (with link to borrower profile)
- **Type** — Individual or Corporate badge
- **Verification status** — e-KYC Verified or Manual Verification
- **IC/SSM number** — Copy-to-clipboard enabled
- **Phone and email** — Copy-to-clipboard enabled
- **Bank details** — Bank name and account number (if available), useful for disbursement

For corporate borrowers, the card shows the company name with the representative's name below.

### Loan Details Card

Displays the core loan terms:

- **Principal amount** — The loan amount
- **Interest rate** and **term** in months
- **Loan schedule type** — Jadual J (no collateral) or Jadual K (with collateral) badge
- **Collateral information** (for Jadual K loans) — Type and value

Once disbursed, additional details appear:

- **Net disbursement amount** (principal minus fees)
- **Disbursement date** and **reference number**
- **Agreement date**
- **Proof of disbursement** — View or upload
- **Loan documents** — Quick access buttons for Agreement, Stamp Certificate, and Lampiran A

### Progress Card

Before disbursement, this shows "Awaiting disbursement".

After disbursement, it displays:

- **Progress donut chart** — Visual percentage of payments completed
- **Total paid** vs **total due**
- **Outstanding balance**
- **Discount info** (if early settled)
- **"Ready to complete" badge** when all payments are received

Below the donut chart, four metric tiles provide a quick snapshot:

| Metric | Description |
|--------|-------------|
| **Paid** | Number of paid repayments out of total |
| **Overdue** | Number of overdue repayments with days count |
| **Late Fees** | Total late fees accrued on this loan |
| **On-Time Rate** | Percentage of payments made on or before their due date |

---

## Status-Specific Cards

Depending on the loan's current status, additional information cards appear:

### Pending Disbursement

Two document cards are displayed:

- **Loan Agreement** — Generate PDF, upload signed copy, or view existing. Shows version number and upload date.
- **Stamp Certificate** — Link to LHDN Stamp Portal, upload certificate, or view existing.

Both must be uploaded before the Disburse button becomes active. See [Loan Disbursement](?doc=loans/loan-disbursement) for the full process.

A **Schedule Preview** table also appears showing the projected repayment schedule based on the selected disbursement date. You can change the date to see how it affects the schedule.

### Completed Loan

A green **"Loan Completed"** (or **"Early Settlement Completed"**) card shows:

- Completion date
- **Download Discharge Letter** button
- Settlement details (if early settled): amount, discount, late fee handling, and repayment rate
- Proof of payment and settlement receipt buttons (if applicable)
- Discharge notes (if provided)

### Defaulted Loan

A red **"Loan Defaulted"** card shows:

- Warning message that late interest continues to accrue
- **Overdue balance to clear default** — The exact amount the borrower must pay to return the loan to active status
- Explanation that the loan will automatically revert to active once cleared

---

## Repayment Schedule Table

After disbursement, the repayment schedule table is the main feature of the loan detail page.

### Table Columns

| Column | Description |
|--------|-------------|
| **#** | Repayment number (1, 2, 3...) |
| **Due Date** | When the payment is due. Overdue rows show a warning icon. |
| **Principal** | Principal portion of this repayment |
| **Interest** | Interest portion of this repayment |
| **Total Due** | Principal + Interest for this repayment |
| **Late Fees** | Accrued late fees for this repayment (with amount paid if any) |
| **Paid** | Total amount paid toward this repayment. Shows receipt/proof icons. |
| **Status** | PENDING, PAID, PARTIAL, OVERDUE, or SETTLED (for cancelled/early settled) |
| **Actions** | Dropdown menu to view receipts, proof of payment, or upload proof |

### Row Styling

- **Red tinted rows** — Overdue repayments (past due date and not fully paid)
- **Dimmed rows** — Cancelled/settled repayments (from early settlement)

### Legend

A legend bar above the table explains the icons:

- **Receipt icon** — A receipt has been generated for this payment
- **File check icon** — Proof of payment has been uploaded

### Next Payment Due

In the top-right corner of the schedule card, the **Next Payment Due** section shows:

- The amount due (including any late fees)
- The due date
- Whether it's overdue
- A **Record Payment** button that pre-fills the next payment amount

### Payment Actions Dropdown

For each repayment with recorded payments, click the **three-dot menu** to:

- **View Receipt** — Open the auto-generated payment receipt PDF
- **View Proof of Payment** — Open the uploaded bank slip or proof
- **Upload/Replace Proof of Payment** — Upload a new proof document

See [Recording Payments](?doc=loans/recording-payments) for detailed instructions.

---

## Quick Info Card

The right sidebar shows a **Quick Info** card with key loan metadata:

| Field | Description |
|-------|-------------|
| **Loan ID** | Truncated unique identifier |
| **Created** | Loan creation date |
| **Disbursed** | Disbursement date (if applicable) |
| **Product** | Product name (links to product detail page) |
| **Arrears Period** | Days before loan enters arrears |
| **Default Period** | Days before loan is flagged for default |
| **Late Payment Rate** | Annual rate charged on overdue amounts |
| **Lock-in Period** | Early settlement lock-in (if enabled) |
| **Settlement Discount** | Discount terms (if early settlement is enabled) |
| **Total Late Fees** | Total late fees accrued (if any) |
| **Collateral** | Type and value (for Jadual K loans) |
| **View Application** | Link to the original loan application |

### Ready for Default Indicator

If the loan has exceeded the default period, a red **"Ready for Default"** box appears in the Quick Info card, indicating the loan can be marked as defaulted.

### Letters Section

For loans in arrears or defaulted status, a **Letters** section appears showing:

- **Arrears Notice** — Download link with generation date. Button to regenerate.
- **Default Notice** — Download link with generation date. Button to regenerate.

See [Loan Documents & Reports](?doc=loans/loan-documents-reports) for details on all auto-generated documents.

---

## Activity Timeline

The **Activity Timeline** on the right sidebar provides a complete audit trail of everything that has happened to the loan. Events are shown in reverse chronological order.

### Event Types

| Event | Icon | Description |
|-------|------|-------------|
| **Loan Created** | Green plus | Loan record created from approved application |
| **Disbursed** | Green banknote | Loan funds disbursed |
| **Payment Recorded** | Blue card | Payment received and allocated (shows amount and late fee portion) |
| **Proof of Payment Uploaded** | Purple upload | Bank slip or proof document uploaded |
| **Proof of Payment Deleted** | Orange trash | Proof document removed |
| **Status Updated** | Green refresh | Loan status change (shows from/to status) |
| **Completed** | Green checkmark | Loan completed and discharged |
| **Early Settlement** | Green banknote | Full details: amount, discount, waived fees, receipt, cancelled installments |
| **Marked Default** | Red X | Loan marked as defaulted by admin |
| **Late Fees Charged** | Amber warning | Daily late fee processing (shows fee amount and affected repayments) |
| **Default Ready** | Red warning | Loan flagged as ready for default (shows days overdue) |
| **Arrears Letter Generated** | Amber file | Arrears notice letter created (auto or manual) |
| **Default Letter Generated** | Red file | Default notice letter created |
| **Discharge Letter Generated** | Green file | Discharge letter created upon completion |
| **Agreement Uploaded** | Purple file | Signed loan agreement uploaded |
| **Stamp Certificate Uploaded** | Purple shield | Stamp certificate uploaded |
| **Disbursement Proof Uploaded** | Green upload | Proof of disbursement uploaded |
| **Document Exported** | Indigo download | Lampiran A or KPKT export generated |

### Event Details

Each event shows:

- **Action label** with colored icon
- **Relative time** (e.g., "5 minutes ago")
- **User** who performed the action
- **Contextual details** — Payment amounts, status transitions, fee breakdowns, etc.
- **Exact date** at the bottom

### Load More

The timeline shows the 10 most recent events by default. Click **"Load More"** to fetch older events.

---

## Frequently Asked Questions

### Can I see the original application for a loan?

Yes. In the Quick Info card, click **"View Application"** to navigate to the loan application detail page.

### How do I know if a loan is ready to complete?

Look for the green **"Ready to complete"** badge in the Progress card. This appears when all repayments are marked as Paid. The **Complete Loan** button also appears in the header.

### What does the on-time rate show?

The on-time rate shows the percentage of repayments that were paid on or before their due date. A payment made after the due date counts as "late" even if it was only one day overdue.

### Can I download a history of all changes?

The Activity Timeline is available on-screen. Each event includes the user who performed the action, making it suitable for audit purposes.
