---
title: Lampiran A (Borrower Ledger)
order: 2
---

# Lampiran A (Borrower Account Ledger)

Lampiran A (also known as *Penyata Akaun Peminjam*) is a mandatory document under the Moneylenders Act that records all borrower and loan details, plus a full repayment history. TrueKredit generates this PDF automatically using your loan data.

---

## Overview

Lampiran A is required by KPKT (Bahagian Pemberi Pinjam Wang) and follows the official form format. Each PDF covers **one loan** for **one borrower**, containing:

| Section | Contents |
|---------|----------|
| **Butiran Peminjam** (Borrower Details) | Name, IC/registration number, address, phone, income or nature of business, Bumi status |
| **Butiran Pinjaman** (Loan Details) | Loan reference, agreement date, principal, interest rate, term, monthly instalment, total repayable |
| **Butiran Bayaran Balik** (Repayment Details) | Date, amount, balance, receipt reference, and status note for each payment |

---

## Borrower Information Requirements

To generate a complete Lampiran A, certain borrower fields must be filled in. These fields are **mandatory** on the [borrower creation and edit pages](?doc=loan-management/managing-borrowers).

### For Individual Borrowers

| Field | Why It's Needed |
|-------|-----------------|
| **Full Name** | Borrower identity on the ledger |
| **IC Number** | Official identification (No. K/P) |
| **Address** | Borrower address on the ledger |
| **Phone Number** | Contact number on the ledger |
| **Monthly Income** | Required for the "Pendapatan Sebulan" field on the form |

### For Corporate Borrowers

| Field | Why It's Needed |
|-------|-----------------|
| **Company Name** | Company identity on the ledger |
| **Registration Number** | SSM registration (No. Pendaftaran Syarikat) |
| **Address** | Company address on the ledger |
| **Phone Number** | Contact number on the ledger |
| **Nature of Business** | Required for the "Jenis Perniagaan" field on the form |
| **Taraf (Bumi Status)** | Required for the "Taraf" field — Bumi, Bukan Bumi, or Asing |

If any mandatory field is missing, the PDF will still generate but the field will appear blank. Ensure borrower records are complete before generating regulatory documents.

---

## Repayment Table Details

The repayment table lists every payment transaction recorded against the loan. Each row shows:

| Column | Description |
|--------|-------------|
| **Tarikh** | Payment date |
| **Jumlah Besar** | Total amount paid (with annotations for late fees or discounts, see below) |
| **Baki** | Running balance after payment |
| **Tandatangan Peminjam** | Blank space for borrower signature |
| **No. Resit** | Payment reference / receipt number |
| **Catatan** | Status code at the time of payment (see below) |

### Catatan (Status Codes)

The "Catatan" column reflects the **status of the loan at the time of each individual payment**, not the final loan status. This is important for loans that went through [arrears or default](?doc=loans/late-fees-arrears-default) before eventually being settled.

| Code | Meaning | Malay Term |
|------|---------|------------|
| **1** | Loan fully repaid / settled | Pinjaman Selesai |
| **2** | Loan current (up to date) | Pinjaman Semasa |
| **3** | In recovery / arrears | Dalam Proses Dapat Balik |
| **4** | Legal action / default | Dalam Tindakan Mahkamah |

**How the status is determined for each payment:**

- If the payment was made **after the loan entered default**, the code is **4**
- If the payment was made **after the loan entered arrears** (but before default), the code is **3**
- If the payment was made **after the due date** of the corresponding repayment, the code is **3**
- If the payment was made **on or before the due date**, the code is **2**
- The **last payment** that brings the balance to zero is marked as **1** (loan completed), unless the loan is in default status

### Late Fees in the Repayment Table

If a payment included a [late fee](?doc=loans/late-fees-arrears-default) component, the "Jumlah Besar" column shows the total amount paid followed by a small annotation:

```
RM 550.00
(caj lewat: +RM 50.00)
```

This makes it clear that RM 50 of the total RM 550 was a late fee charge, while keeping the total amount accurate for the running balance calculation.

### Early Settlement Discount

If a loan was [early settled](?doc=loans/early-settlement) with an interest discount, the final payment row shows an annotation:

```
RM 9,600.00
(rebat faedah: -RM 400.00)
```

This indicates that an RM 400 interest rebate was applied, reducing the amount needed to settle the loan. The running balance will correctly show zero after this payment.

If a payment has **both** a late fee and a discount (unlikely but possible), the annotation combines them:

```
RM 9,650.00
(+RM 50.00, -RM 400.00 rebat)
```

---

## Downloading Lampiran A for a Single Loan

1. Navigate to **Loans** in the sidebar
2. Click on the loan you want to generate the document for
3. Click the **"Lampiran A"** button in the action bar at the top of the page
4. The PDF will be downloaded to your device automatically

The file is named using the pattern: `Lampiran_A_[BorrowerName]_[LoanRef].pdf`

After downloading, the loan's **activity timeline** will immediately show an entry confirming the export, including the document type, borrower name, and IC number.

---

## Bulk Export (All Loans for a Year)

To download Lampiran A for all loans at once:

1. Navigate to **[Compliance & Exports](?doc=compliance/compliance-overview)** in the sidebar
2. On the **KPKT Regulatory** tab, find the **"Lampiran A (Penyata Akaun Peminjam)"** card
3. Select the **year** using the dropdown — this filters loans by agreement date
4. Click **"Download All (ZIP)"**
5. A ZIP file containing individual PDF files for each loan will be downloaded

The ZIP file is named: `Lampiran_A_[Year].zip`

Inside, each PDF follows the single-loan naming convention. Loans with `Pending Disbursement` status are excluded from the bulk export.

---

## Frequently Asked Questions

### Why is some borrower information blank on the PDF?

The borrower record may be incomplete. Go to **Borrowers**, find the borrower, click **Edit**, and fill in the missing fields (especially Monthly Income for individuals, and Taraf / Nature of Business for companies). See [Managing Borrowers](?doc=loan-management/managing-borrowers) for details on editing borrower records.

### Why does the Catatan show different statuses for the same loan?

This is correct behavior. The Catatan reflects the loan status **at the time each payment was made**. A loan that fell into arrears and then recovered will show status 3 for payments made during the arrears period, and status 2 for payments made after catching up.

### Can I regenerate Lampiran A after correcting borrower data?

Yes. Simply download the Lampiran A again — it always uses the latest borrower and loan data. Each download is separately audit-logged.

### Are late fees included in the balance calculation?

Yes. Late fees are added to the running balance when they are charged. The payment amount then covers both the regular instalment and the late fee. This is reflected in the "Jumlah Besar" column with a late fee annotation. See [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) for how late fees are calculated.

### How is the early settlement discount shown?

The final payment in an early-settled loan shows the total settlement amount with an annotation indicating the interest rebate applied. The running balance correctly reaches zero after accounting for the discount. See [Early Settlement](?doc=loans/early-settlement) for full details on how settlement discounts work.

### What happens if I bulk export and one loan has errors?

The system generates as many PDFs as it can. If a particular loan fails to generate (e.g., missing critical data), it is skipped and the remaining PDFs are still included in the ZIP file.

---

## Related Documentation

- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all available exports
- [KPKT Portal Export (iDeal CSV)](?doc=compliance/kpkt-ideal-export) — The other key KPKT regulatory export
- [Managing Borrowers](?doc=loan-management/managing-borrowers) — Creating and editing borrower records with required compliance fields
- [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default) — How arrears and default affect status codes in Lampiran A
- [Early Settlement](?doc=loans/early-settlement) — How early settlement discounts are reflected in the ledger
