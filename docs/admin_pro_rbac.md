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
- We also have not fully implemented a strict two-step L1 to L2 application approval workflow yet.
- Today, `applications.approve_l1` and `applications.approve_l2` exist as separate permissions, but both currently unlock the same approval controls and backend approval endpoint.
- The current approval endpoint moves an application straight to `APPROVED` and creates the loan immediately, so there is not yet an enforced handoff where L1 can review/recommend and L2 performs the final approval.
- Recommended implementation:
- Add an explicit intermediate approval state for the handoff, such as `PENDING_L2_APPROVAL`, or formalize `UNDER_REVIEW` as the L1-complete waiting-for-L2 state with strict transition rules.
- Persist approval-stage metadata on the application, for example `l1ReviewedAt`, `l1ReviewedByMemberId`, `l1DecisionNote`, `l2ApprovedAt`, and `l2ApprovedByMemberId`.
- Split the backend transitions so L1 can only move `SUBMITTED` -> L2 review state, while only L2 can move L2 review state -> `APPROVED` and trigger loan creation.
- Update the admin UI so L1 sees actions like "Send to L2" or "Recommend approval", while L2 sees the final approval action plus the L1 review summary.
- Extend audit logs and notifications so the handoff, reviewer identities, timestamps, and decision notes are visible for compliance and dispute review.

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
