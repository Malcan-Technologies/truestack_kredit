---
title: Dashboard Overview
order: 1
---

# Dashboard Overview

The Dashboard is your central command centre for TrueKredit Pro. It surfaces portfolio health, risk, and the work that currently needs action — all permission-scoped to what **you** can do.

> TrueKredit Pro does not show the SaaS Billing / Plan card. Licensing is handled outside the app (see [Single-Tenant Deployment Model](?doc=getting-started/deployment-model)).

---

## Date Range Filter

Preset buttons at the top-right control the time window for charts and trend data.

| Preset | What it covers |
|--------|----------------|
| This Month | Current calendar month |
| 3 Months | Last 3 calendar months |
| 6 Months | Last 6 calendar months (default) |
| 1 Year | Last 12 calendar months |
| All Time | All data since your first loan |

KPI summary cards always show **all-time totals** regardless of the filter. Only the charts (Disbursement Trend, Collection Performance) change.

---

## Action Needed (Permission-Scoped)

The Dashboard surfaces work that needs action **based on what you can do**. Returned from `GET /api/dashboard/stats → actionNeeded`, the card shows only the queues you are allowed to work.

| Queue | Visible when you have |
|-------|----------------------|
| L1 queue count | `applications.approve_l1` |
| Pending L2 approvals | `applications.approve_l2` |
| Pending disbursement | `loans.disburse` or `loans.manage` |
| Pending attestation | `attestation.schedule` or `attestation.witness_sign` |
| Ready to complete | `loans.manage` |
| Ready for default | `collections.manage` |

Users who do not hold any of these permissions (e.g. Auditor Read-only) see a reduced card, or no queue items at all.

---

## KPI Summary Cards

### Total Disbursed

Total **principal amount** (face value) of all disbursed loans — the amount on the loan agreement and used in regulatory filings. Small text underneath shows the **net disbursement** (principal minus legal and stamping fees).

### Outstanding

Total amount still owed across all active loans — sum of remaining unpaid repayment instalments. Small text shows the number of **active loans**.

### Collected

Total repayments received across all loans (principal, interest, and allocated late fees).

### Overdue

Total amount from repayment instalments past their due date and not fully paid. Small text shows how many loans are currently **in arrears** (after exceeding the configured arrears period).

### Collection Rate

**Collection Rate = Total Collected / (Total Collected + Total Outstanding) × 100**

| Range | Indicator |
|-------|-----------|
| 80% and above | Green — healthy |
| 50–79% | Amber — needs attention |
| Below 50% | Red — critical |

### PAR 30 (Portfolio at Risk)

**PAR 30 = Outstanding balance of loans with 30+ day overdue payments / Total outstanding balance of active loans × 100**

| Range | Indicator |
|-------|-----------|
| ≤ 5% | Green — excellent |
| 6–15% | Amber — moderate risk |
| > 15% | Red — high risk |

Lower is better. Hover the card for an in-depth explanation.

---

## Charts

### Disbursement Trend

Bar chart of total principal disbursed per month within the selected range. Hover a bar to see exact amount and number of loans disbursed.

### Loan Portfolio

Donut chart of loans by status.

| Status | Colour | Meaning |
|--------|--------|---------|
| Active | Blue | Current, on schedule |
| Pending Disbursement | Light green | Approved, not yet disbursed |
| In Arrears | Amber | Overdue past the arrears period |
| Completed | Green | Fully repaid and discharged |
| Defaulted | Red | Marked as defaulted |
| Written Off | Grey | Written off |

### Collection Performance

Area chart comparing two lines per month:

- **Due** (grey) — scheduled repayment instalments
- **Collected** (green) — actual payments received

A widening gap between them signals collection issues.

### Application Pipeline

Horizontal bar breakdown of applications by status (Draft, Submitted, Under Review, Pending L2 Approval, Approved, Rejected). The pending badges at the top-right reflect only the queues you can work.

---

## Portfolio at Risk (PAR)

A dedicated card shows PAR 30 / 60 / 90 with colour-coded progress bars and the total **accrued late fees**.

| Metric | Meaning |
|--------|---------|
| PAR 30 | % outstanding with payments 30+ days overdue |
| PAR 60 | % outstanding with payments 60+ days overdue |
| PAR 90 | % outstanding with payments 90+ days overdue |

PAR is calculated only against **active** and **in-arrears** loans — completed, defaulted, and written-off loans are excluded from the denominator.

---

## Recent Activity

The bottom of the dashboard shows your five most recent **loans** and **applications**. Click any row to jump to its detail page.

---

## Related Documentation

- [Loan Applications (L1 / L2)](?doc=loan-management/loan-applications) — The two-stage review
- [Compliance Overview](?doc=compliance/compliance-overview) — Reports and exports
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — Understanding arrears and default metrics
- [Roles & Permissions](?doc=getting-started/roles-and-permissions) — Why you see the queues you see
