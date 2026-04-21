---
title: Roles & Permissions
order: 3
---

# Roles & Permissions

TrueKredit Pro uses a **granular, extensible RBAC model**. Unlike the SaaS product (which has three fixed roles: Owner, Admin, Staff), Pro ships with a **catalogue of default roles** plus the ability to create **custom tenant roles** with arbitrary permission matrices.

This page covers the default role catalogue, how enforcement works, and how to see what you can do today.

---

## Default Role Catalogue

Every Pro tenant is seeded with the following roles. All roles except `OWNER` and `SUPER_ADMIN` are **editable** from the Roles page.

| Role key | Purpose |
|----------|---------|
| `OWNER` | The tenant owner — exactly one per deployment. System-managed, not editable. |
| `SUPER_ADMIN` | Full permissions like Owner, but not the tenant owner. Assigned automatically when ownership is transferred. Not editable. |
| `OPS_ADMIN` | Operational admin — broad management access without being the account owner. |
| `GENERAL_STAFF` | Default day-to-day staff — create borrowers, applications, record payments, view records. |
| `CREDIT_OFFICER_L1` | Stage-1 application reviewer — can send applications to L2 or reject at L1. |
| `APPROVAL_AUTHORITY_L2` | Stage-2 final approver — converts approved applications into loans. |
| `FINANCE_OFFICER` | Handles disbursement, payment recording, and payment/early-settlement approvals. |
| `ATTESTOR` | Schedules and witnesses attestation, co-signs digital agreements. |
| `COLLECTIONS_OFFICER` | Handles arrears, late fees, default, and collection workflows. |
| `COMPLIANCE_OFFICER` | Generates KPKT reports and exports, inspects loan records. |
| `AUDITOR_READONLY` | Read-only auditor — never mutates records. |

> `OWNER` and `SUPER_ADMIN` are **immutable presets** and re-aligned from the platform template on sync. Editable defaults (e.g. `OPS_ADMIN`) keep your tenant customisations; they are only overwritten if you click **Reset to default** on the Roles page.

---

## Custom Tenant Roles

If none of the defaults fit, users with the `roles.manage` permission can create **custom tenant roles** from the Roles page. Custom roles:

- Use a unique, tenant-local key
- Have fully configurable permission matrices
- Are never overwritten by platform upgrades
- Can be cloned from any existing role (default or custom)

See [Roles Management](?doc=administration/roles-management) for the walkthrough.

---

## Permission Domains

Permissions follow the `resource.action` pattern. The shared catalogue is defined in `packages/shared/src/rbac.ts`. The main domains are:

| Domain | Examples |
|--------|----------|
| Dashboard | `dashboard.view` |
| Borrowers | `borrowers.view`, `borrowers.create`, `borrowers.edit`, `borrowers.documents.upload` |
| Applications | `applications.view`, `applications.create`, `applications.approve_l1`, `applications.approve_l2`, `applications.reject` |
| Loans & disbursement | `loans.view`, `loans.disburse`, `loans.manage` |
| Payments | `payments.record`, `payments.approve` |
| Early settlement | `early_settlement.request`, `early_settlement.approve` |
| Attestation | `attestation.schedule`, `attestation.witness_sign` |
| Collections | `collections.manage` |
| Compliance & exports | `compliance.view`, `compliance.export` |
| Products | `products.view`, `products.manage` |
| Agreements & signing certificates | `agreements.manage`, `signing_certificates.manage` |
| Availability | `availability.manage` |
| TrueSend | `truesend.manage` |
| TrueIdentity / KYC | `kyc.view`, `kyc.manage` |
| Audit logs & reports | `audit.view`, `reports.view` |
| Team management | `team.invite`, `team.edit_roles`, `team.deactivate` |
| Roles management | `roles.manage` |
| Tenant settings | `settings.view`, `settings.edit` |

> The **Auditor Read-only** role only has `*.view` permissions. It can never approve, record, or modify anything.

---

## How Enforcement Works

### Backend Is the Source of Truth

The backend (`apps/backend_pro`) checks permissions on every write. Even if the UI shows a button, the backend will reject the call if the caller does not hold the required permission.

### Frontend Mirrors the Backend

`GET /api/auth/me` returns your active tenant role key, role name, role ID, and the full permission list. The admin app uses this to:

- Grey out or hide sidebar entries you cannot access
- Return an **Access Denied** view on restricted routes (e.g. directly visiting `/dashboard/roles` without `roles.manage`)
- Hide or disable action buttons you cannot use (approve, disburse, upload, delete, etc.)

### Where to See Your Current Role

Your active role is shown in the sidebar near your profile. The dashboard's **Action Needed** card is also **permission-scoped** — you only see the L1 queue if you have `applications.approve_l1`, only see pending disbursements if you have `loans.disburse` or `loans.manage`, and so on.

---

## Two-Step L1 / L2 Application Approval

This is one of the biggest differences from SaaS.

| Transition | Permission required | Status change |
|------------|---------------------|---------------|
| Send to L2 | `applications.approve_l1` | `SUBMITTED` / `UNDER_REVIEW` → `PENDING_L2_APPROVAL` |
| Final approve (creates loan) | `applications.approve_l2` | `PENDING_L2_APPROVAL` → `APPROVED` |
| Reject | `applications.reject` + stage permission (L1 at L1, L2 at L2) | → `REJECTED` |
| Return for amendments | `applications.approve_l1` or `applications.approve_l2` (by stage) | → `DRAFT` (clears L1/L2 metadata) |
| Negotiation (counter / accept / reject offers) | Same as stage (L1 on L1 queue, L2 on L2 queue) | Within the stage |

A user can hold **both** `applications.approve_l1` and `applications.approve_l2` (e.g. Owner, Super Admin, Ops Admin), but for segregation of duties, most deployments split these between different people.

See [Loan Applications](?doc=loan-management/loan-applications) for the full flow.

---

## Ownership Rules

- Only the **Owner** can transfer ownership (via `POST /api/tenants/transfer-ownership`)
- The new owner must be an **active** existing member (any non-owner role)
- The previous owner is automatically demoted to **Super Admin**
- `SUPER_ADMIN` **cannot be chosen manually** as an invite role or role change — it is only assigned via the transfer flow
- The **Owner row is protected** — it cannot be deactivated, removed, or re-assigned through the normal team APIs, regardless of any permission the caller holds

---

## How Roles Appear in the App

| Surface | Behaviour |
|---------|-----------|
| Sidebar | Pages you cannot access are hidden or locked |
| Direct URL | Restricted pages show an **Access Denied** view |
| Action buttons | Hidden or disabled when you lack the required permission |
| Staff notes / read-only fields | Read-only when you can view but not mutate |
| Dashboard "Action Needed" card | Scoped to the permissions you actually have |
| Application counts API | L1/L2 badges in the sidebar only reflect queues you can work |

---

## Frequently Asked Questions

### Can I customise the default roles?

Yes, **except** `OWNER` and `SUPER_ADMIN`. All other default roles are editable, and you can reset them back to the platform template from the Roles page.

### Can a Compliance Officer approve a loan?

No, not with the default permissions. Compliance Officer is scoped to read and export; it does not hold `applications.approve_l1`, `applications.approve_l2`, `loans.disburse`, or similar write permissions.

### Can the same person act as both L1 and L2?

Technically yes (grant both permissions), but operationally most lenders split them to preserve segregation of duties.

### What happens if a borrower resubmits while the application is pending L2?

The application is reset to the L1 queue (`SUBMITTED`) and all L1/L2 metadata is cleared — review restarts at L1. This is intentional to avoid silently changing what was approved.

### Where are role changes audited?

Role assignments, ownership transfers, and role-matrix edits are recorded in [Admin Logs](?doc=administration/admin-logs).

---

## Next Steps

- [Team Management](?doc=administration/team-management) — Invite users and assign roles
- [Roles Management](?doc=administration/roles-management) — Edit and create tenant roles
- [Loan Applications](?doc=loan-management/loan-applications) — Run the L1 / L2 review
