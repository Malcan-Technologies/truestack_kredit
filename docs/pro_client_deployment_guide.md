# Pro Client Deployment Guide

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
- `apps/borrower_pro/**`
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
- `apps/borrower_pro/**` updates `truekredit-demo-client-borrower`

In addition:

- `packages/**` is treated as shared code, so it can trigger rebuilds for more than one Pro app
- `config/clients/demo-client.yaml` can trigger all 3 because it changes deployment targeting/config

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

- `backend_pro` and borrower/admin apps share `BETTER_AUTH_SECRET` and the same database.
- `backend_pro` should run with `PRODUCT_MODE=pro`.
- `PRO_TENANT_SLUG` should match the seeded or expected Pro tenant.
- the borrower app and admin app each proxy to `backend_pro`, so `BACKEND_URL` must point to the public API origin.
- use immutable image tags for real client rollouts even if `demo-client` tracks `latest`

---

## Next Recommended Step

After `demo-client` is working:

- extract the infra into a dedicated Pro Terraform lane
- generalize the deployment workflow from `demo-client` to a reusable per-client `deploy-pro.yml`
- keep `demo-client` as the canary deployment target for shared Pro changes
