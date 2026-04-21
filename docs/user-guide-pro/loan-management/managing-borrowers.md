---
title: Managing Borrowers
order: 1
---

# Managing Borrowers

Learn how to create, view, and manage borrower records in TrueKredit Pro. Borrower management is essential for compliance and efficient loan processing.

> In Pro, borrowers can also **self-register** through the borrower portal and submit their own applications. Admin-side borrower management remains available for records created manually, imported, or needing correction. See [Borrower Portal Overview](?doc=borrower-portal/overview).

---

## Overview

The Borrowers module allows you to:

- Create and maintain borrower profiles for individuals and corporate entities
- Store compliance-required information
- Track borrower activity, KYC state, and document history
- Link borrowers to loan applications and active loans
- For corporate borrowers, manage **directors / company members** and their per-director KYC state

---

## Borrower Types

TrueKredit supports two types of borrowers:

### Individual Borrowers

Individual borrowers are natural persons applying for personal loans. They are identified by:

- **IC Number (MyKad)** - 12-digit Malaysian identity card number
- **Passport** - For non-Malaysians

Individual borrowers require personal compliance information such as date of birth, gender, race, education level, occupation, and employment status.

### Corporate Borrowers

Corporate borrowers are registered businesses (Sdn Bhd, partnerships, sole proprietorships). They are identified by:

- **SSM Registration Number** - Business registration number from SSM

Corporate borrowers require company information such as:

- Company name and SSM registration number
- Business address and nature of business
- Authorized representative details (name and IC)
- Company contact information
- Optional: Date of incorporation, paid-up capital, number of employees

### Borrower Type Badge

In the borrower list and detail pages, you'll see a badge indicating the borrower type:

- **Individual** - Shows a person icon with the borrower's name
- **Corporate** - Shows a building icon with the company name

### Product Eligibility

Some loan products may be restricted to specific borrower types. When creating a loan application:

- **Individual Only** products - Only available for individual borrowers
- **Corporate Only** products - Only available for corporate borrowers
- **Both** products - Available for all borrower types

---

## Viewing Borrowers

### Borrower List

Navigate to **Borrowers** from the sidebar to see all registered borrowers.

The table displays:

| Column | Description |
|--------|-------------|
| Name | Borrower's full name (click to view details) |
| Identity | IC/Passport number with verification status |
| Verification | e-KYC verified or manual verification indicator |
| Contact | Phone number and email |
| Performance | Borrower-level repayment risk profile and on-time behavior |
| Created | When the borrower was registered |
| Loans | Number of active loans |

### Searching Borrowers

Use the search bar to find borrowers by:

- Name
- IC number
- Passport number
- Phone number
- Email address

### Borrower Details

Click on a borrower's name to view their full profile, including:

- Identity information
- Personal details (DOB, gender, race, education, occupation)
- Contact information
- Bank details
- Payment performance summary (risk profile, on-time rate, and borrower-level signals)
- Emergency contact
- Activity timeline

---

## Creating a New Borrower

1. Click **New Borrower** on the Borrowers page
2. Select the **Borrower Type** (Individual or Corporate)
3. Fill in the required information (fields marked with *)

---

### Creating Individual Borrowers

#### Identity Information

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Full legal name |
| Document Type | Yes | IC (MyKad) or Passport |
| IC/Passport Number | Yes | For IC: enter 12 digits only, no dashes |

**For Malaysian IC holders:**
- Enter the 12-digit IC number without dashes
- Date of birth and gender are automatically extracted
- The IC number will be displayed with dashes in the table

**For Passport holders:**
- Select "Passport" as document type
- Manually enter date of birth and gender

#### Personal Information (Compliance Required)

| Field | Required | Notes |
|-------|----------|-------|
| Date of Birth | Yes | Auto-extracted from IC if applicable |
| Gender | Yes | Auto-extracted from IC if applicable |
| Race | Yes | Required for regulatory reporting |
| Education Level | Yes | Highest education attained |
| Occupation | Yes | Current job title |
| Employment Status | Yes | Employed, Self-employed, etc. |

#### Contact Information

| Field | Required | Notes |
|-------|----------|-------|
| Phone | Yes | Primary contact number |
| Email | Yes | Email address |
| Address | Yes | Full residential address |

#### Bank Information

| Field | Required | Notes |
|-------|----------|-------|
| Bank | Yes | Select from list or choose "Other" |
| Bank Name (Other) | If "Other" selected | Enter the bank name manually |
| Account Number | Yes | Bank account for disbursements |

#### Emergency Contact (Optional)

| Field | Required | Notes |
|-------|----------|-------|
| Name | No | Emergency contact's name |
| Phone | No | Emergency contact's phone |
| Relationship | No | Relationship to borrower |

---

### Creating Corporate Borrowers

When you select **Corporate** as the borrower type, a different set of fields appears:

#### Company Information (Required)

| Field | Required | Notes |
|-------|----------|-------|
| Company Name | Yes | Trading/business name as registered |
| SSM Registration Number | Yes | SSM certificate number |
| Business Address | Yes | Registered business address |
| Nature of Business | Yes | Industry or business type |

#### Authorized Representative (Required)

| Field | Required | Notes |
|-------|----------|-------|
| Representative Name | Yes | Name of the authorized signatory |
| Representative IC | Yes | IC number of the representative |

#### Company Contact

| Field | Required | Notes |
|-------|----------|-------|
| Company Phone | Yes | Main company phone number |
| Company Email | Yes | Official company email |

#### Bank Information

| Field | Required | Notes |
|-------|----------|-------|
| Bank | Yes | Select from list or choose "Other" |
| Account Number | Yes | Company bank account for disbursements |

#### Optional Company Information

| Field | Required | Notes |
|-------|----------|-------|
| Date of Incorporation | No | When the company was incorporated |
| Paid-up Capital | No | Paid-up capital amount (RM) |
| Number of Employees | No | Current employee count |

---

4. Click **Create Borrower** to save

---

## Editing Borrower Details

1. Navigate to the borrower's detail page (click their name)
2. Click **Edit Borrower** in the top-right corner
3. Modify the necessary fields
4. Click **Save Changes**

### Editing Restrictions

- **e-KYC Verified borrowers**: Document type and IC/Passport number cannot be modified
- **Manually verified borrowers**: All fields remain editable

All changes are logged in the Activity Timeline with the previous and new values.

---

## Document Verification Status

Each borrower has a verification status for their identity document:

### Manual Verification (Amber Badge)

- Default status for all new borrowers
- Indicates the document was manually entered
- Admin should exercise caution when processing loans
- Document details remain editable

### e-KYC Verified (Green Badge)

- Indicates the document was verified through the e-KYC system
- Higher trust level for loan processing
- Document type and number are locked and cannot be modified

---

## Activity Timeline

The Activity Timeline on the borrower detail page shows:

- **When** changes were made
- **Who** made the changes
- **What** was changed (previous vs new values)

### Timeline Events

| Event | Description |
|-------|-------------|
| Created | Borrower record was created |
| Updated | One or more fields were modified |

The timeline loads 10 events at a time. Click **Load More** to see older events.

---

## Copy to Clipboard

Fields with important information (phone, email, address, bank account) have a copy icon. Click it to copy the value to your clipboard. A confirmation toast will appear.

---

## Best Practices

### Data Entry

- Always verify IC numbers before saving
- Use consistent phone number formats (e.g., +60123456789)
- Enter complete addresses for compliance
- Keep emergency contact information up to date

### Compliance

- Ensure all mandatory fields are completed
- Verify document numbers match physical documents
- Review manually verified borrowers carefully before loan approval

### Data Maintenance

- Regularly update contact information
- Check for duplicate borrower records
- Review and update occupation/employment status periodically

---

## Frequently Asked Questions

### Can I delete a borrower?

No, borrower records cannot be deleted to maintain audit trail integrity. If a borrower is no longer active, their record simply remains without active loans.

### What if I entered the wrong IC number?

For manually verified borrowers, you can edit the IC number through the Edit function. For e-KYC verified borrowers, contact support.

### Can the same person be registered multiple times?

No. IC numbers must be unique in your deployment. The system will reject duplicate IC numbers.

### How do I find a borrower quickly?

Use the search bar on the Borrowers page. You can search by name, IC, phone, or email.

### Why is "Monthly Income" mandatory for individual borrowers?

Monthly Income is required for generating [Lampiran A](?doc=compliance/lampiran-a), a regulatory document mandated by KPKT. It appears as the "Pendapatan Sebulan" field on the form. A value of 0 is accepted if the borrower has no income.

### Why is "Taraf (Bumi Status)" mandatory for corporate borrowers?

The Bumi Status field is required for both the [Lampiran A](?doc=compliance/lampiran-a) and [KPKT Portal Export](?doc=compliance/kpkt-ideal-export). It classifies the borrower as Bumi, Bukan Bumi, or Asing for regulatory reporting purposes.

---

## Related Documentation

- [Borrower Performance & Risk](?doc=loan-management/borrower-performance-and-risk) — Understanding borrower-level risk badges, on-time rate, tags, and signals
- [Lampiran A (Borrower Ledger)](?doc=compliance/lampiran-a) — How borrower details appear in the Lampiran A regulatory document
- [KPKT Portal Export (iDeal CSV)](?doc=compliance/kpkt-ideal-export) — How borrower data is used in the KPKT export
- [Compliance & Exports Overview](?doc=compliance/compliance-overview) — Overview of all compliance and data export features
- [Loan Applications](?doc=loan-management/loan-applications) — How borrower records are used in loan applications
- [Data Exports](?doc=compliance/data-exports) — Exporting borrower records as CSV
