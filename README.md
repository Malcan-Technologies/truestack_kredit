# TrueKredit

Multi-tenant SaaS platform for KPKT loan management.

## Overview

TrueKredit is a comprehensive loan management system designed for KPKT compliance. It features:

- **Multi-tenant architecture** with strict data isolation
- **Loan origination** workflow with configurable interest models
- **Schedule engine** supporting flat rate, declining balance, and effective rate calculations
- **Billing system** with monthly prepaid subscriptions
- **Compliance features** including audit logs and data exports
- **Notifications** via WhatsApp and email

## Tech Stack

### Backend
- Express.js with TypeScript
- Prisma 7 ORM with PostgreSQL
- JWT authentication
- Zod validation

### Frontend
- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- ShadCN UI components
- Sonner for notifications

## Project Structure

```
truestack_kredit/
├── apps/
│   ├── admin/          # Tenant admin frontend (Next.js)
│   └── backend/        # API server (Express)
├── packages/
│   └── shared/         # Shared types and constants
├── docs/
│   └── planning/       # Planning documents
└── docker-compose.yml  # Local development services
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm

### Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL & MinIO
npm run docker:up

# 3. Setup backend
cd apps/backend
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed

# 4. Start backend (terminal 1)
npm run dev

# 5. Start frontend (terminal 2)
cd apps/admin
npm run dev
```

**Access:** http://localhost:3000

### Demo Login

| Field    | Value          |
|----------|----------------|
| Email    | admin@demo.com |
| Password | Demo@123       |

### Seeded Data

The seed creates:
- 2 tenants (Demo Company, ACME Lending)
- 3 loan products (flat rate, declining balance, corporate)
- 4 borrowers (2 individual, 1 passport holder, 1 corporate)
- 2 sample loan applications
- Active 30-day trial subscriptions

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services |
| `npm run dev:admin` | Frontend only (port 3000) |
| `npm run dev:backend` | Backend only (port 4000) |
| `npm run docker:up` | Start Docker services |
| `npm run docker:down` | Stop Docker services |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:generate` | Generate Prisma client |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection error | Run `docker ps` to verify PostgreSQL is running |
| Prisma client error | Run `npm run db:generate` in `apps/backend` |
| Port already in use | Change `PORT` in `.env` files |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new tenant
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Tenants
- `GET /api/tenants/current` - Get tenant info
- `GET /api/tenants/users` - List users
- `POST /api/tenants/users` - Add user

### Borrowers
- `GET /api/borrowers` - List borrowers
- `POST /api/borrowers` - Create borrower
- `GET /api/borrowers/:id` - Get borrower
- `PATCH /api/borrowers/:id` - Update borrower

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `PATCH /api/products/:id` - Update product

### Loans
- `GET /api/loans/applications` - List applications
- `POST /api/loans/applications` - Create application
- `POST /api/loans/applications/:id/submit` - Submit for review
- `POST /api/loans/applications/:id/approve` - Approve (creates loan)
- `GET /api/loans` - List loans
- `GET /api/loans/:id` - Get loan with schedule
- `POST /api/loans/:id/disburse` - Disburse loan

### Schedules
- `POST /api/schedules/preview` - Preview schedule calculation
- `GET /api/schedules/loan/:loanId` - Get loan schedule
- `POST /api/schedules/payments` - Record payment

### Billing
- `GET /api/billing/subscription` - Get subscription status
- `GET /api/billing/invoices` - List invoices
- `POST /api/billing/payments` - Record payment
- `POST /api/billing/invoices/generate` - Generate invoice

### Compliance
- `GET /api/compliance/audit-logs` - Get audit logs
- `GET /api/compliance/exports/loans` - Export loans CSV
- `GET /api/compliance/reports/portfolio` - Portfolio report

## Interest Models

The schedule engine supports three interest calculation models:

### Flat Rate
Total interest = Principal × Rate × Term / 12

### Declining Balance (Reducing Balance)
Interest calculated on outstanding balance each month using EMI formula.

### Effective Rate
Similar to declining balance with effective annual rate conversion.

## Environment Variables

### Backend (`apps/backend/.env`)

```env
DATABASE_URL="postgresql://kredit:kredit_dev@localhost:5432/kredit_dev"
BETTER_AUTH_SECRET="dev-secret-change-in-production-32-chars-min"
PORT=4000

# Storage (default: local)
STORAGE_TYPE="local"
STORAGE_PATH="./uploads"

# Optional: S3/MinIO
# S3_ENDPOINT="http://localhost:9000"
# S3_ACCESS_KEY="minioadmin"
# S3_SECRET_KEY="minioadmin"
# S3_BUCKET="kredit-uploads"
```

### Frontend (`apps/admin/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET="dev-secret-change-in-production-32-chars-min"
```

## Branding

The platform uses a dark theme with orange gradient accents:

- **Background:** #0B0B0D
- **Surface:** #131316
- **Accent:** Linear gradient from #FF8A00 to #FF4D00
- **Fonts:** Rethink Sans (headings), Inter (body)

See `docs/planning/brand.md` for complete branding guidelines.

## License

Private - All rights reserved
