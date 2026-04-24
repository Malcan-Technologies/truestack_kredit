# TrueKredit

**TrueKredit** is the loan-management product built and operated by **[TrueStack](https://truestack.my)** — a Malaysian technology company focused on compliant, multi-tenant financial software. This repository is TrueStack’s monorepo for **TrueKredit SaaS** (pooled multi-tenant platform) and **TrueKredit Pro** (dedicated deployments for licensed digital lenders), including web admin, borrower experiences, and native mobile apps.

### Tech stack

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-55-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.83-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Zod](https://img.shields.io/badge/Zod-schema-3E67B3?style=flat-square)](https://zod.dev/)
[![Better Auth](https://img.shields.io/badge/Better_Auth-auth-000000?style=flat-square)](https://www.better-auth.com/)
[![Vitest](https://img.shields.io/badge/Vitest-test-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![AWS](https://img.shields.io/badge/AWS-deploy-232F3E?style=flat-square&logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/)

## What this system is

**TrueKredit** spans two delivery models in this monorepo:

- **SaaS** — multi-tenant admin and API (`apps/admin`, `apps/backend`): pooled runtime, shared database, strict tenant isolation; origination, servicing, billing, and compliance features for many lenders on one stack.
- **Pro** — dedicated deployment per licensed client (`admin_pro`, `backend_pro`, per-client borrower web and mobile): same platform codebase, isolated AWS account, database, and secrets; see [architecture plan](docs/architecture_plan.md) for lanes, signing, and CI/CD.

Shared building blocks include **schedules & disbursement**, **audit logging**, **exports**, and **notifications** (email, WhatsApp, and in-app where applicable).

### TrueKredit Pro — product features

End-to-end **loan management and origination**, designed for alignment with **KPKT digital licence** requirements for online money lending.  
**More detail:** [TrueStack — digital licence services](https://www.truestack.my/services/digital-license)

**Admin (staff)**

| Area | Capabilities |
|------|----------------|
| **Portfolio & intelligence** | Executive dashboard — KPIs, trends, portfolio risk signals, action queues. |
| **Borrower management** | Directory, create/edit records, full servicing profile; personal & corporate; optional **e-KYC** for walk-in customers (**RM4** per check, no integration fees). |
| **Loan origination** | Application pipeline, L1/L2 review, online & walk-in; Book A / Book B; counter-offer & amendment flows. |
| **Attestation** | Meeting scheduling, per-loan views, staff availability; **Google Meet** & **Google Calendar** (Google Workspace). |
| **Digital signing** (on-prem) | Automated **Jadual J / K**; CA-backed certificates; witness & company rep signing; walk-in path (generate, print, upload). |
| **Servicing & collections** | Active loan book & detail (Book A / B); payment & early-settlement approvals; late fee, arrears, and default handling. |
| **Product & compliance** | Product catalogue & settings; **iDeal** (CSV), **Lampiran A** (PDF) generation/export. |
| **Communications** | Granular notifications, platform announcements, automated email. |
| **Tools** | Loan calculator, signature verification, help, contact. |
| **Governance** | Tenant/org settings (profile, branding, operations), admin activity logs, RBAC. |

**Borrower (web)**

| Area | Capabilities |
|------|----------------|
| **Account & security** | Sign-in, registration, email verification, password recovery, **2FA**, security setup, passkeys. |
| **Profile & onboarding** | Wizard, profile maintenance, identity/eKYC; **multi-profile** — one personal account, unlimited corporate profiles per borrower. |
| **Origination** | Apply flow, application list/detail, documents, offers/counter-offers, withdrawal where allowed. |
| **Servicing** | Loan center (applications + loans, journey filters), payments, early settlement; late fee / arrears / default with automated notifications. |
| **Attestation & agreements** | Pending agreements, attestation video, schedule meetings. |
| **Digital signing** (on-prem) | e-KYC, certificate request, in-app **PKI** signing (e.g. email OTP) with approved CA. |
| **Notifications & support** | In-app notifications, help center, legal/about as needed. |
| **Trust & legal** | Terms, privacy, PDPA, cookies, security; invitation accept flow. |

**Mobile app (Pro)**

- **Android & iOS** (Expo / React Native) — borrower-facing parity with the web borrower module for core flows; **included in Pro pricing**.

**Infrastructure**

- **AWS (Malaysia region)** for cloud hosting and data residency.
- **On-prem signing stack** at the client site (hardware/setup part of commercial offering) for the digital signing workflow.
- **Integrations:** **MSC Trustgate** (PKI / CA), **TrueIdentity** (e-KYC).

**Security**

- **Cloudflare Tunnel** between cloud and on-prem signing; **VPC** segmentation for cloud workloads.
- **Encryption** at rest in cloud and on-prem; **automated daily backups** with restore paths.
- **Pentesting** for web, app, database, and backend (included in Pro pricing) — operator runbook: [`docs/pro_client_pentest_access.md`](docs/pro_client_pentest_access.md).

Repository structure, deployment boundaries, and signing architecture: **[docs/architecture_plan.md](docs/architecture_plan.md)**.

## Monorepo overview

| Lane | Purpose | Primary apps |
|------|---------|----------------|
| **SaaS** | Pooled multi-tenant product; single deployment in TrueStack’s AWS account | `apps/admin`, `apps/backend` |
| **Pro** | Dedicated stack per client; shared `admin_pro` / `backend_pro`, per-client borrower UI | `apps/admin_pro`, `apps/backend_pro`, `apps/borrower_pro/<client>` |
| **Mobile (Pro)** | Native borrower app (Expo / React Native) consuming `backend_pro` and Better Auth via borrower web | `apps/borrower_pro_mobile/<client>` (e.g. `Demo_Client`) |

**Design principle (from the architecture plan):** *share code, not production runtime* — SaaS stays one pooled deployment; each Pro client gets isolated infrastructure while reusing the same platform repositories.

Shared libraries live under `packages/` (e.g. `@kredit/shared`, `@kredit/borrower`). Optional on-prem **Signing Gateway** code: `apps/signing-gateway/` (see architecture doc).

### Releases and Pro rollout

- **SaaS** ships from `main` on its own deploy lane (pooled production).
- **Pro platform** releases are identified by **immutable Git tags** (e.g. `pro-platform-v<semver>`). Borrower-only drops can use tags such as `pro-borrower-<borrower_app>-v<semver>` when they diverge from the platform tag. Details and workflow names live in [`docs/architecture_plan.md`](docs/architecture_plan.md) (versioning & CI/CD).
- **Per-client Pro lanes:** each external client has an **isolated** deployment and pins **`platform_release`** / **`borrower_release`** (and related metadata) in [`config/clients/`](config/clients/) — promotions are **manual**, not “every merge to `main`”.
- **Demo client** (`client_id` **demo-client**, borrower app **`Demo_Client`**) is TrueStack’s **staging / canary for Pro**: it **auto-deploys from `main`** when shared Pro code or `Demo_Client` (and shared layers it uses) change, so migrations and behaviour are exercised before external clients adopt a pinned release.

### Semantic versioning (how we use semver)

Versions follow **`MAJOR.MINOR.PATCH`** (and optional pre-release, e.g. `1.3.0-rc.1`), per [Semantic Versioning 2.0.0](https://semver.org/).

| Bump | When |
|------|------|
| **MAJOR** | Breaking changes for operators or integrations (e.g. incompatible API, migration that requires a coordinated cut, removed behaviour clients rely on). |
| **MINOR** | Backward-compatible additions (features, endpoints, optional fields) — existing clients keep working without change. |
| **PATCH** | Backward-compatible fixes (bugs, security patches, internal refactors with no contract change). |

**In this repo**

- **Pro deploy contract** is the **semver string** pinned per client (e.g. `platform_release`, `borrower_release` in `config/clients/`). **Rollback** means redeploying a **previous semver**, not “whatever `latest` is”.
- **Git tags** map to that contract: `pro-platform-v<semver>` for shared `admin_pro` / `backend_pro` (and aligned artefacts); `pro-borrower-<borrower_app>-v<semver>` when a borrower app (web/mobile) ships **independently** of the platform tag.
- **Docker / CI** may also tag images with **Git SHA** for traceability; promotion and client pins should still reference **semver** so releases stay human-readable and comparable.
- **SaaS** may use its own tagging or deploy-from-`main` practice; **Pro external clients** should not float on `main` — they advance only when deliberately pinned to a new semver.

## Pro client prerequisites

What **external Pro clients** (and operators) typically need **before** go-live. Full steps, checklists, and Terraform behaviour: **[`docs/pro_client_deployment_guide.md`](docs/pro_client_deployment_guide.md)**.

### Accounts & automation

| Prerequisite | Purpose |
|--------------|---------|
| **Dedicated AWS account** | Isolated Pro stack (VPC, ALB, ECS, RDS, S3, Secrets Manager, ACM) — external clients use **`dedicated`** networking in Terraform; `demo-client` may use **`shared`** VPC/ALB inside TrueStack’s account. |
| **Terraform remote state** | S3 + lock table (or equivalent) **in that account**, bootstrapped before `terraform-pro` applies. |
| **GitHub Actions OIDC role** | Deploy role in the client account; stored as `AWS_ROLE_ARN` in a **per-client GitHub Environment** (e.g. `pro-<client_id>`). |
| **GitHub Environment secrets** | At minimum `AWS_ROLE_ARN`; if **signing** is enabled, also on-prem deploy + Cloudflare Access material (e.g. `ONPREM_SSH_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) per the deployment guide. |
| **Client registry** | Non-secret metadata in [`config/clients/<client_id>.yaml`](config/clients/) (domains, ECS/ECR names, release pins, `secrets.app_secrets_arn`, etc.) — **never** commit credentials. |

### Domains, DNS, and edge

- **Public hostnames** for **admin**, **API**, and **borrower** apps (and **signing** hostname if applicable), with TLS (ACM or your CA).
- Many stacks use **Cloudflare** (or another DNS/WAF provider) in front of the ALB: plan for **DNS validation** records, proxy/WAF rules, and (for signing) **Tunnel + Zero Trust** as described in the deployment guide.

### Runtime secrets & third-party services

Populate the client’s **AWS Secrets Manager** app secret (ARN in client YAML). Keys depend on enabled modules; the deployment guide lists examples such as **database**, **Better Auth / JWT**, **webhooks**, **email (Resend)**, and **TrueIdentity** (e-KYC URLs and webhook secrets). Only include what the deployment actually uses.

**Product / compliance integrations** you contract for separately:

| Service | Typical use |
|---------|-------------|
| **TrueIdentity** | e-KYC / identity verification (`trueidentity_*` and related keys in Secrets Manager). |
| **MSC Trustgate (MTSA)** | PKI signing — runs **on-prem** with Trustgate-supplied image/credentials; not a cloud API key in the same sense. |
| **Google Workspace** | **Google Meet** and **Google Calendar** for attestation scheduling (staff Google accounts). |
| **Resend** (or aligned provider) | Transactional email (`resend_*` keys). |

### On-prem signing (if `signing` is enabled)

- **Hardware or VM** at the client site with Docker (and Compose), **Cloudflare Tunnel** (`cloudflared`), Trustgate **MTSA** image loaded from tarball, and local **Signing Gateway** config/secrets.
- **GHCR** (or agreed registry) credentials on the server to pull the gateway image; alignment between **signing API key** and **gateway URL** in AWS Secrets Manager and on-prem `.env`.

### Penetration testing (assessor access)

For **external security assessments** on a deployed Pro stack, use **[`docs/pro_client_pentest_access.md`](docs/pro_client_pentest_access.md)** — read-only, **time-bounded** access for vendors (AWS console/API, optional **private RDS** via SSM port forwarding, Cloudflare allowlisting).

**Short operator guide**

1. **Scope** — Agree in-scope URLs (borrower, admin, API), window, and whether **RDS**, **signing**, and **on-prem** are in scope; avoid handing over production app bundles or CI/service tokens unless explicitly required.
2. **Edge** — If traffic is behind **Cloudflare**, add temporary **IP allow / WAF** relief for the firm’s egress IPs for the test window; roll back after.
3. **AWS** — Create a **dedicated** assessor IAM user or role with **`ReadOnlyAccess`** (or tighter) and **`secretsmanager:GetSecretValue`** only on a **separate** “pentest read-only DB URL” secret — **not** the main app secret.
4. **Database** — RDS sits in **private** subnets; preferred path is **ECS + SSM port forwarding** (`scripts/pentest/connect-db-via-ecs-ssm.sh`, see [`scripts/pentest/README.md`](scripts/pentest/README.md)) so assessors use `psql` via `127.0.0.1` after starting the tunnel. Alternatives (jump host, temporary SG rule to vendor `/32` IPs) are documented in the pentest runbook.
5. **Teardown** — Remove allowlists, revoke IAM keys / policies, delete or disable the pentest DB secret and **`pentest_readonly`** DB role, and strip any temporary RDS rules.

## Repository layout

```text
truestack_kredit/
├── apps/
│   ├── admin/                 # SaaS tenant admin (Next.js)
│   ├── backend/               # SaaS API (Express)
│   ├── admin_pro/             # Pro staff admin (Next.js)
│   ├── backend_pro/           # Pro API (Express; separate Prisma schema from SaaS)
│   ├── borrower_pro/          # Per-client borrower web (Next.js), e.g. Demo_Client
│   ├── borrower_pro_mobile/   # Per-client borrower native app (Expo), e.g. Demo_Client
│   └── signing-gateway/       # On-prem PKI signing service (Pro; shared codebase)
├── packages/
│   ├── shared/                # Shared types and constants
│   └── borrower/              # Borrower API contracts, schemas, clients
├── config/clients/            # Pro client registry (non-secret metadata)
├── docs/                      # Architecture, runbooks, planning
│   └── architecture_plan.md   # Approved reference architecture
├── docker-compose.yml         # Local PostgreSQL, MinIO, etc.
└── package.json               # Workspace root scripts
```

## Prerequisites

- **Node.js** 20+
- **Docker** & Docker Compose (for local database and object storage)
- **npm** (workspace scripts at repo root)
- **Pro mobile:** Xcode (iOS), Android Studio / SDK (Android), and [Expo](https://expo.dev) tooling as needed for device builds

---

## Development startup guide

### 1. Install and start infrastructure

From the repository root:

```bash
npm install
npm run docker:up
```

This brings up PostgreSQL and MinIO (and any other services defined in `docker-compose.yml`).

### 2. TrueKredit SaaS (admin + backend)

Typical local flow:

```bash
# Backend
cd apps/backend
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```bash
# Admin UI — configure `.env.local` if needed (API URL, app URL, auth secret aligned with backend)
cd apps/admin
npm run dev
```

**Access:** admin UI at [http://localhost:3000](http://localhost:3000) (port may vary; check the app’s `package.json` and env).

**Demo login (seeded):**

| Field    | Value          |
|----------|----------------|
| Email    | admin@demo.com |
| Password | Demo@123       |

Root shortcuts:

| Command | Description |
|---------|-------------|
| `npm run dev:backend` | SaaS API only |
| `npm run dev:admin` | SaaS admin only |
| `npm run db:migrate` | SaaS migrations (via `apps/backend`) |
| `npm run db:seed` | SaaS seed |

### 3. TrueKredit Pro (admin + API + borrower web)

Pro uses **separate** apps and database from SaaS.

| App | Typical port | Root command |
|-----|--------------|--------------|
| `backend_pro` | `4001` (see `apps/backend_pro/.env.example`) | `npm run dev:backend_pro` |
| `admin_pro` | `3005` | `npm run dev:admin_pro` |
| `borrower_pro` (Demo_Client) | `3006` | `npm run dev:borrower_pro` |

**Setup:**

1. Configure `apps/backend_pro/.env` from `.env.example`. Include `CORS_ORIGINS` with `http://localhost:3005` (and borrower origin). Set `PRODUCT_MODE=pro` when using public TrueStack KYC flows on staff borrower verification.
2. Copy `apps/admin_pro/.env.example` to `apps/admin_pro/.env`. Point `BACKEND_URL` at `backend_pro` (e.g. `http://localhost:4001`). Set `NEXT_PUBLIC_PRODUCT_MODE=pro` to match the backend.
3. Configure `apps/borrower_pro/Demo_Client` env files per that app’s `.env.example` so the borrower web origin matches what mobile and auth expect.

**Database (Pro):**

```bash
npm run db:generate:pro
npm run db:migrate:pro
npm run db:seed:pro
```

**Product notes:** Pro assumes a constrained tenant/staff model — see [`docs/admin_pro_product_notes.md`](docs/admin_pro_product_notes.md).

**All-in-one Pro + mobile (optional):** from repo root, `npm run dev:demo_client` runs `backend_pro`, `admin_pro`, borrower web, and the Demo mobile workspace concurrently (see root `package.json`).

### 4. Borrower mobile app (Expo)

The Demo mobile workspace is `apps/borrower_pro_mobile/Demo_Client` (npm workspace name `demo_client`).

```bash
# From repo root — after packages are built if needed
npm run dev:borrower_pro_mobile
```

Or from the app folder:

```bash
cd apps/borrower_pro_mobile/Demo_Client
cp .env.example .env
# Set EXPO_PUBLIC_BACKEND_URL and EXPO_PUBLIC_AUTH_BASE_URL to backend_pro and borrower web origins
npm run dev
```

Mobile talks to **`backend_pro`** and uses the **borrower web** URL as the Better Auth base (same pattern as `EXPO_PUBLIC_*` in `.env.example`). For Android emulators or physical devices, follow the comments in `apps/borrower_pro_mobile/Demo_Client/.env.example` (ADB reverse, LAN IP, or tunneled HTTPS).

### 5. Signing Gateway (Pro, optional local)

For PKI signing against MTSA in development, use Docker Compose under `apps/signing-gateway/` as described in [docs/architecture_plan.md](docs/architecture_plan.md) (Section 12.15). Point `backend_pro` signing env vars at the local gateway when enabled.

---

## Common root commands

| Command | Description |
|---------|-------------|
| `npm run docker:up` / `docker:down` | Start / stop Docker services |
| `npm run dev:backend` / `dev:admin` | SaaS API / admin |
| `npm run dev:backend_pro` / `dev:admin_pro` / `dev:borrower_pro` | Pro stack pieces |
| `npm run dev:borrower_pro_mobile` | Expo dev server for Demo mobile |
| `npm run dev:demo_client` | Pro backend + admin + borrower web + mobile together |
| `npm run db:migrate` / `db:seed` | SaaS DB |
| `npm run db:migrate:pro` / `db:seed:pro` | Pro DB |
| `npm run build:packages` | Build shared workspace packages |

---

## API overview (SaaS backend)

High-level route groups (see OpenAPI or route files under `apps/backend` for the full set):

- **Auth** — register, login, refresh, session
- **Tenants & users** — current tenant, user management
- **Borrowers & products** — CRUD and configuration
- **Loans** — applications, approval, disbursement, schedules
- **Billing** — subscriptions, invoices, payments
- **Compliance** — audit logs, exports, reports

Pro APIs live in `apps/backend_pro` with a separate Prisma schema; do not point Pro clients at the SaaS database.

---

## Environment variables (quick reference)

**SaaS backend** (`apps/backend/.env`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `PORT`, storage (`STORAGE_TYPE`, MinIO/S3 as needed).

**SaaS admin** (`apps/admin/.env.local`): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, auth secret aligned with backend.

**Pro** — use each app’s `.env.example` (`backend_pro`, `admin_pro`, `borrower_pro`, `borrower_pro_mobile`).

---

## Branding

**TrueStack** delivers TrueKredit as part of its product line; customer-facing Pro apps may use client-specific visual identity while sharing platform behavior.

Default **TrueKredit web** accents (dark theme, orange gradient) — see `docs/planning/brand.md` for full guidelines:

- **Background:** `#0B0B0D`
- **Surface:** `#131316`
- **Accent:** linear gradient `#FF8A00` → `#FF4D00`
- **Fonts:** Rethink Sans (headings), Inter (body)

---

## License

Private — All rights reserved.
