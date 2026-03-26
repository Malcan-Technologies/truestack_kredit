# TrueKredit Architecture Plan

## Status

This document is the approved reference architecture for `truestack_kredit`.

It defines the long-term structure for:

- the existing TrueKredit SaaS platform
- the new TrueKredit Pro product line
- per-client deployment from a single monorepo
- release control, infrastructure ownership, and CI/CD behavior

This document supersedes any earlier draft or alternative architecture note.

---

## 1. Executive Summary

TrueKredit will use one monorepo with two product lanes:

1. **SaaS lane**
   - `apps/admin`
   - `apps/backend`
   - shared multi-tenant runtime
   - existing deployment in the Truestack AWS account

2. **Pro lane**
   - `apps/admin_pro`
   - `apps/backend_pro`
   - `apps/borrower_pro/<client>`
   - shared Pro platform code with per-client runtime isolation

Core principle:

**Share code, not production runtime.**

That means:

- SaaS remains one pooled deployment
- Pro uses one shared platform codebase
- each Pro client gets an isolated deployment, database, secrets, and AWS boundary
- borrower frontends are per-client apps, but shared borrower flows and components are reused from common packages

The `Demo_Client` borrower app is treated as a real Pro client named `demo-client`, except it is hosted in a Truestack-controlled AWS account instead of an external customer account.

---

## 2. Product Lines

### 2.1 TrueKredit SaaS

TrueKredit SaaS is the existing pooled platform.

Characteristics:

- multi-tenant runtime
- shared backend and admin deployment
- shared database
- deployed in the Truestack AWS account
- automatically deployed from `main`

Primary apps:

- `apps/admin`
- `apps/backend`

### 2.2 TrueKredit Pro

TrueKredit Pro is the dedicated-deployment product for digital license clients.

Characteristics:

- one deployment per client
- isolated AWS account for each external client
- isolated database and runtime per client
- shared Pro admin and backend codebase
- client-specific borrower frontend app
- selective release promotion per client

Primary apps:

- `apps/admin_pro`
- `apps/backend_pro`
- `apps/borrower_pro/<client>`

---

## 3. Final Architecture Decisions

The following decisions are final unless explicitly replaced by a newer approved document.

### 3.1 Single Monorepo

All SaaS and Pro applications remain in `truestack_kredit`.

We will not create:

- a separate Pro repo
- a separate borrower repo
- a separate repo per client

### 3.2 Shared Pro Platform, Client-Specific Borrower App

For Pro:

- `admin_pro` is shared across all Pro clients
- `backend_pro` is shared across all Pro clients
- `borrower_pro/<client>` is per client

This means each client receives the same Pro platform behavior, while the borrower-facing app can vary in presentation and branding.

### 3.3 Per-Client Runtime Isolation

Every external Pro client gets:

- its own AWS account
- its own ECS services
- its own database
- its own secrets
- its own S3 buckets
- its own logs and monitoring
- its own domains and certificates

There is no shared production runtime between Pro clients.

### 3.4 Demo Client Is a First-Class Pro Client

`apps/borrower_pro/Demo_Client` is not a throwaway sample. It is the first operational Pro tenant and should be treated as:

- client id: `demo-client`
- a separate Pro stack
- isolated from SaaS
- deployed automatically when Pro shared code changes

Its difference from other Pro clients is only account ownership:

- external clients use their own AWS account
- `demo-client` uses a Truestack-controlled AWS account

### 3.5 Separate SaaS and Pro Release Lanes

SaaS and Pro must not share the same deployment automation or rollout behavior.

- SaaS deploys automatically from `main`
- Pro shared artifacts are built from `main`
- `demo-client` may auto-deploy from `main`
- external clients are promoted manually to a chosen Pro release

### 3.6 Separate SaaS and Pro Database Lanes

SaaS and Pro currently have separate backend apps and separate Prisma schemas:

- SaaS: `apps/backend/prisma`
- Pro: `apps/backend_pro/prisma`

This separation stays in place.

We will not force SaaS and Pro into one shared runtime schema at this stage.

---

## 4. Monorepo Structure

### 4.1 Approved Target Shape

```txt
/apps
  /admin
  /backend
  /admin_pro
  /backend_pro
  /borrower_pro
    /Demo_Client
    /client-a
    /client-b

/packages
  /shared
  /borrower-ui
  /form-schemas
  /api-contracts
  /domain-*
  /integrations-*

/config
  /clients
    /demo-client.yaml
    /client-a.yaml
    /client-b.yaml

/terraform
  /environments              # SaaS stack only
  /modules                   # SaaS stack modules
  /pro
    /modules
      /client-stack
    /clients
      /demo-client
      /client-a
      /client-b

/.github/workflows
  deploy.yml
  ci.yml
  build-pro.yml
  deploy-demo-client.yml
  deploy-pro.yml
  terraform.yml
  terraform-pro.yml
```

### 4.2 Notes on Current State

The repo already contains:

- `apps/admin`
- `apps/backend`
- `apps/admin_pro`
- `apps/backend_pro`
- `apps/borrower_pro/Demo_Client`
- shared borrower components under `apps/borrower_pro/components`

Immediate direction:

- keep using existing Pro app folders
- treat `Demo_Client` as the first real client lane
- extract shared borrower UI into `packages/borrower-ui` over time

---

## 5. Shared Code vs Client-Specific Code

### 5.1 Shared Across All Pro Clients

Shared Pro code must live in common app or package locations:

- `apps/admin_pro`
- `apps/backend_pro`
- `packages/shared`
- `packages/borrower-ui`
- `packages/form-schemas`
- shared domain packages extracted from `backend_pro` when stable
- integration packages such as signing, payments, and eKYC adapters

### 5.2 Client-Specific

Client-specific code should be limited to:

- `apps/borrower_pro/<client>`
- client branding
- client copy and content
- client page composition where needed
- client domain configuration
- client deployment metadata in `config/clients/<client>.yaml`
- client Terraform instantiation in `terraform/pro/clients/<client>`

### 5.3 What Must Not Be Forked Per Client

Do not create per-client copies of:

- `admin_pro`
- `backend_pro`
- shared borrower flow logic
- shared validation rules
- shared API hooks

If a borrower flow becomes client-specific in behavior, solve that with feature flags, configuration, or composition before considering a fork.

---

## 6. Borrower Frontend Model

### 6.1 Final Pattern

Each client has its own borrower app folder:

```txt
apps/borrower_pro/
  Demo_Client/
  client-a/
  client-b/
```

Each borrower app can differ in:

- branding
- layout
- content
- visual identity
- optional page composition

The borrower apps should share:

- authentication flow
- registration flow
- profile flow
- loan application flow
- repayment flow
- document upload flow
- API integration patterns
- validation schemas

### 6.2 Shared Borrower Package

The long-term shared borrower layer should live in:

```txt
packages/borrower-ui
```

This package should become the home for:

- shared form components
- shared flow containers
- API hooks
- borrower auth helpers
- reusable feature UI
- shared theme contracts

Short-term transition:

- current shared code under `apps/borrower_pro/components` and shared borrower `lib` files can continue to exist
- move stable pieces into `packages/borrower-ui` incrementally

### 6.3 Demo Client as the Template

`apps/borrower_pro/Demo_Client` is the reference implementation for:

- new client onboarding
- shared borrower package extraction
- CI/CD proofing
- demo and QA

New clients should start by cloning the structural pattern of `Demo_Client`, then replacing only the client shell concerns, not the shared flows.

---

## 7. Pro Deployment Unit

### 7.1 What Gets Deployed for One Client

One Pro client deployment consists of:

- one `admin_pro` instance
- one `backend_pro` instance
- one borrower frontend instance for `apps/borrower_pro/<client>`
- one Pro database
- one client-specific secrets set
- one client-specific infra stack

### 7.2 Deployment Composition

Conceptually:

```txt
admin_pro + backend_pro + borrower_pro/<client> -> client AWS account
```

### 7.3 Runtime Isolation Rules

Every Pro client must have:

- isolated ECS services
- isolated RDS instance or cluster
- isolated Secrets Manager secret set
- isolated uploads bucket
- isolated certificates and DNS records
- isolated log groups and alarms

No client should rely on:

- the SaaS VPC
- the SaaS ALB
- the SaaS database
- shared Pro runtime services in another client account

---

## 8. Client Registry and Configuration as Code

### 8.1 Purpose

The repo needs a checked-in client registry so CI/CD and Terraform can understand:

- which clients exist
- which borrower app folder maps to which client
- which AWS account and GitHub environment to use
- which release each client is currently pinned to

### 8.2 Approved Location

```txt
config/clients/<client-id>.yaml
```

### 8.3 Example Shape

```yaml
client_id: demo-client
client_type: demo
borrower_app: Demo_Client
aws_account_id: "491694399426"
aws_region: ap-southeast-5
github_environment: pro-demo-client
terraform_var_file: terraform/pro/clients/demo-client/prod.tfvars
platform_release: sha-abcdef123456
borrower_release: sha-abcdef123456
auto_deploy: true
domains:
  admin: demo-admin.example.com
  api: demo-api.example.com
  borrower: demo.example.com
enabled_modules:
  - origination
  - repayments
  - attestation
  - signing
```

### 8.4 Rules for the Client Registry

- keep only non-secret metadata in the repo
- store credentials in GitHub environments and AWS Secrets Manager
- use this registry as the source of truth for deployment targeting
- track release pins per client here or in an adjacent deployment inventory file

---

## 9. Versioning and Release Management

### 9.1 Platform Release Model

The Pro platform should use immutable release identifiers.

Recommended default:

- image tag: Git commit SHA
- optional human label: `pro-YYYY.MM.DD.N`

### 9.2 Separate Release Pins

Each client should be able to pin:

- `platform_release`
- `borrower_release`

This allows:

- shared `admin_pro` and `backend_pro` promotion across many clients
- borrower frontend changes to be promoted independently when needed
- clear rollback targets

### 9.3 Release Policy

- `demo-client` tracks the newest Pro release automatically
- external clients do not auto-upgrade
- external clients are promoted manually to a chosen release
- rollback means redeploying a previous pinned release

### 9.4 Why This Model Is Required

This is how we maintain version control of shared Pro code without duplicating code per client.

Shared code changes are built once.
Deployment remains selective.

---

## 10. CI/CD Model

### 10.1 SaaS and Pro Must Be Split

The existing `deploy.yml` is the SaaS deploy lane and should remain SaaS-focused.

We should not overload one workflow with all rollout policies.

### 10.2 Approved Workflow Roles

#### `deploy.yml`

Purpose:

- SaaS deploy only
- continues to deploy from `main`
- continues to target:
  - `apps/backend`
  - `apps/admin`

#### `ci.yml`

Purpose:

- lint
- typecheck
- tests
- impacted builds across SaaS and Pro

This remains a recommended follow-up workflow if broader PR validation becomes necessary.

#### `build-pro.yml`

Purpose:

- build Pro artifacts
- validate:
  - `admin_pro`
  - `backend_pro`
  - targeted borrower app builds
- publish immutable images or build outputs
- do not deploy external clients directly

This remains optional while `deploy-demo-client.yml` directly handles the first Pro deployment target.

#### `deploy-demo-client.yml`

Purpose:

- auto-deploy `demo-client`
- trigger from `main` when Pro shared code or `Demo_Client` changes
- read target names, URLs, secret ARN, tenant slug, and bucket name from `config/clients/demo-client.yaml`
- use its own GitHub environment and AWS deployment role

#### `deploy-pro.yml`

Purpose:

- manual deployment of an external Pro client
- uses `workflow_dispatch`
- required inputs:
  - `client_id`
  - `platform_release`
  - optional `borrower_release`
  - `run_migrations`
  - `apply_terraform`

This remains the next workflow to add after `demo-client` is proven.

#### `terraform.yml`

Purpose:

- SaaS Terraform only
- should only react to SaaS Terraform paths

#### `terraform-pro.yml`

Purpose:

- Pro Terraform plan/apply for one selected client stack
- currently used for `terraform/pro/**` changes and manual client-specific runs

### 10.3 Change Detection Rules

The pipeline must distinguish between these categories.

#### SaaS changes

Examples:

- `apps/admin/**`
- `apps/backend/**`
- SaaS-only shared packages
- existing SaaS Terraform

Effect:

- run SaaS CI
- deploy SaaS automatically on `main`

#### Pro shared platform changes

Examples:

- `apps/admin_pro/**`
- `apps/backend_pro/**`
- `packages/borrower-ui/**`
- shared packages consumed by Pro

Effect:

- run Pro CI and build
- auto-deploy `demo-client`
- do not auto-deploy external clients

#### Client-specific borrower changes

Examples:

- `apps/borrower_pro/Demo_Client/**`
- `apps/borrower_pro/client-a/**`

Effect:

- build only the impacted borrower app where possible
- auto-deploy `demo-client` when `Demo_Client` changes
- require manual deployment for external clients

### 10.4 Deployment Policy

Final deployment policy:

- SaaS: automatic from `main`
- `demo-client`: automatic from `main` for Pro-relevant changes
- external Pro clients: manual promotion only

### 10.5 GitHub Environments

Each deployment target should map to its own GitHub environment.

Examples:

- `saas-production`
- `pro-demo-client`
- `pro-client-a`
- `pro-client-b`

These environments should hold:

- `AWS_ROLE_ARN`
- approval rules
- optional environment-specific secrets

---

## 11. Infrastructure and AWS Account Model

### 11.1 SaaS Infrastructure

The current Terraform root remains the SaaS infrastructure lane.

Its current design is suitable for the existing SaaS deployment but should not be reused directly for Pro client stacks because it relies on:

- shared VPC lookup
- shared ALB lookup
- shared remote state usage
- hardcoded SaaS-oriented account assumptions

### 11.2 Pro Infrastructure Must Be Self-Contained

Each Pro client stack must be self-contained.

Approved target location:

```txt
terraform/pro/
  modules/client-stack/
  clients/<client-id>/
```

### 11.3 Each Pro Client Stack Must Manage or Receive

- VPC and subnets
- ALB
- ECS cluster and services
- Pro migrations task
- RDS
- S3 bucket
- Secrets Manager secret set
- Route53 records
- ACM certificates
- minimal ECS log groups required for runtime debugging

CloudWatch alarms, dashboards, custom metrics, and similar observability add-ons are **not** enabled by default for Pro client stacks. Add them only when there is a clear operational need.

### 11.4 What Pro Must Not Depend On

Pro client stacks must not depend on:

- SaaS Terraform remote state
- SaaS VPC
- SaaS ALB
- fixed shared ALB listener priorities
- hardcoded local AWS profiles such as `truestack`

### 11.5 AWS Account Ownership

#### SaaS

- hosted in the Truestack AWS account

#### Demo client

- hosted in a Truestack-controlled AWS account
- separate stack and runtime from SaaS

#### External Pro clients

- hosted in each client's own AWS account

### 11.6 Terraform State Strategy

Preferred model:

- each Pro client account owns its own Terraform state bucket and lock table after bootstrap
- GitHub Actions assumes the deploy role in that client account through OIDC

This preserves the cleanest boundary for client-owned environments.

### 11.7 Cost-Optimized Default for Pro

Pro infrastructure should follow the current SaaS platform's proven low-cost baseline unless a specific client requirement overrides it.

Approved default posture:

- single-AZ only
- one backend task and one frontend task by default
- small Fargate task sizes by default
- no autoscaling by default
- no RDS Multi-AZ
- no RDS Performance Insights
- no read replicas
- no Container Insights
- no CloudWatch dashboards or alarms by default
- only minimal ECS log groups with short retention

Current SaaS baseline to mirror where practical:

- ECS cluster with `containerInsights = disabled`
- backend task: `cpu = 256`, `memory = 512`
- frontend task: `cpu = 256`, `memory = 512`
- backend desired count: `1`
- frontend desired count: `1`
- RDS instance class: `db.t4g.micro`
- RDS storage: `gp3`, `20 GB`, `max_allocated_storage = 100`
- RDS `multi_az = false`
- RDS `performance_insights_enabled = false`
- CloudWatch log groups with `retention_in_days = 14`

This means Pro client stacks are intentionally **not** provisioned as high-availability or enterprise-observability stacks by default.

If a client later requires stronger resilience or monitoring, those should be opt-in upgrades, not part of the default template.

### 11.8 Networking Cost Guardrail

Per-client accounts must avoid hidden fixed-cost networking where possible.

In particular:

- do not introduce Multi-AZ networking patterns by default
- do not introduce extra always-on AWS services unless they are required
- do not introduce NAT gateways, VPC endpoints, or other fixed-cost networking components without explicitly justifying the cost impact

The goal is to stay close to the current SaaS operating cost profile while still preserving per-client isolation.

---

## 12. Database and Migration Strategy

### 12.1 SaaS and Pro Remain Separate

Current separation stays in place:

- SaaS backend uses `apps/backend/prisma`
- Pro backend uses `apps/backend_pro/prisma`

### 12.2 Pro Schema Consistency

All Pro clients use the same `backend_pro` schema and migration history.

That means:

- one Pro codebase
- one Pro migration chain
- one Pro database per client

### 12.3 Migration Execution Rules

- SaaS migrations are run only against the SaaS database
- Pro migrations are run only against the selected client database
- external client migrations happen only during an approved deployment to that client
- `demo-client` migrations can run automatically with the demo deployment

### 12.4 Migration Safety

Prefer:

- additive schema changes
- forward-compatible releases
- explicit rollback notes for high-risk changes

---

## 13. Pro Platform Build Requirements

### 13.1 `backend_pro`

`backend_pro` must produce its own correct production artifact.

The production build path must use:

- `apps/backend_pro/package.json`
- `apps/backend_pro/prisma/schema.prisma`
- `npm run build -w apps/backend_pro`

It must not build the SaaS backend by mistake.

### 13.2 `admin_pro`

`admin_pro` is already aligned with the intended Pro deployable model:

- standalone Next.js output
- separate build args for Pro URLs
- its own runtime port and environment

### 13.3 `borrower_pro/<client>`

Each borrower app must have a production build path.

Recommended direction:

- standardize on standalone Next.js output for borrower apps
- provide a reusable Dockerfile or build template that accepts the borrower app folder as input

This lets one workflow build:

- `Demo_Client` now
- future `client-a`, `client-b`, and others later

---

## 14. Demo Client Operating Model

`demo-client` has three roles:

1. **Live demo environment**
2. **Reference Pro client implementation**
3. **Automatic canary for shared Pro releases**

Rules:

- deploy it separately from SaaS
- keep it on the latest shared Pro release
- use it to validate migration, infrastructure, and rollout behavior before external promotion

`demo-client` should mirror real Pro deployment behavior as closely as possible, except for account ownership.

---

## 15. Security and Secret Management

### 15.1 Do Not Store Secrets in Git

Never commit:

- client AWS credentials
- database credentials
- API keys
- signing credentials
- eKYC credentials

### 15.2 Secret Location

Use:

- GitHub environments for workflow-level secret wiring
- AWS Secrets Manager in the target account for runtime secrets

### 15.3 Deployment Authentication

Use GitHub Actions OIDC role assumption for:

- SaaS deployment
- `demo-client` deployment
- external client deployment

Avoid long-lived shared AWS keys.

---

## 16. Implementation Roadmap

### Phase 1: Documentation and Registry

- finalize this architecture document
- add `config/clients/`
- define `demo-client` metadata
- define GitHub environments

### Phase 2: Build Readiness

- fix `backend_pro` production Docker/build path
- add production build support for borrower apps
- standardize borrower app runtime packaging

### Phase 3: Shared Borrower Layer

- extract stable shared borrower code into `packages/borrower-ui`
- keep client folders thin
- avoid duplicate flow logic

### Phase 4: Pro CI/CD

- keep `deploy.yml` for SaaS
- add `ci.yml`
- add `build-pro.yml`
- add `deploy-demo-client.yml`
- add `deploy-pro.yml`

### Phase 5: Pro Terraform

- leave current Terraform root as SaaS
- add `terraform/pro`
- bootstrap `demo-client`
- validate isolated Pro deployment in a Truestack-controlled account

### Phase 6: External Client Onboarding

- add one client registry file
- add one Terraform client instantiation
- add one borrower app folder or client shell
- manually promote a chosen Pro release

---

## 17. Anti-Patterns to Avoid

Do not do the following:

1. fork `admin_pro` per client
2. fork `backend_pro` per client
3. create one repo per client by default
4. auto-deploy all external clients on every merge
5. reuse the SaaS shared network stack for Pro client accounts
6. keep borrower apps as copy-paste duplicates without extracting shared flow logic
7. store secrets in the client registry
8. tie external client production rollout directly to `main`

---

## 18. Final Reference Summary

The final approved method is:

- keep SaaS and Pro in one monorepo
- keep SaaS on `apps/admin` and `apps/backend`
- keep Pro shared platform code on `apps/admin_pro` and `apps/backend_pro`
- keep borrower frontend code per client under `apps/borrower_pro/<client>`
- treat `Demo_Client` as the operational `demo-client`
- extract shared borrower flows into `packages/borrower-ui`
- use a checked-in client registry in `config/clients/`
- keep SaaS auto-deploy on `main`
- auto-deploy only `demo-client` for Pro shared changes
- manually promote external clients to approved Pro releases
- build Pro infrastructure as self-contained per-client stacks under `terraform/pro`
- keep one shared Pro codebase and many isolated Pro runtimes

This is the architecture to follow for all future Pro implementation and deployment work in this repository.
