---
title: Reports
order: 5
---

# Reports

The Reports tab on the [Compliance & Exports](?doc=compliance/compliance-overview) page provides operational reports for monitoring loan performance, identifying overdue accounts, and tracking collection activity.

---

## Portfolio Summary Report

### What It Shows

A high-level overview of your entire loan portfolio, including:

| Metric | Description |
|--------|-------------|
| **Total Loans** | Total number of loans in the system |
| **Active Loans** | Loans currently active and in good standing |
| **In Arrears** | Loans with overdue payments |
| **Completed Loans** | Fully repaid or early-settled loans |
| **Defaulted Loans** | Loans that have entered default status |
| **Total Disbursed** | Sum of all principal amounts disbursed |
| **Total Outstanding** | Sum of all remaining loan balances |
| **Total Collected** | Sum of all payments received |

### How to Export

1. Go to **Compliance & Exports** and select the **Reports** tab
2. Find the **"Portfolio Summary"** card
3. Click **"Export Portfolio Report"**
4. A CSV file with the portfolio breakdown is downloaded

---

## Overdue / NPL Report

### What It Shows

A detailed list of all loans that currently have overdue repayments. This report is essential for monitoring non-performing loans (NPL) and taking timely collection action.

Each row represents a loan with at least one overdue repayment:

| Column | Description |
|--------|-------------|
| **Loan Reference** | Loan identifier |
| **Borrower** | Borrower name |
| **Borrower IC** | Identification number |
| **Product** | Loan product |
| **Principal** | Original loan amount |
| **Outstanding Balance** | Current remaining balance |
| **Overdue Repayments** | Number of repayments past due |
| **Total Overdue** | Sum of overdue repayment amounts |
| **Oldest Overdue Date** | Due date of the earliest unpaid repayment |
| **Days Overdue** | Days since the oldest overdue repayment |
| **Status** | Current loan status (Active, In Arrears, or Defaulted) |
| **Phone** | Borrower contact number for follow-up |

### How to Export

1. Go to **Compliance & Exports** and select the **Reports** tab
2. Find the **"Overdue / NPL Report"** card
3. Click **"Export Overdue Report"**
4. A CSV file with all overdue loans is downloaded

This report includes loans in **Active**, **In Arrears**, and **Defaulted** status — any loan with at least one overdue repayment appears here.

---

## Collection Summary Report

### What It Shows

A monthly breakdown of payment collection performance over a configurable time period. This helps you track how much you're collecting each month and compare against expectations.

Each row represents a month:

| Column | Description |
|--------|-------------|
| **Month** | Calendar month (e.g., "Jan 2026") |
| **Payments Received** | Number of payment transactions |
| **Total Collected** | Sum of all payments in that month |
| **Principal Collected** | Principal portion of payments |
| **Interest Collected** | Interest portion of payments |
| **Late Fees Collected** | Late fee portion of payments |

### How to Export

1. Go to **Compliance & Exports** and select the **Reports** tab
2. Find the **"Collection Summary"** card
3. Select the **time period** — 3 months, 6 months, or 12 months (defaults to 6 months)
4. Click **"Export Collection Summary"**
5. A CSV file with the monthly breakdown is downloaded

---

## Using Reports Effectively

### Regular Monitoring

It's good practice to export the **Overdue / NPL Report** weekly to identify at-risk loans early. The sooner you follow up on overdue accounts, the higher the recovery rate.

### Compliance Submissions

The **Portfolio Summary** can accompany regulatory submissions to demonstrate the overall health of your lending portfolio.

### Performance Tracking

Use the **Collection Summary** to compare monthly collection amounts over time. A declining trend in collections may indicate a need for more proactive collection activity or a review of credit assessment practices.

### Combining with Other Exports

These reports complement the data on the [Dashboard](?doc=dashboard/dashboard-overview). While the Dashboard gives you a real-time visual overview, the Reports tab provides downloadable data you can archive, share, or analyze further in a spreadsheet.

---

## Related Documentation

- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all available exports
- [Data Exports](?doc=compliance/data-exports) — Borrower and loan CSV exports
- [KPKT Portal Export (iDeal CSV)](?doc=compliance/kpkt-ideal-export) — Regulatory CSV export for KPKT
- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — Borrower account ledger PDFs
- [Dashboard Overview](?doc=dashboard/dashboard-overview) — Real-time portfolio metrics that complement these downloadable reports
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — Understanding the loan statuses that appear in overdue reports
