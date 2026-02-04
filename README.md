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

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm or yarn

### Local Development

1. **Clone and install dependencies**

```bash
cd truestack_kredit
npm install
```

2. **Start the database**

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and MinIO (S3-compatible) on port 9000.

3. **Set up the backend**

```bash
cd apps/backend
cp .env.example .env  # Already configured for local dev
npx prisma generate
npx prisma db push
npm run db:seed       # Seed demo data
```

4. **Start the backend server**

```bash
npm run dev           # Runs on http://localhost:4000
```

5. **Start the frontend**

In a new terminal:

```bash
cd apps/admin
npm run dev           # Runs on http://localhost:3000
```

### Demo Credentials

After seeding, you can login with:

- **Email:** admin@demo.com
- **Password:** Demo@123
- **Tenant:** demo-company

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

### Backend (.env)

```env
DATABASE_URL="postgresql://kredit:kredit_dev@localhost:5432/kredit_dev"
JWT_SECRET="your-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=4000
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
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
