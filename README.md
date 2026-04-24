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

Shared building blocks include configurable **interest models** (flat, declining balance, effective rate), **schedules & disbursement**, **audit logging**, **exports**, and **notifications** (email, WhatsApp, and in-app where applicable).

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
- **Pentesting** for web, app, database, and backend (included in Pro pricing).

Repository structure, deployment boundaries, and signing architecture: **[docs/architecture_plan.md](docs/architecture_plan.md)**.

## Monorepo overview

| Lane | Purpose | Primary apps |
|------|---------|----------------|
| **SaaS** | Pooled multi-tenant product; single deployment in TrueStack’s AWS account | `apps/admin`, `apps/backend` |
| **Pro** | Dedicated stack per client; shared `admin_pro` / `backend_pro`, per-client borrower UI | `apps/admin_pro`, `apps/backend_pro`, `apps/borrower_pro/<client>` |
| **Mobile (Pro)** | Native borrower app (Expo / React Native) consuming `backend_pro` and Better Auth via borrower web | `apps/borrower_pro_mobile/<client>` (e.g. `Demo_Client`) |

**Design principle (from the architecture plan):** *share code, not production runtime* — SaaS stays one pooled deployment; each Pro client gets isolated infrastructure while reusing the same platform repositories.

Shared libraries live under `packages/` (e.g. `@kredit/shared`, `@kredit/borrower`). Optional on-prem **Signing Gateway** code: `apps/signing-gateway/` (see architecture doc).

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

## Interest models

The schedule engine supports:

- **Flat rate** — total interest from principal × rate × term / 12
- **Declining balance** — interest on outstanding balance (EMI-style)
- **Effective rate** — declining-balance style with effective annual rate conversion

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
