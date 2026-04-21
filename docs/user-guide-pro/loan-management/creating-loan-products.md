---
title: Creating Loan Products
order: 2
---

# Creating Loan Products

This guide explains how to create and configure loan products in TrueKredit. Loan products define the terms and conditions that will be applied to loans issued under that product.

---

## What is a Loan Product?

A **Loan Product** is a template that defines the rules for a specific type of loan your organization offers. For example:
- Personal Loan
- Home Improvement Loan
- Emergency Loan
- Staff Loan

Each product specifies the interest calculation method, allowable loan amounts, and term lengths.

---

## Creating a New Product

Navigate to **Dashboard → Products** and click the **"Add Product"** button. This opens a step-by-step wizard to guide you through the configuration.

### Step 1: Basic Information

Configure the fundamental settings for your loan product.

| Field | Description | Default |
|-------|-------------|---------|
| **Product Name** | A descriptive name for the loan product (e.g., "Personal Loan - Flat Rate") | Required |
| **Description** | Brief description of the product (visible to staff) | Required |
| **Interest Model** | How interest is calculated (see below) | Flat Rate |
| **Borrower Eligibility** | Which borrower types can use this product | Both |
| **Loan Schedule Type** | Jadual J (no collateral) or Jadual K (with collateral) | Jadual J |

### Step 2: Rates & Fees

Set the interest rates and fee structure.

| Field | Description | Default |
|-------|-------------|---------|
| **Interest Rate** | The standard annual interest rate (%) | 18% |
| **Late Payment Rate** | Additional annual interest charged on overdue payments (%) | 8% |
| **Legal Fee** | Fixed amount (RM) or percentage of loan amount | RM 0 |
| **Stamping Fee** | Fixed amount (RM) or percentage of loan amount | RM 0 |

### Step 3: Limits

Define the boundaries for loan amounts, terms, and collection settings.

| Field | Description | Default |
|-------|-------------|---------|
| **Minimum Amount** | The smallest loan amount allowed (RM) | RM 1,000 |
| **Maximum Amount** | The largest loan amount allowed (RM) | RM 50,000 |
| **Minimum Term** | The shortest repayment period (in months) | 6 months |
| **Maximum Term** | The longest repayment period (in months) | 60 months |
| **Arrears Period** | Days after missed payment before loan is flagged as at-risk | 14 days |
| **Default Period** | Days after missed payment before loan is marked as defaulted | 28 days |

**Loan length options** (same step): After min/max term, you choose how borrowers pick a repayment length:

- **Equal steps** — Terms from your minimum to maximum, spaced by a **step size** in months (for example step 6 between 12 and 60 gives 12, 18, 24, …, 60).
- **Only these months** — A fixed list of allowed lengths (comma-separated, e.g. `6, 12, 24`). Each value must sit between your min and max term.

You use **one** of these approaches; the product wizard makes that explicit so it is clear which settings apply. See [Setting Term Limits](#setting-term-limits) for detail.

### Step 4: Documents & Review

Configure required documents and review your product before saving.

This step shows a summary of all your settings. Review them carefully before clicking **Create Product**

---

## Interest Models Explained

When creating a product, you must choose an **Interest Model**. This determines how interest is calculated on loans.

### 1. Flat Rate

**Best for:** Simple, easy-to-understand loans

Interest is calculated on the **original principal** for the entire loan term, regardless of how much has been repaid. The same amount of interest is allocated to each month.

**Formula:**
```
Total Interest = Principal × Annual Rate × Term (in years)
Monthly Payment = (Principal + Total Interest) ÷ Number of Months
```

**Example:**
- Loan: RM 10,000
- Rate: 8% per annum
- Term: 12 months

```
Total Interest = 10,000 × 8% × 1 year = RM 800
Monthly Payment = (10,000 + 800) ÷ 12 = RM 900
Total Repayment = RM 10,800
```

**Note:** Flat rate offers predictable fixed monthly payments with interest spread evenly across the term.

---

### 2. Rule 78

**Best for:** Front-loaded interest where more interest is collected earlier in the loan term

Rule 78 (also known as the sum-of-digits method) uses the same **total interest** as Flat Rate, but allocates it differently across installments. A larger portion of interest is charged in the early months and a smaller portion in the later months.

**How it works:**
- Total interest is calculated the same way as Flat Rate: Principal × Rate × Term
- The monthly payment amount is the same as Flat Rate: (Principal + Total Interest) ÷ Term
- The split between principal and interest in each payment varies: early payments have more interest, later payments have more principal

**Example (RM 10,000 at 8% for 12 months):**

| Aspect | Flat Rate | Rule 78 |
|--------|-----------|----------|
| Total Interest | RM 800 | RM 800 |
| Monthly Payment | RM 900 | RM 900 |
| Total Repayment | RM 10,800 | RM 10,800 |
| First payment (interest portion) | RM 66.67 | Higher |
| Last payment (interest portion) | RM 66.67 | Lower |

**Note:** Rule 78 is useful when you want to collect more interest upfront. Early settlement discounts can still be applied based on your product's discount settings (percentage or fixed on remaining future interest).

---

## Interest Model Comparison

| Aspect | Flat Rate | Rule 78 |
|--------|-----------|---------|
| Total Interest | Same formula | Same formula |
| Monthly Payment | Fixed | Fixed |
| Interest Allocation | Even across months | Front-loaded (more early, less late) |
| Complexity | Simple | Moderate |
| Best For | Predictable, even repayments | When more interest is needed upfront |

**Example Comparison (RM 10,000 at 8% for 12 months):**

| Model | Monthly Payment | Total Interest | Total Repayment |
|-------|-----------------|----------------|-----------------|
| Flat Rate | RM 900.00 | RM 800.00 | RM 10,800.00 |
| Rule 78 | RM 900.00 | RM 800.00 | RM 10,800.00 |

---

## Setting Amount Limits

Define the range of loan amounts allowed for this product:

- **Minimum Amount:** The smallest loan you'll issue under this product
- **Maximum Amount:** The largest loan you'll issue under this product

**Tips:**
- Set realistic limits based on your organization's risk tolerance
- Consider the borrower segment for this product
- Amounts outside this range will be rejected when creating a loan application

---

## Setting Term Limits

Define the repayment period range (in months):

- **Minimum Term:** Shortest allowed repayment period
- **Maximum Term:** Longest allowed repayment period

**Tips:**
- Shorter terms mean higher monthly payments but less total interest
- Longer terms mean lower monthly payments but more total interest
- Consider your organization's cash flow needs

**Common Configurations:**
| Product Type | Min Term | Max Term |
|--------------|----------|----------|
| Emergency Loan | 1 month | 6 months |
| Personal Loan | 6 months | 36 months |
| Home Improvement | 12 months | 84 months |

### Loan length options (how borrowers choose a term)

Beyond min and max term, you configure **how** applicants select a length:

1. **Equal steps**  
   Borrowers see options from **minimum term** to **maximum term** at a fixed spacing (e.g. every 3 or 6 months). This replaces a confusing split between “interval” and a separate list—pick this mode when you want a regular ladder of terms.

2. **Only these months**  
   Borrowers see **only** the months you enter (e.g. 6, 12, 24). Use this when you want a small, specific set of products (e.g. only 12- or 24-month loans) regardless of a wide min/max range, or when marketing defines exact tenures.

**Rules:**

- Listed terms must each be at least **2 months** and fall **between** your minimum and maximum term.
- If you use **Only these months**, leave **Equal steps** behaviour unused—the product stores your explicit list.

For technical and UX notes (admin apps, borrower portal), see the internal feature doc: `docs/features/application-ux-and-product-tenure-configuration.md`.

---

## Borrower Eligibility

Control which types of borrowers can use this loan product.

### Eligibility Options

| Option | Description |
|--------|-------------|
| **Individual Only** | Only individual borrowers (persons) can apply |
| **Corporate Only** | Only corporate borrowers (businesses) can apply |
| **Both** | Both individual and corporate borrowers can apply |

### When to Use

- **Individual Only**: Personal loans, salary-backed loans, emergency loans
- **Corporate Only**: Business working capital, equipment financing, trade financing
- **Both**: General purpose loans that suit both personal and business needs

### Product Card Display

The product card shows an eligibility badge:
- Person icon for Individual Only
- Building icon for Corporate Only
- Group icon for Both

### Application Filtering

When creating a loan application, only products matching the selected borrower's type will appear. For example, if you select a corporate borrower, Individual Only products will be hidden.

---

## Loan Schedule Type (Jadual J / Jadual K)

Per KPKT (Ministry of Housing and Local Government) regulations, loan products must be categorized based on collateral requirements.

### Jadual J - No Collateral

**What it means:**
- Loans issued without any security or collateral
- Higher risk for the lender, typically higher interest rates allowed
- Most personal loans fall under this category

**Default interest rate:** 18% per annum (configurable)

**Use cases:**
- Personal loans
- Emergency loans
- Education loans
- Working capital (unsecured)

### Jadual K - With Collateral

**What it means:**
- Loans secured by assets (property, vehicle, fixed deposits, etc.)
- Lower risk for the lender, capped interest rates
- Maximum interest rate is 12% per annum

**Default interest rate:** 12% per annum (auto-set when selected)

**Use cases:**
- Secured personal loans
- Home improvement loans (with property as collateral)
- Vehicle-backed loans
- Asset financing

### Automatic Rate Adjustment

When you select **Jadual K** for a product, the system will:
1. Automatically set the interest rate to 12%
2. Show a note reminding you of the 12% maximum rate

If you manually change the interest rate above 12% for a Jadual K product, a warning will appear indicating the rate exceeds the typical maximum.

### Product Card Display

The product card shows the loan schedule type with a badge:
- **Jadual J** - Standard outline badge with shield icon
- **Jadual K** - Highlighted badge with checkmark shield icon

---

## Fee Configuration

Products can include legal and stamping fees that are calculated at the time of loan application.

### Legal Fee

Covers legal documentation and processing costs.

| Type | Description | Example |
|------|-------------|---------|
| **Fixed** | A set amount regardless of loan size | RM 150 |
| **Percentage** | Calculated as a percentage of loan amount | 1% (RM 100 on a RM 10,000 loan) |

### Stamping Fee

Covers stamp duty for the loan agreement.

| Type | Description | Example |
|------|-------------|---------|
| **Fixed** | A set amount regardless of loan size | RM 200 |
| **Percentage** | Calculated as a percentage of loan amount | 0.5% (RM 50 on a RM 10,000 loan) |

### Net Disbursement

The borrower receives the **Net Disbursement** amount, which is:

```
Net Disbursement = Loan Amount - Legal Fee - Stamping Fee
```

All fees are clearly displayed during the loan application process before submission.

---

## Required Documents

Each loan product can specify which documents borrowers must provide when applying for a loan. This ensures consistent documentation requirements across all applications using that product.

### Document Recommendations

When creating or editing a product, TrueKredit shows **smart recommendations** based on your product configuration:

- **Borrower Type** (Individual, Corporate, or Both) - Different document requirements
- **Loan Schedule Type** (Jadual J or K) - Collateral documents for Jadual K

Click any recommendation to instantly add it to your product, or use **"Add All"** to add all recommendations at once.

### Recommended Documents by Borrower Type

#### For Individual Borrowers

| Document | Default Status | Purpose |
|----------|---------------|---------|
| IC Front | Required | Identity verification |
| IC Back | Required | Identity verification |
| Payslip (3 months) | Required | Income verification |
| Bank Statement (3 months) | Required | Financial history |
| Employment Letter | Optional | Employment verification |

#### For Corporate Borrowers

| Document | Default Status | Purpose |
|----------|---------------|---------|
| SSM Registration (Form 9/24/49) | Required | Business registration |
| Company Profile | Optional | Business overview |
| Director IC | Required | Director verification |
| Board Resolution | Optional | Authorization |
| Bank Statement (3 months) | Required | Financial history |

### Additional Documents for Jadual K (Collateral)

When a product uses **Jadual K** (secured loans), additional collateral-related documents are recommended:

| Document | Default Status | Purpose |
|----------|---------------|---------|
| Collateral Documents | Required | Security documentation |
| Property Title / Grant | Optional | Property ownership proof |
| Vehicle Registration Card | Optional | Vehicle ownership proof |
| Valuation Report | Optional | Asset valuation |

### Custom Documents

You can also add custom document categories by typing a name in the input field and clicking **"Add Custom"**. This is useful for:

- Organization-specific requirements
- Specialized loan products
- Additional verification documents

### Document Status

Each document can be marked as:

- **Required** - Must be uploaded before the application can be submitted
- **Optional** - Can be uploaded but not mandatory

Toggle between Required and Optional by clicking the corresponding button next to each document.

---

## Late Payment & Collection Settings

These settings control how overdue payments are handled:

### Late Payment Rate

An additional annual interest rate charged on overdue payments. This incentivizes timely repayment.

- **Default:** 8% per annum
- **Range:** 0% to 100%
- **Applied:** On overdue amounts only

**Example:**
If a borrower has an overdue payment of RM 500, and the late payment rate is 8%:
- Daily late charge = RM 500 × 8% ÷ 365 = RM 0.11 per day

### Arrears Period

The number of days after a missed payment before the loan is flagged as "at risk". This triggers:
- Reminder notifications to the borrower
- Alerts to staff for follow-up

- **Default:** 14 days
- **Recommended range:** 7 to 30 days

### Default Period

The number of days after a missed payment before the loan status changes to "Defaulted". This represents a more serious collection stage.

- **Default:** 28 days
- **Must be:** Greater than or equal to Arrears Period
- **Recommended range:** 21 to 90 days

**Timeline Example (using defaults):**

```
Day 0:  Payment due date
Day 1:  Payment missed → Status: OVERDUE
Day 14: Arrears period reached → Loan flagged as AT RISK
        → Notifications sent to borrower
        → Staff alerted for follow-up
Day 28: Default period reached → Status: DEFAULTED
        → Escalation procedures triggered
```

---

## Product Status

Products can be **Active** or **Inactive**:

- **Active:** Can be used for new loan applications
- **Inactive:** Cannot be used for new applications but existing loans remain unaffected

**When to deactivate a product:**
- Discontinuing a loan offering
- Seasonal products (e.g., festive loans)
- Replacing with an updated version

**Note:** If you try to delete a product that has existing loans, it will automatically be deactivated instead.

---

## Best Practices

1. **Use clear naming conventions**
   - Good: "Personal Loan - 12 Months - Flat Rate"
   - Avoid: "Loan Type A"

2. **Add descriptions**
   - Document any special conditions or target borrowers
   - Helps staff select the right product

3. **Review rates regularly**
   - Update default rates based on market conditions
   - Consider creating new products for new rates rather than changing existing ones

4. **Start conservative**
   - Begin with lower maximum amounts and shorter terms
   - Increase limits as you understand borrower behavior

---

## Viewing Product Details

Click on a product name or the **View** button to see the full product details page. This page shows:

- **Basic Information** - Name, interest model, borrower eligibility, loan schedule type
- **Rates & Fees** - Interest rate, late payment rate, legal fee, stamping fee
- **Limits & Collection** - Amount range, term range, arrears period, default period
- **Required Documents** - List of required and optional documents
- **Usage Summary** - Number of active loans and applications using this product
- **Activity Timeline** - Audit trail of all changes made to the product

---

## Editing Products

You can edit any product by clicking the **Edit** button on the product card or from the product detail page.

The edit process uses the same step-by-step wizard as creating a new product:

1. **Basic Info** - Update name, description, interest model, eligibility, schedule type
2. **Rates & Fees** - Modify interest rates and fees
3. **Limits** - Change amount/term limits and collection settings
4. **Documents & Review** - Update required documents and toggle product status

### Product Status Toggle

In the edit wizard (Step 4), you can toggle the product status between **Active** and **Inactive**:

- **Active** - Product is available for new loan applications
- **Inactive** - Product is hidden from new applications

### What Can Be Changed

All product settings can be modified:
- Product name and description
- Interest model
- Interest rate and late payment rate
- Arrears and default periods
- Amount and term limits
- Required documents
- Active/Inactive status

### Impact of Changes

| Change | Effect on Existing Loans | Effect on New Loans |
|--------|-------------------------|---------------------|
| Interest rate | No change | New rate applied |
| Late payment rate | No change | New rate applied |
| Arrears/Default periods | No change | New periods applied |
| Amount/Term limits | No change | New limits enforced |
| Required documents | No change | New documents required |
| Deactivate product | No change | Cannot create new loans |

**Important:** Changes to a product only affect **future** loan applications. Existing loans retain their original terms from when they were created.

---

## Audit Trail

Every change made to a loan product is recorded in the **Activity Timeline**, visible on the product detail page.

### What's Tracked

- **Product Created** - When and by whom the product was created
- **Product Updated** - All field changes with before/after values
- **Product Deactivated/Activated** - Status changes
- **Product Deleted** - If the product was removed

### Change Details

For each update, the timeline shows:
- **What changed** - The field name (e.g., "Interest Rate", "Required Documents")
- **Previous value** - The old value before the change
- **New value** - The updated value
- **Who made the change** - The user who performed the action
- **When** - Relative time (e.g., "5 minutes ago") with full date on hover

### Example Timeline Entry

```
Updated · 5 minutes ago
by Ahmad Abdullah

Interest Rate
  From: 18
  To: 15

Required Documents
  From: IC Front *, IC Back *, Payslip (3 months) *
  To: IC Front *, IC Back *, Payslip (3 months) *, Bank Statement *
```

The `*` indicates required documents.

### Use Cases

- **Compliance auditing** - Track who changed what and when
- **Troubleshooting** - Understand why a product behaves differently
- **Accountability** - Maintain a record of all administrative actions

---

## Frequently Asked Questions

**Q: Can I change a product's interest model after creating it?**
A: Yes, but it only affects new loans. Existing loans keep their original terms.

**Q: What happens to existing loans if I deactivate a product?**
A: Nothing changes. Existing loans continue with their original schedule. Only new applications are prevented.

**Q: Can I have multiple products with the same interest model?**
A: Yes. You might have "Personal Loan - Standard" and "Personal Loan - Staff" with the same model but different rates.

**Q: Is the interest rate annual or monthly?**
A: Always annual. The system converts it to monthly for calculations.

---

## Need Help?

Contact your system administrator if you need assistance with:
- Custom interest calculation requirements
- Bulk product imports
- Product configuration for specific regulatory requirements
