# Admin Pro RBAC

This document records the current role-based access control model for `apps/admin_pro` and `apps/backend_pro`.

## Architecture

- Better Auth remains responsible for identity, sessions, MFA, and active tenant selection.
- Tenant authorization is owned by app data through `TenantMember` plus tenant-scoped `TenantRole` records.
- Backend enforcement is the source of truth.
- Frontend navigation and page controls mirror the backend permission set from `GET /api/auth/me`.

## Data Model

RBAC is stored in the backend schema with:

- `TenantRole`
  - tenant-scoped role catalog
  - stores `key`, `name`, `description`, `permissions`, and system/default flags
- `TenantMember`
  - keeps `role` as the canonical role key
  - stores `roleId` to link each membership to a `TenantRole`

Default tenant roles are lazily seeded and legacy memberships are normalized automatically when RBAC-aware routes are used.

- Missing default tenant roles are auto-seeded on demand when a tenant is resolved.
- Bootstrap is safe against concurrent requests, so an empty `TenantRole` table can self-heal immediately after deployment without overwriting tenant-customized editable default roles.

## Default Roles

Every tenant is seeded with these role presets:

- `OWNER`
- `OPS_ADMIN`
- `GENERAL_STAFF`
- `CREDIT_OFFICER_L1`
- `APPROVAL_AUTHORITY_L2`
- `FINANCE_OFFICER`
- `ATTESTOR`
- `COLLECTIONS_OFFICER`
- `COMPLIANCE_OFFICER`
- `AUDITOR_READONLY`

`OWNER` is system-managed and not editable through the roles page. Ownership still transfers through the existing ownership-transfer flow.

Important behavior for default roles:

- Editable default roles preserve tenant customizations when the catalog is re-synced.
- Template changes apply automatically to newly seeded tenants.
- Existing tenants can pick up platform default changes by using the reset action on `/dashboard/roles`, or by manually enabling the permission.
- `COMPLIANCE_OFFICER` now includes `loans.view` by default so compliance staff can inspect loan records while preparing reviews and exports.

## Permissions

Permissions use `resource.action` keys. The shared catalog lives in `packages/shared/src/rbac.ts`.

Core domains:

- Dashboard visibility
- Borrowers
- Applications
- Loans and disbursement
- Payments
- Early settlement
- Attestation
- Collections
- Compliance and exports
- Products
- Agreements and signing certificates
- Availability
- TrueSend
- TrueIdentity
- Audit logs and reports
- Team management
- Roles management
- Tenant settings
- Billing

## Backend Enforcement

Backend request context now resolves:

- role key
- role name
- role ID
- permission list

Primary RBAC files:

- `apps/backend_pro/src/lib/rbac.ts`
- `apps/backend_pro/src/middleware/authenticate.ts`
- `apps/backend_pro/src/middleware/requireRole.ts`
- `apps/backend_pro/src/modules/auth/routes.ts`
- `apps/backend_pro/src/modules/tenants/routes.ts`

Permission middleware is applied to:

- tenant role management
- team member invites and role updates
- products CRUD
- application approval/review actions
- disbursement-sensitive loan actions
- payment approval queues
- early-settlement approval queues
- compliance exports and audit endpoints
- borrower, application, and loan detail sub-actions such as notes, document uploads, agreement review, disbursement proof, and guarantor agreement flows

## Frontend Enforcement

Frontend receives tenant permissions from `GET /api/auth/me` and stores them in `TenantProvider`.

Primary frontend RBAC files:

- `apps/admin_pro/lib/permissions.ts`
- `apps/admin_pro/components/tenant-context.tsx`
- `apps/admin_pro/components/role-gate.tsx`
- `apps/admin_pro/app/(dashboard)/layout.tsx`

Permission-aware UI updates include:

- sidebar access filtering
- route-level access denial via the dashboard layout
- application approval buttons
- application document upload/delete and draft submission controls
- borrower edit/document controls and TrueIdentity management controls
- loan lifecycle actions such as disbursement, payment recording, early settlement, default handling, and agreement-related actions
- product create/edit controls
- settings page actions
- module page gates
- internal schedule visibility on loan detail
- read-only behavior for shared components like internal staff notes when a user can view but not mutate

Current scope note:

- We have not implemented the dedicated collections workflow yet.
- Collections will move to its own separate page/flow later so we can enforce `loans.*` and `applications.*` visibility more narrowly first.
- Until that page exists, collections permissions should not be treated as a reason to unlock the main loans list page by default.

### Two-step L1 / L2 application approval (implemented)

| Transition | Permission | From → To |
|------------|------------|-----------|
| Send to L2 | `applications.approve_l1` | `SUBMITTED` or `UNDER_REVIEW` → `PENDING_L2_APPROVAL` |
| Final approve (creates loan) | `applications.approve_l2` | `PENDING_L2_APPROVAL` → `APPROVED` |
| Reject | `applications.reject` plus stage permission (L1 on L1 queue, L2 on L2 queue) | → `REJECTED` |
| Return for amendments | `applications.approve_l1` or `applications.approve_l2` (by stage) | → `DRAFT` (clears L1/L2 metadata) |
| Negotiation (counter / accept / reject offers) | Same as stage: L1 on L1 queue, L2 on `PENDING_L2_APPROVAL` | — |

- `LoanApplication` stores `l1ReviewedAt`, `l1ReviewedByMemberId`, `l1DecisionNote`, `l2ReviewedAt`, `l2ReviewedByMemberId`, `l2DecisionNote` for audit.
- Audit action `APPLICATION_SEND_TO_L2` records the L1 handoff.
- Borrower resubmission or document changes while pending L2 reset the application to the L1 queue (`SUBMITTED`) and clear L1/L2 metadata so review starts again at L1.
- **Online** applications: borrowers submit via the online flow; admin does not show a draft **Submit** on the application detail when `loanChannel === ONLINE`.
- **Dashboard “Action Needed”** (`GET /api/dashboard/stats` → `actionNeeded`) is permission-scoped:
  - L1 queue count: only if `applications.approve_l1`
  - Pending L2 count: only if `applications.approve_l2`
  - Pending disbursement: `loans.disburse` or `loans.manage`
  - Pending attestation: `attestation.schedule` or `attestation.witness_sign`
  - Ready to complete: `loans.manage`
  - Ready for default: `collections.manage`
- **Application list filter** `L1_QUEUE` (API `status=L1_QUEUE`) returns `SUBMITTED` and `UNDER_REVIEW` together for the L1 work queue.

### Application counts API

`GET /api/loans/applications/counts` returns permission-scoped `submitted`, `underReview`, `pendingL2Approval`, `l1QueueCount`, and `actionableTotal` for sidebar badges.

## Roles Page

Super admins and other authorized users can manage tenant roles at:

- `/dashboard/roles`

The page supports:

- viewing seeded and custom roles
- creating tenant-specific custom roles
- cloning from existing roles
- editing names, descriptions, and permission matrices
- resetting editable default roles back to platform defaults

Member assignment remains in:

- `/dashboard/settings`

Invite behavior:

- Users with `team.invite` can add team members.
- Assigning a non-default invite role requires `team.edit_roles`.
- If a user can invite but cannot edit roles, new invites default to `GENERAL_STAFF`.

The team settings page now uses the tenant role catalog for:

- invite role selection
- member role reassignment
- role display labels

## Migration Notes

After pulling this change, run Prisma migration commands manually from `apps/backend_pro`:

```bash
cd apps/backend_pro
npx prisma migrate dev --name add_tenant_rbac_roles
```

Then restart the affected apps so the regenerated Prisma client and shared RBAC catalog are loaded.
