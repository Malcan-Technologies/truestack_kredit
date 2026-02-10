---
title: KPKT Portal Export (iDeal CSV)
order: 3
---

# KPKT Portal Export (iDeal CSV)

The KPKT Portal export generates a CSV file formatted for upload to the KPKT (Bahagian Pemberi Pinjam Wang) iDeal system. This export contains all required loan and borrower data in the exact format specified by the portal.

---

## Overview

Malaysian licensed moneylenders are required to submit periodic loan data to KPKT via the iDeal portal. TrueKredit generates this CSV automatically, saving you from manual data entry. This export is available on the [Compliance & Exports](?doc=compliance/compliance-overview) page alongside the [Lampiran A](?doc=compliance/lampiran-a) PDF export.

The export includes:

- Borrower identification and contact details
- Loan terms (principal, interest, tenure)
- Repayment status and amounts
- Arrears information
- Borrower classification (Bumi / Bukan Bumi / Asing)

---

## How to Export

1. Navigate to **Compliance & Exports** in the sidebar
2. On the **KPKT Regulatory** tab, find the **"KPKT Portal Export (iDeal CSV)"** card
3. Select the **year** — this filters loans by agreement date (defaults to the current year)
4. Optionally filter by **loan status** (Active, In Arrears, Completed, Defaulted, or All)
5. Click **"Export KPKT CSV"**
6. The CSV file will be downloaded to your device

The file is named: `kpkt_export_[year]_[status].csv`

---

## CSV Columns

The export produces a CSV with the following columns, matching the KPKT iDeal portal field requirements:

| Column | Description | Example |
|--------|-------------|---------|
| **No** | Row number | 1 |
| **NamaPeminjam** | Borrower full name or company name | Ali bin Ahmad |
| **NoKP** | IC number or company registration number | 901201-14-5678 |
| **JenisSyarikat** | Borrower classification — Bumi, Bukan Bumi, or Asing | Bumi |
| **Alamat** | Borrower address | 123, Jln Merdeka, KL |
| **NoTelefon** | Phone number | 012-3456789 |
| **NoPerjanjian** | Loan agreement / reference number | LN-00042 |
| **TarikhPerjanjian** | Agreement date (DD/MM/YYYY) | 15/01/2026 |
| **JumlahPinjaman** | Principal amount | 10000.00 |
| **KadarFaedah** | Annual interest rate (%) | 18.00 |
| **TempohPinjaman** | Loan term in months | 12 |
| **BayaranBulanan** | Monthly instalment amount | 983.33 |
| **JumlahDibayar** | Total amount paid to date | 5900.00 |
| **BakiPinjaman** | Outstanding balance | 5900.00 |
| **StatusPinjaman** | Loan status | Aktif |
| **TunggakanBulan** | Number of months in arrears | 0 |
| **JumlahTunggakan** | Total arrears amount | 0.00 |

---

## Filtering by Year

The year filter determines which loans are included based on their **agreement date**. If a loan does not have an agreement date set, the system uses the **disbursement date** instead.

For example, selecting "2026" will include all loans whose agreement date falls within the year 2026 (1 January 2026 to 31 December 2026).

---

## Filtering by Status

| Status Option | Loans Included |
|---------------|---------------|
| **All Statuses** | All loans matching the year filter |
| **Active** | Loans in good standing with payments up to date |
| **In Arrears** | Loans with overdue payments |
| **Completed** | Fully repaid or early-settled loans |
| **Defaulted** | Loans that have entered default status |

---

## Borrower Classification (JenisSyarikat)

The "JenisSyarikat" column reflects the borrower's Bumiputera status:

| Value | Meaning |
|-------|---------|
| **Bumi** | Bumiputera |
| **Bukan Bumi** | Non-Bumiputera |
| **Asing** | Foreign national or company |

For **corporate borrowers**, this value comes from the **Taraf (Bumi Status)** field set on the [borrower profile](?doc=loan-management/managing-borrowers).

For **individual borrowers**, if the Bumi Status field is not set, the system derives it from the borrower's **Race** field:

| Race | Derived Status |
|------|---------------|
| Malay | Bumi |
| Orang Asli | Bumi |
| Iban, Bidayuh, Melanau, Kadazan, Bajau, Murut, Dusun | Bumi |
| Chinese, Indian, Other | Bukan Bumi |

To override the derived value, set the Taraf field explicitly on the [borrower profile](?doc=loan-management/managing-borrowers).

---

## Uploading to the Portal

After downloading the CSV:

1. Log in to the KPKT iDeal portal
2. Navigate to the data submission section
3. Upload the CSV file
4. Review and confirm the submission

The CSV is formatted to be directly compatible with the portal upload — no additional editing should be required.

---

## Frequently Asked Questions

### Why are some loans missing from the export?

Check that the loan has an **agreement date** (or disbursement date) that falls within the selected year. Loans in `Pending Disbursement` status (not yet disbursed) may also be excluded depending on your status filter.

### The JenisSyarikat column shows a wrong value — how do I fix it?

Go to **Borrowers**, find the borrower, click **Edit**, and update the **Taraf (Bumi Status)** field (for corporate) or **Race** field (for individual). See [Managing Borrowers](?doc=loan-management/managing-borrowers) for guidance. The next export will use the updated value.

### Can I export multiple years at once?

Currently, each export covers a single year. To export multiple years, repeat the export with different year selections.

### Is the export audit-logged?

Yes. Every KPKT export is recorded in the system audit trail with the admin's name, timestamp, year, and status filter used.

---

## Related Documentation

- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all available exports
- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — The other key KPKT regulatory document
- [Managing Borrowers](?doc=loan-management/managing-borrowers) — Ensuring borrower records have correct Bumi Status and other required fields
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — How arrears affect the status and tunggakan columns
