---
title: Managing Loans
order: 1
---

# Managing Loans

This guide explains how to view, manage, and track loans throughout their lifecycle in TrueKredit. From the moment a loan application is approved to final completion, every step is tracked and manageable from the Loans module.

---

## Loan Lifecycle Overview

Every loan follows a predictable lifecycle. Understanding the stages helps you manage loans efficiently.

| Stage | Status | Description |
|-------|--------|-------------|
| **Created** | Pending Disbursement | Application approved, loan created. Awaiting agreement, stamp certificate, and disbursement. |
| **Disbursed** | Active | Funds released to borrower. Repayment schedule generated. Monthly payments begin. |
| **Overdue** | Active (with overdue repayments) | One or more payments missed their due date. Late fees begin accruing. |
| **In Arrears** | In Arrears | An overdue repayment exceeds the product's arrears period. Arrears notice generated. |
| **Default Ready** | In Arrears (flagged) | An overdue repayment exceeds the product's default period. Ready for admin to mark as defaulted. |
| **Defaulted** | Defaulted | Admin has manually marked the loan as defaulted. Default notice generated. Late fees continue. |
| **Completed** | Completed | All repayments fully paid (or early settled). Discharge letter generated. |

---

## Loan Statuses Explained

### Pending Disbursement

The loan has been created from an approved application but has not yet been funded. During this stage:

- A **loan agreement** must be generated and uploaded (signed copy)
- A **stamp certificate** from LHDN must be uploaded
- A **schedule preview** is available showing the projected repayment plan
- The **Disburse Loan** button is disabled until both documents are uploaded

See [Loan Disbursement](?doc=loans/loan-disbursement) for step-by-step instructions.

### Active

The loan has been disbursed and the borrower is making repayments according to the schedule. The repayment schedule is generated upon disbursement and payments can be recorded against it.

### In Arrears

One or more repayments have been overdue beyond the product's **arrears period** (e.g., 14 days). The system automatically:

- Changes the loan status to In Arrears
- Generates an **Arrears Notice Letter** (PDF)
- Records the event in the audit trail

See [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) for full details on the arrears process.

### Defaulted

An admin has manually marked the loan as defaulted after the default period was exceeded. This generates a **Default Notice Letter** and is recorded in the audit trail. Late fees continue to accrue.

**Important:** The system never automatically defaults a loan — this is always an admin decision.

If a borrower clears all overdue repayments (including late fees) on a defaulted loan, the status automatically reverts to **Active**.

See [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) for full details.

### Completed

All repayments have been fully paid (or the loan was settled early). A **Discharge Letter** is generated and the loan is closed. No further payments can be recorded.

Loans that were completed via early settlement show an **"Early Settled"** badge. See [Early Settlement](?doc=loans/early-settlement) for details.

---

## The Loans List Page

Navigate to **Loans** in the sidebar to see all loans across your organization.

### Table Columns

| Column | Description |
|--------|-------------|
| **Borrower** | Name (or company name for corporate), IC/SSM number. Click to view loan details. |
| **Type** | Individual or Corporate badge |
| **Product** | The loan product name |
| **Principal** | Loan principal amount |
| **Rate** | Annual interest rate |
| **Term** | Repayment period in months |
| **Progress** | Visual donut chart showing paid/total repayments. Green checkmark when ready to complete. |
| **Late Fees** | Outstanding unpaid late fees. Shows "Settled" if all late fees are paid. |
| **Status** | Current loan status badge with additional badges for "Early Settled", "Ready", or "Default Ready" |
| **Disbursed** | Disbursement date |
| **Actions** | View button to open the loan detail page |

### Sorting

Click any column header to sort by that column. Click again to reverse the sort order. Click a third time to clear the sort.

### Searching

Use the search bar to find loans by **borrower name**, **IC number**, or **company name**. The search is debounced — results update automatically as you type.

### Status Filters

Use the filter buttons to quickly narrow down the loans list:

| Filter | What It Shows |
|--------|---------------|
| **All** | All loans regardless of status |
| **Active** | Only active loans (in good standing) |
| **In Arrears** | Loans with overdue repayments beyond the arrears period |
| **Defaulted** | Loans marked as defaulted |
| **Completed** | Fully paid or early settled loans |

### Action Needed Filters

A separate set of filters highlights loans requiring admin attention:

| Filter | What It Shows |
|--------|---------------|
| **Pending Disbursement** | Loans waiting to be disbursed. Badge count shows total. |
| **Ready to Complete** | Loans where all repayments are paid but not yet formally completed. Badge count shows total. |
| **Ready for Default** | Loans that have exceeded the default period and can be marked as defaulted. Badge count shows total. |

### Status Bar

When loans are in arrears or ready for default, a **warning bar** appears at the top of the page showing the count of affected loans.

### Row Highlighting

Loan rows are highlighted based on their state:

- **Green tint** — Ready to complete (all payments received)
- **Red tint** — Ready for default (overdue beyond default period)
- **Amber tint** — Pending disbursement

---

## Processing Late Fees

The **Process Late Fees** button in the top-right corner of the Loans page allows you to manually trigger late fee processing for all overdue loans in your organization.

Late fees are also **automatically processed daily at 12:30 AM Malaysian time (GMT+8)**.

After processing, a toast message confirms how many loans were processed and how many fees were charged. The "Last run" timestamp below the button shows when fees were last processed.

See [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) for complete details on how late fees work.

---

## Navigating to a Loan

Click on any borrower name in the loans list, or click the **View** button, to open the **Loan Detail Page**.

The loan detail page is where you perform all loan management actions:

- [Disbursing a loan](?doc=loans/loan-disbursement)
- [Recording payments](?doc=loans/recording-payments)
- [Viewing documents and reports](?doc=loans/loan-documents-reports)
- [Completing or settling a loan](?doc=loans/loan-completion)

---

## Frequently Asked Questions

### How do I create a new loan?

Loans are created through the **Applications** workflow. Navigate to **Applications** and create a new loan application. Once approved, a loan record is automatically created with "Pending Disbursement" status. See [Loan Applications](?doc=loan-management/loan-applications) for details.

### Can I edit a loan's terms after creation?

No. Loan terms (amount, rate, term) are locked at the time of application approval. To change terms, you would need to create a new application.

### What's the difference between "In Arrears" and "Defaulted"?

"In Arrears" is an automatic status when overdue payments exceed the arrears period. "Defaulted" is a manual action taken by an admin after reviewing the loan. See [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) for the full escalation process.

### Can a defaulted loan go back to active?

Yes. If a borrower clears all overdue repayments (including any outstanding late fees) on a defaulted loan, the system automatically changes the status back to Active.

### Where can I see all early-settled loans?

Use the **Completed** filter on the Loans page. Loans completed via early settlement display an "Early Settled" badge next to their status.
