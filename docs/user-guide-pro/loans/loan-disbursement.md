---
title: Loan Disbursement
order: 3
---

# Loan Disbursement

This guide walks through the disbursement process — from preparing the required documents to releasing funds and activating the loan.

> **Pro-specific note:** The agreement steps below describe the legacy print-sign-scan flow. Most Pro deployments use the built-in **digital signing** workflow, where the borrower, admin, and witness sign digitally and no scanning is needed — see [Digital Signing Overview](?doc=digital-signing/signing-overview). You can still upload a scanned agreement if your deployment uses a hybrid signing model.

---

## Overview

After a loan application is approved at L2, the loan enters **Pending Disbursement** status. Before funds can be released, the loan agreement must be fully signed (digitally or, in hybrid deployments, physically) and the LHDN stamp certificate must be on file:

1. **Loan Agreement** — In a fully digital deployment this is signed via the signing gateway (borrower → admin → witness). In hybrid deployments, the admin can generate a PDF, print, collect wet-ink signatures, scan, and upload it instead.
2. **Stamp Certificate** — Obtained from LHDN (Inland Revenue Board).

Only a user with `loans.disburse` (or `loans.manage`) can confirm the disbursement. Disbursement generates the repayment schedule and activates the loan.

---

## Permissions

| Action | Permission |
|--------|------------|
| Generate / upload agreement PDF | `agreements.manage` |
| Borrower digital signing | Borrower side only, through the portal |
| Admin digital signature | `agreements.manage` |
| Witness digital signature | `attestation.witness_sign` |
| Upload stamp certificate | `loans.manage` |
| Confirm disbursement | `loans.disburse` or `loans.manage` |

---

## Step 1: Generate the Loan Agreement

The system generates a professional loan agreement PDF based on the loan terms, borrower details, and your company information.

### How to Generate

1. Navigate to the loan detail page
2. In the **Loan Agreement** card, click **"Generate Agreement PDF"**
3. Select the **agreement date** in the dialog
4. Click **"Generate & Download"**
5. The PDF is downloaded to your computer

### What's in the Agreement

The generated agreement includes:

- Company letterhead (logo, name, registration details)
- Borrower details (name, IC/SSM, address)
- Loan terms (amount, interest rate, term, payment schedule)
- Repayment schedule table
- Fee breakdown (legal fees, stamping fees, net disbursement)
- Terms and conditions
- Loan schedule type (Jadual J or Jadual K)
- Signature blocks for both parties

### Print, Sign, and Upload

1. **Print** the generated agreement
2. Have both parties **sign** the agreement
3. **Scan** the signed agreement (PDF format preferred)
4. Return to the loan detail page and click **"Upload Signed Agreement"**
5. Select the scanned file and upload

The card turns green with a **"Uploaded"** badge and shows the version number and upload date.

**Replacing an Agreement:** If you need to upload a corrected version, click **"Replace"** next to the existing agreement. The previous version is kept on record and the version number increments.

---

## Step 2: Upload the Stamp Certificate

Malaysian regulations require loan agreements to be stamped by LHDN (Lembaga Hasil Dalam Negeri). The stamp certificate serves as proof that stamp duty has been paid.

### How to Obtain

1. On the loan detail page, in the **Stamp Certificate** card, click **"LHDN Stamp Portal"**
2. This opens the official LHDN stamps portal (stamps.hasil.gov.my) in a new tab
3. Submit the loan agreement for stamping through the portal
4. Download the stamp certificate once processed

### How to Upload

1. Return to the loan detail page
2. Click **"Upload Stamp Certificate"**
3. Select the certificate file (PDF, JPG, PNG, or WebP accepted)
4. The card turns green with an **"Uploaded"** badge

**Replacing a Certificate:** Click **"Replace"** to upload a corrected version. The version number increments.

---

## Step 3: Preview the Schedule

Before disbursing, review the projected repayment schedule:

1. The **Schedule Preview** table shows all monthly repayments with principal, interest, total, and running balance
2. **Change the disbursement date** using the date picker to see how it affects due dates
3. Review the **Total Payable** amount

The first repayment is due one month from the disbursement date. All subsequent repayments follow monthly on the same day.

---

## Step 4: Disburse the Loan

Once the agreement and stamp certificate are uploaded:

1. Click **"Disburse Loan"** in the header
2. The disbursement dialog opens showing:

### Disbursement Dialog Details

| Section | Description |
|---------|-------------|
| **Total to Disburse** | The net amount to transfer to the borrower (principal minus fees). Highlighted prominently. |
| **Fee Breakdown** | Legal fee and stamping fee deductions (if applicable) |
| **Bank Details** | Borrower's bank name and account number for the transfer (copy-enabled) |
| **Loan Details** | Borrower name and product for confirmation |
| **Disbursement Date** | Defaults to today. Set to the actual transfer date. |
| **Reference Number** | Auto-generated (format: DIS-YYYYMMDD-LOANID). Editable. Copy-enabled. |
| **Proof of Disbursement** | Optional file upload for the bank transfer slip. Can be uploaded later. |
| **Schedule Summary** | Principal, total interest, total payable, and estimated monthly payment |

3. Review the details carefully
4. Click **"Confirm Disbursement"**

### What Happens Upon Disbursement

When you confirm:

- The loan status changes from **Pending Disbursement** to **Active**
- The **repayment schedule** is generated based on the disbursement date
- A **disbursement event** is recorded in the activity timeline
- The borrower info cards update to show the disbursement details
- The schedule preview is replaced by the live repayment schedule table

---

## After Disbursement

### Upload Proof of Disbursement

If you didn't upload proof during disbursement, you can do it later:

1. In the **Loan Details** card, find the disbursement section
2. Click **"Upload Proof"** (amber-highlighted button)
3. Select the bank transfer slip or receipt file
4. The button changes to **"View Proof"** once uploaded

You can replace the proof at any time by clicking **"Replace"** next to the view button.

### Generated Reference Number

The auto-generated reference number follows the format `DIS-YYYYMMDD-XXXXXXXX` where the last part is a truncated loan ID. This reference can be:

- Copied to clipboard for pasting into bank transfers
- Modified manually if you prefer a different format
- Used for reconciliation with your banking records

---

## Disbursement Checklist

Before disbursing a loan, ensure:

- [ ] Loan agreement generated and signed by both parties
- [ ] Signed agreement scanned and uploaded to the system
- [ ] Stamp certificate obtained from LHDN
- [ ] Stamp certificate uploaded to the system
- [ ] Disbursement date is correct
- [ ] Reference number is recorded
- [ ] Borrower's bank details are correct
- [ ] Net disbursement amount (after fees) matches the transfer

---

## Frequently Asked Questions

### Can I disburse without uploading the agreement?

No. Both the signed loan agreement and stamp certificate must be uploaded before the Disburse button becomes active. This ensures proper documentation before funds are released.

### What if I set the wrong disbursement date?

The disbursement date determines when the first repayment is due (one month later). If you set an incorrect date, the repayment schedule will have incorrect due dates. Currently, the disbursement date cannot be changed after confirmation, so double-check before proceeding.

### Can I upload the proof of disbursement later?

Yes. The proof of disbursement is optional during the disbursement step. You can upload it at any time from the Loan Details card on the loan detail page.

### What file formats are accepted?

PDF, JPG, JPEG, PNG, and WebP files are accepted for all document uploads (agreement, stamp certificate, and proof of disbursement).

### Can I replace an uploaded document?

Yes. All uploaded documents (agreement, stamp certificate, proof of disbursement) can be replaced at any time. The system keeps previous versions on record and increments the version number.
