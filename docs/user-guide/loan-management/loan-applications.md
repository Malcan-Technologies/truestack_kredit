---
title: Loan Applications
order: 3
---

# Loan Applications

This guide explains how to create, manage, and process loan applications in TrueKredit. The loan application workflow ensures proper documentation and approval before a loan is issued.

---

## Overview

Loan applications go through a structured workflow:

1. **Draft** - Application created, documents being collected
2. **Submitted** - Ready for review
3. **Under Review** - Being evaluated by admin
4. **Approved** - Loan is ready for disbursement
5. **Rejected** - Application was declined

---

## Creating a New Loan Application

Navigate to **Dashboard → Applications** and click **New Application** to start the 4-step wizard.

### Step 1: Select Borrower

Choose the borrower for this loan application.

**Features:**
- Search by name, IC number, phone, or email
- View verification status (e-KYC Verified or Manual Verify)
- See borrower type badge (Individual or Corporate)

**Corporate Borrowers:**
- Display shows company name and "Rep: [Representative Name]"
- SSM number is shown instead of IC number

**Creating a New Borrower:**
If the borrower doesn't exist, click **New Borrower** to create one. This opens the borrower creation page in a new tab.

### Step 2: Select Product

Choose the loan product for this application.

**Product Filtering:**
Products are automatically filtered based on the selected borrower's type:
- Individual borrowers see products marked as "Individual Only" or "Both"
- Corporate borrowers see products marked as "Corporate Only" or "Both"

**Product Information Displayed:**
- Product name and description
- Interest model (Flat Rate, Declining Balance, Effective Rate)
- Loan schedule type badge (Jadual J or Jadual K)
- Interest rate
- Amount and term ranges
- Legal and stamping fees

**No Eligible Products:**
If no products are available for the selected borrower type, you'll see a message indicating this. Contact your administrator to configure appropriate products.

### Step 3: Enter Loan Details

Specify the loan amount and term.

**Amount Input:**
- Enter the requested loan amount
- Must be within the product's minimum and maximum limits
- Invalid amounts show error messages and red borders

**Term Input:**
- Enter the repayment period in months
- Must be within the product's minimum and maximum limits
- Invalid terms show error messages and red borders

**Loan Summary Card:**
As you enter values, the loan summary updates in real-time:

| Field | Description |
|-------|-------------|
| Loan Amount | The principal amount requested |
| Term | Repayment period in months |
| Interest Rate | Annual interest rate from the product |
| Legal Fee | Calculated based on product settings |
| Stamping Fee | Calculated based on product settings |
| Total Fees | Legal fee + Stamping fee |
| Net Disbursement | Loan amount minus total fees (what borrower receives) |
| Monthly Payment | Estimated monthly installment |
| Total Interest | Total interest over the loan term |
| Total Payable | Principal + Total interest |

### Step 4: Review & Confirm

Review all details before creating the application.

**Borrower Card:**
- Name (or company name for corporate)
- Verification badge
- IC/SSM number
- Phone and email

**Product Card:**
- Product name
- Interest model
- Interest rate
- Late payment rate
- Arrears and default periods

**Loan Summary:**
Complete breakdown of:
- Principal and term
- Monthly payment
- All fees
- Net disbursement
- Total interest and total payable

Click **Create Application** to save the application in Draft status.

---

## Managing Applications

### Applications List

The Applications page shows all loan applications with:

| Column | Description |
|--------|-------------|
| Borrower | Name (and company for corporate) with type badge |
| Type | Individual or Corporate badge |
| Product | Loan product name |
| Amount | Requested loan amount |
| Term | Repayment period |
| Status | Current application status |
| Created | Application creation date |
| Actions | View button to open details |

### Application Statuses

| Status | Badge Color | Description |
|--------|-------------|-------------|
| Draft | Gray | Documents being collected, not yet submitted |
| Submitted | Blue | Ready for admin review |
| Under Review | Yellow | Being evaluated |
| Approved | Green | Loan approved, ready for disbursement |
| Rejected | Red | Application declined |

---

## Application Details Page

Click **View** on any application to see its full details.

### Borrower Information

Shows the borrower's key details:
- Name with link to borrower profile
- Verification badge
- IC/SSM number
- Phone and email

### Product Information

Shows the product configuration:
- Product name and interest model
- Interest rate and late payment rate
- Arrears and default periods

### Loan Summary

Complete financial breakdown in table format.

### Document Upload

Upload required documents for the application.

**Required Documents:**
Based on the product's configuration, some documents are marked as mandatory. These must be uploaded before the application can be submitted.

**Document Categories:**
- Each document category from the product appears as a section
- Upload button to add files
- View button to open uploaded documents in a new tab
- Delete button to remove documents

**Other Documents:**
Upload additional supporting documents that don't fit the predefined categories.

### Application Timeline

View the audit trail showing:
- When the application was created
- Who made changes
- Status transitions
- Document uploads

---

## Submitting an Application

### Prerequisites

Before submitting, ensure:
1. All mandatory documents are uploaded (marked with "Required")
2. Loan amount and term are within product limits

### Missing Documents Warning

If required documents are missing, you'll see:
- A warning banner listing missing documents
- The Submit button is disabled
- Tooltip explaining why submission is blocked

### Submission Process

1. Review all application details
2. Ensure all required documents are uploaded
3. Click **Submit for Review**
4. Confirm in the popup dialog

**Confirmation Dialog:**
- Shows application summary (borrower, product, amount, term)
- Warning that submission is final
- Cancel or Confirm buttons

After submission, the application status changes to "Submitted" and cannot be modified.

---

## Approving an Application

Only applications with "Submitted" status can be approved.

### Approval Process

1. Review the application details and documents
2. Verify borrower information
3. Click **Approve**
4. Confirm in the popup dialog

**Confirmation Dialog:**
- Shows application summary
- Green styling indicating positive action
- Notes that a loan will be created upon approval

After approval:
- Application status changes to "Approved"
- A new loan record is created
- The loan appears in the Loans module

---

## Rejecting an Application

Only applications with "Submitted" status can be rejected.

### Rejection Process

1. Review the application details
2. Determine the reason for rejection
3. Click **Reject**
4. Confirm in the popup dialog

**Confirmation Dialog:**
- Shows application summary
- Red styling indicating negative action
- Warning that rejection is irreversible

After rejection:
- Application status changes to "Rejected"
- The application cannot be reopened or modified

---

## Product Filtering for Borrower Types

When creating applications, the system automatically matches products to borrowers:

### Individual Borrowers

Can use products with eligibility set to:
- Individual Only
- Both

### Corporate Borrowers

Can use products with eligibility set to:
- Corporate Only
- Both

### Example

If you have:
- "Personal Loan" (Individual Only)
- "Business Working Capital" (Corporate Only)
- "General Purpose Loan" (Both)

| Borrower Type | Available Products |
|---------------|-------------------|
| Individual | Personal Loan, General Purpose Loan |
| Corporate | Business Working Capital, General Purpose Loan |

---

## Loan Schedule Types

Products are categorized by collateral requirements:

### Jadual J (No Collateral)

- Unsecured loans
- Higher interest rates allowed
- Badge shows shield icon

### Jadual K (With Collateral)

- Secured by assets
- Maximum 12% interest rate
- Badge shows checkmark shield icon

This information is displayed on product cards during selection.

---

## Best Practices

### Document Collection

- Collect all required documents before creating the application
- Verify document authenticity before uploading
- Use clear file names for easy identification

### Review Before Submit

- Double-check borrower details
- Verify loan amount and term are appropriate
- Ensure fee calculations are correct

### Timely Processing

- Review submitted applications promptly
- Communicate with borrowers about missing documents
- Document reasons for rejections

---

## Frequently Asked Questions

**Q: Can I edit an application after submission?**
A: No, submitted applications are locked. If changes are needed, reject and create a new application.

**Q: Who can approve or reject applications?**
A: Users with Admin or Owner roles in the tenant.

**Q: What happens to documents if an application is rejected?**
A: Documents remain stored but the application cannot be reopened.

**Q: Can I delete a draft application?**
A: Currently, draft applications cannot be deleted but can be left in draft status.

**Q: How do I view uploaded documents?**
A: Click the View button next to any uploaded document to open it in a new browser tab.

---

## Need Help?

Contact your system administrator if you need assistance with:
- Document upload issues
- Application processing questions
- Product configuration for specific borrower types
