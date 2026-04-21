---
title: Loan Documents & Reports
order: 8
---

# Loan Documents & Reports

TrueKredit automatically generates and manages a range of documents throughout a loan's lifecycle. This guide covers every document type, how they're generated, and where to access them.

---

## Overview of Documents

| Document | When Generated | Format | Access Location |
|----------|---------------|--------|-----------------|
| **Loan Agreement** | On-demand (pre-disbursement) | PDF | Loan Detail → Agreement card / Documents section |
| **Stamp Certificate** | Uploaded from LHDN | PDF/Image | Loan Detail → Stamp Certificate card / Documents section |
| **Payment Receipts** | Automatically after each payment | PDF | Repayment schedule → Actions dropdown |
| **Proof of Payment** | Uploaded by admin | PDF/Image | Repayment schedule → Actions dropdown |
| **Proof of Disbursement** | Uploaded by admin | PDF/Image | Loan Detail → Loan Details card |
| **Arrears Notice Letter** | Automatically when loan enters arrears | PDF | Loan Detail → Quick Info → Letters |
| **Default Notice Letter** | Automatically when loan is marked defaulted | PDF | Loan Detail → Quick Info → Letters |
| **Discharge Letter** | Automatically on loan completion | PDF | Loan Detail → Completed card |
| **Lampiran A** | On-demand | PDF | Loan Detail → Loan Documents section |

---

## Loan Agreement

The loan agreement is the primary legal document for the loan. TrueKredit generates a professional agreement PDF from the loan data.

### Contents

- Company letterhead with logo and registration details
- Borrower identification details
- Loan terms: amount, rate, tenure, interest model
- Complete repayment schedule table
- Fee breakdown and net disbursement amount
- Loan schedule type classification (Jadual J or Jadual K)
- Terms and conditions
- Signature blocks

### Generating

1. On the loan detail page (Pending Disbursement status), click **"Generate Agreement PDF"**
2. Select the agreement date
3. The PDF downloads automatically

### Uploading the Signed Copy

After printing and obtaining signatures, scan and upload:

1. Click **"Upload Signed Agreement"**
2. Select the scanned document
3. The system records the upload date, version number, and the user who uploaded it

The agreement can be replaced at any time. Each upload increments the version number (v1, v2, etc.) and the previous versions are kept on record.

### Accessing After Disbursement

After disbursement, access the signed agreement via:

- **Loan Documents** section in the Loan Details card → **"Agreement"** button
- The original agreement card is no longer shown, but the document remains accessible

---

## Stamp Certificate

The stamp certificate from LHDN proves that stamp duty has been paid on the loan agreement.

### Uploading

1. Obtain the certificate from the LHDN Stamp Portal (link provided on the loan detail page)
2. Click **"Upload Stamp Certificate"** on the loan detail page
3. Select the certificate file

### Accessing

- Before disbursement: Stamp Certificate card → **"View Certificate"**
- After disbursement: Loan Documents section → **"Stamp Cert"** button

---

## Payment Receipts

A payment receipt is **automatically generated** each time a payment is recorded against a loan. Receipts serve as official confirmation of payment.

### What's Included

- Company details
- Borrower information
- Payment date and amount
- Payment reference number
- Allocation breakdown (how the payment was applied)
- Running balance

### Accessing

1. On the repayment schedule table, find the repayment row
2. Click the **three-dot menu** in the Actions column
3. Click **"View Receipt"** to open the receipt PDF in a new tab

Each repayment row shows a **receipt icon** next to the paid amount when a receipt is available.

---

## Proof of Payment

Proof of payment documents (bank slips, transfer confirmations) are uploaded by the admin to support payment records.

### Uploading During Payment

When recording a payment, you can optionally attach a bank slip file. See [Recording Payments](?doc=loans/recording-payments) for details.

### Uploading After Payment

If proof wasn't uploaded during payment recording:

1. On the repayment schedule table, click the **three-dot menu**
2. Click **"Upload Proof of Payment"**
3. Select the file (PDF, JPG, PNG, or WebP)

### Replacing Proof

To replace an existing proof document:

1. Click the **three-dot menu** on the repayment row
2. Click **"Replace Proof of Payment"**
3. Select the new file

Each repayment row shows a **file check icon** next to the paid amount when proof of payment is uploaded.

---

## Proof of Disbursement

The proof of disbursement is a record of the bank transfer to the borrower.

### Uploading

- **During disbursement:** Optionally attach the bank transfer slip in the disbursement dialog
- **After disbursement:** In the Loan Details card, click **"Upload Proof"**

### Viewing

Click **"View Proof"** in the Loan Details card to open the document in a new tab.

---

## Arrears Notice Letter

An arrears notice is **automatically generated** when a loan first enters the arrears status (overdue beyond the product's arrears period).

### Contents

- Company letterhead
- Borrower details
- List of all overdue repayments with amounts
- Total outstanding amount including late fees
- Settlement deadline (based on arrears period days from letter date)
- Warning about potential default classification and legal action

### Accessing

Navigate to the loan detail page → **Quick Info** card → **Letters** section → Click **"Arrears Notice"** to download.

### Regenerating

The initial letter is generated automatically. To generate an updated letter with current figures:

1. In the Quick Info → Letters section, click **"Regenerate Arrears Letter"**
2. Confirm the action

**When to regenerate:**

- Late fees have increased since the last letter
- A partial payment was made and the outstanding amount has changed
- You need a current letter for the borrower or legal purposes

**Cooldown:** A 3-day cooldown applies between letter generations to prevent excessive creation. Each generation is logged in the activity timeline.

For more details, see [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default).

---

## Default Notice Letter

A default notice is **automatically generated** when an admin marks a loan as defaulted.

### Contents

- Company letterhead
- Borrower details
- All outstanding repayments with amounts
- Total amount due including late fees
- Consequences of default (demand for immediate repayment, additional charges, legal proceedings, credit reporting)
- Contact information

### Accessing

Navigate to the loan detail page → **Quick Info** card → **Letters** section → Click **"Default Notice"** to download.

### Regenerating

For defaulted loans, admins can regenerate both the arrears and default letters independently:

1. Click **"Regenerate Default Letter"** in the Letters section
2. The new letter uses the latest outstanding amounts and late fees

The same 3-day cooldown applies. Old letters are never deleted.

For more details, see [Late Fees, Arrears & Default](?doc=loans/late-fees-arrears-default).

---

## Discharge Letter

A discharge letter is **automatically generated** when a loan is completed — either through full repayment or early settlement.

### Contents

- Company letterhead
- Borrower details
- Loan summary (original terms)
- Confirmation that the loan is fully settled
- Completion date
- Early settlement details (if applicable)

### Accessing

On the completed loan detail page, the green **"Loan Completed"** card includes a **"Discharge Letter"** button. Click it to download the PDF.

---

## Lampiran A (Lejar Akaun Peminjam)

Lampiran A is a regulatory compliance document — the **Borrower Account Ledger** required by KPKT (Ministry of Housing and Local Government). It provides a comprehensive account statement for each loan.

### Contents

The Lampiran A PDF includes:

- Borrower details (name, IC number, address)
- Loan details (amount, rate, term, disbursement date)
- Complete repayment schedule with payment history
- Running balance after each transaction
- Late fee records
- Summary totals

### Generating

1. Navigate to the loan detail page (loan must be disbursed)
2. In the **Loan Documents** section of the Loan Details card, click **"Lampiran A"**
3. The PDF is generated on-demand and downloaded

Each download is recorded in the activity timeline as a **"Document Exported"** event.

### When to Use

- Regulatory audits and compliance checks
- Borrower account statements
- Legal proceedings documentation
- Internal record-keeping

**Note:** Lampiran A is only available for disbursed loans (not for loans still in Pending Disbursement status).

---

## Document Audit Trail

Every document action is recorded in the loan's **Activity Timeline**:

| Action | Description |
|--------|-------------|
| Agreement Uploaded | Signed agreement uploaded (shows version) |
| Stamp Certificate Uploaded | Certificate uploaded (shows version) |
| Disbursement Proof Uploaded | Bank slip uploaded |
| Proof of Payment Uploaded | Payment proof uploaded for a specific transaction |
| Proof of Payment Deleted | Payment proof removed |
| Arrears Letter Generated | Auto or manual generation |
| Default Letter Generated | Auto or manual generation |
| Discharge Letter Generated | Completion or early settlement |
| Document Exported | Lampiran A or other export downloaded |

This creates a complete chain of custody for all loan documents.

---

## File Format Support

All document uploads accept the following formats:

| Format | Extension | Notes |
|--------|-----------|-------|
| PDF | .pdf | Preferred for scanned documents |
| JPEG | .jpg, .jpeg | Photos or scans |
| PNG | .png | Screenshots or scans |
| WebP | .webp | Modern image format |

---

## Frequently Asked Questions

### Are old letter versions kept when I regenerate?

Yes. Old letters are never deleted. Each regeneration creates a new file. The download link in the Quick Info section always points to the most recent version. All generations are logged in the activity timeline.

### Can I generate Lampiran A for a pending loan?

No. Lampiran A requires an active repayment schedule, so it's only available after the loan has been disbursed.

### Who can see the activity timeline for documents?

All users in your tenant can view the activity timeline. Each entry shows which user performed the action.

### Is there a limit to how many times I can regenerate letters?

A 3-day cooldown applies between letter regenerations for each letter type (arrears and default are independent). This prevents excessive letter creation while still allowing updated letters when needed.
