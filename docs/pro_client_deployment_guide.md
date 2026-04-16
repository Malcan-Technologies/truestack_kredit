# Pro Client Deployment Guide

This is the canonical combined reference for Pro deployment planning, demo-client rollout behavior, and external-client onboarding/checklist work.

## Purpose

This guide explains how to:

- deploy `demo-client` first in the Truestack AWS account
- keep the deployment lean and low-cost
- add future Pro clients with their own AWS account later
- manage per-client configuration in a repeatable way

This guide assumes the current approved architecture in `docs/architecture_plan.md`.

---

## Deployment Model

For each Pro client, the deployable unit is:

```txt
admin_pro + backend_pro + borrower_pro/<client>
```

Important isolation rule:

- only the **codebase** is shared across Pro clients
- the **runtime is not shared**
- every client gets its own deployed `admin_pro`
- every client gets its own deployed `backend_pro`
- every client gets its own borrower app deployment
- every client gets its own database
- every client gets its own secrets, domains, storage, and infrastructure boundary

If signing is enabled for a client, that client also gets its own on-prem signing stack:

- one dedicated Signing Gateway deployment for that client
- one dedicated MTSA deployment for that client
- one dedicated on-prem server / VM / hardware footprint for that client

The Signing Gateway source code in the repo is shared. The MTSA container/image is a proprietary on-prem component and should be treated as a separate per-client deployment artifact, not a shared monorepo service runtime.

For `demo-client`, that means:

```txt
apps/admin_pro
apps/backend_pro
apps/borrower_pro/Demo_Client
```

The repository now includes a dedicated workflow for this first deployment target:

```txt
.github/workflows/deploy-demo-client.yml
```

It also includes a checked-in client registry entry:

```txt
config/clients/demo-client.yaml
```

Future clients should follow the same pattern using:

```txt
config/clients/_template.yaml
```

The `deploy-demo-client` workflow now reads the deployment target names, domains, secret ARN, tenant slug, and bucket name from `config/clients/demo-client.yaml` instead of carrying a second hardcoded copy of those values.

---

## How Deployment Works Now

There are now 2 separate automatic deployment lanes on `main`:

- `.github/workflows/deploy.yml` for the live SaaS platform
- `.github/workflows/deploy-demo-client.yml` for the Pro `demo-client`

This means a push to GitHub does **not** deploy everything.

What happens depends on:

- which branch receives the push
- which files changed

### 1. SaaS auto-deploy lane

The SaaS workflow only runs on pushes to `main` when the changed files match SaaS paths such as:

- `apps/admin/**`
- `apps/backend/**`
- `packages/shared/**`
- `apps/backend/prisma/**`
- `Dockerfile.migrations`
- `scripts/run-prisma-migrations.sh`

If a push only changes Pro paths, the SaaS workflow does not start.

### 2. Demo-client auto-deploy lane

The `demo-client` workflow only runs on pushes to `main` when the changed files match Pro paths such as:

- `apps/admin_pro/**`
- `apps/backend_pro/**`
- `apps/borrower_pro/Demo_Client/**`
- shared borrower layers consumed by `Demo_Client` such as `apps/borrower_pro/components/**`, `apps/borrower_pro/lib/**`, `apps/borrower_pro/help-docs/**`, `apps/borrower_pro/Dockerfile`, and `apps/borrower_pro/tsconfig.json`
- `packages/**`
- `config/clients/demo-client.yaml`
- `Dockerfile.migrations.pro`
- `scripts/run-prisma-migrations-pro.sh`
- `.github/workflows/deploy-demo-client.yml`

The workflow loads its deployment target from:

```txt
config/clients/demo-client.yaml
```

So it deploys to the ECS cluster, ECS services, ECR repositories, domains, and Secrets Manager ARN defined there.

### 3. Which ECS service gets updated

On a push to `main`, the demo workflow detects which part of Pro changed and updates the matching ECS service:

- `apps/backend_pro/**` updates `truekredit-demo-client-backend`
- `apps/admin_pro/**` updates `truekredit-demo-client-admin`
- `apps/borrower_pro/Demo_Client/**` and shared borrower layers used by Demo update `truekredit-demo-client-borrower`

In addition:

- `packages/**` is treated as shared code, so it can trigger rebuilds for more than one Pro app
- `config/clients/demo-client.yaml` can trigger all 3 because it changes deployment targeting/config
- changes in `apps/borrower_pro/<external-client>/**` do not auto-deploy `demo-client`

### 4. Database behavior

The demo workflow has a separate database operations job for the migrations task family:

- `truekredit-demo-client-migrations`

Automatic behavior:

- if `apps/backend_pro/prisma/**` changes on a push to `main`, the workflow can run database operations automatically

Manual behavior:

- `db-migrate`
- `db-seed`
- `db-migrate-and-seed`
- `db-reset-and-seed`

Use manual database actions when you want to control rollout timing, reseed the demo tenant, or rerun migrations without rebuilding every app.

### 5. Manual deployment actions

The workflow also supports `workflow_dispatch` so you can manually choose:

- `full`
- `deploy-only`
- `backend-only`
- `admin-only`
- `borrower-only`
- `db-migrate`
- `db-seed`
- `db-migrate-and-seed`
- `db-reset-and-seed`

Practical meaning:

- `full` builds and deploys the relevant apps
- `deploy-only` reuses the latest pushed images and only updates ECS
- `backend-only`, `admin-only`, and `borrower-only` let you roll one service at a time
- database actions run the migrations task without doing a normal app deploy

### 6. What this means for normal day-to-day pushes

Current expected behavior is:

- push or merge SaaS changes to `main` -> only SaaS services deploy
- push or merge Pro `demo-client` changes to `main` -> only `demo-client` services deploy
- push or merge borrower-only `demo-client` changes to `main` -> borrower ECS service deploys
- push or merge backend-only `demo-client` changes to `main` -> backend ECS service deploys
- push or merge admin-only `demo-client` changes to `main` -> admin ECS service deploys

So yes: once code is pushed to GitHub and lands on `main`, the correct ECS containers are updated automatically for the currently configured `demo-client` lane.

### 7. What does not auto-deploy

Right now:

- feature branches do not auto-deploy this stack
- external Pro clients do not auto-deploy by default
- only `demo-client` is wired as the automatic Pro target

That keeps `demo-client` as the canary lane for shared Pro code while avoiding accidental rollout to future external client accounts.

---

## Cost-Minimized Default

Follow the same proven minimal baseline used by the current SaaS platform unless a client explicitly pays for more.

Use these defaults:

- single AZ only
- one ECS task for backend
- one ECS task for admin
- one ECS task for borrower
- Fargate task size `256 CPU / 512 MB` unless the app proves it needs more
- RDS `db.t4g.micro`
- RDS storage `20 GB gp3`
- no RDS Multi-AZ
- no RDS Performance Insights
- no autoscaling by default
- no ECS Container Insights
- only basic CloudWatch log groups with short retention

Do not add:

- Multi-AZ
- read replicas
- NAT gateways unless truly required
- custom dashboards and alarms by default
- always-on extra AWS services that add fixed monthly cost

---

## What Exists in Repo Now

The repo now contains the minimum app packaging needed to deploy `demo-client` cleanly:

- fixed `apps/backend_pro/Dockerfile`
- standalone build enabled for `apps/borrower_pro/Demo_Client`
- reusable borrower Dockerfile at `apps/borrower_pro/Dockerfile`
- Pro migrations image at `Dockerfile.migrations.pro`
- Pro migrations runner at `scripts/run-prisma-migrations-pro.sh`
- demo client workflow at `.github/workflows/deploy-demo-client.yml`
- Pro Terraform workflow at `.github/workflows/terraform-pro.yml`
- client registry files under `config/clients/`
- reusable Pro client Terraform module under `terraform/pro/modules/client_stack`
- bootstrap stack for `demo-client` under `terraform/pro/clients/demo-client`

This gives us a consistent packaging and deployment lane for the first Pro client.

---

## Demo Client Prerequisites

Before running the workflow, provision the following in your AWS account.

The infrastructure is now codified under:

```txt
terraform/pro/clients/demo-client
```

So the recommended order is:

1. apply Terraform for `demo-client`
2. set the GitHub environment secret
3. run `db-migrate-and-seed`
4. run `full`

### 1. Networking

For the first `demo-client` deployment, the fastest approach is:

- reuse the same shared VPC pattern already proven by SaaS
- use separate ECS services and separate target groups
- keep the runtime isolated from SaaS at the service, DB, secret, and domain level

You do not need Multi-AZ or special HA networking for `demo-client`.

### 2. ECR repositories

Create:

- `truekredit-demo-client-backend-pro`
- `truekredit-demo-client-admin-pro`
- `truekredit-demo-client-borrower`

### 3. ECS resources

Create:

- cluster: `truekredit-demo-client`
- backend service: `truekredit-demo-client-backend`
- admin service: `truekredit-demo-client-admin`
- borrower service: `truekredit-demo-client-borrower`
- migrations task family: `truekredit-demo-client-migrations`

Recommended internal ports:

- backend_pro: `4001`
- admin_pro: `3005`
- borrower app: `3000`

Recommended container names:

- backend
- admin
- borrower
- migrations

The workflow assumes those container names when it renders ECS task definitions.

### 4. Database

Create one Pro database for `demo-client`:

- engine: PostgreSQL
- instance class: `db.t4g.micro`
- storage: `gp3`
- allocated storage: `20 GB`
- single AZ only
- no Performance Insights
- no Multi-AZ

### 5. S3 bucket

Create a dedicated uploads bucket, for example:

```txt
truekredit-demo-client-uploads
```

### 6. Secrets Manager

Create one secret for the runtime apps, matching the ARN in `config/clients/demo-client.yaml`.

Required keys should include at least:

- `database_url`
- `better_auth_secret`
- `jwt_secret`
- `jwt_refresh_secret`
- `webhook_secret`
- `resend_api_key`
- `resend_webhook_secret`
- `trueidentity_admin_base_url`
- `kredit_webhook_secret`
- `trueidentity_webhook_secret`
- `kredit_internal_secret`

Only include keys actually used by your Pro runtime.

### 7. DNS and TLS

Create and route these domains:

- `demo-admin.truestack.my`
- `demo-api.truestack.my`
- `demo.truestack.my`

Use the same ALB and ACM pattern already proven by SaaS if you want the fastest first rollout.

If the domain is not hosted in Route53 for the target AWS account, keep `create_dns_records = false` in Terraform and create the DNS records in your external DNS provider instead. For `demo-client`, the records should point to:

```txt
trueidentity-prod-alb-561379335.ap-southeast-5.elb.amazonaws.com
```

---

## GitHub Environment Setup

Create a GitHub environment:

```txt
pro-demo-client
```

Add:

- secret: `AWS_ROLE_ARN`

The workflow uses OIDC and assumes this role during build and deploy.

Use a dedicated role for `pro-demo-client`. Do not reuse the SaaS production deployment role unless it is intentionally scoped to the demo-client resources only.

If you want stricter controls, add reviewers and approval rules to this environment.

---

## Demo Client Configuration

The checked-in config lives here:

```txt
config/clients/demo-client.yaml
```

Update it when any of these change:

- AWS account ID
- region
- GitHub environment
- ECR repository names
- ECS cluster or service names
- Secrets Manager ARN
- domains
- default seeded owner info
- enabled modules

For a new client, copy:

```txt
config/clients/_template.yaml
```

and rename it to:

```txt
config/clients/<client-id>.yaml
```

---

## Per-Client Config Rules

Each client config file should define:

- `client_id`: stable slug used across infra and workflows
- `client_type`: `demo` or `external`
- `borrower_app`: the app folder in `apps/borrower_pro`
- `aws.account_id`: target AWS account
- `aws.region`: deployment region
- `aws.github_environment`: GitHub environment name
- `deploy.auto_deploy`: only `true` for `demo-client`
- `deploy.platform_release`: current shared `admin_pro` and `backend_pro` release pin
- `deploy.borrower_release`: current borrower app release pin
- `ecr.*`: per-client repositories
- `ecs.*`: cluster, service, and migrations task names
- `secrets.app_secrets_arn`: runtime secrets ARN
- `storage.uploads_bucket`: client uploads bucket
- `domains.*`: admin, api, and borrower URLs
- `pro_tenant.slug`: deployment tenant slug
- `enabled_modules`: feature list for that client

Rules:

- keep secrets out of Git
- store only metadata here
- use one file per client
- treat this as the source of truth for deployment targeting

---

## First Demo Deployment

After AWS resources and the GitHub environment are ready:

1. Confirm your AWS identity locally if needed:

```bash
aws --profile truestack sts get-caller-identity
```

2. Bootstrap or update the demo infrastructure:

```bash
cd terraform/pro/clients/demo-client
AWS_PROFILE=truestack terraform init
AWS_PROFILE=truestack terraform apply -var-file=demo-client.tfvars
```

3. Verify `config/clients/demo-client.yaml` matches the real AWS resource names and domains created by Terraform.

4. Add the `AWS_ROLE_ARN` secret to the `pro-demo-client` GitHub environment.

5. Push the branch to `main` once the workflow and config are ready, or manually run:

```txt
Deploy Demo Client -> workflow_dispatch
```

6. For the first deployment, run:

- `db-migrate-and-seed`

This creates the Pro schema and seeds the default demo tenant owner.

7. Then run:

- `full`

This deploys:

- backend_pro
- admin_pro
- Demo_Client borrower app

8. Verify:

- `https://demo-admin.truestack.my`
- `https://demo-api.truestack.my/health`
- `https://demo.truestack.my`

---

## Recommended First-Cut Infrastructure Strategy

For `demo-client`, use the fastest path that mirrors the existing SaaS setup:

- same AWS account as current Truestack-hosted infrastructure
- same shared VPC approach
- same shared ALB approach if convenient
- separate ECS services
- separate database
- separate secrets
- separate uploads bucket
- separate domains
- separate GitHub environment role

This gets `demo-client` live quickly without locking future external clients into the same-account model.

For external clients later:

- same app packaging
- same client registry pattern
- same GitHub OIDC model
- different AWS account and per-client infra stack

---

## Adding a New Client Later

When onboarding a new client:

1. Create a borrower app folder under `apps/borrower_pro/<client>`.
2. Reuse shared borrower flows instead of copying logic.
3. Copy `config/clients/_template.yaml` to `config/clients/<client-id>.yaml`.
4. Create a GitHub environment for that client.
5. Provision the client's AWS account and resources using the same naming pattern.
6. Create ECR repos, ECS services, Secrets Manager secret, bucket, DB, and domains for that client.
7. Pin the desired shared Pro release for that client.
8. Deploy the client manually.

Only `demo-client` should auto-deploy by default.

External clients should be promoted manually.

---

## Operational Notes

- within a single client stack, `backend_pro`, `admin_pro`, and the borrower app share that client's `BETTER_AUTH_SECRET` and connect to that client's database.
- across clients, `backend_pro`, `admin_pro`, borrower apps, databases, secrets, and ECS services are **not shared**.
- if signing is enabled, each client also has its own on-prem Signing Gateway deployment and its own MTSA deployment on separate client-specific hardware or VM infrastructure.
- `backend_pro` should run with `PRODUCT_MODE=pro`.
- `PRO_TENANT_SLUG` should match the seeded or expected Pro tenant.
- the borrower app and admin app each proxy to `backend_pro`, so `BACKEND_URL` must point to the public API origin.
- use immutable image tags for real client rollouts even if `demo-client` tracks `latest`

---

## Next Recommended Step

After `demo-client` is working:

- extract the infra into a dedicated Pro Terraform lane
- use `deploy-pro.yml` for manual semver-based external client promotion
- keep `demo-client` as the canary deployment target for shared Pro changes

---

## External Client Onboarding Checklist

This checklist is the canonical reference for onboarding and releasing a new external `borrower_pro` client from the shared `truestack_kredit` monorepo.

Use this for clients like **Proficient Premium** where:

- `apps/admin_pro` is shared
- `apps/backend_pro` is shared
- `apps/signing-gateway` is shared
- `apps/borrower_pro/<client>` is the client-specific borrower shell
- infrastructure, secrets, database, and deployment are isolated per client
- the on-prem Signing Gateway and MTSA are also deployed separately per client on client-specific hardware / VM infrastructure

### Scope

- Applies to **external Pro clients**
- Assumes **one AWS account per client**
- Assumes **manual promotion** for production releases
- Assumes **semantic versioning** for release control
- Mobile is **out of scope for now**

### Release model

- Platform release tag: `pro-platform-v<semver>`
- Borrower release tag: `pro-borrower-<borrower_app>-v<semver>`
- Example platform tag: `pro-platform-v1.2.3`
- Example borrower tag: `pro-borrower-Proficient_Premium-v1.2.3`

#### Rules

- `platform_release` controls the shared Pro platform release used for `admin_pro`, `backend_pro`, and shared deployment logic.
- `borrower_release` controls the borrower app release only when it needs to diverge from the platform release.
- If `borrower_release` is omitted or equal to `platform_release`, deploy the borrower app from the same platform tag.
- External clients must use **pinned semver versions**. Do not use `latest`.
- Demo can continue acting as a canary lane, but external production clients should always be promoted by semver.

### CI/CD workflows

- `deploy-demo-client.yml`: auto-deploy canary lane for `demo-client`
- `deploy-pro.yml`: manual multi-client AWS app deploy for external clients
- `terraform-pro.yml`: client-aware Terraform plan/apply
- `deploy-signing-gateway.yml`: multi-client on-prem signing gateway deploy

#### Auto vs manual policy

- `demo-client`: backend, admin, borrower, and signing build/deploy automatically from `main`
- external clients: backend, admin, borrower, and signing are always manual via workflow dispatch
- shared code may trigger the demo lane automatically, but must never auto-promote an external client
- external-client-only borrower folders must not trigger `demo-client` borrower auto deployment

### AI guardrails

- Do not fork `admin_pro` per client.
- Do not fork `backend_pro` per client.
- Do not auto-deploy all external clients from `main`.
- Do not store secrets in `config/clients/*.yaml`.
- Do not use `latest` for external client production release pins.
- Do not assume the borrower app version equals the platform version without checking the client config.
- Do not change the client’s AWS account boundary to reuse SaaS infrastructure.

### 1. Create client identity

- [ ] Choose a stable machine `client_id` in kebab-case, for example `proficient-premium`
- [ ] Choose the borrower app folder name, for example `Proficient_Premium`
- [ ] Confirm the production domains:
- [ ] Admin domain
- [ ] API domain
- [ ] Borrower domain
- [ ] Signing gateway domain, if signing is enabled

### 2. Create client registry entry

- [ ] Copy `config/clients/_template.yaml` to `config/clients/<client_id>.yaml`
- [ ] Set `client_type: external`
- [ ] Set `borrower_app` to the borrower folder name
- [ ] Set `aws.account_id`
- [ ] Set `aws.region`
- [ ] Set `aws.github_environment` to `pro-<client_id>` or approved equivalent
- [ ] Set `deploy.auto_deploy: false`
- [ ] Set `deploy.platform_release` to a semver, for example `1.2.3`
- [ ] Set `deploy.borrower_release` to a semver, for example `1.2.3`
- [ ] Set ECR repository names
- [ ] Set ECS cluster/service/task names
- [ ] Set `secrets.app_secrets_arn`
- [ ] Set `storage.uploads_bucket`
- [ ] Set `pro_tenant.slug`
- [ ] Set `pro_tenant.name`
- [ ] Set `pro_tenant.type`
- [ ] Set `pro_tenant.license_number`
- [ ] Set `pro_tenant.registration_number`
- [ ] Set `pro_tenant.email`
- [ ] Set `pro_tenant.contact_number`
- [ ] Set `pro_tenant.business_address`
- [ ] Set `pro_tenant.seed_owner_email`
- [ ] Set `pro_tenant.seed_owner_name`
- [ ] Set `enabled_modules`

#### If signing is enabled

- [ ] Set `signing.gateway_hostname`
- [ ] Set `signing.ssh_host`
- [ ] Set `signing.tunnel_name`
- [ ] Set `signing.mtsa_env`
- [ ] Set `signing.backup_bucket_prefix`
- [ ] Set `signing.ecr_repository` if used by the workflow

### 3. Prepare the AWS account

- [ ] Create or confirm the dedicated AWS account for this client
- [ ] Bootstrap Terraform backend state in that account
- [ ] Create the GitHub Actions OIDC deploy role
- [ ] Grant the deploy role access to ECS, ECR, RDS, S3, Secrets Manager, Route53, ACM, and CloudWatch as required
- [ ] Confirm Route53 zone ownership strategy for the client domains
- [ ] Confirm ACM certificate plan for the client domains

### 4. Create GitHub Environment

- [ ] Create GitHub Environment matching `aws.github_environment`
- [ ] Add `AWS_ROLE_ARN`
- [ ] Add any extra environment-specific secrets required by deploy workflows

#### If signing is enabled

- [ ] Add `ONPREM_SSH_KEY`
- [ ] Add `CF_ACCESS_CLIENT_ID`
- [ ] Add `CF_ACCESS_CLIENT_SECRET`
- [ ] Add any on-prem deployment secrets still required by `deploy-signing-gateway.yml`

### 5. Provision Terraform client stack

- [ ] Copy `terraform/pro/clients/demo-client/` to `terraform/pro/clients/<client_id>/`
- [ ] Rename the `*.tfvars` file to match the client folder convention
- [ ] Update stack names, domains, bucket names, RDS identifiers, and ECS naming
- [ ] Run `terraform-pro.yml` with `client_id=<client_id>` and `action=plan`
- [ ] Review the plan
- [ ] Run `terraform-pro.yml` with `client_id=<client_id>` and `action=apply`
- [ ] Confirm ECS cluster, services, RDS, Secrets Manager, S3, DNS, and certificates exist

### 6. Populate runtime secrets

- [ ] Create or update the client’s AWS Secrets Manager secret referenced by `secrets.app_secrets_arn`
- [ ] Store database URL
- [ ] Store Better Auth secret
- [ ] Store email provider keys
- [ ] Store any integration credentials required by this client

#### If signing is enabled

- [ ] Add `signing_gateway_url`
- [ ] Add `signing_api_key`
- [ ] Add `signing_backup_bucket`

### 7. Create borrower app shell

- [ ] Copy `apps/borrower_pro/Demo_Client` to `apps/borrower_pro/<borrower_app>`
- [ ] Keep shared borrower logic in `apps/borrower_pro/components` and `apps/borrower_pro/lib`
- [ ] Change only client-specific shell concerns:
- [ ] Branding
- [ ] Copy/content
- [ ] Legal pages
- [ ] Public URL env wiring
- [ ] Theme storage key and client-facing strings
- [ ] Verify the borrower app builds via `apps/borrower_pro/Dockerfile`

### 8. Create release tags

- [ ] Decide the platform release version, for example `1.2.3`
- [ ] Create the platform Git tag: `pro-platform-v1.2.3`
- [ ] Push the platform tag
- [ ] If the borrower app needs an independent release, create `pro-borrower-<borrower_app>-v<semver>`
- [ ] Push the borrower tag if used
- [ ] Update `config/clients/<client_id>.yaml` release pins if the chosen release changed

#### Recommended semantic versioning policy

- [ ] `MAJOR`: breaking operational or deployment contract changes
- [ ] `MINOR`: backward-compatible features or modules
- [ ] `PATCH`: backward-compatible fixes only
- [ ] Use prerelease labels like `-rc.1` for staged validation

### 9. Deploy AWS-hosted Pro apps

- [ ] Run `deploy-pro.yml`
- [ ] Set `client_id=<client_id>`
- [ ] Set `action=full` for first deployment
- [ ] Set `platform_version=<semver>` or let it resolve from the client config
- [ ] Set `borrower_version=<semver>` only if the borrower app should differ from the platform release
- [ ] Leave `skip_migrations=false` unless you have a specific reason
- [ ] Confirm backend service reaches stable state
- [ ] Confirm admin service reaches stable state
- [ ] Confirm borrower service reaches stable state

#### Database actions

- [ ] Use `action=db-migrate` for migrations only
- [ ] Use `action=db-seed` for seed only
- [ ] Use `action=db-migrate-and-seed` when both are needed
- [ ] Use `action=db-reset-and-seed` only in safe non-production situations

#### Important note

- [ ] The seed task reads tenant and owner values from `config/clients/<client>.yaml` via workflow-provided env vars. Demo-compatible fallback values still exist as a safety net, but do not rely on them for a new client.
- [ ] `domains.admin`, `domains.api`, and `domains.borrower` are not database seed fields. They are the public hostnames used for build args, runtime URLs, CORS, and auth callbacks.
- [ ] If Cloudflare fronts the client, keep these domain values as the real public hostnames seen by users. Cloudflare is the DNS/proxy layer in front of them, not a replacement for them in config.

### 10. Cloudflare / Zero Trust setup

This is part of the standard workflow for signing-enabled clients. Follow the same pattern used for `demo-client`.

Reference pattern:

- zone: `truestack.my`
- signing hostname example: `demo-sign.truestack.my`
- SSH hostname example: `ssh-sign-demo.truestack.my`
- tunnel name example: `demo-onprem`

Required outcome:

- the public signing hostname routes through a Cloudflare Tunnel to the on-prem Signing Gateway
- the SSH hostname routes through the same tunnel to the host SSH daemon
- Cloudflare Access protects both the signing API and the SSH path
- GitHub Actions and `backend_pro` authenticate with Cloudflare Access using service tokens

Checklist:

- [ ] Confirm the DNS zone is active in Cloudflare before creating Access apps
- [ ] If using API/CLI automation, create or confirm a Cloudflare API token with:
- [ ] `Zone > DNS > Edit`
- [ ] `Account > Cloudflare Tunnel > Edit`
- [ ] `Account > Access: Apps and Policies > Edit`
- [ ] Create tunnel: `<client-id>-onprem`
- [ ] Configure public hostnames on the tunnel:
- [ ] `<client-id>-sign.truestack.my` -> `http://signing-gateway:3100`
- [ ] `ssh-sign-<client-id>.truestack.my` -> `ssh://host.docker.internal:22`
- [ ] Create or verify proxied DNS CNAME records pointing at `<tunnel-id>.cfargotunnel.com`
- [ ] Create one Cloudflare Access service token for this client
- [ ] Save the service token Client ID and Client Secret immediately
- [ ] Create Cloudflare Access application for SSH hostname with service-token-only policy
- [ ] Create Cloudflare Access application for signing API hostname with service-token-only policy
- [ ] Verify the signing API returns `403` without token and `200` with the service token headers
- [ ] Store `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` in the client GitHub Environment
- [ ] Store `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` in the client AWS Secrets Manager secret for `backend_pro`
- [ ] Store the tunnel token as `ONPREM_CF_TUNNEL_TOKEN` in the client GitHub Environment

Important notes:

- The `truestack.my` zone must be **active** in Cloudflare before Access applications can be created. If the zone is still pending, update nameservers at the registrar and wait for propagation.
- Cloudflare may auto-create the CNAME records when the tunnel and hostnames are configured in the dashboard. If using the API, verify or create the DNS records explicitly.
- Use the **same Cloudflare Access service token** for both:
- GitHub Actions SSH deployment through the tunnel
- `backend_pro` runtime calls to the signing API
- `cloudflared` runs inside Docker, so the SSH route must target `host.docker.internal:22`, and the production compose config must preserve the `extra_hosts: ["host.docker.internal:host-gateway"]` mapping.
- Increase Linux UDP buffer sizes before starting `cloudflared`; this was required for tunnel stability in the demo-client setup.
- If Cloudflare is fronting the public hostnames, keep `domains.*` in `config/clients/<client>.yaml` as the real public origins used by users and runtime configuration.
- Verification pattern:
- without Access headers, the signing API should return `403`
- with `CF-Access-Client-Id` and `CF-Access-Client-Secret`, the health endpoint should return `200`

### 11. Provision on-prem signing stack

- [ ] Provision the on-prem server or VM
- [ ] Install Docker and Docker Compose
- [ ] Increase UDP buffer sizes for Cloudflare Tunnel QUIC stability before starting `cloudflared`
- [ ] Load the MTSA image from the Trustgate tarball
- [ ] Create `/opt/signing-stack/.env`
- [ ] Set MTSA credentials
- [ ] Set the signing API key
- [ ] Set the Cloudflare Tunnel token from Step 10
- [ ] Set any GHCR or ECR pull credentials required by the deploy path
- [ ] Start `cloudflared` and MTSA first so the tunnel is reachable before the first CI/CD deployment
- [ ] Use a minimal `.env` for the first start if the full CI-managed `.env` has not been written yet
- [ ] Verify the tunnel shows healthy in Cloudflare Zero Trust
- [ ] Verify `docker logs cloudflared` shows a healthy registered connection

### 12. Deploy signing gateway

- [ ] Run `deploy-signing-gateway.yml`
- [ ] Set `client_id=<client_id>`
- [ ] Set `platform_version=<semver>` or let it resolve from the client config
- [ ] Use `action=full` for normal deploys
- [ ] Use `action=deploy-only` only when the image tag already exists in the target registry
- [ ] Confirm on-prem deployment completes through the Cloudflare Tunnel SSH path
- [ ] Confirm the gateway health endpoint is healthy
- [ ] Confirm `backend_pro` can reach the gateway URL

### 13. Validate the deployed environment

- [ ] Admin app loads on the client domain
- [ ] Borrower app loads on the client domain
- [ ] API health check passes
- [ ] Auth/session flow works
- [ ] File upload path works
- [ ] Email provider works
- [ ] Core borrower onboarding works
- [ ] Loan application flow works
- [ ] Repayment flow works if enabled

#### If signing is enabled

- [ ] Agreement generation works
- [ ] Gateway health is healthy
- [ ] MTSA connectivity works
- [ ] OTP flow works in the configured environment
- [ ] Signing callback/reconciliation path works
- [ ] Download of signed documents works

### 14. Rollback plan

- [ ] Keep the previous known-good `platform_release`
- [ ] Keep the previous known-good `borrower_release`
- [ ] To roll back AWS apps, rerun `deploy-pro.yml` with the previous semver
- [ ] To roll back the signing gateway, rerun `deploy-signing-gateway.yml` with the previous semver
- [ ] Do not use mutable tags like `latest` as rollback targets

### 15. Future AI instructions

When an AI agent is asked to onboard a new Pro client, it should:

- [ ] Start from this checklist
- [ ] Read `docs/architecture_plan.md`
- [ ] Read `config/clients/_template.yaml`
- [ ] Read `docs/signing-gateway-client-onboarding.md` and `docs/pro_onprem_pki_signing_recommendations.md` when signing is enabled
- [ ] Confirm whether the client is external or demo
- [ ] Confirm whether signing is enabled
- [ ] Confirm the target semver release(s)
- [ ] Confirm the new client’s AWS account, GitHub Environment, and domains
- [ ] Prefer reusing `deploy-pro.yml`, `terraform-pro.yml`, and `deploy-signing-gateway.yml`
- [ ] Avoid inventing a new per-client architecture unless explicitly approved
