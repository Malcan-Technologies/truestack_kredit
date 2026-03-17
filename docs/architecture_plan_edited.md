# TrueKredit Architecture Planning Summary

## Purpose

This document summarizes the intended architecture direction for extending the existing **TrueKredit** system into a broader platform that supports:

1. **Current SaaS TrueKredit**
   - pooled multi-tenant deployment
   - co-mingled tenant data
   - admin-facing loan management system
   - existing backend + database + admin access

2. **TrueKredit Pro for digital license clients**
   - dedicated deployment per client (own AWS account, DB, backend, frontend)
   - one deployment per AWS account
   - isolated client data
   - borrower-facing origination, repayment, attestation, and signing modules
   - **single monorepo** — Pro apps live in `apps/`: `admin_pro`, `backend_pro`, `borrower_pro`
   - `admin_pro` and `backend_pro`: shared codebase for all clients
   - `borrower_pro`: per-client frontend (each client has their own); shares components via packages (no duplication)
   - deployments controlled via config files / flags
   - mostly deployed on AWS

This summary is meant for another AI to review together with the existing codebase and propose a detailed implementation plan.

---

# Stakeholder Decision: Pro Deployment & Frontend Model (Confirmed)

The following architecture decisions have been confirmed by stakeholders:

## Per-Client Full Stack Isolation

Each TrueKredit Pro client receives:
- **Own database** — isolated data per client
- **Own backend instance** — deployed from shared TrueKredit Pro backend codebase
- **Own frontend instance** — deployed from client-specific frontend code
- **Own AWS account** — all client-specific files deployed in their own AWS account

**Reason**: Client-specific files must be deployed within each client's own AWS account for isolation and data sovereignty.

## Single Monorepo: Pro Apps in `apps/`

TrueKredit Pro lives in the same repo (`truestack_kredit`) under `apps/`:

- **`admin_pro`**: Shared codebase for all clients. Same admin UI/UX across Pro deployments.
- **`backend_pro`**: Shared codebase for all clients. Same backend APIs; deployed per client with client-specific config/secrets.
- **`borrower_pro`**: Per-client frontend. Each client has their own folder (e.g. `apps/borrower_pro/client-a/`). Different UI per client, same UX flow. **Shared components** — SignIn, SignUp, forms, flows from `packages/borrower-ui`; no duplication. UI can differ via theming.

## Shared Codebase, Separate Deployments

- **Backend**: One shared `backend_pro` codebase. Updates can be pushed to all clients via config. Each client gets their own deployed instance with client-specific secrets/variables.
- **Admin**: One shared `admin_pro` codebase. Same across all Pro clients.
- **Borrower frontend**: Per-client code in `apps/borrower_pro/{client_id}/`. Shares components via packages — no copy-paste.
- **Database**: Same schema (from shared migrations) across all clients; each client has their own database instance.

## Borrower Frontend: Per-Client Code, Shared Components

**Decision**: Each Pro client has their own borrower frontend in `apps/borrower_pro/{client_id}/`.

- **UI (design)**: Different per client — colors, layout, branding, visual identity
- **UX (flow)**: Same across clients — steps, user journey, business logic flow
- **Shared components**: All borrower_pro apps import from `packages/borrower-ui`. No duplication. Components like **SignIn**, **SignUp**, loan application forms, repayment flows, etc. are shared. Each client uses the same component — UI can differ via theming (colors, fonts, spacing) while the component logic and UX flow stay the same.

**Deployment pattern**: `admin_pro + backend_pro + borrower_pro (client-a)` → Client A's AWS account (with Client A's secrets/variables)

**Customization**:
- **Backend/Admin**: Config files, flags, secrets, environment variables
- **Frontend**: Per-client code (different UI); shared components via packages — same components, different styling/theming

---

# 1. Current State

## Existing system
The current TrueKredit system already exists and acts as:

- backend system
- database
- admin-facing loan management system
- SaaS-style deployment
- pooled tenant setup with co-mingled tenant data

There is currently **no borrower-facing component** in this SaaS system.

## Current repo structure
The current monorepo/repo structure is approximately:

```txt
/apps
  /admin
  /backend

/packages
  /shared           # types, enums, constants (TenantStatus, UserRole, ApiResponse, etc.)

/terraform          # AWS infra (ECS, RDS, ALB, S3, ACM)
  /modules
  /environments

/.github/workflows
  deploy.yml        # ECS deploy for backend + admin (single SaaS env)
  terraform.yml    # Terraform plan/apply for infra
```

This should be treated as the current baseline.

## Codebase-specific context

### Backend (`apps/backend`)
- **Stack**: Express + TypeScript + Prisma 7 + PostgreSQL
- **Auth**: Better Auth with session cookies; `TenantMember` + `Session.activeTenantId` for tenant context
- **Tenant scoping**: Manual per-route — `req.tenantId` from `authenticateToken` middleware; each route adds `tenantId: req.tenantId` to Prisma queries. No Prisma middleware for tenant isolation.
- **Modules** (under `src/modules/`): auth, tenants, billing, borrowers, products, loans, schedules, compliance, notifications, docs, referrals, dashboard, webhooks (Resend, TrueIdentity, Kredit), internalAdmin
- **Key integrations**: TrueIdentity (eKYC), TrueSend (email), Resend (delivery), TrueStack Admin (webhooks for tenant/subscription sync)
- **Billing**: Subscription + add-ons (TrueSend, TrueIdentity, Borrower Performance); approval-based payment flow; see `docs/billing-behavior-internal.md`
- **Config**: `src/lib/config.ts` — env-driven (JWT, storage, CORS, TrueIdentity URLs, webhook secrets). No `productMode` or `enabledModules` yet.

### Admin (`apps/admin`)
- **Stack**: Next.js 16 (App Router) + TypeScript + ShadCN UI + Better Auth client
- **Tenant context**: `TenantContext` + `TenantSwitcher`; session stores `activeTenantId`
- **Features**: Loans, applications, borrowers, products, billing, dashboard, TrueIdentity/TrueSend modules, referrals

### Deployment (current)
- **Single ECS cluster** (`truekredit-prod`), one backend + one admin service
- **ECR**: `truekredit-backend`, `truekredit-frontend`
- **Secrets**: AWS Secrets Manager (`truekredit-prod-*`)
- **Deploy**: Push to `main` triggers deploy; workflow supports `backend-only`, `frontend-only`, `db-migrate`, etc.
- **Terraform**: `environments/prod.tfvars`; single prod environment

## Feasibility audit from current codebase

Overall direction is **feasible**, but some parts of the plan are more realistic as a phased evolution than as an immediate target.

### High-feasibility items
- One shared monorepo for SaaS + Pro
- One backend deployable for the near term
- Config-driven SaaS vs Pro behavior (`productMode`, `enabledModules`, `clientId`)
- Dedicated per-client Pro deployments
- Shared domain logic and integration adapters

### Medium-feasibility items
- Extracting reusable packages from the backend
- Borrower-facing auth
- Client-specific branding/theming
- Per-client release lanes in GitHub Actions

### Higher-risk items that need plan adjustment
- **Immediate package-first refactor**: current backend is still route-heavy, with very large route files such as `modules/loans/routes.ts` and `modules/borrowers/routes.ts`. A full `/packages/domain-*` extraction should not be the first move. The more feasible first step is to extract internal services within `apps/backend`, then promote stable services into packages.
- **Per-client frontend from day 1**: Stakeholder direction is per-client frontend code (in client folders). Current frontend/deploy setup knows about one admin app and one backend image. Adding per-client frontend builds and deploy workflows will require CI/CD and Dockerfile updates. Maximize shared packages (`ui-core`, `api-sdk`) to reduce per-client maintenance burden.
- **Current Terraform is not yet account-per-client ready**: the existing `terraform/` reuses shared infra state (`terraform_remote_state` from `admin-truestack`) and a shared VPC/ALB model. That is suitable for today's SaaS deployment, but Pro client accounts will need a more self-contained stack instead of depending on shared network state.
- **Current workflow and Dockerfiles are app-specific**: the GitHub Actions workflow and Dockerfiles are currently hardcoded around `apps/backend`, `apps/admin`, and `packages/shared`. Adding new packages/apps is feasible, but requires explicit CI/CD and Docker changes.

### Practical conclusion
The plan should optimize for **minimal architectural change before the first Pro client**:

1. Add product-mode/config boundaries first.
2. Extract backend services inside `apps/backend` before extracting many new workspace packages.
3. Add Pro apps: `admin_pro`, `backend_pro`, `borrower_pro` (per-client folders under `borrower_pro`).
4. Add shared `packages/borrower-ui` for borrower_pro components (no duplication).
5. Add per-client deployment templates and manual Pro deployment workflows (config/flags).
6. Deploy: `admin_pro + backend_pro + borrower_pro (client-x)` → Client X's AWS account.

---

# 2. Desired Target State

## Product lines

### A. TrueKredit SaaS
This remains the existing pooled multi-tenant SaaS product.

Characteristics:
- co-mingled tenant data
- shared deployment/runtime
- admin-facing
- existing functionality continues

### B. TrueKredit Pro
This is an extension of TrueKredit for digital license clients.

Characteristics:
- dedicated deployment per client
- one AWS account per client
- isolated database and runtime per client
- borrower-facing modules added
- **single monorepo** — Pro apps in `apps/`: `admin_pro`, `backend_pro`, `borrower_pro`
- **admin_pro, backend_pro**: shared codebase for all clients
- **borrower_pro**: per-client frontend in `apps/borrower_pro/{client_id}/`; shares components via `packages/borrower-ui` (no duplication)

---

# 3. High-Level Architecture Decision

## Core direction
The best approach is:

**one shared codebase / monorepo, with shared core logic, and separate deployment models for SaaS vs Pro**

This means:

- do **not** build a completely separate product for Pro
- do **not** fork the backend per client — backend remains shared
- do **not** create totally separate repos per client by default

Instead:

- keep one shared backend codebase (TrueKredit Pro backend)
- per-client borrower frontend code (in client folders; different UI, same UX flow)
- use deployment config, module flags, secrets, and environment-specific runtime settings
- deploy SaaS and Pro separately; Pro: `admin_pro + backend_pro + borrower_pro/client-x` → Client X's AWS account

## Summary of the model

### TrueKredit SaaS
- pooled multi-tenant runtime
- shared database
- current existing product

### TrueKredit Pro
- same core product foundation
- adds digital-license-specific modules
- dedicated deployment per client
- isolated account, infra, DB, secrets, frontend, and app identity

---

# 4. TrueKredit Pro Modules

The following modules are expected to be added for Pro:

- borrower origination / loan application
- borrower-facing repayments
- borrower-facing website
- borrower mobile app
- attestation module
- digital signing integration
- document generation / handling
- borrower onboarding
- possibly notifications / reminders / collections workflows later

## Digital signing note
Digital signing is expected to remain on-prem or in a separate secure integration boundary due to CA integration requirements.

It should be handled as an integration adapter/service, not hard-coupled directly inside generic business logic.

### Signing adapter structure (implementation guidance)

```
packages/integrations-signing/
  src/
    types.ts           # SigningRequest, SigningResult, etc.
    adapter.ts         # Abstract interface
    onprem-adapter.ts  # On-prem/CA implementation
```

Backend calls the adapter; implementation is chosen by config (e.g. `SIGNING_PROVIDER=onprem`). Keeps CA/on-prem specifics out of core logic; easy to add cloud providers later.

---

# 5. Relationship Between Core, SaaS, and Pro

## Key design principle
TrueKredit Pro should be:

**TrueKredit Core + Pro apps (admin_pro, backend_pro, borrower_pro) + dedicated deployment**

- `admin_pro`, `backend_pro`: shared codebase for all clients
- `borrower_pro`: per-client frontend; shares components via `packages/borrower-ui`

Not:
- a totally separate product
- a separate backend codebase per client

## What should be shared
Shared across SaaS and Pro:
- domain logic
- lending workflows
- repayment logic
- auth patterns where appropriate
- API contracts where possible
- shared UI/package libraries
- shared integration SDKs/adapters
- shared CI/CD build logic

## What should differ
Different between SaaS and Pro:
- deployment topology
- database model
- tenant isolation model
- enabled modules
- **borrower_pro** — per-client frontend in `apps/borrower_pro/{client_id}/`; shares `packages/borrower-ui`; admin_pro shared
- mobile app identity
- client-specific config (secrets, variables, flags)
- infra/account boundaries

---

# 6. Repository Strategy

## Recommendation
Use **one repository** (`truestack_kredit`):

All SaaS and Pro apps live in the same monorepo:

- **SaaS**: `apps/admin`, `apps/backend`
- **Pro**: `apps/admin_pro`, `apps/backend_pro`, `apps/borrower_pro`
- **Shared packages**: `packages/shared`, `packages/borrower-ui`, etc.
- **Infra**: `terraform/`, `.github/workflows/`

## Why a single repo

- **Simpler coordination** — backend, admin, and borrower_pro changes can land in one PR
- **Shared components** — borrower_pro client apps import from `packages/borrower-ui`; no cross-repo contract publishing
- **Unified CI/CD** — one pipeline; deploy workflows select which apps to build/deploy per client
- **Easier refactors** — rename DTOs, update API contracts across apps in one place

---

# 7. Recommended Repo Shapes

## Current vs target

**Current**: `apps/admin`, `apps/backend`, `packages/shared` (types, enums), `terraform/`, `.github/workflows/`

**Target**: Add Pro apps in the same repo (`truestack_kredit`):
- `apps/admin_pro` — shared codebase for all Pro clients
- `apps/backend_pro` — shared codebase for all Pro clients
- `apps/borrower_pro` — per-client frontend (each client has their own folder); shares components via `packages/borrower-ui` (SignIn, SignUp, forms, etc.) — same UX, different UI per client

## Target structure (`truestack_kredit`)

```txt
/apps
  /admin                     # current SaaS admin frontend
  /backend                   # current SaaS backend API
  /admin_pro                 # Pro admin — shared codebase for all clients
  /backend_pro               # Pro backend — shared codebase for all clients
  /borrower_pro              # Pro borrower frontend — per-client
    /client-a                # Client A's borrower app (different UI)
    /client-b                # Client B's borrower app
  /worker                    # optional later for async jobs, queues, scheduled jobs

/packages
  /shared                    # existing: types, enums, constants
  /borrower-ui               # shared components for borrower_pro (SignIn, SignUp, forms, flows, API hooks)
  /domain-core               # loans, accounts, schedules, repayments (extract from backend)
  /domain-origination        # borrower application/origination flows
  /domain-attestation        # attestation logic
  /domain-documents          # agreements, docs, templates
  /domain-repayments         # borrower-facing repayment logic
  /domain-compliance         # audit trail, digital-license rules (extract from backend)
  /shared-auth               # auth/session/roles
  /shared-db                 # ORM/db access layer (optional; Prisma lives in backend)
  /shared-config             # runtime config loading
  /api-contracts             # published/shared API contracts
  /form-schemas              # shared validation schemas/forms where useful

  /integrations-ekyc         # eKYC adapter (TrueIdentity logic can move here)
  /integrations-credit       # future credit report adapter/client
  /integrations-signing      # CA/on-prem signing adapter interface
  /integrations-payments     # payment gateway integration abstraction

/terraform                  # existing at repo root
  /modules/pro-client       # new: reusable Pro client stack
  /environments/pro-client-* # new: per-client tfvars (or use existing environments/ pattern)

/.github/workflows
  ci.yml, deploy-saas.yml, deploy-pro.yml, build-images.yml
```

## Borrower_pro: Per-Client Frontend, Shared Components

- **Per-client**: Each client has their own folder under `apps/borrower_pro/{client_id}/` (e.g. `client-a`, `client-b`).
- **Shared components**: All borrower_pro apps import from `packages/borrower-ui`. SignIn, SignUp, forms, flows — same components, no duplication. UI can differ per client via theming (colors, fonts, layout); UX flow stays the same.
- **admin_pro, backend_pro**: Shared across all clients; deployed per client with config/secrets.

## Feasible interpretation of the target structure

**Confirmed direction**: Single monorepo. Pro apps: `admin_pro`, `backend_pro` (shared); `borrower_pro` (per-client). borrower_pro shares components via `packages/borrower-ui` — no copy-paste.

Deployments are controlled via config files / flags. When deploying for Client A: `admin_pro + backend_pro + borrower_pro/client-a` → Client A's AWS account (with Client A's secrets/variables).

---

# 8. Backend Strategy

## Keep backend in monorepo
Backend (SaaS) and backend_pro (Pro) remain in the same monorepo.

## Recommended immediate approach
Do **not** split the backend into many microservices yet.

**SaaS**: `apps/backend`  
**Pro**: `apps/backend_pro` — shared codebase for all Pro clients; deployed per client with config/secrets.

Both can share domain logic via `packages/`. First move internal business logic into **services inside `apps/backend`** (and later `apps/backend_pro`), then move stable abstractions into reusable packages under `/packages`.

## Best near-term model
Use:

- **one backend deployable app**
- **many internal modules/services**
- **selective shared packages only where boundaries are already stable**

That means the backend remains one deployable service initially, but internally becomes modular.

## Practical codebase note

This matters because the current backend is still route-centric:
- `modules/loans/routes.ts` is very large and mixes routing, validation, orchestration, and domain logic
- `modules/borrowers/routes.ts` also contains significant business logic
- some cross-cutting behavior such as subscription enforcement is currently attached at route level

Because of this, the most feasible first refactor is:
1. extract per-module service files inside `apps/backend/src/modules/...`
2. introduce product-aware middleware/config boundaries
3. move genuinely reusable logic into `/packages` after those seams exist

## Why
This avoids:
- premature microservice complexity
- too many ECS services too early
- duplicated backend logic
- unnecessary operational overhead

## Potential future split
Only split the backend further if there is real pressure, for example:
- borrower/public API needs separate security boundary
- worker jobs need separate scaling
- digital signing needs isolation
- async tasks grow significantly
- different deployment cadence is needed

Likely future additions:
- `/apps/worker`
- maybe later `/apps/borrower-api` and `/apps/admin-api`

But not required immediately.

---

# 9. SaaS vs Pro Backend Behavior

The same backend codebase should support both SaaS and Pro.

## SaaS runtime
- pooled tenancy enabled
- co-mingled tenant data
- admin-facing modules only or mostly
- SaaS deployment config

## Pro runtime
- dedicated single-client deployment
- isolated DB
- borrower-facing modules enabled
- attestation enabled
- signing integration enabled
- repayment frontend APIs enabled
- Pro deployment config

**Backend updates**: TrueKredit Pro backend code is shared. When an update is made, it can be pushed to all clients that have Pro in their config. Backend APIs remain the same across clients. Each client gets their own deployed instance with client-specific secrets/variables.

## Important point
This should be achieved through:
- config
- module enablement
- environment variables
- feature flags
- client/product mode

Not through separate code forks.

## Product mode configuration (implementation guidance)

Extend `apps/backend/src/lib/config.ts` with:

```typescript
productMode: process.env.PRODUCT_MODE || 'saas',   // 'saas' | 'pro'
clientId: process.env.CLIENT_ID || null,           // Pro: client identifier (e.g. 'client-a')
enabledModules: (process.env.ENABLED_MODULES || 'core').split(','),
```

- **SaaS**: `PRODUCT_MODE=saas` — multi-tenant, billing/subscription enabled, admin-only.
- **Pro**: `PRODUCT_MODE=pro`, `CLIENT_ID=client-a` — single effective tenant, billing typically disabled, borrower modules enabled.

Gate routes and features by these values. Same image, different runtime behavior.

## Product-aware middleware

Current route composition includes SaaS-oriented middleware patterns. For Pro, some of this behavior must become product-aware.

Examples:
- borrower-facing Pro routes should not accidentally inherit SaaS subscription checks
- admin routes may still need auth/role checks, but not SaaS billing checks
- Pro-specific route groups should be mounted conditionally based on `productMode` / `enabledModules`

## Pro tenant model

For Pro, each deployment has exactly one logical tenant. Recommended approach:

- **Single-tenant DB**: One `Tenant` row per Pro deployment; seed or create during deployment.
- **`req.tenantId`** is always that tenant; no tenant switcher in Pro admin.
- Avoid over-engineering Pro with multi-tenant support when it is single-tenant by design.

## Borrower auth (Pro)

Current auth is admin-only (Better Auth + TenantMember). Pro needs borrower-facing auth.

**Options**:
1. **Same Better Auth** — Add `userType` (admin vs borrower); different session/tenant semantics.
2. **Separate auth path** — JWT or session for borrowers, distinct from admin.
3. **Borrower identity** — `Borrower` record as identity (phone/IC + OTP or email/password); link to tenant via `Borrower.tenantId`.

**Recommendation**: Use same Better Auth with clear separation. Admin = `User` + `TenantMember`. Borrower = `Borrower` (or `BorrowerUser` if login needed) linked to tenant. Avoid mixing admin and borrower concepts in the same `User` table unless explicitly desired.

---

# 10. Frontend Strategy

## Borrower_pro: Per-Client Frontend, Shared Components (Confirmed)

**Structure**: `apps/borrower_pro/{client_id}/` — each Pro client has their own borrower frontend folder.

- **UI (design)**: Different per client — colors, layout, branding, visual identity
- **UX (flow)**: Same across clients — steps, user journey, business logic flow
- **Shared components**: All borrower_pro apps import from `packages/borrower-ui`. No duplication.

## Shared Components (packages/borrower-ui)

**Yes, borrower_pro can share components without duplicating.** All per-client borrower apps import from a shared package:

- **packages/borrower-ui**: Shared components used by all clients — **SignIn**, **SignUp**, loan application forms, repayment flows, document upload patterns, eKYC flow integration, API hooks, validation, common screen logic
- **Same component, different UI**: Client A and Client B both use `<SignIn />` and `<SignUp />` from `packages/borrower-ui`. The UX (flow, validation, API calls) is identical. The UI (colors, fonts, spacing, logo) can differ per client via theming — e.g. CSS variables, theme provider, or client-specific style overrides.
- Client-specific code only: branding, theme config, layout, custom page composition, route variations

This avoids copy-paste and keeps UX flow logic in one place. Components are shared; styling is configurable per client.

**Implementation note**: Shared components can accept theme/className props or use a theme provider (e.g. CSS variables, Tailwind theme, or design tokens) so each client app supplies its own theme. The component logic (validation, API calls, flow) stays the same; only the visual presentation changes.

## Implementation pattern

**Per-client structure** (`apps/borrower_pro/client-a/`, `client-b/`, etc.):
- each client has their own folder with their app code
- all import from `packages/borrower-ui` for shared components
- client-specific code: branding, layout, styling, custom pages
- deployments controlled via config files / flags

**Deployment**: When deploying for Client A → `admin_pro + backend_pro + borrower_pro/client-a` → Client A's AWS account (with Client A's secrets/variables).

## Shared vs client-specific

**Shared** (`packages/borrower-ui`):
- borrower flows (UX)
- auth/session handling
- API hooks / SDK usage
- shared forms and validation
- document upload patterns
- repayment flow components
- eKYC flow integration
- common screen logic

**Client-specific** (`apps/borrower_pro/{client_id}/`):
- UI / branding
- logo/colors/fonts
- client-specific wording/content
- custom page composition where needed
- route variations where required

---

# 11. Mobile App Strategy

## Client mobile apps
Each Pro client has their own borrower mobile app. In the single monorepo, mobile can live under `apps/borrower_pro/{client_id}/mobile` or as a shared `apps/mobile_pro` with per-client build profiles.

## Recommendation
Keep mobile in the **same monorepo** (`truestack_kredit`):

- **Option A**: Per-client mobile under `apps/borrower_pro/{client_id}/mobile` — aligned with per-client borrower web
- **Option B**: Shared `apps/mobile_pro` with per-client build profiles, environment config, and theme assets
- Per-client app identities (bundle ID, app-store listing, icons, splash)
- Same UX flow across clients; different UI per client
- Shares `packages/borrower-ui` for components (same as borrower web)

## Most feasible implementation
Create:
- per-client mobile under `apps/borrower_pro/{client_id}/mobile`, OR
- one shared `apps/mobile_pro` with per-client build profiles
- support separate app identities from day 1 (bundle ID, icons, splash per client)

## Mobile app pattern (single monorepo)

```txt
truestack_kredit/
  /apps
    /borrower_pro
      /client-a
        /web              # Client A borrower web
        /mobile           # Client A borrower mobile (optional: per-client)
      /client-b
        /web
        /mobile
  # OR: shared mobile app
  /apps/mobile_pro        # shared Expo app; per-client build profiles
  /packages
    /borrower-ui          # shared components for web + mobile
```

Each client mobile config should define:
- app name
- bundle ID / package name
- icons / splash assets
- theme
- API base URL
- enabled modules
- app-store metadata

## Shared layer (packages/borrower-ui)

borrower_pro web and mobile share:
- borrower business logic
- repayment flows
- auth/session handling
- API hooks / SDK usage
- validation/forms
- shared screens/components
- theme support
- reusable flow logic

Client-specific shell:
- bundle ID / package name
- app name
- app icon / splash
- colors/theme
- enabled modules
- app-store metadata
- client branding

## Recommendation summary

Single monorepo. Pro apps: `admin_pro`, `backend_pro` (shared); `borrower_pro` (per-client). borrower_pro shares components via `packages/borrower-ui`. No separate repos.

---

# 12. Core Shared Services

There is also a core system providing services to TrueKredit today, such as:
- eKYC
- future credit reports
- possibly other financial/integration services later

## Recommendation
Treat these as **shared platform services**, not logic buried directly inside TrueKredit.

## Example shared platform services
- eKYC
- credit report
- SSM APIs
- identity verification
- possibly fraud/risk tooling later

## Relationship to TrueKredit
TrueKredit and TrueKredit Pro should consume these services via:
- API clients
- adapters
- clear interfaces

Avoid:
- direct DB coupling
- tightly embedding platform services into product business logic

## Existing pattern (TrueIdentity)

The codebase already uses TrueIdentity (eKYC) via `modules/trueidentity/` — Admin webhook client, usage client, session creation, webhook handlers. This adapter-style integration is the model to follow for signing, credit reports, and other shared services.

---

# 13. Deployment Model

## SaaS deployment
TrueKredit SaaS remains:
- shared runtime
- pooled database
- AWS deployment
- existing SaaS environment

## Pro deployment
Each TrueKredit Pro client should get:
- one AWS account per client
- separate deployment stack
- separate database
- separate secrets/config
- separate frontend deployment
- separate mobile app release
- separate logs/storage/monitoring boundary

## Key principle
**Share code, not production runtime**

This is the most important deployment principle for Pro.

## Clarified requirement

Treat **per-client AWS accounts from day 1** as a hard requirement, not a future optimization.

This means the first Pro implementation must already include:
- a repeatable client account bootstrap process
- per-client IAM role assumptions for GitHub Actions
- per-client secrets and naming conventions
- per-client DNS / certificates / monitoring conventions
- per-client release inventory

## Pro deployment composition

Each Pro client deployment consists of:
- **admin_pro** + **backend_pro** + **borrower_pro/client-x** → Client X's AWS account

Deployments are controlled via config files / flags. When deploying for Client A, the shared admin_pro and backend_pro plus Client A's borrower_pro folder are deployed to Client A's AWS account with Client A's secrets/variables.

## Pro deployment template (for easy new-client onboarding)

Use a reusable Terraform module so adding a Pro client is mostly configuration:

```txt
/terraform
  /modules
    /pro-client           # Reusable Pro stack (new)
      main.tf
      variables.tf
      outputs.tf
  /environments
    prod.tfvars           # Existing SaaS (current prod)
    pro-client-a.tfvars   # New Pro client
    pro-client-b.tfvars  # New Pro client
```

**Per-client tfvars example** (`pro-client-a/terraform.tfvars`):

```hcl
client_id       = "client-a"
client_name     = "Client A"
domain          = "loans.client-a.com"
api_domain      = "api.client-a.com"
enabled_modules = ["origination", "repayments", "attestation", "signing"]
```

**CI/CD pattern**: Reusable workflow with `client_id` input; builds once from monorepo, deploys to the correct AWS account via OIDC, runs migrations for that client's DB. Deployments are manual or release-triggered — not automatic on every push.

## Current infrastructure constraint

The current `terraform/` is still SaaS-oriented:
- it uses `terraform_remote_state` from `admin-truestack`
- it assumes a shared VPC / shared ALB model
- it is parameterized for one main production environment

That is acceptable for the current SaaS deployment, but it means Pro cannot simply reuse the existing Terraform shape as-is.

## Adjustment for Pro feasibility

For Pro, prefer a **self-contained client stack module** that does not depend on shared network state from another project/account.

That module should be able to provision or reference, per client:
- VPC / subnets (or clearly defined network inputs)
- ECS or equivalent compute
- RDS
- secrets
- storage
- DNS / certificates
- logging / monitoring

---

# 14. AWS Account Model

## Recommended AWS model

### Shared/build/platform account
Can contain:
- build resources
- shared CI/CD resources
- ECR repositories
- central/shared platform services if appropriate
- client inventory / release metadata if you centralize it

### SaaS account
Contains:
- pooled TrueKredit SaaS deployment
- shared SaaS DB
- shared admin app/backend

### One Pro client account per client
Contains:
- Pro backend services
- borrower frontend hosting
- mobile API endpoints / backend connectivity for that client
- DB
- secrets
- storage
- monitoring/logs
- client-specific infra

## Day-1 operational implication

Because multiple Pro clients will exist from the start, define a client bootstrap standard immediately:
- AWS account name pattern
- OIDC role name pattern for GitHub Actions
- secrets naming pattern
- Route53 / domain naming pattern
- alerting / dashboard baseline
- runbook template

---

# 15. CI/CD with GitHub Actions and AWS

## Recommended direction
Use GitHub Actions with AWS OIDC authentication.

## Core pattern
- build once from monorepo
- push Docker images
- deploy selectively by environment/account

## Suggested workflow split

### CI (`ci.yml`)
Runs on PRs and pushes:
- lint
- test
- typecheck
- maybe build

### Shared image build workflow (`build-images.yml`)
Reusable workflow that:
- builds backend image (and optionally admin)
- pushes to ECR
- outputs image URI/tag

### SaaS deploy workflow (`deploy-saas.yml`)
Deploys only to SaaS environment/account. Current `deploy.yml` is SaaS-only; can be renamed or kept.

### Pro deploy workflow (`deploy-pro.yml`)
Deploys to selected Pro client account(s). Takes `client_id` (and optionally `version`) as workflow input. Manually triggered or release-triggered. Uses AWS OIDC to assume role in client's account.

### Pro borrower_pro workflows
In the same monorepo, workflows deploy:
- `borrower_pro/{client_id}/web` (or `borrower_pro_client_a`, etc.)
- `build-mobile.yml` for per-client mobile builds
- `release-mobile.yml`, optional `submit-store.yml`

These support:
- per-client web deployment config
- per-client mobile build profiles
- per-client release channels

## Build-system implication

Current Dockerfiles and workflows are explicitly wired to:
- `apps/backend`
- `apps/admin`
- `packages/shared`

When introducing Pro apps (`admin_pro`, `backend_pro`, `borrower_pro`) and new packages such as `packages/domain-*`, `packages/borrower-ui`, or `packages/integrations-*`, the build pipeline must be updated in parallel:
- workspace manifests copied into Docker build context
- change detection expanded beyond `packages/shared`
- image builds parameterized for additional apps
- CI paths and cache keys updated to reflect new workspace layout

With the single monorepo, all apps build and deploy from one repo:
- backend, admin, admin_pro, backend_pro, borrower_pro
- no cross-repo contract publishing needed

## Important deployment rule
A code push does **not** automatically update all environments.

Only environments explicitly deployed will move to the new version.

This is important because:
- SaaS may stay on one version
- Pro clients may be upgraded one by one
- rollouts can be controlled safely

## Transition strategy: implementing Pro without disrupting SaaS users

During the period when Pro is being built while SaaS is in production, the CI/CD pipeline must keep SaaS stable and never accidentally deploy Pro code to SaaS in a broken state.

### Principle: SaaS-first, Pro-isolated

| Aspect | SaaS (TrueKredit) | Pro (TrueKredit Pro) |
|--------|-------------------|----------------------|
| **Deploy trigger** | Push to `main` (existing behavior) | Manual only (`workflow_dispatch`) |
| **Deploy target** | Single prod environment | Per-client account |
| **Auto-deploy on merge** | Yes | No |
| **Migrations** | Run when `prisma/` changes | Run only when deploying to that client |

### Keep existing SaaS deploy unchanged

- **Do not change** the `on: push: branches: [main]` trigger for the SaaS workflow. Existing users rely on this.
- The current `deploy.yml` remains the SaaS deploy. Rename to `deploy-saas.yml` only when adding `deploy-pro.yml`; the trigger and behavior stay the same.
- `workflow_dispatch` actions (`backend-only`, `frontend-only`, `db-migrate`, etc.) continue to work for operational overrides.

### Pro deploy is manual-only

- `deploy-pro.yml` must use **only** `workflow_dispatch` — no `on: push`.
- Inputs: `client_id`, optionally `environment` (staging/production), `image_tag` (default: latest).
- Pro deployments never run as a side effect of merging to `main`.
- The workflow should resolve a per-client role ARN / account mapping from a checked-in client registry file or environment configuration.

### Change detection updates (when adding packages)

Current `deploy.yml` detects changes in:
- Backend: `apps/backend/`, `packages/shared/`, `Dockerfile.migrations`, `scripts/`
- Frontend: `apps/admin/`, `packages/shared/`
- Migrations: `apps/backend/prisma/`

**When adding `packages/domain-*` and `packages/integrations-*`**: Extend backend change detection to include `packages/` so that extracting logic into packages still triggers a backend rebuild and deploy. Example:

```yaml
# Backend changed if any of these change:
if echo "$CHANGED_FILES" | grep -qE "^(apps/backend/|packages/|Dockerfile\\.migrations|scripts/)"; then
  echo "backend_changed=true" >> "$GITHUB_OUTPUT"
```

This ensures shared package changes flow to SaaS. Since `productMode=saas` at runtime, new Pro-only code paths are never executed in SaaS.

### CI gate before deploy

- Add or strengthen a **CI job** that runs on every PR and push: `lint`, `test`, `typecheck`.
- Require CI to pass before merging to `main`. This prevents broken Pro code from reaching `main` and thus from being deployed to SaaS.
- If CI fails, the PR cannot merge; SaaS never receives broken code.

### Migrations: additive only

- SaaS and Pro share the same Prisma schema and migrations.
- When adding Pro tables/columns, migrations must be **additive** — new tables, new nullable columns, new enums. No dropping columns or changing semantics for existing SaaS data.
- SaaS deploy runs migrations when `apps/backend/prisma/` changes. New migrations will run on the SaaS DB. As long as they are additive, SaaS is unaffected.
- Pro deploy runs the same migrations on each Pro client's DB when deploying.

### Phased CI/CD evolution

| Phase | Action | SaaS impact |
|-------|--------|-------------|
| **1. Now** | Add `ci.yml` (or enhance existing) for lint/test/typecheck on PRs. Make it a required check. | None |
| **2. Add packages** | Extend change detection to `packages/*` for backend. Ensure backend Dockerfile installs/builds packages. | None; backend rebuilds when packages change |
| **3. Add Pro config** | Add `productMode`, `enabledModules` to backend config. Default `saas`. | None; SaaS behavior unchanged |
| **4. Add client registry** | Add checked-in client deployment metadata (account, role, domains, modules). | None |
| **5. Add deploy-pro** | Create `deploy-pro.yml` with `workflow_dispatch` only. No `on: push`. | None |
| **6. Add borrower_pro CI** | Build borrower_pro web/mobile workflows per client config in the same monorepo. | None |
| **7. Pro staging (optional)** | One or more Pro staging deployments for testing before production clients. | None |

### Rollback safety

- SaaS: Roll back by re-running deploy with a previous image tag, or revert the merge and push.
- Pro: Each client can be rolled back independently by deploying an older image tag.
- Migrations: Prefer forward-compatible migrations. If a migration must be reverted, document the rollback procedure; avoid destructive migrations on shared schema.

### Summary: no disruption to SaaS users

1. **SaaS deploy trigger** — Unchanged. Push to `main` → deploy to SaaS prod.
2. **Pro deploy** — Manual only. Never triggered by push.
3. **CI** — Must pass before merge. Broken code does not reach `main`.
4. **Migrations** — Additive only. New Pro schema does not break SaaS.
5. **Runtime** — `productMode=saas` ensures Pro-only code paths are not executed in SaaS.

---

# 16. Release Model

## Recommendation
Use separate release lanes:

### Lane A: TrueKredit SaaS
For pooled SaaS deployments.

### Lane B: TrueKredit Pro
For dedicated client deployments.

## Versioning concept
Possible versioning structure:
- Core version
- Pro release version
- per-client deployment version

For example:
- `core v2.x`
- `pro v2.x-pro.y`
- client A on one version
- client B on another version

## Benefit
Allows:
- selective client upgrades
- staged rollout
- rollback
- shared code with controlled release cadence

---

# 17. Runtime Configuration Strategy

## Recommendation
Use config-driven behavior.

Examples of config dimensions:
- product mode (`saas`, `pro`)
- enabled modules
- borrower-facing features
- attestation enabled
- signing enabled
- payment integrations
- eKYC provider config
- client theme/branding
- client-specific field configuration

## This allows
- same image/codebase
- different runtime behavior
- safer upgrades
- fewer forks

---

# 18. Multi-Cloud / Non-AWS Support

## Requirement discussed
Some future clients may want deployment on providers other than AWS, for example Alibaba Cloud.

## Recommendation
This is achievable, but needs the correct abstraction.

## Important distinction

### Portable
- application code
- Docker/container images
- shared domain logic
- frontend/mobile code
- API contracts

### Not inherently portable
- ECS task definitions
- AWS-specific IAM assumptions
- AWS-specific deployment workflows
- AWS-specific runtime wiring

## Conclusion
If the system is made too ECS-specific, portability becomes harder.

## Practical recommendation
Since the business will **mostly use AWS**, the main path should remain AWS-first.

However:
- keep app code portable
- keep Docker images portable
- avoid hard-coding too much AWS-specific behavior deep into app code
- keep infra definitions modular
- consider abstracting deployment/runtime assumptions where reasonable

## If non-AWS becomes serious later
For future multi-cloud requirements, especially across AWS and Alibaba:
- Kubernetes may become the more portable runtime target for Pro
- but this does not need to be the first step if AWS remains the main focus

## Current conclusion
Design for:
- mostly AWS
- optional future portability
- avoid over-optimizing for multi-cloud too early

---

# 19. Immediate Recommended Evolution Path

## Phase 1: Codebase restructuring
- keep existing `/apps/admin` and `/apps/backend`
- add `productMode`, `enabledModules`, `clientId` to `config.ts`
- extract module services inside `apps/backend` first
- introduce `/packages` only for stable shared boundaries
- establish config/module boundaries

## Phase 2: Add Pro modules
- borrower origination
- borrower repayment APIs
- attestation
- digital signing adapter (`packages/integrations-signing`)
- borrower-facing capabilities
- document flow support

## Phase 3: Add borrower_pro foundation
- add `apps/borrower_pro` with per-client folders (`client-a`, `client-b`, etc.)
- add `packages/borrower-ui` for shared components (no duplication)
- build per-client borrower web apps; all import from `packages/borrower-ui`
- integrate with backend_pro APIs
- deployments controlled via config/flags

## Phase 4: Add mobile foundation
- add mobile under `apps/borrower_pro/{client_id}/mobile` or shared `apps/mobile_pro`
- use per-client app identities (bundle ID, icons, splash)
- share `packages/borrower-ui` with borrower web

## Phase 5: Pro deployment templating
- define self-contained per-client AWS account deployment template (`terraform/modules/pro-client`)
- infra-as-code for Pro client stacks
- DB/secrets/logging conventions
- `deploy-pro.yml` workflow with `client_id` input
- release pipeline for selective client deployment

## Phase 6: Optional extra deployables
- per-client frontend structure is in place from Phase 3/4
- split `worker` / `borrower-api` only when scaling or security boundaries justify it

## Phase 7: Operational hardening
- worker service if needed
- monitoring/alerts
- audit logging
- release controls
- environment approvals
- migration/version management

---

# 20. Key Principles to Preserve

1. **One shared backend codebase** — TrueKredit Pro backend shared across all clients
2. **Per-client borrower frontend** — each client has their own frontend code (different UI, same UX flow)
3. **Shared logic, separate runtime** — same code, deployed per client with client-specific config
4. **Config-driven backend differences** — flags, secrets, variables per client
5. **Dedicated Pro deployment per client** — own AWS account, DB, backend instance, frontend
6. **SaaS and Pro release independently**
7. **Mostly AWS, but keep code portable**
8. **Modularize first, split services later only if needed**
9. **Treat core services like eKYC as shared platform services**

---

# 21. Anti-Patterns to Avoid

## Avoid these:

### 1. Separate repo per client by default
All Pro apps live in the same monorepo. Separate repos per client will become difficult to maintain and upgrade.

### 2. Full code forks for Pro
This will create long-term maintenance pain.

### 3. Premature microservices
Splitting backend into too many services too early will increase ops complexity.

### 4. Copy-paste web/mobile apps
Per-client frontends are required, but avoid full duplication. Use shared packages (`ui-core`, `api-sdk`, `form-schemas`) for UX flow and logic. Client-specific code should focus on UI/branding, not reimplementing flows.

### 5. Embedding provider-specific deployment assumptions into app logic
This reduces portability and future flexibility.

### 6. Mixing shared SaaS pooled runtime model with Pro isolated runtime model without clear boundaries
This can make operational and compliance boundaries messy.

---

# 22. Planning Questions for the Next AI

The next AI reviewing the codebase should help answer:

1. How should the current `/apps/backend` be modularized into packages?
2. Which domain boundaries already exist implicitly in the current code?
3. What is the best migration path from current SaaS-only backend to shared core + Pro modules?
4. How should configuration be structured to support SaaS vs Pro?
5. How should auth/roles be extended for borrower-facing users?
6. What borrower-facing flows should become reusable shared packages?
7. What is the best frontend architecture for per-client borrower frontends? (Confirmed: per-client code in client folders; different UI, same UX flow.)
8. What is the best mobile shared-core + client-shell approach?
9. What infra-as-code structure should be used for AWS account-per-client deployments?
10. How should CI/CD be structured in GitHub Actions for SaaS vs Pro rollouts?
11. Which parts of the backend should remain one app, and which should become separate deployables later?
12. How should digital signing integration be isolated cleanly?
13. How should shared services like eKYC and future credit reports be integrated without tight coupling?
14. What migration path allows minimal disruption to the existing production SaaS system?

---

# 23. Final Summary

The recommended direction is:

- keep **TrueKredit SaaS** as the current pooled multi-tenant product
- build **TrueKredit Pro** as an extension of the same shared codebase
- use **one monorepo** (`truestack_kredit`) for all apps
- **admin_pro, backend_pro**: Shared across all clients; deployed per client with config/flags/secrets/variables
- **borrower_pro**: Per-client frontend in `apps/borrower_pro/{client_id}/`; shares components via `packages/borrower-ui` (no duplication)
- **Deployment**: `admin_pro + backend_pro + borrower_pro/client-x` → Client X's AWS account
- extract services first, then use **shared packages** where boundaries are stable
- keep **shared backend logic**, but deploy Pro **per client AWS account**
- use **GitHub Actions + AWS** for selective deployments; deployments controlled via config files / flags
- stay **AWS-first**, while avoiding unnecessary deep lock-in in the app layer
- optimize for **maintainability, upgradeability, and isolation**

This is the preferred architecture direction, confirmed by stakeholders.

---

# 24. Codebase-Specific Implementation Guidance

## Backend modularization mapping

| Current location | Target package | Notes |
|------------------|----------------|-------|
| `modules/loans/*`, `modules/schedules/*` | module services first, then `packages/domain-core` | Loans, schedules, repayments |
| `modules/billing/*` | Keep in backend or `packages/domain-billing` | SaaS-only; Pro may not need |
| `modules/compliance/*` | module services first, then `packages/domain-compliance` | Audit, digital-license rules |
| `lib/math.ts` | `packages/shared` or `packages/shared-math` | Already in shared |
| `modules/borrowers/*` | module services first, then `packages/domain-core` | Core domain |
| New: origination flows | `packages/domain-origination` | Borrower application flows |
| New: attestation | `packages/domain-attestation` | Attestation logic |
| New: documents | `packages/domain-documents` | Agreements, templates |
| New: signing | `packages/integrations-signing` | CA/on-prem adapter |

Backend remains one deployable app; it imports packages and wires routes based on `productMode` and `enabledModules`.

Practical recommendation: do not try to extract the large route modules directly into workspace packages in one step. First create service boundaries inside `apps/backend`.

## Existing domain boundaries

The codebase already has implicit domain boundaries that map well to packages:

- **Loans**: `modules/loans`, `modules/schedules` — schedule generation, repayments, disbursement
- **Borrowers**: `modules/borrowers` — KYC, performance projection, TrueIdentity
- **Products**: `modules/products` — loan products, interest models
- **Billing**: `modules/billing` — subscription, invoices, add-ons (SaaS-only)
- **Compliance**: `modules/compliance` — audit logs, audit service
- **Notifications**: `modules/notifications` — TrueSend, Resend, WhatsApp

## CI/CD workflow structure

```
.github/workflows/
  ci.yml              # Lint, test, typecheck on PRs (required before merge)
  deploy-saas.yml     # Deploy to SaaS (on push to main; current deploy.yml)
  deploy-pro.yml      # Manual only: client_id input, deploys to that client
  build-images.yml    # Reusable: build backend and admin
```

**Pro deployment flow**: Build images from monorepo → deploy `admin_pro + backend_pro + borrower_pro/client-x` to client X's AWS account via OIDC → run migrations for that client's DB → update ECS services. Deployments controlled via config files / flags. Each client gets their own admin_pro instance (shared code) + backend_pro instance (shared code) + borrower_pro instance (per-client code) + their own DB. Use image tags like `sha-abc123` or `v2.1.0-pro`. Maintain a version matrix (which client is on which version).

**Transition**: See Section 15 "Transition strategy" for how to implement Pro without disrupting SaaS users — SaaS deploy stays on push-to-main; Pro deploy is manual-only.

## Borrower_pro web pattern

**Per-client frontend structure** (single monorepo):

```
truestack_kredit/
  /apps
    /borrower_pro
      /client-a/            # Client A frontend (different UI)
        app/, components/, theme/
      /client-b/            # Client B frontend (different UI)
        app/, components/, theme/
  /packages
    /borrower-ui            # Shared components (forms, flows, API hooks)
  /packages/shared
  /packages/form-schemas
```

Each client folder contains their frontend code. `packages/borrower-ui` provides shared components — no duplication. Client-specific code provides UI (branding, layout, styling). Deployments: config/flags select client → deploy to that client's AWS account with that client's secrets/variables.

## Mobile app pattern

Mobile can live under `apps/borrower_pro/{client_id}/mobile` or as shared `apps/mobile_pro`:

```
truestack_kredit/
  /apps
    /borrower_pro
      /client-a/
        /web
        /mobile
      /client-b/
        /web
        /mobile
  # OR: shared mobile
  /apps/mobile_pro        # shared Expo app; per-client build profiles
  /packages/borrower-ui   # shared by web + mobile
```

## Migration path (minimal disruption)

| Phase | Focus | Impact |
|-------|-------|--------|
| 1 | Add `productMode`, `enabledModules` to config | Low |
| 2 | Extract module services inside `apps/backend` | Medium |
| 3 | Add Pro deployment Terraform module + `deploy-pro` workflow | Medium |
| 4 | Add borrower origination + repayment APIs (Pro-only routes) | Medium |
| 5 | Add borrower_pro with per-client folders + packages/borrower-ui | Medium |
| 6 | Add mobile (under borrower_pro or shared mobile_pro) | Medium |
| 7 | Add attestation, documents, signing adapter | Medium |

SaaS behavior stays unchanged when `productMode=saas`.

---

# 25. Planning Questions — Answered

1. **Modularize backend**: First extract services inside `apps/backend`, then promote stable domains into `packages/domain-*`; keep routes thin.

2. **Domain boundaries**: Loans, schedules, repayments, borrowers, products, compliance, billing — use these as package boundaries.

3. **Migration path**: Introduce product-mode and internal services first, then packages incrementally; keep existing modules working while extracting.

4. **Config for SaaS vs Pro**: `productMode`, `clientId`, `enabledModules`; gate routes/features by these.

5. **Borrower auth**: Extend Better Auth or add borrower-specific path; use `Borrower` (or `BorrowerUser`) as identity for Pro.

6. **Borrower flows as packages**: Origination, repayments, attestation, documents as `packages/domain-*`.

7. **Web client structure**: Per-client frontend code in client folders. Different UI per client, same UX flow. Shared packages for flow logic; client-specific code for UI/branding.

8. **Borrower_pro**: Per-client frontend in `apps/borrower_pro/{client_id}/`. Shares components via `packages/borrower-ui`. No duplication.

9. **Infra for Pro**: Terraform module `pro-client` parameterized by `client_id`, domain, modules, and built as a self-contained client stack rather than depending on current shared remote state.

10. **CI/CD**: Separate workflows for SaaS vs Pro in the same monorepo. Pro workflow takes `client_id` input and resolves per-client account/role mapping. Builds admin_pro, backend_pro, borrower_pro/{client_id}.

11. **Backend split**: Keep one backend initially; consider `borrower-api` only if separate security boundary needed.

12. **Signing**: Adapter in `packages/integrations-signing`; backend depends on interface, not implementation.

13. **eKYC / shared services**: Consume via API clients/adapters; no direct DB coupling. TrueIdentity already follows this pattern.

14. **Minimal disruption**: Use `productMode` and feature flags; SaaS unchanged when `productMode=saas`.

---

# 26. Top Priorities for Easy Deployment & Maintenance

1. **Product-mode config first** — Single source of truth for SaaS vs Pro behavior.
2. **Parameterized Pro Terraform module** — New client = new tfvars + run apply.
3. **Reusable Pro deploy workflow** — Input `client_id`, deploy to correct account. Manual-only; never on push. Deploy: `admin_pro + backend_pro + borrower_pro/client-x` → Client X's AWS account.
4. **Client config as code** — e.g. `config/clients/client-a.yaml` with branding, modules, domains, secrets. Deployments controlled via config files / flags.
5. **Service extraction before package extraction** — Stabilize boundaries inside `apps/backend` before creating many new workspace packages.
6. **Build pipeline updates alongside architecture** — Parameterize Dockerfiles and GitHub Actions for per-client frontend builds.
7. **Client account registry from day 1** — Track account IDs, role ARNs, domains, module flags, and release state per client.
8. **packages/borrower-ui** — Shared components for borrower_pro. Per-client apps import from this package; no duplication.
9. **Version matrix** — Track which client is on which release for support and staged rollouts.
10. **SaaS deploy unchanged during transition** — Keep push-to-main → SaaS deploy. Pro deploy never auto-triggers. CI must pass before merge.