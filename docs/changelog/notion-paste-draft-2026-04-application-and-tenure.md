# Notion / release notes — paste draft (April 2026)

Use this file to copy sections into Notion pages, sprint reviews, or customer-facing “What’s new” posts. Titles are plain; adjust tone (internal vs external) as needed.

---

## Suggested Notion page title

**TrueKredit — Product & borrower updates (loan terms + apply flow)**

---

## Short blurb (hero / email intro)

We improved **how lenders configure loan repayment lengths** in the admin product wizard, and made the **borrower apply** experience clearer by showing **completion status** on contact and bank sections—matching identity and personal information.

---

## Feature: Loan length options (admin)

**Problem**  
Staff had to understand two related fields (term interval vs an explicit list of months) and how they interacted.

**What changed**  
In **Products → Create / Edit → Limits**, loan tenure is now configured under **“Loan length options”** with two clear choices:

- **Equal steps** — Borrowers get terms from your **minimum** to **maximum** term, spaced by a **step size** in months (e.g. every 6 months).
- **Only these months** — Borrowers get **only** the lengths you list (comma-separated, e.g. 6, 12, 24), each within your min/max term.

**Why it matters**  
Less ambiguity, fewer misconfigured products, and parity between **TrueKredit Pro admin** and **core admin** on edit product.

**Small polish**  
Hover states on the selection cards were softened so inactive options feel less heavy when you move the pointer over them.

---

## Feature: Section completion on apply (borrower web)

**What changed**  
On **Apply for a loan**, the **Contact information** and **Bank information** cards (and **Company contact** for corporate borrowers) now show the same **Complete / Incomplete** indicator as **Identity** and **Personal information**.

**Why it matters**  
Borrowers get consistent feedback that required blocks are done before continuing, reducing confusion and support questions.

---

## Changelog bullets (compact)

Copy as a single block:

- **Admin — Products:** Replaced confusing term interval + free-text list with **Loan length options**: **Equal steps** vs **Only these months**; validation ensures listed terms sit within min/max term.
- **Admin — Products:** Lighter hover styling on tenure mode cards.
- **Admin:** Edit product flow aligned with Pro for the same tenure UX (where applicable).
- **Borrower — Apply:** **Contact**, **Bank**, and **Company contact** sections now show **Complete / Incomplete** badges like other profile sections on the apply wizard.

---

## Internal / engineering notes (optional Notion toggle)

- Docs: `docs/features/application-ux-and-product-tenure-configuration.md`
- User guide: `docs/user-guide/loan-management/creating-loan-products.md` (Limits + loan length options)

---

## Customer-safe wording (if you publish externally)

We updated the **loan product** setup so your team can choose **either** evenly spaced repayment lengths **or** a fixed list of allowed months—without overlapping settings. We also improved the **loan application** form so **contact** and **bank** sections clearly show when they are complete.
