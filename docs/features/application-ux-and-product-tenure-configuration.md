# Borrower application UX and product tenure configuration

This document describes **TrueKredit Pro** updates to (1) how **loan products** configure which repayment lengths borrowers may choose, and (2) how the **borrower web application** shows **section completion** during apply.

It is intended for **engineering handoff**, **support**, and **release notes**. End-user facing copy is summarized in the [user guide: Creating loan products](../user-guide/loan-management/creating-loan-products.md).

---

## 1. Product configuration: loan length options (admin)

### Where it appears

- **TrueKredit Pro admin** (`admin_pro`): **Dashboard → Products → Add product** (wizard) and **Edit product** (Limits step).
- **Core admin** (`admin`): **Edit product** Limits step uses the same interaction model (aligned with `admin_pro`).

### Behaviour (business rules)

Administrators set **minimum** and **maximum term** (months) as before. Additionally they choose **one** of two ways borrowers see term choices:

| Mode | UI label | Meaning |
|------|----------|---------|
| **Interval** | **Equal steps** | Borrowers may select lengths from min term up to max term in **equal steps** of **N months** (formerly “term interval”). Example: min 12, max 60, step 6 → 12, 18, 24, …, 60. |
| **Explicit list** | **Only these months** | Borrowers may select **only** the months listed (comma-separated, e.g. `6, 12, 24, 36`). Each value must be within min/max term and at least 2 months. |

- If **Only these months** is selected, the saved product sends an **allowed terms** list; the interval field is not used for generating options in that case.
- If **Equal steps** is selected, **allowed terms** is cleared and the **step size (months)** drives the selectable grid or slider on the borrower side.

Validation on continue/save ensures list entries fall within min/max term and that step size stays within allowed bounds (e.g. 1–60 months, per product rules).

### UX notes

- The Limits step groups this under **“Loan length options”** with two **selectable cards** so staff do not have to infer precedence between “interval” and “explicit list” from two independent fields.
- **Hover** styling on unselected cards was softened (lighter hover background) so the control feels less heavy than the previous strong gray hover.

### Implementation pointers (code)

- Wizard pages: `apps/admin_pro/.../products/new/page.tsx`, `apps/admin_pro/.../products/[id]/edit/page.tsx`, and `apps/admin/.../products/[id]/edit/page.tsx`.
- Shared parsing/helpers for comma-separated allowed terms and validation live alongside existing application/product validation in those apps.

---

## 2. Borrower apply flow: section completion on Contact and Bank

### Where it appears

- **Borrower Pro web** (`borrower_pro`): **Apply for a loan** wizard, step **Personal information** (individual) or **Company details** (corporate).

### Behaviour

Section headers for **Identity** and **Personal information** already showed a **Complete** / **Incomplete** badge (`SectionCompleteBadge`). The following cards now match that pattern:

| Card | Individual | Corporate |
|------|------------|-----------|
| Contact | **Contact information** — complete when phone and email are valid; if the card includes **address** fields, address must also satisfy the same completeness rules used elsewhere (aligned with validation). | **Company contact** — complete when company phone and company email are filled. |
| Bank | **Bank information** — complete when bank is selected, optional “other” bank name if needed, and account number passes format rules. | Same **Bank** component; same bank completion rules. |

This gives borrowers consistent feedback that contact and bank blocks are filled before moving on, in line with Identity and Personal sections.

### Implementation pointers (code)

- `apps/borrower_pro/components/borrower-form/contact-card.tsx`
- `apps/borrower_pro/components/borrower-form/bank-card.tsx`
- `apps/borrower_pro/components/borrower-form/company-contact-card.tsx`
- Completion predicates reuse `borrower-form-validation` helpers (`isIndividualContactComplete`, `isIndividualAddressComplete` when address is part of the contact card, `isIndividualBankComplete`, `isCorporateCompanyContactComplete`).

---

## 3. Related documentation

- [Creating loan products (user guide)](../user-guide/loan-management/creating-loan-products.md) — Step 3 Limits and “Loan length options”
- UI badge component: `SectionCompleteBadge` in `apps/borrower_pro/components/ui/status-row.tsx`
