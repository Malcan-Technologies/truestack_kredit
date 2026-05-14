# TrueKredit Pro — Borrower Product (Demo_Client)

**Purpose**: Product blueprint for the borrower-facing app. Borrowers register to borrow money online from money lenders (digital license KPKT).

**Status**: Phase 1 — Sign in & Sign up with Better Auth. backend_pro and borrower_pro (Demo_Client) setup.

---

## 1) Product Summary

**TrueKredit Pro** is the digital license KPKT borrowing product. Borrowers use the borrower_pro frontend to:

- Register (sign up) to become a borrower
- Sign in to access their account
- (Future) Apply for loans, view repayments, manage profile

Each Pro client (e.g. Demo_Client) has their own borrower frontend. Shared components (ShadCN, forms, flows) live at `apps/borrower_pro/components/` — no duplication per client.

---

## 2) Architecture Overview

### Project Structure

```
truestack_kredit/
├── apps/
│   ├── backend_pro/              # Pro backend (copy of backend, adapted)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   ├── lib/              # auth (Better Auth), config, prisma
│   │   │   └── ...
│   │   └── prisma/
│   │
│   ├── borrower_pro/
│   │   ├── components/           # SHARED: ShadCN, UI primitives (all clients use)
│   │   │   └── ui/
│   │   ├── lib/                  # SHARED: utils, theme (optional)
│   │   │
│   │   └── Demo_Client/          # Client-specific app (this folder)
│   │       ├── app/
│   │       │   ├── (auth)/       # sign-in, sign-up
│   │       │   └── ...
│   │       ├── components/       # Client-specific components only
│   │       ├── lib/              # Auth client, API utils
│   │       └── docs/planning/
│   │
│   └── admin_pro/                # (Future) Pro admin
│
└── packages/
    └── shared/                   # Types, enums, constants
```

### Shared vs Client-Specific

| Location | Purpose |
|----------|---------|
| `borrower_pro/components/` | ShadCN, shared UI — import, do not copy |
| `borrower_pro/Demo_Client/` | Demo_Client app — branding, pages, client-specific logic |

---

## 3) Core Stack

- **Frontend**: Next.js 16.x, TypeScript, Tailwind, ShadCN UI (from shared), Sonner
- **Backend**: backend_pro — Express, Prisma 7, PostgreSQL
- **Auth**: Better Auth (sign in, sign up, session cookies)
- **Deployment**: Per-client; each client has own URL, AWS account, DB

---

## 4) Phase 1: Sign In & Sign Up

### Scope

- **Sign up**: Borrower registers (email, password, basic info)
- **Sign in**: Borrower logs in
- **Auth**: Better Auth on backend_pro; Better Auth client on borrower_pro

### Pages

| Route | Purpose |
|-------|---------|
| `/sign-in` | Sign in form |
| `/sign-up` | Sign up form |
| `/` | Landing or redirect to sign-in/dashboard |

### Backend (backend_pro)

- Better Auth instance (Prisma adapter)
- Borrower user model or extend User for borrowers
- Session verification middleware

### Frontend (Demo_Client)

- Better Auth client (no admin plugin)
- Sign-in and sign-up forms using shared components
- Import UI from `../components` or `@/borrower_pro/components`

---

## 5) Local Development

```bash
# Start database
docker-compose up -d

# Backend_pro
cd apps/backend_pro
npx prisma db push   # or migrate
npm run dev          # e.g. port 4001

# Borrower_pro (Demo_Client)
cd apps/borrower_pro/Demo_Client
npm run dev          # e.g. port 3001
```

**Env**: `NEXT_PUBLIC_BACKEND_URL`, `BETTER_AUTH_SECRET` must match between frontend and backend.

---

## 6) Adding a New Client

1. Copy `Demo_Client` folder → `ClientName/`
2. Update branding in `docs/planning/brand.md`
3. Update `.cursor/rules` if client has specific requirements
4. Shared components remain in `borrower_pro/components/` — no changes needed

---

## 7) Future Phases

- Loan application flow
- Repayment viewing / payment
- Borrower dashboard
- eKYC integration
- Document upload
