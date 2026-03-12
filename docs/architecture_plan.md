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

# 6. Monorepo Strategy

## Recommendation
Use a **single monorepo**.

This monorepo should contain:
- backend
- admin frontend
- borrower web frontends
- mobile apps
- shared packages
- infra code
- CI/CD workflows

## Why
This is recommended because:
- logic is mostly shared
- APIs are shared
- easier upgrades
- easier to maintain consistent contracts
- avoids code duplication across clients
- easier for shared testing/build tooling

---

# 7. Recommended Monorepo Shape

## Current vs target

**Current**: `apps/admin`, `apps/backend`, `packages/shared` (types, enums), `terraform/`, `.github/workflows/`

**Target**: Add borrower apps, mobile apps, and domain/integration packages as below.

## Suggested target structure

```txt
/apps
  /admin                     # current admin frontend
  /backend                   # current main backend API
  /worker                    # optional later for async jobs, queues, scheduled jobs

  /borrower-web-base         # shared borrower web base app
  /web-client-a              # thin client-specific wrapper
  /web-client-b              # thin client-specific wrapper

  /mobile-base               # shared mobile borrower app base
  /mobile-client-a           # thin client-specific wrapper
  /mobile-client-b           # thin client-specific wrapper

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
  /api-sdk                   # frontend/mobile SDK for backend APIs
  /ui-core                   # shared UI components/design system
  /theme-engine              # branding/theme system
  /form-schemas              # shared validation schemas/forms

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

But move internal business logic into reusable packages under `/packages`.

## Best near-term model
Use:

- **one backend deployable app**
- **many internal modules/packages**

That means the backend remains one deployable service initially, but internally becomes modular.

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
Keep borrower websites in the same monorepo.

## Best implementation pattern
Create:
- one shared borrower web base app
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
Keep mobile apps in the same monorepo too.

## Best implementation pattern
Create:
- one shared mobile app base
- thin client-specific app shells/wrappers

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

---

# 14. AWS Account Model

## Recommended AWS model

### Shared/build/platform account
Can contain:
- build resources
- shared CI/CD resources
- ECR repositories
- central/shared platform services if appropriate

### SaaS account
Contains:
- pooled TrueKredit SaaS deployment
- shared SaaS DB
- shared admin app/backend

### One Pro client account per client
Contains:
- Pro backend services
- borrower frontend hosting
- DB
- secrets
- storage
- monitoring/logs
- client-specific infra

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
- builds backend image (and optionally admin, borrower-web, mobile)
- pushes to ECR
- outputs image URI/tag

### SaaS deploy workflow (`deploy-saas.yml`)
Deploys only to SaaS environment/account. Current `deploy.yml` is SaaS-only; can be renamed or kept.

### Pro deploy workflow (`deploy-pro.yml`)
Deploys to selected Pro client account(s). Takes `client_id` (and optionally `version`) as workflow input. Manually triggered or release-triggered. Uses AWS OIDC to assume role in client's account.

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
| **4. Add deploy-pro** | Create `deploy-pro.yml` with `workflow_dispatch` only. No `on: push`. | None |
| **5. Pro staging (optional)** | One Pro staging deployment for testing before production clients. Deploy via manual trigger. | None |

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
- introduce `/packages` (start with `domain-core` extraction)
- move business/domain logic out of app layer into packages
- establish config/module boundaries

## Phase 2: Add Pro modules
- borrower origination
- borrower repayment APIs
- attestation
- digital signing adapter (`packages/integrations-signing`)
- borrower-facing capabilities
- document flow support

## Phase 3: Add borrower web foundation
- build shared borrower web base app (`apps/borrower-web-base`)
- create client wrapper approach
- integrate with backend APIs

## Phase 4: Add mobile foundation
- build shared mobile base app (`apps/mobile-base`)
- create client wrapper approach
- connect to same backend contracts

## Phase 5: Pro deployment templating
- define per-client AWS account deployment template (`infra/modules/pro-client`)
- infra-as-code for Pro client stacks
- DB/secrets/logging conventions
- `deploy-pro.yml` workflow with `client_id` input
- release pipeline for selective client deployment

## Phase 6: Operational hardening
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
5. **Thin client-specific frontend/mobile shells**
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
- use **one monorepo**
- keep backend, admin, borrower web, and mobile app code in the same monorepo
- use **shared packages** for business logic
- use **thin client-specific shells** for custom borrower websites and apps
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
| `modules/loans/*`, `modules/schedules/*` | `packages/domain-core` | Loans, schedules, repayments |
| `modules/billing/*` | Keep in backend or `packages/domain-billing` | SaaS-only; Pro may not need |
| `modules/compliance/*` | `packages/domain-compliance` | Audit, digital-license rules |
| `lib/math.ts` | `packages/shared` or `packages/shared-math` | Already in shared |
| `modules/borrowers/*` | `packages/domain-core` | Core domain |
| New: origination flows | `packages/domain-origination` | Borrower application flows |
| New: attestation | `packages/domain-attestation` | Attestation logic |
| New: documents | `packages/domain-documents` | Agreements, templates |
| New: signing | `packages/integrations-signing` | CA/on-prem adapter |

Backend remains one deployable app; it imports packages and wires routes based on `productMode` and `enabledModules`.

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
  build-images.yml    # Reusable: build backend, admin, borrower-web, mobile
```

**Pro deployment flow**: Build images from monorepo → deploy to client AWS account via OIDC → run migrations for that client's DB → update ECS services. Use image tags like `sha-abc123` or `v2.1.0-pro`. Maintain a version matrix (which client is on which version).

**Transition**: See Section 15 "Transition strategy" for how to implement Pro without disrupting SaaS users — SaaS deploy stays on push-to-main; Pro deploy is manual-only.

## Thin client shell pattern (web)

```
apps/borrower-web-base/     # Shared Next.js app
  app/, components/, lib/
  theme/                    # CSS variables, default theme

apps/web-client-a/          # Thin shell
  app/layout.tsx            # Imports base layout, applies theme
  theme/variables.css       # Client A colors/fonts
```

## Thin client shell pattern (mobile)

```
apps/mobile-base/
  src/, app.json            # Base config

apps/mobile-client-a/
  app.json                  # Override: name, bundleId, icon, splash
  theme.ts                  # Client A theme
  index.js                  # Entry that loads base + theme
```

Use `packages/theme-engine` for shared theming consumed by both web and mobile shells.

## Migration path (minimal disruption)

| Phase | Focus | Impact |
|-------|-------|--------|
| 1 | Add `productMode`, `enabledModules` to config | Low |
| 2 | Extract `domain-core` into package | Medium |
| 3 | Add Pro deployment Terraform module + `deploy-pro` workflow | Medium |
| 4 | Add borrower origination + repayment APIs (Pro-only routes) | Medium |
| 5 | Add `borrower-web-base` + first client shell | Medium |
| 6 | Add attestation, documents, signing adapter | Medium |
| 7 | Add mobile base + first client shell | Medium |

SaaS behavior stays unchanged when `productMode=saas`.

---

# 25. Planning Questions — Answered

1. **Modularize backend**: Extract domain logic into `packages/domain-*`; keep routes in `apps/backend` calling package services.

2. **Domain boundaries**: Loans, schedules, repayments, borrowers, products, compliance, billing — use these as package boundaries.

3. **Migration path**: Introduce packages incrementally; keep existing modules working while extracting.

4. **Config for SaaS vs Pro**: `productMode`, `clientId`, `enabledModules`; gate routes/features by these.

5. **Borrower auth**: Extend Better Auth or add borrower-specific path; use `Borrower` (or `BorrowerUser`) as identity for Pro.

6. **Borrower flows as packages**: Origination, repayments, attestation, documents as `packages/domain-*`.

7. **Web client wrappers**: Shared Next.js base app; per-client apps override layout/theme/config only.

8. **Mobile**: Shared Expo/React Native base; per-client `app.json` + theme overrides.

9. **Infra for Pro**: Terraform module `pro-client` parameterized by `client_id`, domain, modules.

10. **CI/CD**: Separate workflows for SaaS vs Pro; Pro workflow takes `client_id` input.

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
5. **Shared packages** — One implementation for loans, schedules, repayments; no duplication.
6. **Version matrix** — Track which client is on which release for support and staged rollouts.
7. **SaaS deploy unchanged during transition** — Keep push-to-main → SaaS deploy. Pro deploy never auto-triggers. CI must pass before merge.