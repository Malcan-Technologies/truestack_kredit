# TrueKredit Architecture Planning Summary

## Purpose

This document summarizes the intended architecture direction for extending the existing **TrueKredit** system into a broader platform that supports:

1. **Current SaaS TrueKredit**
   - pooled multi-tenant deployment
   - co-mingled tenant data
   - admin-facing loan management system
   - existing backend + database + admin access

2. **TrueKredit Pro for digital license clients**
   - dedicated deployment per client
   - one deployment per AWS account
   - isolated client data
   - borrower-facing origination, repayment, attestation, and signing modules
   - custom borrower website and mobile app per client
   - shared backend logic across clients
   - mostly deployed on AWS

This summary is meant for another AI to review together with the existing codebase and propose a detailed implementation plan.

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
- **Immediate client wrapper apps**: current frontend/deploy setup only knows about one admin app and one backend image. Creating `web-client-a`, `web-client-b`, etc. immediately is possible, but not the fastest path. A single shared borrower web app with runtime theming/config is more feasible first; thin wrapper apps can come later if client divergence becomes real.
- **Current Terraform is not yet account-per-client ready**: the existing `terraform/` reuses shared infra state (`terraform_remote_state` from `admin-truestack`) and a shared VPC/ALB model. That is suitable for today's SaaS deployment, but Pro client accounts will need a more self-contained stack instead of depending on shared network state.
- **Current workflow and Dockerfiles are app-specific**: the GitHub Actions workflow and Dockerfiles are currently hardcoded around `apps/backend`, `apps/admin`, and `packages/shared`. Adding new packages/apps is feasible, but requires explicit CI/CD and Docker changes.

### Practical conclusion
The plan should optimize for **minimal architectural change before the first Pro client**:

1. Add product-mode/config boundaries first.
2. Extract backend services inside `apps/backend` before extracting many new workspace packages.
3. Build one shared borrower web app first.
4. Add per-client deployment templates and manual Pro deployment workflows.
5. Introduce wrapper apps or additional deployables only after real reuse/divergence is proven.

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
- client-specific branded borrower frontend and mobile app
- shared backend logic/codebase where possible

---

# 3. High-Level Architecture Decision

## Core direction
The best approach is:

**one shared codebase / monorepo, with shared core logic, and separate deployment models for SaaS vs Pro**

This means:

- do **not** build a completely separate product for Pro
- do **not** fork code per client
- do **not** create totally separate repos per client by default

Instead:

- keep one shared backend codebase
- keep shared business/domain logic in reusable packages
- use deployment config, module flags, and environment-specific runtime settings
- deploy SaaS and Pro separately

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

**TrueKredit Core + Pro modules + dedicated deployment + client-specific frontend shells**

Not:
- a totally separate product
- a code fork
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
- frontend branding
- mobile app identity
- client-specific config
- infra/account boundaries

---

# 6. Repository Strategy

## Recommendation
Use **two repositories**:

1. **Platform repo (`truestack_kredit`)**
   - backend API
   - admin app
   - Terraform / infra
   - platform/shared backend packages
   - GitHub Actions for SaaS + Pro backend deployments

2. **Borrower frontend repo** (`truekredit-borrower` or similar)
   - borrower web app
   - borrower mobile app
   - per-client branding / app identities / frontend config
   - frontend CI/CD and store release workflows

## Why this separation makes sense

This split matches the actual product boundaries better:
- **platform** concerns live together: auth, tenanting, billing, admin operations, infra
- **borrower experience** concerns live together: borrower web, mobile, branding, feature presentation
- borrower web and mobile share flows, copy, theming, app identity, and client branding more closely with each other than with the admin app
- admin remains tightly coupled to backend behavior and tenant/billing logic, so it belongs in the platform repo
- mobile no longer has to be the only thing separated; instead the entire borrower-facing surface gets a coherent delivery boundary

## Trade-off

This is slightly more operationally complex than a single monorepo, because backend/admin and borrower-facing apps now change across repo boundaries.

However, for your clarified requirements, it is a better fit because:
- every Pro client needs borrower web and mobile from day 1
- both web and mobile are client-branded deliverables
- both web and mobile will likely evolve faster and more frequently than admin
- frontend/mobile release workflows are materially different from backend/admin deployment workflows

## What the borrower frontend repo must share with the platform repo

Do **not** let the borrower frontend repo become a disconnected code fork. It should consume:
- a generated API SDK or shared contract package from the platform repo
- shared Zod/TypeScript API contracts where possible
- shared client configuration model
- shared release/version compatibility rules

This keeps the platform and borrower experience aligned even though they live in separate repos.

---

# 7. Recommended Repo Shapes

## Current vs target

**Current**: `apps/admin`, `apps/backend`, `packages/shared` (types, enums), `terraform/`, `.github/workflows/`

**Target**: Keep backend/admin/infra in this repo, and move borrower-facing web + mobile into a shared borrower frontend repo.

## Platform repo target structure (`truestack_kredit`)

```txt
/apps
  /admin                     # current admin frontend
  /backend                   # current main backend API
  /worker                    # optional later for async jobs, queues, scheduled jobs

/packages
  /shared                    # existing: types, enums, constants
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
  /api-sdk                   # generated/published SDK for borrower frontend repo
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

## Borrower frontend repo target structure (`truekredit-borrower`)

```txt
/apps
  /borrower-web              # shared borrower web app
  /mobile-app                # shared borrower mobile app

/packages
  /ui-core                   # borrower-facing UI components
  /theme-engine              # borrower branding and design tokens
  /client-config             # client metadata, domains, app ids, feature flags
  /api-sdk                   # consumed/generated from platform repo
  /form-schemas              # shared borrower form schemas if published cleanly

/.github/workflows
  ci.yml
  deploy-web.yml
  build-mobile.yml
  release-mobile.yml
```

## Feasible interpretation of the target structure

The structure above is the long-term target, not the required day-one shape.

Most feasible rollout order:
- start with one borrower web app and one mobile app in the borrower frontend repo
- use shared per-client config in that repo for branding, domains, bundle IDs, and feature flags
- introduce thinner per-client wrappers only when multiple clients truly need different shells or build identities

---

# 8. Backend Strategy

## Keep backend in monorepo
The backend should remain in the same monorepo.

## Recommended immediate approach
Do **not** split the backend into many microservices yet.

Keep:

```txt
/apps
  /backend
```

But first move internal business logic into **services inside `apps/backend`**, then move stable abstractions into reusable packages under `/packages`.

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

## Client borrower websites
Each Pro client will have their own custom borrower website.

However:
- logic remains the same
- backend APIs remain shared in terms of code/contract
- only UI/branding/composition should vary where possible

## Recommendation
Keep borrower websites in the **shared borrower frontend repo**, together with the mobile app.

## Most feasible first implementation
Create:
- one shared borrower web app in the borrower frontend repo
- runtime client config for branding, wording, enabled flows, and domain
- optional wrapper apps later only if clients diverge materially

This separation makes sense because borrower web and mobile share more with each other than with the admin app:
- client branding
- borrower journeys
- public-facing copy and content
- feature presentation
- per-client frontend release cadence

## When to add wrapper apps

Add thin client-specific wrapper apps only when at least one of these becomes true:
- a client needs substantially different page composition or routing
- legal/commercial requirements force separate app code identity
- build-time branding/assets become too awkward to manage via runtime config
- deployment identity must be separated from the shared base in a way runtime config cannot handle

## Long-term implementation pattern
Later, if needed, evolve to:
- one shared borrower web base app inside the borrower frontend repo
- thin client-specific wrapper apps on top

The shared layer should contain:
- borrower flows
- auth/session handling
- API SDK
- shared forms and validation
- document upload patterns
- repayment flow components
- eKYC flow integration
- common screen logic

The client-specific wrapper should contain:
- branding
- logo/colors/fonts
- client-specific wording/content
- custom page composition
- route variations where required
- feature toggles

## Avoid
Avoid creating fully duplicated client frontend apps with copy-paste code.

---

# 11. Mobile App Strategy

## Client mobile apps
Each client may also have their own borrower mobile app.

## Recommendation
Given your clarified requirements, **keep mobile in the shared borrower frontend repo**, together with borrower web, rather than in this platform repo.

Recommended model:
- one borrower frontend repo
- one shared mobile codebase
- per-client app identities via build profiles / config
- no per-client mobile forks

## Why the combined borrower frontend repo makes sense here

- every Pro client needs mobile from day 1
- each client will likely need its own bundle ID / package name, app-store listing, icons, splash, and release pipeline
- mobile has a distinct toolchain (Expo/React Native, native modules, EAS/Fastlane, app-store credentials)
- borrower web and mobile share branding, customer-facing flows, and release planning
- separating both from the current backend/admin repo keeps the platform repo much cleaner operationally

## Most feasible implementation
Create:
- one shared mobile app / Expo app in the borrower frontend repo
- use build profiles, environment config, and theme assets per client
- support separate app identities from day 1

## Recommended borrower frontend repo pattern

```txt
truekredit-borrower/
  /apps
    /borrower-web
    /mobile-app
  /packages
    /ui-core
    /theme-engine
    /api-sdk
  /client-configs
    /client-a
    /client-b
  /.github/workflows
    deploy-web.yml
    build-mobile.yml
    release-mobile.yml
```

Each client config should define:
- app name
- bundle ID / package name
- icons / splash assets
- theme
- API base URL
- enabled modules
- app-store metadata

## Core requirement if the borrower frontend repo is separate

The borrower frontend repo must not hand-code API contracts independently. It should consume one of:
- a generated API SDK published from the core repo
- a shared contracts package published to a registry
- OpenAPI-generated clients if you formalize the API that way

Without this, backend/frontend drift becomes a serious maintenance risk.

Shared layer:
- borrower business logic
- repayment flows
- auth/session handling
- API SDK
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

## Important distinction
Client apps may be separate deployable identities while still sharing the same codebase.

This means:
- separate branded apps are possible
- but code remains shared

## Avoid
Avoid separate repos per client unless:
- client becomes heavily bespoke
- separate ownership is required
- contractual handover/isolation is required
- release cadence is completely different

## What you lose by keeping borrower-facing frontends in a separate repo

Compared with putting borrower web + mobile in this monorepo, you lose:
- **atomic cross-repo changes** — backend + borrower web/mobile contract updates cannot land in one PR/commit
- **direct workspace sharing** — cannot import local packages from `packages/*` without publishing/generating them
- **simpler refactors** — renaming DTOs/contracts across backend and borrower frontends takes more coordination
- **one-place CI visibility** — CI and release history are split across repos
- **higher integration coordination overhead** — you will need versioning and compatibility rules between the platform repo and the borrower frontend repo

## What you gain by separating borrower-facing frontends

- **cleaner operational boundary** for borrower-facing tooling and releases
- **faster borrower frontend iteration** without disturbing backend/admin workflows
- **simpler app-store management** across multiple client apps
- **web + mobile branding in one place**
- **shared borrower UX ownership**
- **easier scaling** if mobile work becomes substantial or is handled by a separate team
- **less complexity in the current repo**, which is already doing backend, admin, infra, and SaaS/Pro evolution

## Recommendation summary

For your stated direction, the better fit is:
- keep backend/admin/infra in this repo
- create **one shared borrower frontend repo** for borrower web + all client mobile apps
- invest early in contract sharing between the two repos

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

### Borrower frontend repo workflows
Handled in the separate borrower frontend repo:
- `deploy-web.yml`
- `build-mobile.yml`
- `release-mobile.yml`
- optional `submit-store.yml`

These should support:
- per-client web deployment config
- per-client mobile build profiles
- per-client release channels

## Build-system implication

Current Dockerfiles and workflows are explicitly wired to:
- `apps/backend`
- `apps/admin`
- `packages/shared`

When introducing new packages such as `packages/domain-*` or `packages/integrations-*`, the build pipeline must be updated in parallel:
- workspace manifests copied into Docker build context
- change detection expanded beyond `packages/shared`
- image builds parameterized for additional apps
- CI paths and cache keys updated to reflect new workspace layout

If borrower-facing frontends are split into a separate repo, this repo's CI/CD becomes cleaner:
- current repo builds backend/admin only
- borrower frontend repo owns borrower-web and mobile CI
- contract publishing between repos becomes mandatory

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
| **6. Add borrower frontend repo CI** | Build borrower web/mobile workflows per client config in the separate borrower frontend repo. | None |
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

## Phase 3: Add borrower web foundation
- create separate shared borrower frontend repo
- build one shared borrower web app there
- use runtime client config/theming
- integrate with backend APIs via published SDK / contracts

## Phase 4: Add mobile foundation
- in the borrower frontend repo, build one shared mobile app from day 1
- use per-client build profiles / environment config / app identities
- connect to the same backend contracts via published SDK / generated client

## Phase 5: Pro deployment templating
- define self-contained per-client AWS account deployment template (`terraform/modules/pro-client`)
- infra-as-code for Pro client stacks
- DB/secrets/logging conventions
- `deploy-pro.yml` workflow with `client_id` input
- release pipeline for selective client deployment

## Phase 6: Optional wrappers / extra deployables
- introduce borrower web wrappers only if multiple clients need separate shells
- introduce extra mobile shells only if one shared borrower frontend repo/app structure becomes insufficient
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

1. **One shared codebase**
2. **No per-client code forks by default**
3. **Shared logic, separate runtime**
4. **Config-driven product differences**
5. **Use thin client-specific shells only when needed**
6. **Dedicated Pro deployment per client**
7. **SaaS and Pro release independently**
8. **Mostly AWS, but keep code portable**
9. **Modularize first, split services later only if needed**
10. **Treat core services like eKYC as shared platform services**

---

# 21. Anti-Patterns to Avoid

## Avoid these:

### 1. Separate repo per client by default
This will become difficult to maintain and upgrade.

### 2. Full code forks for Pro
This will create long-term maintenance pain.

### 3. Premature microservices
Splitting backend into too many services too early will increase ops complexity.

### 4. Copy-paste web/mobile apps
This leads to high frontend maintenance burden.

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
7. What is the best frontend architecture for web-client wrappers?
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
- use **one core platform repo** for backend/admin/infra and **one shared borrower frontend repo**
- keep backend, admin, and infra in this repo; keep borrower web and all client mobile apps in one separate shared borrower frontend repo
- extract services first, then use **shared packages** where boundaries are stable
- start with a shared borrower web app and shared mobile app in the borrower frontend repo; add **thin client-specific shells** only when needed
- keep **shared backend logic**, but deploy Pro **per client AWS account**
- use **GitHub Actions + AWS** for selective deployments
- stay **AWS-first**, while avoiding unnecessary deep lock-in in the app layer
- optimize for **maintainability, upgradeability, and isolation**

This is the preferred architecture direction unless future codebase analysis reveals a strong reason to split differently.

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

**Pro deployment flow**: Build images from monorepo → deploy to client AWS account via OIDC → run migrations for that client's DB → update ECS services. Use image tags like `sha-abc123` or `v2.1.0-pro`. Maintain a version matrix (which client is on which version).

**Transition**: See Section 15 "Transition strategy" for how to implement Pro without disrupting SaaS users — SaaS deploy stays on push-to-main; Pro deploy is manual-only.

**Borrower frontend repo flow**: Deploy borrower web per client config and build mobile app per client profile in the separate borrower frontend repo → release to hosting / internal distribution / app stores using client-specific identities → keep compatibility tied to a published SDK or contract version from the platform repo.

## Borrower web pattern (borrower frontend repo)

```
truekredit-borrower/apps/borrower-web/   # Shared Next.js borrower app
  app/, components/, lib/
  theme/
  client-config.ts          # runtime client branding / copy / feature toggles
```

## Thin client shell pattern (web, optional later)

```
truekredit-borrower/apps/borrower-web-base/  # Shared Next.js app
  app/, components/, lib/
  theme/                    # CSS variables, default theme

truekredit-borrower/apps/web-client-a/       # Thin shell
  app/layout.tsx            # Imports base layout, applies theme
  theme/variables.css       # Client A colors/fonts
```

## Mobile app pattern (borrower frontend repo)

```
truekredit-borrower/apps/mobile-app/
  src/
  app.config.ts             # build profile / env-driven client config
```

Use the borrower frontend repo's `packages/theme-engine` for shared theming consumed by both web and mobile.

## Migration path (minimal disruption)

| Phase | Focus | Impact |
|-------|-------|--------|
| 1 | Add `productMode`, `enabledModules` to config | Low |
| 2 | Extract module services inside `apps/backend` | Medium |
| 3 | Add Pro deployment Terraform module + `deploy-pro` workflow | Medium |
| 4 | Add borrower origination + repayment APIs (Pro-only routes) | Medium |
| 5 | Add borrower frontend repo with borrower web + shared contract flow | Medium |
| 6 | Add mobile app in the borrower frontend repo | Medium |
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

7. **Web client wrappers**: Start with one shared borrower web app plus runtime config; add wrapper apps only if clients diverge.

8. **Borrower frontends**: Use one separate shared borrower frontend repo with borrower web + one shared mobile app codebase and per-client build profiles / app identities.

9. **Infra for Pro**: Terraform module `pro-client` parameterized by `client_id`, domain, modules, and built as a self-contained client stack rather than depending on current shared remote state.

10. **CI/CD**: Separate workflows for SaaS vs Pro in this repo; the borrower frontend repo has its own web/mobile workflows. Pro workflow takes `client_id` input and resolves per-client account/role mapping.

11. **Backend split**: Keep one backend initially; consider `borrower-api` only if separate security boundary needed.

12. **Signing**: Adapter in `packages/integrations-signing`; backend depends on interface, not implementation.

13. **eKYC / shared services**: Consume via API clients/adapters; no direct DB coupling. TrueIdentity already follows this pattern.

14. **Minimal disruption**: Use `productMode` and feature flags; SaaS unchanged when `productMode=saas`.

---

# 26. Top Priorities for Easy Deployment & Maintenance

1. **Product-mode config first** — Single source of truth for SaaS vs Pro behavior.
2. **Parameterized Pro Terraform module** — New client = new tfvars + run apply.
3. **Reusable Pro deploy workflow** — Input `client_id`, deploy to correct account. Manual-only; never on push.
4. **Client config as code** — e.g. `config/clients/client-a.yaml` with branding, modules, domains.
5. **Service extraction before package extraction** — Stabilize boundaries inside `apps/backend` before creating many new workspace packages.
6. **Build pipeline updates alongside architecture** — Parameterize Dockerfiles and GitHub Actions whenever new packages/apps are introduced.
7. **Client account registry from day 1** — Track account IDs, role ARNs, domains, module flags, and release state per client.
8. **Borrower frontend contract sharing** — Publish/generated SDK or contracts for the separate borrower frontend repo from day 1.
9. **Version matrix** — Track which client is on which release for support and staged rollouts.
10. **SaaS deploy unchanged during transition** — Keep push-to-main → SaaS deploy. Pro deploy never auto-triggers. CI must pass before merge.