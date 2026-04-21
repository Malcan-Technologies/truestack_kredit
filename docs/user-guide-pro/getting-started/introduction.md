---
title: Introduction
order: 1
---

# Getting Started with TrueKredit Pro

Welcome to TrueKredit Pro — the dedicated deployment of TrueKredit built for money lenders who need their own isolated environment, a richer role catalogue, a borrower-facing portal, and a compliant digital signing workflow.

This Help Center is specific to your TrueKredit Pro instance. If you are looking for the TrueKredit SaaS (multi-tenant) help content, that documentation lives with the SaaS admin app and is not shown here.

---

## What Is TrueKredit Pro?

TrueKredit Pro is a **single-tenant** loan management platform. Each deployment runs in its own database and backend for one lender. That means:

- No tenant switcher — you sign in and land directly in your workspace
- No SaaS subscription or Core/Add-on billing page inside the app
- Branded borrower portal (`borrower_pro`) running under your own domain
- Integrated digital signing, attestation, and verify-signatures tools
- Granular role-based access control (RBAC) with 10+ default roles and custom roles per deployment

For the technical architecture of Pro vs SaaS, see the engineering docs under `docs/architecture_plan.md` and `docs/admin_pro_product_notes.md`.

---

## What You Can Do

| Area | Description |
|------|-------------|
| **Dashboard** | Real-time snapshot of your portfolio — disbursed, outstanding, collected, overdue, PAR, L1/L2 queues |
| **Borrowers** | Manage individual and corporate borrowers, including directors and company members |
| **Products** | Configure loan products (Jadual J / Jadual K, interest model, fees, term limits, required documents) |
| **Applications** | Run the two-stage application review (L1 credit officer → L2 approval authority) with counter-offers |
| **Loans** | Disburse, track schedules, record payments, handle early settlement and default |
| **Borrower Portal** | Borrowers self-serve: submit applications online, complete KYC, review and sign agreements |
| **Digital Signing** | Borrower, admin, and witness digitally sign the loan agreement via the signing gateway |
| **Verify Signatures** | Verify any previously signed agreement PDF against its recorded signatures |
| **Compliance** | Generate KPKT reports, Lampiran A / Jadual J / Jadual K, and CSV data exports |
| **Roles & Team** | Manage users, assign default or custom tenant roles, and control permission matrices |

---

## Quick Start

### Step 1: Review Your Team and Roles

After initial deployment, the platform seeds a default role catalogue (Owner, Super Admin, Ops Admin, Credit Officer L1, Approval Authority L2, Finance Officer, Attestor, Collections Officer, Compliance Officer, General Staff, Auditor Read-only).

- Go to **Settings → Team Members** to invite users and pick a role
- Go to **Roles** to inspect or customize role permissions (if you hold `roles.manage`)

See [Roles & Permissions](?doc=getting-started/roles-and-permissions) and [Roles Management](?doc=administration/roles-management).

### Step 2: Set Up Your Loan Products

A loan product defines the interest model, term limits, fees, and required documents. At least one product is required before applications can be submitted.

Go to **Products** to create your first product.

### Step 3: Add Borrowers (or Let Them Self-Register)

You can either:

- Add borrowers manually from the **Borrowers** page, or
- Let borrowers register themselves in the **Borrower Portal**, complete KYC, and submit applications

See [Managing Borrowers](?doc=loan-management/managing-borrowers) and [Borrower Portal Overview](?doc=borrower-portal/overview).

### Step 4: Create and Approve Applications

Applications in Pro go through a two-stage review:

1. **L1 queue** — a credit officer reviews the submission and either sends it to L2, rejects it, or returns it for amendments
2. **L2 queue** — an approval authority gives final approval, which creates the loan record

See [Loan Applications](?doc=loan-management/loan-applications).

### Step 5: Attest, Sign, and Disburse

Once an application is approved:

1. Borrower completes **attestation** (video or scheduled meeting as configured)
2. Borrower completes **e-KYC** (via TrueStack KYC)
3. Borrower obtains a **signing certificate** and digitally signs the agreement
4. Admin and witness digitally sign; admin releases funds
5. System generates the repayment schedule and activates the loan

See [Digital Signing Overview](?doc=digital-signing/signing-overview) and [Loan Disbursement](?doc=loans/loan-disbursement).

### Step 6: Track Payments, Arrears, and Discharge

Record payments, let borrowers pay through the portal, handle arrears and default, and close loans when fully settled.

See [Recording Payments](?doc=loans/recording-payments) and [Loan Completion](?doc=loans/loan-completion).

---

## Navigation

| Section | Description |
|---------|-------------|
| **Dashboard** | Portfolio overview and action-needed queues |
| **Borrowers** | Borrower records, KYC status, company members |
| **Products** | Loan product configuration |
| **Applications** | L1 / L2 review queues and application detail |
| **Loans** | Active loans, disbursement, schedules, payments |
| **TrueKredit Pro** | Payment approvals, early-settlement approvals, agreements, attestation meetings, availability, signing certificates |
| **Verify Signatures** | Validate a signed agreement PDF |
| **Debt Marketplace** | Listings for borrower debt (if enabled) |
| **Compliance** | KPKT exports, reports, data exports |
| **Admin Logs** | Audit trail of administrative actions |
| **Roles** | Tenant role catalogue and custom role management |
| **Settings** | Organization info, team members, security |
| **Help** | This Help Center |

---

## User Roles (Quick View)

Pro ships with a richer role catalogue than SaaS. You can keep the defaults, customize editable presets, or define your own custom roles.

| Role | Typical Use |
|------|-------------|
| Owner | Tenant owner — full access, only one per deployment |
| Super Admin | Full permissions, assigned when ownership is transferred |
| Ops Admin | Operational admin, no billing/finance gating |
| Credit Officer L1 | Reviews applications at stage 1 |
| Approval Authority L2 | Final approval at stage 2 |
| Finance Officer | Disbursement, payments, settlement approvals |
| Attestor | Witnesses and signs attestation |
| Collections Officer | Late payments, arrears, default |
| Compliance Officer | Reports, exports, audit access |
| General Staff | Day-to-day borrower/loan operations |
| Auditor Read-only | Inspect records without mutating anything |

See [Roles & Permissions](?doc=getting-started/roles-and-permissions) for the permission catalogue.

---

## What Is Different From TrueKredit SaaS?

| Topic | SaaS | Pro |
|-------|------|-----|
| Tenancy | Multi-tenant, tenant switcher in sidebar | Single tenant per deployment |
| Roles | Owner / Admin / Staff (3 fixed roles) | 11 default roles + custom tenant roles |
| Application review | One-step approve / reject | Two-step L1 → L2 with counter-offers |
| Billing | In-app Core + Add-ons subscription | Deployment licensing — no in-app billing |
| Borrower portal | Not included | First-class `borrower_pro` app, branded per client |
| KYC | TrueIdentity (Admin-provisioned add-on) | TrueStack public KYC API |
| Signing | Manual | Integrated digital signing + witness + verify-signatures |

---

## Need Help?

- Browse this Help Center for feature walk-throughs
- Contact your organization's Owner or Super Admin for account issues
- Contact TrueStack support for deployment-level issues (e.g. environment, integrations)

---

## Next Steps

- [Single-Tenant Model](?doc=getting-started/deployment-model) — How tenancy and your deployment work in Pro
- [Roles & Permissions](?doc=getting-started/roles-and-permissions) — Understand what each role can do
- [Dashboard Overview](?doc=dashboard/dashboard-overview) — Read the numbers on your home screen
- [Loan Applications](?doc=loan-management/loan-applications) — Run the L1 / L2 review
