# backend_pro Setup Guide

Backend for TrueKredit Pro — digital license KPKT borrowing. Runs on port 4001 with a separate PostgreSQL database on port 5434.

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- npm workspaces (root `truestack_kredit`)

## 1. Database

Start the Pro PostgreSQL container:

```bash
# From repo root
docker-compose up -d

# Pro DB: postgres_pro on port 5434
# DB: kredit_pro_dev, user: kredit_pro, password: kredit_pro_dev
```

## 2. Environment

Copy `.env.example` to `.env` in `apps/backend_pro/`:

```bash
cp apps/backend_pro/.env.example apps/backend_pro/.env
```

Edit `.env` and set:

- `DATABASE_URL` — PostgreSQL connection string (default: `postgresql://kredit_pro:kredit_pro_dev@localhost:5434/kredit_pro_dev`)
- `BETTER_AUTH_SECRET` — Must match `BETTER_AUTH_SECRET` in borrower_pro (Demo_Client) for auth to work
- `CORS_ORIGINS` — Include `http://localhost:3006` for Demo_Client
- `FRONTEND_URL` — `http://localhost:3006` for local dev

## 3. Prisma

Generate client and apply schema:

```bash
# From repo root
npm run db:generate:pro
npm run db:push:pro

# Or from apps/backend_pro
npx prisma generate
npx prisma db push
```

Optional: run migrations or seed:

```bash
npm run db:migrate:pro
npm run db:seed:pro
```

## 4. Run

```bash
# From repo root
npm run dev:backend_pro

# Or from apps/backend_pro
npm run dev
```

Backend runs at `http://localhost:4001`.

## 5. Local Development Order

1. Start Docker: `docker-compose up -d`
2. Start backend_pro: `npm run dev:backend_pro`
3. Start Demo_Client: `npm run dev:borrower_pro`

Demo_Client runs at `http://localhost:3006`, uses backend_pro for auth (DB) and future API calls. Ensure `BETTER_AUTH_SECRET` matches between both apps.

## 6. Borrower frontend (`borrower_pro`) layout

The borrower UI is split for **reuse across white-label hosts**:

| Path | Role |
|------|------|
| `apps/borrower_pro/components/` | Shared React components: ShadCN `ui/`, loan center, application flows, **ThemeProvider**, **onboarding wizard**, etc. |
| `apps/borrower_pro/lib/` | Shared clients and types: auth, loans, applications, form validation, **`onboarding-storage-keys.ts`** (localStorage keys aligned with onboarding). |
| `apps/borrower_pro/Demo_Client/` | **Host app only**: App Router pages, `globals.css`, Better Auth route + Prisma adapter (`lib/auth-server.ts`), BFF proxy to this backend (`app/api/proxy`), `lib/version.ts`. |

A second Pro client would add another Next app folder that reuses `@borrower_pro/components` and `@borrower_pro/lib` the same way; only env, branding, and auth DB wiring stay per deployment.

When adding borrower-facing features, prefer extending `components/` or `lib/` under `borrower_pro`, not copying into `Demo_Client`.
