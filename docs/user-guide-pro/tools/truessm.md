---
title: TrueSSM™ — Verify Corporate Borrowers
order: 2
---

# TrueSSM™ — Verify Corporate Borrowers

TrueSSM™ lets you pull a verified company profile directly from Suruhanjaya Syarikat Malaysia (SSM) into a corporate borrower record. Use it to confirm registration details, auto-fill borrower fields, and keep an auditable PDF copy of the registry record on file.

> TrueSSM™ is delivered in partnership with **ssmsearch.com**, sourcing data directly from SSM.

---

## What You Can Do

- **Pull a company profile** for any corporate borrower with an SSM Registration No.
- **Save a PDF** of the registry record to the borrower's documents automatically.
- **Apply selected fields** (company name, address, paid-up capital, etc.) to the borrower record, with a clear preview of what will change.
- **See per-field provenance badges** showing which borrower fields are verified from SSM and when they were last synced.
- **Track every pull and sync** in the borrower activity timeline.

---

## When to Use TrueSSM™

| Situation | Action |
|----|----|
| Onboarding a new corporate borrower | Pull a profile to confirm the entity exists, fill in registration details, and save evidence to the documents folder. |
| Reviewing an existing corporate borrower | Re-pull periodically to keep registered address and paid-up capital up to date. |
| Spotting discrepancies between submitted data and SSM records | Use the Apply preview to see exactly where staff-entered values differ from the registry. |
| Compliance / audit requests | The saved PDF and timeline entries provide a complete trail of when and by whom the registry was checked. |

---

## Permissions

| Permission | What it grants |
|----|----|
| `truessm.view` | See the TrueSSM™ panel, badges, and pull history on the borrower detail page. |
| `truessm.manage` | Pull from SSM and apply fields to the borrower record (billable actions). |

Both permissions are auto-granted to roles that already have `borrowers.view` / `borrowers.edit`, so most ops admins, credit officers, and compliance officers have access by default. Adjust under **Settings → Roles** if you want to restrict the billable actions to a smaller team.

---

## How to Pull a Company Profile

1. Open the corporate borrower's detail page (**Dashboard → Borrowers → \[borrower\]**).
2. In the right-hand column, find the **TrueSSM™** panel (it appears above TrueIdentity for corporate borrowers).
3. Make sure the **SSM Registration No** is filled in the Company Information section. If it's missing, the panel will prompt you to add one.
4. Click **Pull from TrueSSM™**.
5. A confirmation dialog will show the cost (currently **154 credits / RM 15.40 per pull**, billed against your TrueStack credit balance). Review and click **Confirm pull**.
6. On success, you'll see a toast confirming the pull and an **Apply** preview will open automatically.

### What Happens Behind the Scenes

- A PDF of the company profile is generated and added to the borrower's **Borrower Documents** under the **Company Profile** category. Files are named `SSM Company Profile {regNo} {date}.pdf` and tagged with a small **From TrueSSM™** pill.
- A `TrueSSM™ Pull` entry is added to the borrower timeline with the registration number, credit cost, and TrueStack `usage_id`.
- The borrower record is **not** modified yet — you decide whether to apply the data in the next step.

---

## How to Apply Fields to the Borrower

When the Apply preview opens (either right after a pull or by clicking **Apply to borrower** for an existing pull), you'll see a list of mappable fields side by side:

- **Current** — the value currently on the borrower record.
- **TrueSSM™** — the value returned by SSM.

Each row shows one of these badges:

| Badge | Meaning | Default state |
|----|----|----|
| **Will fill** | Borrower field is empty; SSM has data. | Pre-checked. |
| **Will overwrite** | Both differ — applying replaces the current value. | Unchecked (opt-in). |
| **Unchanged** | Both match. | Not selectable. |
| **No SSM data** | SSM did not return a value for this field. | Not selectable. |

Pick the fields you want to apply and click **Apply N fields**. The borrower record updates immediately, each applied field gets a solid blue **SSM** verification badge, and a `TrueSSM™ Synced` entry appears in the timeline.

### Mappable Fields

- Company Name
- SSM Registration No
- Date of Incorporation
- Paid-up Capital (RM)
- Address Line 1 / Line 2
- City / State / Postcode / Country

---

## Understanding the SSM Badges

Every mappable field in the Company Information and Address cards shows a small badge next to its label (only for corporate borrowers, when you have `truessm.view`).

- **Solid blue "SSM" badge** — that field has been synced from a TrueSSM™ pull. Hover for the sync date and usage ID.
- **Dashed grey "SSM" badge** — that field has not been verified yet. Click it to scroll to the TrueSSM™ panel and pull from SSM.

> If you later edit a TrueSSM™-verified field manually, the blue badge falls back to the dashed grey state. This is intentional — we don't claim a field is "verified by SSM" once it's been overridden.

---

## Re-pulling

In the **Last pulled** card on the panel you can:

- **Apply to borrower** — re-open the Apply preview against the most recent pull without billing again.
- **Re-pull** — fetch a fresh snapshot from SSM. This is a new billable pull and creates a new PDF + timeline entry.
- **Open the saved PDF** — links into the **Borrower Documents** section where the PDF lives.
- **Copy the Usage ID** — useful when contacting support about a specific pull.

---

## Billing & Credits

- Pulls are billed against your **TrueStack credits** (1 credit = RM 0.10 on the default template).
- The **company profile** report currently costs **154 credits (RM 15.40)** per pull.
- You are **not billed** when:
 - The entity is not found (`ENTITY_NOT_FOUND`).
 - The entity is not the right type for this report (`ENTITY_TYPE_MISMATCH`).
 - The registry is temporarily unavailable (`REGISTRY_UNAVAILABLE`).
- Re-pulls **are** billable — they fetch a fresh snapshot. Use **Apply to borrower** instead if you just want to re-open the preview from the last pull.

If you hit `INSUFFICIENT_CREDITS`, top up your balance under **Billing** and try again.

---

## Common Errors

| Error | What it means | What to do |
|----|----|----|
| **No SSM registration number** | The borrower record has no Registration No. | Edit Company Information and add it. |
| **Entity not found** | SSM has no record matching the number. | Double-check the SSM Registration No is correct. |
| **Wrong report for this entity** | The registration is not a private/public company (ROC). | The company profile report is only available for ROC entities. |
| **Insufficient TrueStack credits** | Your credit balance is too low. | Top up under Billing. |
| **Registry unavailable** | SSM is down or returned a temporary error. | Wait a few minutes and try again. No credits are billed. |
| **Request already in flight** | A pull for this borrower is still in progress. | Wait a few seconds and refresh. |

---

## Audit & Compliance

Every TrueSSM™ action is logged. Reviewers can see:

- **Pulled TrueSSM™ company profile** entries with the registration number, billed credits, and usage ID.
- **Applied N fields from TrueSSM™** entries listing exactly which fields were overwritten and when.
- **TrueSSM™ pull failed** entries when SSM returns an error.

Combined with the PDF in the documents folder, this gives you a complete evidence trail for KYC / KYB reviews.

---

## Frequently Asked Questions

**Does TrueSSM™ replace e-KYC (TrueIdentity)?**
No. TrueSSM™ verifies the **company** record from the registry. TrueIdentity verifies the **identity** of individuals (directors, authorised representatives, individual borrowers). The two work together — many corporate borrowers will use both.

**Does pulling from SSM automatically update the borrower?**
No — by design. You always see a preview before any borrower data changes, and you choose which fields to apply.

**Can I see who pulled or synced data?**
Yes. The borrower activity timeline shows the actor for every `TrueSSM™ Pull` and `TrueSSM™ Synced` event.

**Does it work for sole proprietorships or LLPs?**
v1 supports **ROC entities (private/public companies)** only. Sole proprietorships, partnerships, and LLPs are not supported yet.

**Where does the data come from?**
Directly from SSM (Suruhanjaya Syarikat Malaysia), the official Malaysian company registry, through our partnership with **ssmsearch.com**.
