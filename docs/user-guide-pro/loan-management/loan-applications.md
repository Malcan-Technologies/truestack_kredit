---
title: Loan Applications (L1 / L2)
order: 3
---

# Loan Applications (L1 / L2)

TrueKredit Pro uses a **two-stage application review**. Applications flow from **L1 (credit officer)** to **L2 (approval authority)** before becoming loans, with optional counter-offer negotiation at each stage. This page covers both the manual (admin-created) and online (borrower-submitted) paths.

---

## Stage Model

| Stage | Status values | Who works this queue | Permissions needed |
|-------|---------------|----------------------|--------------------|
| Draft | `DRAFT` | Creator / Borrower | `applications.create` |
| L1 queue | `SUBMITTED`, `UNDER_REVIEW` | Credit Officer L1 | `applications.approve_l1` |
| L2 queue | `PENDING_L2_APPROVAL` | Approval Authority L2 | `applications.approve_l2` |
| Approved | `APPROVED` (loan created) | — | — |
| Rejected | `REJECTED` | — | — |

Rejections and returns for amendments are both available at L1 and L2.

---

## Application Channels

### Manual (admin-created)

Admin staff create an application from **Dashboard → Applications → New Application** and walk through the 4-step wizard (Borrower, Product, Loan Details, Review & Confirm).

Manual applications start in `DRAFT` and the admin clicks **Submit for Review** to move them into the L1 queue.

### Online (borrower-submitted via portal)

Borrowers submit applications from the **borrower portal** (`borrower_pro`). These applications:

- Are created with `loanChannel = ONLINE`
- Move directly to `SUBMITTED` (they do not sit in a `DRAFT` state for admin staff)
- Do **not** show a `Submit` button in the admin application detail (the admin does not submit on behalf of the borrower)
- Are otherwise routed identically — L1 queue → L2 queue → Approved

See [Online Applications](?doc=borrower-portal/online-applications) for the borrower-side flow.

---

## Creating a Manual Application

Navigate to **Applications → New Application**.

### Step 1: Select Borrower

- Search by name, IC number, SSM number, phone, or email
- See KYC / verification status, borrower type (Individual / Corporate)
- Corporate rows show company name + representative, and SSM number instead of IC
- Click **New Borrower** if they are not yet registered

### Step 2: Select Product

Products are filtered to the borrower type:

- Individual → products flagged Individual or Both
- Corporate → products flagged Corporate or Both

You see the product's interest model, schedule type (Jadual J / Jadual K), rate, amount and term ranges, and legal / stamping fees.

### Step 3: Enter Loan Details

Enter amount and term. The summary card updates in real time with: legal fee, stamping fee, net disbursement, monthly payment, total interest, and total payable.

### Step 4: Review & Confirm

Review borrower, product, and the loan summary. Click **Create Application** — the application is created in **Draft** status.

---

## Applications List

The Applications page shows all applications with columns: Borrower, Type, Product, Amount, Term, Status, Channel, Created, Actions.

### Status badges

| Status | Meaning |
|--------|---------|
| Draft | Documents being collected, not yet submitted |
| Submitted | Landed in the L1 queue |
| Under Review | L1 officer is actively reviewing |
| Pending L2 Approval | Sent from L1 to L2 |
| Approved | L2 approved — loan record created |
| Rejected | Rejected at L1 or L2 |

### Filters

The filter `L1_QUEUE` (API `status=L1_QUEUE`) returns **both** `SUBMITTED` and `UNDER_REVIEW` together so L1 officers see a single work queue.

### Sidebar badges

The sidebar uses `GET /api/loans/applications/counts` which returns permission-scoped counts:

- `submitted`, `underReview`, `l1QueueCount` — only visible with `applications.approve_l1`
- `pendingL2Approval` — only visible with `applications.approve_l2`
- `actionableTotal` — combined, respecting your permissions

You will only see badges for queues **you are allowed to work**.

---

## Document Upload

On the application detail page you can:

- Upload required documents defined by the product (marked **Required**)
- Upload additional supporting documents ("Other Documents")
- View or delete existing uploads (subject to your permissions)

Submission is blocked until all required documents are uploaded. A warning banner lists what is missing, and the **Submit** button is disabled with a tooltip.

---

## Submitting (Manual Applications)

Prerequisites:

- All required documents uploaded
- Amount and term within the product's configured limits

Steps:

1. Review all fields
2. Click **Submit for Review**
3. Confirm in the dialog

Status changes from `DRAFT` to `SUBMITTED`. The application now appears in the **L1 queue**.

> Online applications skip this — they enter the L1 queue directly when the borrower submits.

---

## L1 Review

**Permission:** `applications.approve_l1`

From the L1 queue, an L1 officer can:

| Action | Result |
|--------|--------|
| **Send to L2** | Status → `PENDING_L2_APPROVAL`; `l1ReviewedAt`, `l1ReviewedByMemberId`, `l1DecisionNote` recorded |
| **Reject** (with `applications.reject`) | Status → `REJECTED` |
| **Return for amendments** | Status → `DRAFT`, clears L1/L2 metadata; the borrower or admin must resubmit |
| **Counter-offer** | Propose revised amount, term, or rate; borrower can accept, counter, or decline |

Audit action `APPLICATION_SEND_TO_L2` is recorded on the L1 handoff.

---

## L2 Review

**Permission:** `applications.approve_l2`

From the L2 queue, an L2 officer can:

| Action | Result |
|--------|--------|
| **Approve** | Status → `APPROVED`; a `Loan` record is created |
| **Reject** (with `applications.reject`) | Status → `REJECTED` |
| **Return for amendments** | Status → `DRAFT`, clears L1/L2 metadata |
| **Counter-offer** | Propose revised terms before final approval |

Fields recorded on final approval: `l2ReviewedAt`, `l2ReviewedByMemberId`, `l2DecisionNote`.

---

## Decision notes (application detail)

On the **application detail** page, eligible staff (L1/L2 reviewers and managers, subject to RBAC) can open a **Decision notes** panel above the main decision actions. It shows two subsections:

- **L1 credit review** — `l1DecisionNote` with **reviewer** and **`l1ReviewedAt`** when present.
- **L2 final approval** — `l2DecisionNote` with **reviewer** and **`l2ReviewedAt`** when present.

If a note was not recorded at that stage, the UI shows an empty state (e.g. “No note recorded.”). This complements the workflow tables above: the same fields are stored on the application record; the panel surfaces them for context when handling returns, counter-offers, or escalations.

---

## Resubmission Rules

If the borrower resubmits or changes documents while the application is `PENDING_L2_APPROVAL`, the system automatically:

1. Resets the application to `SUBMITTED` (back into the L1 queue)
2. Clears all L1 and L2 review metadata (`l1ReviewedAt`, `l1ReviewedByMemberId`, `l1DecisionNote`, `l2ReviewedAt`, `l2ReviewedByMemberId`, `l2DecisionNote`)

This ensures review starts again at L1 on the updated submission. It prevents a prior L1 handoff decision from silently applying to a different set of documents.

---

## Counter-Offer Negotiation

Counter-offers allow admins to propose revised terms and let borrowers accept or decline. Negotiation happens **within the current stage**:

- L1 officers can counter while the application is in the L1 queue
- L2 officers can counter while the application is `PENDING_L2_APPROVAL`

Offers sent to the borrower appear on the borrower portal for acceptance, counter, or expiry. The borrower flow is covered in [Loan Process (borrower view)](?doc=borrower-portal/online-applications).

---

## What Happens After Approval

1. Final L2 approval creates a `Loan` record
2. The application status becomes `APPROVED`
3. The borrower proceeds through **attestation → e-KYC → signing certificate → digital signing** (see [Digital Signing](?doc=digital-signing/signing-overview)). If attestation uses a **lawyer meeting**, the admin marks the meeting complete; the borrower must then **accept or reject** before attestation fully completes (`MEETING_COMPLETED` → borrower action → `COMPLETED` on the attestation step). See [Borrower Meetings hub](?doc=borrower-portal/meetings).
4. Admin and witness digitally sign
5. The finance officer **disburses** the loan (see [Loan Disbursement](?doc=loans/loan-disbursement))

Attempting to disburse before all required signing and attestation steps are complete is blocked by the backend.

---

## Product Filtering for Borrower Types

| Borrower Type | Sees Products Flagged |
|---------------|-----------------------|
| Individual | Individual Only, Both |
| Corporate | Corporate Only, Both |

Example:

- "Personal Loan" (Individual Only)
- "Business Working Capital" (Corporate Only)
- "General Purpose Loan" (Both)

| Borrower Type | Available Products |
|---------------|-------------------|
| Individual | Personal Loan, General Purpose Loan |
| Corporate | Business Working Capital, General Purpose Loan |

---

## Loan Schedule Types

| Type | Description |
|------|-------------|
| Jadual J | Unsecured; higher interest rates allowed |
| Jadual K | Secured by collateral; maximum 12% interest rate |

Badges appear on product cards during selection.

---

## Frequently Asked Questions

### Can the same person send to L2 and then approve at L2?

With the default roles, no — `CREDIT_OFFICER_L1` and `APPROVAL_AUTHORITY_L2` are separate. If your deployment grants both permissions to one role (e.g. `OPS_ADMIN`), the UI allows it, but most lenders segregate these duties.

### Can I edit an application after it has moved out of Draft?

No. Once submitted, the application is locked for edits. Use **Return for amendments** at L1 or L2 to send it back to Draft.

### What if documents change after L1 sent it to L2?

The application is automatically reset to the L1 queue (`SUBMITTED`). L1/L2 metadata is cleared so review starts fresh.

### Who can reject?

Anyone with `applications.reject` **and** the stage permission (L1 for L1 queue, L2 for L2 queue).

### Are there notifications for L1 / L2 queue changes?

Yes — the sidebar badges update in real time, and the Dashboard **Action Needed** card highlights items waiting in your queue (permission-scoped).

### Can an application be approved without a signing certificate?

No. A signing certificate is required before the agreement can be digitally signed, which is required before disbursement. The approval itself only creates the loan record — the agreement flow must complete before funds are released.

---

## Related Documentation

- [Online Applications (Borrower Portal)](?doc=borrower-portal/online-applications)
- [Digital Signing Overview](?doc=digital-signing/signing-overview)
- [Agreements & Attestation](?doc=digital-signing/agreements-and-attestation)
- [Loan Disbursement](?doc=loans/loan-disbursement)
- [Roles & Permissions](?doc=getting-started/roles-and-permissions)
