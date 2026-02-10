---
title: Compliance & Exports Overview
order: 1
---

# Compliance & Exports

The Compliance & Exports page is your central hub for generating regulatory reports, exporting loan and borrower data, and producing compliance documents required under Malaysian moneylending legislation.

---

## Accessing the Page

Navigate to **Compliance & Exports** in the sidebar. This page is restricted to **Admin** users only.

---

## Page Layout

The page is organized into three tabs:

| Tab | Purpose |
|-----|---------|
| **KPKT Regulatory** | Exports required for KPKT portal submissions — [KPKT iDeal CSV](?doc=compliance/kpkt-ideal-export) and [Lampiran A PDFs](?doc=compliance/lampiran-a) |
| **Data Exports** | General-purpose CSV exports for [borrowers and loans](?doc=compliance/data-exports) |
| **Reports** | Operational [reports](?doc=compliance/reports) including overdue/NPL and collection summaries |

---

## Quick Reference

| Export | Format | Filter | Description |
|--------|--------|--------|-------------|
| [KPKT Portal (iDeal CSV)](?doc=compliance/kpkt-ideal-export) | CSV | Year, Status | All loan data in KPKT upload format |
| [Lampiran A (Bulk)](?doc=compliance/lampiran-a) | ZIP of PDFs | Year | Borrower Account Ledger for all loans in a year |
| [Lampiran A (Individual)](?doc=compliance/lampiran-a) | PDF | Per loan | Available on each loan detail page |
| [Borrowers Export](?doc=compliance/data-exports) | CSV | Type, Date range | All borrower information |
| [Loans Export](?doc=compliance/data-exports) | CSV | Status, Date range | All loan records with arrears/default details |
| [Overdue / NPL Report](?doc=compliance/reports) | CSV | None (current) | Loans with overdue repayments |
| [Collection Summary](?doc=compliance/reports) | CSV | Period (months) | Monthly collection performance |

All exports are **audit-logged** — every download is recorded with the admin's name, timestamp, and filters used.

---

## Year-Based Filtering

Both the [KPKT export](?doc=compliance/kpkt-ideal-export) and the bulk [Lampiran A export](?doc=compliance/lampiran-a) use a **year filter** based on the loan's **agreement date** (or disbursement date if no agreement date is set). This determines which year a loan "belongs to" for reporting purposes.

The year dropdown shows options from 2020 through the current year, defaulting to the current year.

---

## Individual Lampiran A

While the Compliance page provides bulk export, you can also download a Lampiran A for a single loan directly from the **loan detail page**. Look for the **"Lampiran A"** button in the action area at the top of any loan page. See [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) for full details.

The download is also logged in the loan's activity timeline so you can track when documents were generated and by whom.

---

## Related Documentation

- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — Detailed guide on the Lampiran A PDF format, required fields, and status codes
- [KPKT Portal Export (iDeal CSV)](?doc=compliance/kpkt-ideal-export) — How to generate and upload the KPKT regulatory CSV
- [Data Exports](?doc=compliance/data-exports) — Exporting borrower and loan records as CSV
- [Reports](?doc=compliance/reports) — Portfolio, overdue, and collection reports
- [Managing Borrowers](?doc=loan-management/managing-borrowers) — How to create and edit borrower records (required for compliance fields)
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — How arrears and default statuses affect compliance documents
- [Early Settlement](?doc=loans/early-settlement) — How early settlement discounts appear in Lampiran A
- [Dashboard Overview](?doc=dashboard/dashboard-overview) — Real-time portfolio metrics that complement these downloadable reports
