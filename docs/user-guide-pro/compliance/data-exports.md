---
title: Data Exports
order: 4
---

# Data Exports

The Data Exports tab on the [Compliance & Exports](?doc=compliance/compliance-overview) page lets you download your borrower and loan records as CSV files. These exports are useful for record-keeping, external reporting, or importing data into spreadsheets and other systems.

---

## Borrowers Export

### What's Included

A complete CSV of all borrower records in the system, including:

| Data | Description |
|------|-------------|
| **Name** | Full name or company name |
| **IC / Registration Number** | Identification number |
| **Type** | Individual or Corporate |
| **Contact** | Email, phone number |
| **Address** | Full address |
| **Monthly Income** | For individual borrowers |
| **Nature of Business** | For corporate borrowers |
| **Race** | For individual borrowers |
| **Bumi Status** | Bumiputera classification |
| **Created Date** | When the record was created |

### How to Export

1. Go to **Compliance & Exports** and select the **Data Exports** tab
2. Find the **"Borrowers Export"** card
3. Optionally filter by **borrower type** (All, Individual, or Corporate)
4. Optionally set a **date range** to limit by record creation date
5. Click **"Export Borrowers CSV"**

The status line below the button shows a summary of what will be exported (e.g., "Export all borrowers" or "Export Individual borrowers created from 01/01/2026 to 31/12/2026").

---

## Loans Export

### What's Included

A complete CSV of all loan records, including:

| Data | Description |
|------|-------------|
| **Loan Reference** | Unique loan identifier |
| **Borrower Name** | Associated borrower |
| **Borrower Type** | Individual or Corporate |
| **Product** | Loan product name |
| **Principal** | Loan principal amount |
| **Interest Rate** | Annual interest rate (%) |
| **Term** | Loan tenure in months |
| **Monthly Payment** | Monthly instalment amount |
| **Status** | Current loan status |
| **Disbursement Date** | When the loan was disbursed |
| **Agreement Date** | Loan agreement date |
| **Arrears Since** | Date arrears started (if applicable) |
| **Default Ready** | Whether the loan is ready for default action |
| **Default Ready Date** | When the loan became default-ready (if applicable) |
| **Created Date** | When the loan record was created |

### How to Export

1. Go to **Compliance & Exports** and select the **Data Exports** tab
2. Find the **"Loans Export"** card
3. Optionally filter by **loan status** (All, Active, In Arrears, Completed, Defaulted, Pending Disbursement)
4. Optionally set a **date range** to limit by loan creation date
5. Click **"Export Loans CSV"**

The status line shows a summary of the export filters applied.

---

## General Notes

### Date Range Filtering

The "Created From" and "Created Until" date inputs filter by the record's **creation date in the system**, not the agreement or disbursement date. For year-based regulatory filtering, use the [KPKT](?doc=compliance/kpkt-ideal-export) or [Lampiran A](?doc=compliance/lampiran-a) exports on the KPKT Regulatory tab.

### File Format

All exports are standard CSV files that can be opened in:

- Microsoft Excel
- Google Sheets
- LibreOffice Calc
- Any text editor or data processing tool

### Character Encoding

CSV files are exported in UTF-8 encoding, which supports Malaysian names and special characters. If you see garbled characters in Excel, import the file using **Data > From Text/CSV** and select UTF-8 encoding.

### Audit Logging

All data exports are audit-logged with the admin's identity, timestamp, and filters used.

---

## Related Documentation

- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all available exports
- [KPKT Portal Export (iDeal CSV)](?doc=compliance/kpkt-ideal-export) — Regulatory CSV export for KPKT portal submissions
- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — Borrower account ledger PDFs
- [Reports](?doc=compliance/reports) — Portfolio, overdue, and collection reports
- [Managing Borrowers](?doc=loan-management/managing-borrowers) — Borrower record details that appear in the Borrowers Export
