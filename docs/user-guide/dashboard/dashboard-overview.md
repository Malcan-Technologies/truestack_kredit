---
title: Dashboard Overview
order: 1
---

# Dashboard Overview

The Dashboard is your central command centre. It gives you a real-time snapshot of your lending business so you can spot trends, identify risks, and make informed decisions -- all at a single glance.

---

## Date Range Filter

At the top-right of the dashboard you will find preset buttons to control the time window for charts and trend data:

| Preset | What it covers |
| --- | --- |
| This Month | Current calendar month |
| 3 Months | Last 3 calendar months |
| 6 Months | Last 6 calendar months (default) |
| 1 Year | Last 12 calendar months |
| All Time | All data since your first loan |

The KPI summary cards always show **all-time totals** regardless of the date filter. Only charts (Disbursement Trend, Collection Performance) change when you adjust the range.

---

## Billing Status

The billing card shows your current subscription:

- **Plan name** and **status badge** (PAID, OVERDUE, FREE, or SUSPENDED)
- **Loan usage** — how many of your plan's 500-loan limit you have used, with a colour-coded progress bar (blue under 80%, amber 80-99%, red at 100%)
- **Days remaining** until your next billing renewal (or period end)

Billing periods use same-day boundaries (e.g. 3 Mar – 3 Apr). The last day of your subscription is the day before the renewal date; payment is due on the renewal date.

For full details on billing, invoices, add-ons, and payment, see [Billing & Subscription](?doc=administration/billing-and-subscription).

---

## Promotions

A placeholder for upcoming promotions such as referral rewards and billing discounts. This section will be activated in a future update.

---

## KPI Summary Cards

Six cards at the top of the dashboard surface the numbers that matter most to a money lender.

### Total Disbursed

The total **principal amount** (face value) of all loans that have been disbursed to borrowers. This is the amount recorded on the loan agreement and used in regulatory filings.

The small text underneath shows the **net disbursement** -- the actual amount the borrower received after deducting legal fees and stamping fees.

### Outstanding

The total amount still owed across all active loans. This is calculated as the sum of remaining unpaid repayment instalments (total due minus payments already received).

The small text shows the number of currently **active loans**.

### Collected

The total repayments received from borrowers across all loans. This includes principal, interest, and any late fee payments that have been allocated.

### Overdue

The total amount from repayment instalments that are **past their due date** and have not been fully paid. This is your immediate collection priority.

The small text shows how many loans are currently **in arrears** (have entered the arrears stage after exceeding the configured arrears period).

### Collection Rate

The percentage of total expected repayments that have actually been collected:

**Collection Rate = Total Collected / (Total Collected + Total Outstanding) x 100**

| Range | Indicator |
| --- | --- |
| 80% and above | Green -- healthy |
| 50% to 79% | Amber -- needs attention |
| Below 50% | Red -- critical |

### PAR 30 (Portfolio at Risk)

PAR 30 is a standard microfinance and lending industry metric. It measures what **percentage of your outstanding loan portfolio** has repayments overdue by 30 or more days.

**PAR 30 = Outstanding balance of loans with 30+ day overdue payments / Total outstanding balance of active loans x 100**

| Range | Indicator |
| --- | --- |
| 5% or below | Green -- excellent |
| 6% to 15% | Amber -- moderate risk |
| Above 15% | Red -- high risk |

A lower PAR means your borrowers are paying on time and your portfolio is healthy. Hover over the card to see a detailed explanation.

---

## Charts

### Disbursement Trend

A **bar chart** showing the total principal disbursed each month within your selected date range. Use this to track lending volume over time and spot seasonal patterns.

Hovering over a bar shows the exact amount and number of loans disbursed that month.

### Loan Portfolio

A **donut chart** showing the breakdown of all your loans by status:

| Status | Colour | Meaning |
| --- | --- | --- |
| Active | Blue | Loan is current, borrower is paying on schedule |
| Pending Disbursement | Light green | Loan approved but funds not yet released |
| In Arrears | Amber | Borrower has overdue payments past the arrears period |
| Completed | Green | Loan fully repaid and discharged |
| Defaulted | Red | Loan marked as defaulted |
| Written Off | Grey | Loan written off from the books |

### Collection Performance

An **area chart** comparing two lines:

- **Due** (grey) -- the total repayment instalments scheduled for each month
- **Collected** (green) -- the actual payments received in each month

When the green area closely tracks the grey area, your borrowers are paying on time. A widening gap signals collection problems that need follow-up.

### Application Pipeline

A **horizontal bar breakdown** of your loan applications by status (Draft, Submitted, Under Review, Approved, Rejected). The pending count badge at the top-right shows applications awaiting action.

---

## Portfolio at Risk (PAR)

Below the charts, a dedicated card shows three PAR thresholds:

| Metric | What it measures |
| --- | --- |
| PAR 30 | % of outstanding with payments 30+ days overdue |
| PAR 60 | % of outstanding with payments 60+ days overdue |
| PAR 90 | % of outstanding with payments 90+ days overdue |

Each metric has a colour-coded progress bar (green/amber/red) based on the same thresholds as the PAR 30 KPI card. The card also shows your **total accrued late fees**.

PAR is calculated only against **active and in-arrears** loans. Completed, defaulted, and written-off loans are excluded from the denominator.

---

## Recent Activity

The bottom of the dashboard shows your five most recent **loans** and **applications** for quick access. Click any row to navigate directly to the detail page.

Each entry shows the borrower name, date, amount, and current status badge.

---

## Related Documentation

- [Billing & Subscription](?doc=administration/billing-and-subscription) — Manage your subscription, add-ons, and invoices
- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Download portfolio, overdue, and collection reports as CSV files
- [Reports](?doc=compliance/reports) — Detailed downloadable reports that complement the dashboard's real-time metrics
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — Understanding the arrears and default metrics shown on the dashboard
