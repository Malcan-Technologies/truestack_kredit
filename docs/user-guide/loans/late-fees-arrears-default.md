---
title: Late Fees, Arrears & Default
order: 5
---

# Late Fees, Arrears & Default

This guide explains how TrueKredit handles overdue loan repayments, including automatic late fee calculation, the arrears period, and the default process.

---

## Overview

When a borrower misses a scheduled repayment, the system follows a structured escalation process:

| Stage | What Happens | Trigger |
|-------|-------------|---------|
| **Late Fee Accrual** | Daily late fees are charged on the overdue amount | Day after missed due date |
| **Arrears Period** | Formal arrears notice is generated | After the product's arrears period (e.g., 14 days) |
| **Default Ready** | Admin is notified the loan is ready for default | After the product's default period (e.g., 28 days) |
| **Defaulted** | Loan is manually marked as defaulted by admin | Admin action only |

Late fees continue to accrue throughout all stages, including after a loan has been marked as defaulted.

---

## Late Fee Calculation

### How Late Fees Are Calculated

Late fees are charged **daily** on the **amount in arrears** (overdue principal + interest only). Late fees do not compound — they are never charged on other late fees.

**Formula:**

```
Daily Late Fee = Amount in Arrears × (Late Payment Rate ÷ 365)
```

**Example:**

- Overdue repayment: RM 1,000 (RM 900 principal + RM 100 interest)
- Late Payment Rate: 8% per annum (set in the loan product)
- Days overdue: 10 days

```
Daily Late Fee = 1,000 × (8% ÷ 365) = RM 0.22 per day
Total Late Fees (10 days) = RM 2.19
```

### Per-Repayment Tracking

Late fees are calculated **per scheduled repayment**, not per loan. If a borrower has multiple overdue repayments, each one accrues its own late fees independently based on its own due date.

**Example with two overdue repayments:**

| Repayment | Due Date | Days Overdue | Amount in Arrears | Late Fee (8% p.a.) |
|-----------|----------|-------------|-------------------|-------------------|
| Month 3 | 1 Jan 2026 | 38 days | RM 1,000 | RM 8.33 |
| Month 4 | 1 Feb 2026 | 7 days | RM 1,000 | RM 1.53 |

The January repayment has more late fees because it has been overdue longer.

### Partial Payments

If a borrower has made a partial payment on an overdue repayment, late fees are calculated on the **remaining unpaid amount** (principal + interest not yet covered).

---

## Automatic Processing

### Daily Cron Job

Late fees are automatically processed every day at **12:30 AM Malaysian time (GMT+8)**. The system:

1. Identifies all overdue repayments across all active, in-arrears, and defaulted loans
2. Calculates and records daily late fees for each overdue repayment
3. Checks if any loans have entered the arrears period
4. Generates arrears notice letters for newly-entered arrears loans
5. Flags loans that have passed the default period as "Ready for Default"

### Backfill Protection

If the system misses a day (e.g., server downtime), the next processing run automatically **backfills** all missed days. Each missed day is calculated and recorded individually, ensuring accurate late fee amounts regardless of when the processing runs.

### No Double-Charging

The system uses a unique constraint per repayment per day. Even if processing runs multiple times in the same day, each day's late fee can only be charged once. It is completely safe to run processing multiple times.

---

## Manual Processing

### Process Late Fees Button

Admins can manually trigger late fee processing from the **Loans** page by clicking the **"Process Late Fees"** button in the top-right corner.

This is useful when:

- New loans have been created since the last processing run
- You want to immediately see late fee calculations without waiting for the nightly cron job
- You need to verify late fees are calculating correctly

The button processes only loans belonging to your current tenant. A confirmation toast message shows how many loans were processed and how many fees were charged.

**Note:** The button is always available. Late fees are also automatically processed daily at 12:30 AM (GMT+8). It is safe to click multiple times — the system will only charge fees for days that have not already been processed.

### Last Run Indicator

Below the "Process Late Fees" button, a timestamp shows when late fees were last processed and whether it was triggered manually or by the automated cron job.

---

## Arrears Period

The **arrears period** is defined in each loan product's settings (e.g., 14 days). When any repayment on a loan has been overdue for longer than the arrears period:

1. The loan status changes to **IN_ARREARS**
2. An **Arrears Notice Letter** (PDF) is automatically generated
3. The event is recorded in the loan's audit trail

### Arrears Notice Letter

The arrears notice letter:

- Uses your company's letterhead (logo, company name, registration details)
- Lists all overdue repayments with amounts
- Shows the total outstanding amount including late fees
- States a **deadline** for settlement (based on the arrears period days from the letter date)
- Warns that failure to settle by the deadline may result in the loan being classified as defaulted and legal action may be initiated

The letter can be downloaded from the loan detail page under **Quick Info → Letters → Arrears Notice**.

### Regenerating the Arrears Notice Letter

The initial arrears letter is generated automatically when the loan first enters arrears. However, as late fees continue to accrue and the outstanding amounts change, the original letter may become outdated. Admins can manually generate a **new arrears letter** with up-to-date figures.

**When to regenerate:**

- Late fees have increased significantly since the last letter
- You need a current letter to send to the borrower or for legal purposes
- The borrower has made a partial payment and you need a letter reflecting the updated balance

**How to regenerate:**

1. Navigate to the loan detail page
2. In the **Quick Info** card on the right, find the **Letters** section
3. Click **"Regenerate Arrears Letter"**
4. The new letter is generated with the latest outstanding amounts and late fees

**Important notes:**

- A **3-day cooldown** applies — you must wait at least 3 days between generating arrears letters (auto or manual)
- Old letters are **never deleted** — each generation creates a new file. The download link always points to the most recent letter
- The letter generation is recorded in the loan's **audit trail / timeline**
- This option is available for loans in **In Arrears** or **Defaulted** status

---

## Default Period

The **default period** is also defined in the loan product's settings (e.g., 28 days). When any repayment has been overdue longer than the default period:

1. The loan is flagged as **"Ready for Default"**
2. A badge appears on the loan in the loans list
3. The admin is notified via the status bar on the Loans page

### Marking a Loan as Defaulted

Defaulting a loan is a **manual action** — the system will never automatically mark a loan as defaulted. This gives the admin time to:

- Contact the borrower
- Negotiate repayment arrangements
- Review the loan's history

To mark a loan as defaulted:

1. Navigate to the loan detail page
2. Click the **"Mark as Default"** button
3. Confirm the action

When a loan is marked as defaulted:

- The loan status changes to **DEFAULTED**
- A **Default Notice Letter** (PDF) is generated
- The event is recorded in the audit trail
- **Late fees continue to accrue** on all overdue repayments

### Default Notice Letter

The default notice letter:

- Uses your company's letterhead
- Lists all outstanding repayments with amounts
- Shows the total amount due including late fees
- Lists the consequences of default (demand for immediate repayment, additional charges, legal proceedings, credit reporting)
- Urges the borrower to make immediate contact

The letter can be downloaded from the loan detail page under **Quick Info → Letters → Default Notice**.

### Regenerating Letters for Defaulted Loans

For loans in **Defaulted** status, admins can regenerate **both** the arrears letter and the default letter independently. This is useful when:

- Additional late fees have accumulated since the last letter
- Partial payments have changed the outstanding balance
- You need updated documentation for legal proceedings

To regenerate, go to the loan detail page and use the **"Regenerate Arrears Letter"** or **"Regenerate Default Letter"** buttons in the **Quick Info → Letters** section.

The same **3-day cooldown** applies to each letter type independently. Old letters are preserved on disk and are never overwritten. Each generation is logged in the audit trail.

---

## Payment Allocation

When a payment is received on a loan with outstanding late fees, the payment is allocated in the following priority:

| Priority | Allocation | Description |
|----------|-----------|-------------|
| 1st | **Late Fees** | Outstanding late fees are paid first |
| 2nd | **Interest** | Interest portion of the repayment |
| 3rd | **Principal** | Principal portion of the repayment |

This means if a borrower makes a partial payment, it will first clear any late fees before being applied to the regular repayment amount.

**Example:**

- Outstanding late fees: RM 15.00
- Monthly repayment: RM 1,000.00 (RM 900 principal + RM 100 interest)
- Borrower pays: RM 500.00

```
Allocation:
  Late Fees:  RM 15.00
  Interest:   RM 100.00
  Principal:  RM 385.00
  Remaining:  RM 0.00
```

The repayment would be marked as **PARTIAL** since the full principal has not been covered.

---

## Viewing Late Fee Information

### Loans List Page

The loans list page shows late fee information in several ways:

- **Late Fees column** — Shows the total late fees accrued for each loan
- **Status badges** — Loans in arrears show an "In Arrears" badge; loans ready for default show a "Ready for Default" badge
- **Status bar** — A warning bar at the top shows the count of loans in arrears and loans ready for default
- **Filter buttons** — Quickly filter to see only "In Arrears", "Defaulted", or "Ready for Default" loans, with badge counts

### Loan Detail Page

On the individual loan detail page:

- **Repayment Schedule** — Each repayment row shows its accrued late fees and how much has been paid
- **Next Payment Due** — The outstanding amount includes any unpaid late fees
- **Quick Info Card** — Shows total late fees, "Ready for Default" status, download links for arrears and default letters, and buttons to regenerate letters
- **Audit Trail** — Shows all late fee processing events, status changes, and letter generation events (both auto and manual)

---

## Product Configuration

Late fee behavior is configured per loan product. The relevant settings are found when creating or editing a product:

| Setting | Description | Example |
|---------|-------------|---------|
| **Late Payment Rate** | Annual interest rate charged on overdue amounts (%) | 8% |
| **Arrears Period** | Days after a missed payment before the loan enters arrears | 14 days |
| **Default Period** | Days after a missed payment before the loan is flagged for default | 28 days |

These settings are found in **Step 3: Limits** when creating a product.

---

## Frequently Asked Questions

### Do late fees compound?

No. Late fees are charged only on the overdue principal and interest. Late fees are never charged on other late fees.

### What happens if the system is down for a day?

The backfill mechanism automatically catches up on all missed days during the next processing run. No manual intervention is needed.

### Can I manually adjust late fees?

Currently, late fees are calculated automatically based on the product's late payment rate. To adjust late fee behavior, modify the loan product's Late Payment Rate setting.

### Do late fees stop accruing after default?

No. Late fees continue to accrue on all overdue repayments even after a loan has been marked as defaulted.

### What if a borrower pays after entering arrears?

If the borrower settles all overdue amounts (including late fees), the repayment statuses are updated accordingly. However, the arrears notice letter remains on record as part of the audit trail.

### Can I regenerate the arrears or default letter?

Yes. You can manually regenerate these letters from the loan detail page under **Quick Info → Letters**. The new letter will use the latest outstanding amounts and late fees. A 3-day cooldown applies between each generation to prevent excessive letter creation. Old letters are never deleted — the system always creates a new file.

### What happens to old letters when I regenerate?

Old letter files are preserved on the server. The download link on the loan detail page always points to the most recently generated letter. Each letter generation (auto or manual) is recorded in the loan's audit trail.

### Can I run late fee processing for only my company's loans?

Yes. When you click "Process Late Fees" on the Loans page, it only processes loans belonging to your current tenant. The automated cron job processes all tenants.

### How do I see the late fee breakdown per repayment?

Navigate to the loan detail page. The repayment schedule table has a "Late Fees" column showing the accrued and paid amounts for each individual repayment.

### How do late fees and arrears appear in compliance documents?

Late fees are included in the [Lampiran A](?doc=compliance/lampiran-a) repayment table with annotations showing the fee amount. Arrears and default status affect the "Catatan" (status code) column in Lampiran A and the "TunggakanBulan" and "JumlahTunggakan" columns in the [KPKT export](?doc=compliance/kpkt-ideal-export). The [Overdue/NPL Report](?doc=compliance/reports) provides a downloadable list of all loans with overdue repayments.

---

## Related Documentation

- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — How arrears and late fees appear in the Lampiran A regulatory document
- [KPKT Portal Export (iDeal CSV)](?doc=compliance/kpkt-ideal-export) — How arrears data is included in the KPKT export
- [Reports](?doc=compliance/reports) — Overdue/NPL report for monitoring delinquent loans
- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all compliance and data export features
