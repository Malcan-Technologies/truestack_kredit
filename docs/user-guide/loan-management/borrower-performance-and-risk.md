---
title: Borrower Performance & Risk
order: 2
---

# Borrower Performance & Risk

This guide explains how TrueKredit evaluates borrower repayment behavior across all loans and presents it as an easy-to-read risk summary.

---

## Overview

Borrower performance appears in two places:

- **Borrowers list** (`Dashboard -> Borrowers`) as a **Performance** column
- **Borrower detail page** as a **Payment Performance** card

The performance view helps you quickly answer:

- Is this borrower currently healthy, watchlist, high risk, or defaulted?
- How consistent are their repayments?
- Are there active warning signals (arrears/default-ready/defaulted)?

---

## Where To Find It

## Borrowers List

Each borrower row now includes:

- A **risk badge** (`Good`, `Watch`, `High Risk`, `Defaulted`, or `No History`)
- **On-Time %** (when repayment data exists)
- Key warning signals such as:
  - `X defaulted`
  - `X in arrears`
  - `X default ready`

## Borrower Detail Page

The **Payment Performance** card shows:

- **Risk Profile** badge
- **On-Time Rate**
- Up to 4 performance tags (for example `In Arrears`, `Default Ready`, `Strong Payer`)
- A concise **Signals** line summarizing active risk counts

---

## Risk Levels

TrueKredit assigns one borrower-level risk level based on all loans:

| Risk Level | Meaning |
|---|---|
| **Defaulted** | Borrower has at least one `DEFAULTED` or `WRITTEN_OFF` loan |
| **High Risk** | Borrower has at least one `IN_ARREARS` loan or loan marked `ready for default` |
| **Watch** | No arrears/default, but payment behavior is weaker than target |
| **Good** | No critical risk flags and payment behavior is healthy |
| **No History** | No disbursed repayment track record yet |

### Priority Rule

Risk levels are prioritized from highest severity to lowest:

`Defaulted -> High Risk -> Watch -> Good -> No History`

This ensures severe outcomes are always visible first.

---

## On-Time Rate Calculation

On-Time Rate is calculated across the borrower's latest schedules:

**On-Time Rate (%) = Paid On Time / (Paid On Time + Paid Late + Overdue) x 100**

### How installments are classified

- **Paid On Time**: installment fully paid on or before due date
- **Paid Late**: installment paid after due date
- **Overdue**: installment due date has passed and it is still not fully settled
- **Cancelled** (from early settlement): excluded from on-time behavior

If there is no repayment track record yet, On-Time Rate is shown as unavailable.

---

## Tags And Signals

TrueKredit also surfaces tags to explain *why* a borrower has a specific profile.

Common tags include:

- `Defaulted`
- `Written Off`
- `In Arrears`
- `Default Ready`
- `Overdue Repayments`
- `Strong Payer`
- `Needs Attention`
- `Healthy`
- `No Track Record`

Signals are compact counts shown for operational follow-up (for example, number of defaulted or in-arrears loans).

---

## Data Freshness

Borrower performance is refreshed automatically when key events happen, including:

- Payment recorded
- Loan status changes
- Loan disbursement
- Loan completion
- Early settlement
- Late-fee processing transitions (arrears/default-ready)

This keeps the borrower profile aligned with current portfolio behavior.

---

## How To Use It In Daily Operations

### Collection Prioritization

Start outreach from:

1. `Defaulted`
2. `High Risk`
3. `Watch`

### Credit Decision Support

When reviewing new applications:

- Use **risk level + on-time rate + tags** together
- Do not rely on On-Time % alone when severe status signals exist

### Portfolio Reviews

Use the borrower performance view to quickly detect concentration of risk in specific borrower segments.

---

## Frequently Asked Questions

### Why does a borrower show "No History"?

Usually because there is no disbursed repayment history yet (for example, only pending disbursement loans).

### Can a borrower have a good On-Time % but still show High Risk?

Yes. Severe status signals (`IN_ARREARS`, `DEFAULTED`, `ready for default`) take priority over percentage metrics.

### Does this replace loan-level analysis?

No. It is a borrower-level summary. Use the [The Loan Detail Page](?doc=loans/loan-details) for loan-level diagnostics and action.

---

## Related Documentation

- [Managing Borrowers](?doc=loan-management/managing-borrowers)
- [Loan Details](?doc=loans/loan-details)
- [Recording Payments](?doc=loans/recording-payments)
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default)
