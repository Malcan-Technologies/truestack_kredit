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
  /signing-gateway        # shared on-prem Signing Gateway (one codebase, deployed per client)

/scripts
  /signing-gateway        # on-prem deploy helpers (e.g. deploy.sh)

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
  deploy-signing-gateway.yml
  terraform.yml
  terraform-pro.yml
```

### 4.2 Signing Gateway: Where the Code Lives (vs `borrower_pro`)

The on-prem Signing Gateway is **one shared application** in the monorepo, not a per-client folder tree.

| Layer | Pattern | Location |
|-------|---------|----------|
| Borrower UI | Thin folder **per client** | `apps/borrower_pro/<client>/` |
| Signing Gateway | **Single** service, many deployments | `apps/signing-gateway/` |

**Why it differs from `borrower_pro`:**

- `borrower_pro/<client>` holds branding, copy, and composition that legitimately vary by client.
- The Signing Gateway is a security and PKI appliance: same API contract, same MTSA integration, same backup logic for every client. Duplicating it under `signing-gateway/client-a` would violate the anti-pattern “fork the Signing Gateway code per client” (Section 18).

**How “per client” still works:**

- **Registry:** `config/clients/<client>.yaml` — `signing:` block (hostnames, tunnel name, `mtsa_env`, backup prefix).
- **Secrets:** GitHub Environment + on-prem `.env` per client (never in YAML).
- **Runtime:** Each client runs the **same** image (`ghcr.io/<org>/signing-gateway:<tag>`) on **their** server with **their** environment variables.
- **CI/CD:** `deploy-signing-gateway.yml` selects the client (e.g. `workflow_dispatch` input or path filter on `config/clients/<client>.yaml`), same idea as `deploy-demo-client.yml` loading one client config — not separate codebases.

**Optional layout:** If compose files and server-side-only assets grow, keep them under `apps/signing-gateway/` (e.g. `compose/`, `scripts/`) or a small `on-prem/signing-stack/` folder for templates that are copied to `/opt/signing-stack` during provisioning. The **service source code** stays in `apps/signing-gateway/`.

### 4.3 Notes on Current State

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
- `apps/signing-gateway` (on-prem Signing Gateway — one codebase, deployed per client)
- `packages/shared`
- `packages/borrower` — cross-platform borrower types, Zod schemas, and API client factories (see `docs/packages-borrower.md`)
- `packages/borrower-ui`
- `packages/form-schemas`
- shared domain packages extracted from `backend_pro` when stable
- integration packages such as signing, payments, and eKYC adapters

### 5.2 Client-Specific

Client-specific code should be limited to:

- `apps/borrower_pro/<client>`
- signing stack **configuration and secrets** per client (`config/clients/<client>.yaml` signing block, on-prem `.env`, GitHub Environment) — not duplicate Signing Gateway source
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
- `signing-gateway` (no `apps/signing-gateway/<client>` folders)
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
- one on-prem signing stack (if `signing` module is enabled) — see Section 12

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
platform_release: 1.2.3
borrower_release: 1.2.3
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
signing:
  gateway_hostname: demo-signing.truekredit.com
  ssh_host: ssh-signing-demo.truekredit.com
  tunnel_name: demo-onprem
  mtsa_env: pilot
  backup_bucket_prefix: demo-client
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

- semantic versioning for release pins, for example `1.2.3` or `1.2.3-rc.1`
- Git tag pattern for shared platform releases: `pro-platform-v<semver>`
- optional borrower tag pattern when the borrower app ships independently: `pro-borrower-<borrower_app>-v<semver>`

The semantic version is the deployment-facing version contract. Docker images may additionally carry short-SHA tags for traceability, but client promotion and rollback should use the semver release pin.

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

Shared code changes are versioned once.
Deployment remains selective per client account and per pinned semver release.

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
- resolves client infrastructure from `config/clients/<client-id>.yaml`
- deploys from semantic versions, not floating `latest`
- supported inputs:
  - `client_id`
  - `action`
  - optional `platform_version`
  - optional `borrower_version`
  - optional `skip_migrations`

If versions are omitted, the workflow falls back to the client registry release pins (`deploy.platform_release`, `deploy.borrower_release`). Shared platform code resolves from Git tags named `pro-platform-v<semver>`. Borrower-only releases may resolve from `pro-borrower-<borrower_app>-v<semver>` when they diverge from the platform tag.

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
- auto-deploy `demo-client` when shared borrower layers it consumes change (for example `apps/borrower_pro/components/**`, `apps/borrower_pro/lib/**`, `apps/borrower_pro/help-docs/**`, borrower Docker/build files)
- require manual deployment for external clients
- do not let a change in `apps/borrower_pro/<external-client>/**` trigger `demo-client` auto deployment

### 10.4 Deployment Policy

Final deployment policy:

- SaaS: automatic from `main`
- `demo-client`: automatic from `main` for shared Pro changes, `Demo_Client` changes, and shared borrower code it consumes
- external Pro clients: manual promotion only for backend, admin, borrower, and signing even though they share the same codebase

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

## 12. On-Prem Signing Infrastructure (Pro Only)

### 12.1 Overview

Pro clients with the `signing` module enabled require an on-prem signing component in addition to the AWS-hosted Pro stack.

This component provides:

- PKI digital signing via MTSA (Trustgate)
- certificate enrollment and management
- local artifact storage and serving
- off-site backup to S3

Detailed rationale, flow descriptions, and lessons learned from the previous `creditxpress_aws` implementation are documented in `docs/pro_onprem_pki_signing_recommendations.md`.

### 12.2 Architecture Split

The signing architecture uses a hybrid control-plane / signing-plane model:

- **AWS (`backend_pro`)** is the control plane: workflow state, user auth, agreement PDF generation, authorization, backup ticket issuance, and reconciliation
- **On-prem Signing Gateway** is the signing plane: document intake, MTSA interaction, PKI signing, local artifact storage, file serving, and backup sync
- **MTSA** runs on the same on-prem server, reachable only on the internal Docker network
- **S3** is the off-site backup and restore copy, not the primary serving origin

**Production topology:**

```text
Borrower/Admin UI
        |
        v
   Truestack Pro Apps (AWS)
   - admin_pro / backend_pro / borrower_pro
        |
        | HTTPS via Cloudflare Tunnel
        v
   On-Prem Signing Gateway
   - local metadata DB (SQLite)
   - local document store
   - backup sync worker
        |
        +--> MTSA (internal Docker network only)
        |
        +--> S3 backup/restore (via presigned URLs)
```

**Development topology (no tunnel, no S3):**

```text
Developer machine (Docker Compose)
   ┌─────────────────────────────────────┐
   │  backend_pro (localhost:4000)       │
   │        |                            │
   │        | http://localhost:3100      │
   │        v                            │
   │  Signing Gateway (:3100)            │
   │        |                            │
   │        | http://mtsa:8080           │
   │        v                            │
   │  MTSA Pilot (:8080)                 │
   │        |                            │
   │        +--> Trustgate pilot servers  │
   └─────────────────────────────────────┘
```

### 12.3 On-Prem Deployment Unit

Each Pro client with signing enabled gets:

- one Signing Gateway service (containerized)
- one MTSA container (proprietary Trustgate image, imported from tarball)
- one local metadata database (SQLite by default)
- one local artifact volume
- one Cloudflare Tunnel for connectivity to AWS (production only — not used in dev)

These are deployed as a Docker Compose stack on the client's on-prem server. In development, the same Compose stack runs on the developer's machine without the tunnel. See Section 12.15.

**Source code location:** the Signing Gateway service lives in `apps/signing-gateway/` as a **single shared package** (like `backend_pro`), not under per-client folders. Per-client deployment uses the same image and different config/secrets; see Section 4.2.

### 12.4 Networking

#### Production

Cloudflare Tunnel is the connectivity model between AWS and the on-prem server **in production**.

Rules:

- only the Signing Gateway is exposed through the tunnel
- MTSA is never exposed to the internet
- local database ports are never exposed
- the tunnel hostname follows `signing.<client-domain>`

Cloudflare Tunnel is preferred because it avoids inbound firewall changes, requires no VPN infrastructure, and is repeatable across all clients.

VPN or private connectivity should only be used if a client's compliance rules explicitly require it.

#### Development

In development, Cloudflare Tunnel is **not used**. The Signing Gateway and MTSA run locally via Docker Compose, and `backend_pro` connects to the Gateway over `localhost`. See Section 12.15 for the full dev setup.

### 12.5 Document Storage and Backup

Source of truth rules:

- on-prem local storage is the primary artifact store
- S3 is the off-site backup and restore copy
- AWS database stores only metadata, not the primary file blob

The Signing Gateway replicates artifacts to S3 using presigned URLs issued by `backend_pro`. This avoids placing long-lived AWS credentials on the client's on-prem server.

If a local file is missing (disk failure), the Signing Gateway can restore it from S3, verify the checksum, and serve the restored copy.

### 12.6 File Serving

Signed documents are served from the on-prem server.

Flow:

1. user requests a document through the AWS-hosted app
2. `backend_pro` performs authorization and issues a short-lived signed download token
3. browser is redirected to the Signing Gateway download endpoint
4. Signing Gateway validates the token and streams the file from local disk

If the on-prem server is unreachable, `backend_pro` falls back to serving the S3 backup copy directly via presigned URL.

### 12.7 Agreement Generation and Signature Plans

Agreement PDFs (Jadual J / Jadual K) are generated by `backend_pro` in AWS.

When a PDF is generated, `backend_pro` also produces a **signature plan** that defines where each signatory's visible PKI signature should be placed:

- page number
- coordinates (x, y, width, height)
- signatory role
- appearance rules

The PDF and signature plan are uploaded to the on-prem Signing Gateway for staging before signing begins. This replaces the old dependency on DocuSeal templates and hardcoded signature coordinates.

### 12.8 DocuSeal Removal

The new architecture does not use DocuSeal.

Since `truestack_kredit` already generates agreements, DocuSeal would add unnecessary complexity:

- extra templates and template sync
- extra webhooks and state machines
- extra per-client deployment burden
- signature coordinate coupling to an external template system

The Signing Gateway handles signing directly via MTSA without an intermediate document platform.

### 12.9 Reconciliation

`backend_pro` must run reconciliation jobs for:

- sign operations still marked pending
- artifacts missing backup confirmation
- completion callbacks that were not received

This prevents permanent desync between AWS workflow state and on-prem signing state.

### 12.10 MTSA and Trustgate

MTSA (MyTrustSigner Agent) is a proprietary Java/Tomcat container provided by Trustgate as a Docker tarball.

**Runtime:**

- Runtime: Apache Tomcat on Java
- Container port: **8080**
- Protocol: SOAP 1.1/1.2 over HTTP
- Authentication: HTTP headers (`Username` / `Password` per request)
- Image delivery: Docker tarball (`.tar` file) loaded via `docker load -i`
- Variants: `MTSAPilot` (testing) and `MTSA` (production)
- Container timezone: `Asia/Kuala_Lumpur`
- MTSA is stateless — no persistent volumes needed for the MTSA container itself

**WSDL paths:**

| Variant | Path |
|---------|------|
| Pilot | `/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl` |
| Production | `/MTSA/MyTrustSignerAgentWSAPv2?wsdl` |

**Operations provided by MTSA (11 total):**

- `GetCertInfo` — certificate lookup
- `RequestCertificate` — certificate enrollment (requires identity documents, OTP/PIN)
- `RequestEmailOTP` — send OTP via email for signing or enrollment
- `RequestSMSOTP` — send OTP via SMS for signing or enrollment
- `VerifyCertPin` — verify certificate PIN (internal signatories)
- `SignPDF` — sign a PDF with the user's PKI certificate
- `VerifyPDFSignature` — verify signatures in a signed PDF
- `RequestRevokeCert` — revoke a certificate
- `ResetCertificatePin` — reset certificate PIN (admin operation)
- `UpdateEmailAddress` — update registered email (requires email OTP)
- `UpdateMobileNo` — update registered mobile number (requires SMS OTP)

Full API specifications, status codes, and Signing Gateway REST mapping are documented in `docs/mtsa_api_reference.md`.

**Network requirements:**

- MTSA communicates with Trustgate PKI servers over HTTPS (port 443)
- The on-prem server must have outbound HTTPS access to Trustgate endpoints
- MTSA must **never** be exposed outside the internal Docker network
- Only the Signing Gateway communicates with MTSA

**Failure handling:**

If Trustgate is unavailable, signing operations fail gracefully and remain retryable. The system must never silently succeed without a valid PKI signature.

### 12.11 Client Registry Additions

When signing is enabled, the client config in `config/clients/<client>.yaml` should include:

```yaml
signing:
  gateway_hostname: signing.client-domain.com
  ssh_host: ssh-signing.client-domain.com
  tunnel_name: client-onprem
  mtsa_env: pilot  # or prod
  backup_bucket_prefix: client-id
```

| Field | Purpose |
|-------|---------|
| `gateway_hostname` | Public hostname for the Signing Gateway through Cloudflare Tunnel |
| `ssh_host` | SSH hostname through the tunnel for CI/CD deployment |
| `tunnel_name` | Cloudflare Tunnel identifier |
| `mtsa_env` | `pilot` or `prod` — determines which MTSA WSDL path to use |
| `backup_bucket_prefix` | S3 key prefix for this client's signed document backups |

### 12.12 Deployment and Updates

The Signing Gateway is deployed as a containerized appliance:

- same Docker image across all clients
- same Compose structure
- client-specific configuration via environment variables and secrets only

#### Image Build and Registry

The Signing Gateway Docker image is built in GitHub Actions and pushed to **GitHub Container Registry (GHCR)** at `ghcr.io/<org>/signing-gateway`.

GHCR is preferred over ECR for the on-prem image because:

- the on-prem server does not need AWS credentials to pull images
- GHCR is accessible from any network with outbound HTTPS
- a single registry serves all clients regardless of their AWS account
- authentication uses a GitHub Personal Access Token (PAT) with `read:packages` scope

The MTSA image is **not** built in CI. It is a proprietary Trustgate tarball loaded manually via `docker load -i` during initial provisioning or MTSA version upgrades.

#### CI/CD Workflow: `deploy-signing-gateway.yml`

A dedicated GitHub Actions workflow handles Signing Gateway builds and deployments.

**Trigger model:**

| Client Type | Trigger | Behavior |
|-------------|---------|----------|
| `demo-client` | Push to `main` (paths: `apps/signing-gateway/**`, `config/clients/demo-client.yaml`) | Auto-build and auto-deploy |
| External client | `workflow_dispatch` only | Manual trigger with client selector |

**Workflow structure:**

```text
1. load-config        — parse client YAML for signing config
2. build-gateway      — build Signing Gateway image, push to GHCR
3. deploy-to-onprem   — SSH through Cloudflare Tunnel to pull and restart
```

**Step 1: Load config**

Same pattern as `deploy-demo-client.yml`. Parse the client YAML to extract:

- `signing.gateway_hostname` — the tunnel hostname
- `signing.tunnel_name` — Cloudflare Tunnel name
- `signing.mtsa_env` — `pilot` or `prod`
- `signing.backup_bucket_prefix` — S3 backup prefix
- `signing.ssh_host` — SSH hostname through the tunnel (e.g. `ssh-signing.demo.truestack.my`)

**Step 2: Build and push**

```yaml
- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Build and push Signing Gateway
  run: |
    docker build -f apps/signing-gateway/Dockerfile \
      -t ghcr.io/${{ github.repository_owner }}/signing-gateway:${{ github.sha }} \
      -t ghcr.io/${{ github.repository_owner }}/signing-gateway:latest .
    docker push ghcr.io/${{ github.repository_owner }}/signing-gateway:${{ github.sha }}
    docker push ghcr.io/${{ github.repository_owner }}/signing-gateway:latest
```

**Step 3: Deploy to on-prem**

Deployment to the on-prem server uses SSH through Cloudflare Tunnel. The tunnel exposes an SSH endpoint for the server, secured by Cloudflare Access with a service token.

```yaml
- name: Install cloudflared
  run: |
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
      -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared

- name: Deploy via SSH through Cloudflare Tunnel
  env:
    CF_ACCESS_CLIENT_ID: ${{ secrets.CF_ACCESS_CLIENT_ID }}
    CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
    SSH_HOST: ${{ needs.load-config.outputs.ssh_host }}
  run: |
    mkdir -p ~/.ssh
    echo "${{ secrets.ONPREM_SSH_KEY }}" > ~/.ssh/deploy_key
    chmod 600 ~/.ssh/deploy_key

    cat >> ~/.ssh/config <<EOF
    Host onprem-signing
      HostName $SSH_HOST
      User deploy
      IdentityFile ~/.ssh/deploy_key
      ProxyCommand cloudflared access ssh --hostname %h --id $CF_ACCESS_CLIENT_ID --secret $CF_ACCESS_CLIENT_SECRET
      StrictHostKeyChecking no
    EOF

    ssh onprem-signing "cd /opt/signing-stack && ./deploy.sh ${{ github.sha }}"
```

**On-prem deploy script (`deploy.sh`):**

A simple script checked into the repo at `scripts/signing-gateway/deploy.sh`:

```bash
#!/bin/bash
set -euo pipefail
TAG="${1:-latest}"
echo "$GHCR_TOKEN" | docker login ghcr.io -u deploy --password-stdin
docker pull "ghcr.io/<org>/signing-gateway:$TAG"
cd /opt/signing-stack
docker compose up -d --no-deps signing-gateway
docker image prune -f
```

#### Integration with Existing Workflows

The on-prem signing deployment is **separate** from the AWS deployment:

- `deploy-demo-client.yml` handles AWS (backend_pro, admin_pro, borrower_pro)
- `deploy-signing-gateway.yml` handles on-prem (Signing Gateway)

Both workflows trigger independently on `main` pushes based on changed paths. They do not block each other.

For external clients, on-prem deployment is always `workflow_dispatch` — never auto-triggered.

#### Initial Provisioning

First-time setup for a new client's on-prem server is a manual process:

1. Provision the server (physical or VM)
2. Install Docker and Docker Compose
3. Load the MTSA Docker image from Trustgate tarball
4. Copy the `docker-compose.yml` template and client `.env` file
5. Install and authenticate `cloudflared` with the client's tunnel token
6. Run `docker compose up -d` to start all services
7. Verify health via the Gateway health endpoint
8. Run first deployment from GitHub Actions to confirm the pipeline works

A provisioning checklist and runbook should be maintained in `docs/signing-gateway-provisioning.md`.

### 12.13 Secrets and Keys Inventory

#### GitHub Secrets (per GitHub Environment)

Each client's GitHub Environment stores these secrets:

| Secret | Purpose | Used By |
|--------|---------|---------|
| `AWS_ROLE_ARN` | OIDC role for AWS deployment | AWS deploy jobs (existing) |
| `ONPREM_SSH_KEY` | SSH private key for on-prem deployment | `deploy-signing-gateway.yml` |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token ID | SSH through tunnel |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token secret | SSH through tunnel |

`GITHUB_TOKEN` is used automatically for GHCR push (no additional secret needed).

#### On-Prem Server (`.env` file on the server)

Each on-prem server stores these in its local `.env` file at `/opt/signing-stack/.env`:

| Variable | Purpose | Source |
|----------|---------|--------|
| `MTSA_SOAP_USERNAME` | MTSA SOAP authentication | Issued by Trustgate per client |
| `MTSA_SOAP_PASSWORD` | MTSA SOAP authentication | Issued by Trustgate per client |
| `SIGNING_API_KEY` | Shared secret for backend_pro ↔ Gateway auth | Generated during provisioning |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel identity | Cloudflare dashboard |
| `GHCR_TOKEN` | Pull images from GHCR | GitHub PAT with `read:packages` |
| `MTSA_ENV` | `pilot` or `prod` | From client config |
| `GATEWAY_PORT` | Signing Gateway listen port (default: `3100`) | Set during provisioning |
| `BACKUP_ENABLED` | Enable S3 backup sync | `true` / `false` |

The `.env` file is placed once during provisioning and updated only when secrets rotate.

#### AWS Secrets Manager (in the client's AWS account)

Add these to the client's existing Secrets Manager entry alongside database and auth secrets:

| Key | Purpose | Used By |
|-----|---------|---------|
| `signing_gateway_url` | Full URL of the Gateway through the tunnel | `backend_pro` at runtime |
| `signing_api_key` | Same shared secret as on-prem `SIGNING_API_KEY` | `backend_pro` for Gateway API calls |
| `signing_backup_bucket` | S3 bucket name for signed document backup | `backend_pro` for presigned URL generation |

#### Secret Rotation

| Secret | Rotation Strategy |
|--------|-------------------|
| MTSA SOAP credentials | Rotated by Trustgate; update on-prem `.env` and restart |
| Signing API key | Generate a new key, update both AWS SM and on-prem `.env`, restart Gateway |
| Cloudflare Tunnel token | Rotate via Cloudflare dashboard, update on-prem `.env`, restart `cloudflared` |
| GHCR token | Rotate GitHub PAT, update on-prem `.env` |
| SSH deploy key | Rotate key pair, update GitHub secret and on-prem `authorized_keys` |

### 12.14 Duplicability

This architecture is duplicable because each client receives the same standard on-prem bundle:

- same Gateway image
- same Compose structure
- same API contract with `backend_pro`
- same environment variable names
- same health check and backup state model

Client-specific differences are limited to secrets, domain names, MTSA environment (`pilot` vs `prod`), and the Cloudflare Tunnel identity.

### 12.15 Development and Testing Setup

In development, the Signing Gateway and MTSA run locally on the developer's machine. There is no Cloudflare Tunnel, no S3 backup, and no on-prem server.

#### Prerequisites

1. Docker and Docker Compose installed
2. MTSA pilot WAR file placed at `apps/signing-gateway/mtsa-pilot/webapps/MTSAPilot.war` (from Trustgate pilot package — git-ignored, ~40 MB)
3. Trustgate pilot SOAP credentials (shared via secure channel, stored in local `.env`)

The MTSA pilot container is **built from source** using the Dockerfile and config files checked into `apps/signing-gateway/mtsa-pilot/`. The WAR file is the only component that must be copied manually.

#### Docker Compose (Dev)

The dev Compose file lives at `apps/signing-gateway/docker-compose.dev.yml`:

```yaml
services:
  mtsa:
    build:
      context: ./mtsa-pilot
      dockerfile: Dockerfile
    container_name: mtsa-pilot
    ports:
      - "8080:8080"
    environment:
      TZ: Asia/Kuala_Lumpur
      JAVA_OPTS: -Dsun.net.inetaddr.ttl=60 -Dsun.net.inetaddr.negative.ttl=10
    dns:
      - 8.8.8.8
      - 8.8.4.4
      - 1.1.1.1
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8080/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    restart: unless-stopped

  signing-gateway:
    build:
      context: ../..
      dockerfile: apps/signing-gateway/Dockerfile
    container_name: signing-gateway
    ports:
      - "3100:3100"
    environment:
      PORT: "3100"
      NODE_ENV: development
      MTSA_URL: http://mtsa:8080
      MTSA_WSDL_PATH: /MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl
      MTSA_SOAP_USERNAME: ${MTSA_SOAP_USERNAME}
      MTSA_SOAP_PASSWORD: ${MTSA_SOAP_PASSWORD}
      SIGNING_API_KEY: ${SIGNING_API_KEY:-dev-signing-key}
      STORAGE_PATH: /data/documents
      BACKUP_ENABLED: "false"
    volumes:
      - signing-data:/data/documents
      - signing-db:/data/db
    depends_on:
      mtsa:
        condition: service_healthy
    restart: unless-stopped

volumes:
  signing-data:
  signing-db:
```

The `depends_on` with `condition: service_healthy` ensures the Gateway starts only after MTSA's WSDL is reachable.

#### Environment Variables (Dev)

Create a `.env` file at `apps/signing-gateway/.env` (see `.env.example` for a template):

```env
MTSA_SOAP_USERNAME=<pilot_username>
MTSA_SOAP_PASSWORD=<pilot_password>
SIGNING_API_KEY=dev-signing-key
```

These are the pilot credentials issued by Trustgate. They must **not** be committed to git.

#### Starting the Dev Stack

```bash
cd apps/signing-gateway
docker compose -f docker-compose.dev.yml up -d
```

Verify MTSA is running:

```bash
curl "http://localhost:8080/MTSAPilot/MyTrustSignerAgentWSAPv2?wsdl"
```

Verify the Signing Gateway is running and connected to MTSA:

```bash
curl http://localhost:3100/health
# Expected: {"status":"healthy","services":{"mtsa":"connected"}}
```

Test a live MTSA call through the Gateway:

```bash
curl -X POST http://localhost:3100/api/cert/info \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-signing-key" \
  -d '{"UserID": "770908012232"}'
# Expected: {"success":true/false,"statusCode":"GC100","statusMsg":"Cert not found",...}
```

#### Connecting `backend_pro` to the Dev Gateway

In `backend_pro`'s local `.env`, point the signing config at the local Gateway:

```env
SIGNING_GATEWAY_URL=http://localhost:3100
SIGNING_API_KEY=dev-signing-key
SIGNING_ENABLED=true
```

No Cloudflare Tunnel is involved. `backend_pro` calls the Gateway directly over `localhost`.

#### What Works in Dev

| Capability | Dev | Production |
|------------|-----|------------|
| MTSA SOAP operations (11 ops: cert, sign, verify, OTP, contact updates) | Yes (pilot) | Yes (prod) |
| Signing Gateway API | Yes | Yes |
| Local document storage | Yes (Docker volume) | Yes (host volume) |
| S3 backup sync | No (disabled) | Yes |
| File serving | Yes (localhost) | Yes (via tunnel) |
| Cloudflare Tunnel | No | Yes |
| Reconciliation jobs | Can test against local Gateway | Against remote Gateway |
| Multi-signatory flow | Yes | Yes |

#### Differences Between Dev and Production

| Aspect | Dev | Production |
|--------|-----|------------|
| MTSA variant | `MTSAPilot` | `MTSA` |
| MTSA WSDL path | `/MTSAPilot/...` | `/MTSA/...` |
| SOAP credentials | Pilot credentials | Production credentials |
| Certificates issued | Test certificates (not legally valid) | Production certificates (legally valid) |
| Connectivity | `localhost` / Docker network | Cloudflare Tunnel |
| S3 backup | Disabled | Enabled |
| Document storage | Docker volume (ephemeral) | Host volume (persistent) |
| `cloudflared` | Not running | Running as a service |
| SSH deploy pipeline | Not applicable | Via CI/CD |

#### Testing the Signing Flow

End-to-end signing can be tested locally against the MTSA pilot:

1. Start the dev stack (`docker compose up`)
2. Start `backend_pro` locally with signing enabled
3. Create a loan and generate an agreement (Jadual J / K)
4. The agreement PDF and signature plan are sent to the local Signing Gateway
5. Trigger the borrower signing flow:
   - `RequestEmailOTP` (or `RequestSMSOTP`) sends a real OTP to the test borrower via Trustgate pilot
   - Enter the OTP to authorize signing
   - `SignPDF` signs the document with a test certificate
6. Download the signed PDF from the local Gateway
7. Optionally verify with `VerifyPDFSignature`

All Gateway API responses include `success: boolean` and `errorDescription` (on failure) for easy programmatic handling. See `docs/mtsa_api_reference.md` for the full status code reference and REST endpoint mapping.

Pilot certificates are issued by Trustgate's test CA and are **not legally valid**. They are functionally identical to production certificates for development purposes.

#### Hot Reload (Gateway Development)

For active development on the Signing Gateway itself, mount the source code instead of building the image:

```yaml
services:
  signing-gateway:
    build:
      context: ../..
      dockerfile: apps/signing-gateway/Dockerfile
      target: dev
    volumes:
      - ../../apps/signing-gateway/src:/app/src
      - signing-data:/data/documents
      - signing-db:/data/db
    # ... same env and ports as above
```

This allows code changes without rebuilding the container.

#### Resetting Dev State

To clear all local signing data and start fresh:

```bash
cd apps/signing-gateway
docker compose -f docker-compose.dev.yml down -v
```

The `-v` flag removes the named volumes, clearing the local document store and SQLite database.

---

## 13. Database and Migration Strategy

### 13.1 SaaS and Pro Remain Separate

Current separation stays in place:

- SaaS backend uses `apps/backend/prisma`
- Pro backend uses `apps/backend_pro/prisma`

### 13.2 Pro Schema Consistency

All Pro clients use the same `backend_pro` schema and migration history.

That means:

- one Pro codebase
- one Pro migration chain
- one Pro database per client

### 13.3 Migration Execution Rules

- SaaS migrations are run only against the SaaS database
- Pro migrations are run only against the selected client database
- external client migrations happen only during an approved deployment to that client
- `demo-client` migrations can run automatically with the demo deployment

### 13.4 Migration Safety

Prefer:

- additive schema changes
- forward-compatible releases
- explicit rollback notes for high-risk changes

---

## 14. Pro Platform Build Requirements

### 14.1 `backend_pro`

`backend_pro` must produce its own correct production artifact.

The production build path must use:

- `apps/backend_pro/package.json`
- `apps/backend_pro/prisma/schema.prisma`
- `npm run build -w apps/backend_pro`

It must not build the SaaS backend by mistake.

### 14.2 `admin_pro`

`admin_pro` is already aligned with the intended Pro deployable model:

- standalone Next.js output
- separate build args for Pro URLs
- its own runtime port and environment

### 14.3 `borrower_pro/<client>`

Each borrower app must have a production build path.

Recommended direction:

- standardize on standalone Next.js output for borrower apps
- provide a reusable Dockerfile or build template that accepts the borrower app folder as input

This lets one workflow build:

- `Demo_Client` now
- future `client-a`, `client-b`, and others later

---

## 15. Demo Client Operating Model

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

## 16. Security and Secret Management

### 16.1 Do Not Store Secrets in Git

Never commit:

- client AWS credentials
- database credentials
- API keys
- signing credentials (including MTSA credentials and on-prem shared secrets)
- eKYC credentials
- Cloudflare Tunnel tokens

### 16.2 Secret Location

Use:

- GitHub environments for workflow-level secret wiring
- AWS Secrets Manager in the target account for runtime secrets
- On-prem `.env` files for Signing Gateway and MTSA credentials (see Section 12.13)

### 16.3 Deployment Authentication

Use GitHub Actions OIDC role assumption for:

- SaaS deployment
- `demo-client` deployment
- external client deployment

For on-prem signing deployment, use Cloudflare Access service tokens + SSH keys (see Section 12.12).

Avoid long-lived shared AWS keys. The on-prem server never stores AWS credentials — it receives presigned URLs from `backend_pro` for S3 operations.

---

## 17. Implementation Roadmap

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

### Phase 6: On-Prem Signing Infrastructure

**Step 1 — Dev environment and core integration:**

- set up `docker-compose.dev.yml` with MTSA pilot and Signing Gateway (Section 12.15)
- load MTSA pilot tarball and verify WSDL accessibility
- define the Signing Gateway API contract (document intake, cert/sign operations, download, backup)
- build the Signing Gateway service and MTSA SOAP integration
- tie agreement generation to signature plans
- implement borrower certificate and signing flow end to end against MTSA pilot
- add multi-signatory progression
- test full signing flow locally (no tunnel, no S3)

**Step 2 — Production pipeline:**

- create `deploy-signing-gateway.yml` GitHub Actions workflow
- set up GHCR for Signing Gateway images
- provision demo-client on-prem server (or VM) with Docker, `cloudflared`, and MTSA
- configure GitHub environment secrets for on-prem deployment (SSH key, CF Access tokens)
- add S3 backup/restore and reconciliation
- harden with health checks, restore drills, and support runbook
- write provisioning runbook (`docs/signing-gateway-provisioning.md`)
- see `docs/pro_onprem_pki_signing_recommendations.md` for detailed phasing
- see `docs/mtsa_api_reference.md` for MTSA API contract

### Phase 7: External Client Onboarding

- add one client registry file (including `signing` block with hostnames and MTSA env)
- add one Terraform client instantiation
- add one borrower app folder or client shell
- create GitHub environment for the client with required secrets (AWS role, SSH key, CF tokens)
- provision on-prem server: install Docker, load MTSA tarball, configure `.env`, start `cloudflared`
- deploy on-prem signing stack via `deploy-signing-gateway.yml` (`workflow_dispatch`)
- add `signing_gateway_url` and `signing_api_key` to client AWS Secrets Manager
- manually promote a chosen Pro release

---

## 18. Anti-Patterns to Avoid

Do not do the following:

1. fork `admin_pro` per client
2. fork `backend_pro` per client
3. create one repo per client by default
4. auto-deploy all external clients on every merge
5. reuse the SaaS shared network stack for Pro client accounts
6. keep borrower apps as copy-paste duplicates without extracting shared flow logic
7. store secrets in the client registry
8. tie external client production rollout directly to `main`
9. expose MTSA directly through Cloudflare Tunnel or any external network
10. fork the Signing Gateway code per client
11. use the on-prem server as a second workflow/business-logic engine
12. store long-lived AWS credentials on the on-prem server
13. auto-deploy on-prem signing for external clients on `main` push — always use `workflow_dispatch`
14. store MTSA SOAP credentials or signing API keys in the client registry YAML

---

## 19. Final Reference Summary

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
- deploy a per-client on-prem signing stack (Signing Gateway + MTSA) for PKI signing
- build and push Signing Gateway images to GHCR; deploy via SSH through Cloudflare Tunnel
- auto-deploy on-prem signing for `demo-client` on `main` push; manual `workflow_dispatch` for external clients
- use Cloudflare Tunnel as the default connectivity between AWS and on-prem
- store on-prem secrets in `.env` files; store AWS-side signing secrets in Secrets Manager
- store signed documents on-prem first, replicate to S3 as backup
- serve documents from the on-prem server, with S3 fallback when unreachable
- do not use DocuSeal — agreement generation and signing are handled by the Pro platform and Signing Gateway directly
- reference `docs/mtsa_api_reference.md` for the MTSA SOAP API contract

This is the architecture to follow for all future Pro implementation and deployment work in this repository.

---

## 20. External Pro client onboarding checklist (e.g. Proficient Premium)

Use this when onboarding a **new external Pro client** that shares the same `admin_pro` / `backend_pro` / Signing Gateway code as the rest of the monorepo but runs on **its own AWS account** and (if signing is enabled) **its own on-prem stack**. The borrower app can start as a **structural copy** of `apps/borrower_pro/Demo_Client` with client-specific branding, domains, and registry metadata only.

### 20.1 Identity and registry

1. Choose a stable `client_id` (kebab-case), e.g. `proficient-premium`.
2. Add `config/clients/<client_id>.yaml` from `config/clients/_template.yaml` with:
   - `borrower_app` set to the new borrower folder name (e.g. `Proficient_Premium` if mirroring `Demo_Client` folder naming)
   - `client_type: external`, `deploy.auto_deploy: false`, and **pinned** `platform_release` / `borrower_release` when ready (not `latest` for production)
   - `aws.account_id` and `aws.region` for the **new** AWS account
   - `aws.github_environment` naming convention such as `pro-<client_id>`
   - `domains.*`, `ecr.*`, `ecs.*`, `secrets.app_secrets_arn`, `storage.uploads_bucket`, and `pro_tenant.*` for this client
3. If signing is enabled, complete the `signing:` block (gateway hostname, SSH host, tunnel name, `mtsa_env`, backup prefix) per Section 12.11 — **no secrets in YAML**.

### 20.2 AWS account and infrastructure

1. Create or designate the client’s AWS account; bootstrap Terraform remote state (S3 + lock table) and GitHub OIDC deploy role in that account.
2. Instantiate `terraform/pro/clients/<client_id>/` from the `demo-client` pattern (`terraform/pro/clients/demo-client/`), with client-specific `*.tfvars` (names, domains, capacity).
3. Apply Terraform to create VPC, ALB, ECS, RDS, S3, Secrets Manager, ACM/Route53 as required by the module.
4. Populate **AWS Secrets Manager** with runtime secrets (DB, auth, app keys, and if signing: `signing_gateway_url`, `signing_api_key`, `signing_backup_bucket` per Section 12.13).

### 20.3 Borrower frontend (`borrower_pro`)

1. Copy `apps/borrower_pro/Demo_Client` to `apps/borrower_pro/<borrower_app>/` and adjust only **shell** concerns: branding, copy, legal pages, env-driven URLs, tenant-facing names — keep shared flows in shared components/packages.
2. Wire production build args / env for that client’s public URLs (admin, API, borrower) consistent with `domains` in the registry file.

### 20.4 GitHub Environments and secrets

1. Create GitHub Environment `pro-<client_id>` (or the name set in `aws.github_environment`).
2. Store at minimum: `AWS_ROLE_ARN` (OIDC) for this account; any workflow-specific secrets the generalized deploy job will need.
3. If on-prem signing deploy is used: `ONPREM_SSH_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (Section 12.13). Signing Gateway image pull on the server uses a GHCR token in on-prem `.env`, not necessarily GitHub Environment, but rotation must be coordinated.

### 20.5 CI/CD

1. **AWS (admin_pro + backend_pro + borrower):** use `deploy-pro.yml` (Section 10.2) so `workflow_dispatch` selects `client_id` and semantic release pins from workflow input or `config/clients/<client_id>.yaml`.
2. **Signing Gateway:** use `deploy-signing-gateway.yml` with `client_id` and semantic `platform_version` (or the config default); external clients still deploy on-prem by **manual** dispatch only (never auto on `main` for external — Section 10.4 / 18).
3. Keep **demo-client** as the automatic canary on `main`; external clients promote only when deliberately pinned.

### 20.6 On-prem Signing Gateway + MTSA

1. Provision the client’s server (Docker, Compose), load Trustgate MTSA image from tarball, configure `mtsa_env` (`pilot` vs `prod`) and Trustgate-issued SOAP credentials in on-prem `.env` only.
2. Install and configure Cloudflare Tunnel (`cloudflared`) and DNS/hostnames consistent with `signing.gateway_hostname` / `signing.ssh_host`.
3. Align `SIGNING_API_KEY` (and related) between on-prem `.env` and the client’s AWS Secrets Manager entry for `backend_pro`.
4. Run first health checks (Gateway `/health`, MTSA WSDL per Section 12), then first deploy via CI SSH path.

### 20.7 Mobile

Native mobile apps for borrowers are **out of scope** for this checklist until the app reaches release readiness; architecture remains “shared codebase, per-client deployment” when you add them later.

### 20.8 Naming note: “Proficient Premium”

For a client marketed as **Proficient Premium**, use a stable machine-friendly `client_id` (e.g. `proficient-premium`) in registry, Terraform, and GitHub Environment names; use human-facing strings in branding and `pro_tenant` display fields as needed.
