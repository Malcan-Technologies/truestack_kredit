> Purpose: Use this document as a reusable prompt + product blueprint for the TrueKredit platform at kredit.truestack.my.
> Status: Phase 1-4 implemented for local development. AWS infrastructure deferred.

---

## 1) Product Summary

**TrueKredit** is a multi-tenant SaaS platform for KPKT loan management. Tenant admins perform loan origination, repayments, and compliance tasks. Internal admin is a separate system that syncs via events/webhooks.

**Key goals**

- Single Postgres database with strict `tenantId` scoping.
- Admin-only loan creation (tenant admins, not internal admins).
- Modular, maintainable architecture (clean boundaries).
- Configurable interest models at scheduling time.
- Monthly prepaid billing with 3-day grace period.
- Audit logs, Schedule A, exports, invoices/receipts.
- AWS ECS (frontend + backend), RDS Postgres, S3 storage (deferred).

---

## 2) Architecture Overview

### Project Structure

```
truestack_kredit/
├── apps/
│   ├── admin/                    # Tenant admin frontend (Next.js 16)
│   │   ├── app/
│   │   │   ├── (auth)/           # Login, Register pages
│   │   │   ├── (dashboard)/      # Protected dashboard pages
│   │   │   └── api/              # Next.js API routes (if needed)
│   │   ├── components/ui/        # ShadCN UI components
│   │   └── lib/                  # Auth, API utilities
│   │
│   └── backend/                  # Express API
│       ├── src/
│       │   ├── modules/          # Feature modules
│       │   │   ├── auth/         # Registration, login, JWT
│       │   │   ├── tenants/      # Tenant & user management
│       │   │   ├── billing/      # Subscription, invoices, receipts
│       │   │   ├── borrowers/    # Borrower CRUD
│       │   │   ├── products/     # Loan product configuration
│       │   │   ├── loans/        # Applications & loans
│       │   │   ├── schedules/    # Schedule engine & payments
│       │   │   ├── compliance/   # Audit logs, exports, reports
│       │   │   ├── notifications/# Email & WhatsApp
│       │   │   └── events/       # Outbox pattern for webhooks
│       │   ├── middleware/       # Auth, billing guard, error handling
│       │   └── lib/              # Config, JWT, Prisma, utilities
│       └── prisma/
│           ├── schema.prisma
│           └── seed.ts
├── packages/
│   └── shared/                   # Shared types, enums, constants
├── docs/planning/
└── docker-compose.yml            # Local Postgres + MinIO
```

### Core Stack

- **Frontend**: Next.js 16.x, TypeScript, Tailwind, ShadCN UI, Sonner notifications
- **Backend**: Express (Node.js), Prisma 6, PostgreSQL
- **Auth**: JWT-based (access + refresh tokens)
- **Storage**: Local filesystem (S3 via MinIO for local dev, AWS S3 for production)
- **Notifications**: WhatsApp (Meta API) + Email (Resend) - mocked in dev

### Local Development

```bash
# Start database
docker-compose up -d

# Setup backend
cd apps/backend
npx prisma db push
npm run db:seed

# Run servers
npm run dev:backend  # Port 4000
npm run dev:admin    # Port 3000
```

**Demo credentials**: `admin@demo.com` / `Demo@123` (tenant: demo-company)

---

## 3) Multi-Tenant Data Model

### Tenant Scoping

All tenant-owned tables include `tenantId`. Queries are scoped via Express middleware.

**Core Entities (all tenant-scoped)**

| Entity | Purpose |
|--------|---------|
| `Tenant` | Organization/company |
| `User` | Tenant admins & staff (OWNER, ADMIN, STAFF roles) |
| `Subscription` | Billing status, period dates, grace period |
| `Invoice` / `Receipt` | Billing artifacts |
| `BillingEvent` | Payment history, access changes |
| `Borrower` | Loan applicants (IC number unique per tenant) |
| `Product` | Loan products with interest models |
| `LoanApplication` | Application workflow (DRAFT → SUBMITTED → APPROVED) |
| `Loan` | Active loans linked to applications |
| `LoanScheduleVersion` | Immutable schedule snapshots |
| `LoanRepayment` | Expected payments per schedule |
| `PaymentAllocation` | Actual payments recorded |
| `AuditLog` | All sensitive actions logged |
| `File` | Uploaded documents metadata |
| `Notification` | Email/WhatsApp notifications |
| `OutboxEvent` | Event outbox for webhook delivery |

### Database Schema Location

See `apps/backend/prisma/schema.prisma` for full schema.

---

## 4) Loan Origination & Schedule Engine

### Workflow

```
DRAFT → SUBMITTED → APPROVED → PENDING_DISBURSEMENT → ACTIVE → COMPLETED
                  ↘ REJECTED
```

1. Create borrower (or select existing)
2. Create loan application with product, amount, term
3. Submit application for review
4. Approve → Creates `Loan` record
5. Disburse → Generates schedule, loan becomes ACTIVE
6. Record payments → Allocations update repayment status
7. All paid → Loan status becomes COMPLETED

### Interest Models

Located in `apps/backend/src/modules/schedules/service.ts`:

| Model | Calculation |
|-------|-------------|
| `FLAT` | Interest = Principal × Rate × Term / 12 |
| `DECLINING_BALANCE` | EMI formula, interest on outstanding balance |
| `EFFECTIVE_RATE` | Same as declining (extensible) |

### Schedule Versioning

- Each disbursement creates `LoanScheduleVersion` with inputs hash
- Repayments linked to schedule version
- Never mutate existing schedules—create new version if needed

---

## 5) Billing & Subscription

### Rules

- Monthly prepaid billing
- Grace period: 3 days after period end
- Status flow: `ACTIVE` → `GRACE_PERIOD` → `BLOCKED`

### Access Gating

- Backend: `requireActiveSubscription` middleware blocks API when blocked
- Frontend: Shows grace period warning, redirects when blocked

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/billing/subscription` | Current subscription status |
| `GET /api/billing/invoices` | Invoice list |
| `POST /api/billing/invoices/generate` | Generate invoice for period |
| `POST /api/billing/payments` | Record manual payment |

---

## 6) Compliance & Reporting

### Audit Logging

`AuditService` logs all sensitive actions with:
- User ID, tenant ID
- Action type (CREATE, UPDATE, DELETE, etc.)
- Entity type and ID
- Previous and new data (JSON)
- IP address, timestamp

### Exports

| Endpoint | Format |
|----------|--------|
| `GET /api/compliance/exports/loans` | CSV |
| `GET /api/compliance/exports/schedule/:loanId` | CSV |
| `GET /api/compliance/reports/portfolio` | JSON summary |

---

## 7) Internal Admin Integration

### Event Outbox Pattern

Events stored in `OutboxEvent` table for reliable delivery:

```typescript
DomainEventEmitter.emit({
  tenantId,
  eventType: 'loan.disbursed',
  payload: { loanId, amount, ... }
});
```

**Event Types**
- `tenant.created`, `tenant.updated`, `tenant.blocked`
- `subscription.paid`, `subscription.expired`
- `invoice.issued`, `receipt.generated`
- `loan.created`, `loan.disbursed`, `loan.closed`
- `user.invited`, `user.revoked`

### Webhook Delivery

- HMAC signature on payloads
- Idempotency keys prevent duplicates
- Retry with backoff on failure

---

## 8) API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register tenant + owner |
| `/api/auth/login` | POST | Login, returns tokens |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/me` | GET | Current user + tenant |

### Tenants & Users

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants/current` | GET | Tenant info with counts |
| `/api/tenants/users` | GET | List users |
| `/api/tenants/users` | POST | Add user (ADMIN only) |
| `/api/tenants/users/:userId` | PATCH | Update user |
| `/api/tenants/users/:userId` | DELETE | Delete user (OWNER only) |

### Borrowers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/borrowers` | GET | List with search |
| `/api/borrowers` | POST | Create borrower |
| `/api/borrowers/:id` | GET | Get with loans |
| `/api/borrowers/:id` | PATCH | Update |
| `/api/borrowers/:id` | DELETE | Delete (no active loans) |

### Products

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/products` | GET | List products |
| `/api/products` | POST | Create product |
| `/api/products/:id` | PATCH | Update product |
| `/api/products/:id` | DELETE | Delete/deactivate |

### Loans & Applications

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/loans/applications` | GET | List applications |
| `/api/loans/applications` | POST | Create application |
| `/api/loans/applications/:id/submit` | POST | Submit for review |
| `/api/loans/applications/:id/approve` | POST | Approve (creates loan) |
| `/api/loans/applications/:id/reject` | POST | Reject |
| `/api/loans` | GET | List loans |
| `/api/loans/:id` | GET | Loan with schedule |
| `/api/loans/:id/disburse` | POST | Disburse loan |

### Schedules & Payments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schedules/preview` | POST | Preview schedule calculation |
| `/api/schedules/loan/:loanId` | GET | Schedule with summary |
| `/api/schedules/payments` | POST | Record payment allocation |

### Documentation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/docs` | GET | List all docs with categories |
| `/api/docs/:slug` | GET | Get doc content by slug |
| `/api/docs/:category/:slug` | GET | Get doc from category |

---

## 9) UI/UX Guidelines

### Branding (see `brand.md`)

| Element | Value |
|---------|-------|
| Background | `#0B0B0D` |
| Surface | `#131316` |
| Border | `#25262B` |
| Text | `#F5F6F7` |
| Accent Start | `#FF8A00` |
| Accent End | `#FF4D00` |
| Heading Font | Rethink Sans |
| Body Font | Inter |

### Frontend Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/login` | Login form |
| `/register` | Tenant registration |
| `/dashboard` | Overview with metrics |
| `/dashboard/borrowers` | Borrower management |
| `/dashboard/products` | Product configuration |
| `/dashboard/applications` | Application workflow |
| `/dashboard/loans` | Loan list |
| `/dashboard/loans/[id]` | Loan detail + schedule + payments |
| `/dashboard/billing` | Subscription + invoices |
| `/dashboard/reports` | Portfolio reports + exports |
| `/dashboard/settings` | Tenant + user settings |
| `/dashboard/help` | User documentation / help center |

---

## 10) Infrastructure (Deferred)

### AWS Resources (Future)

- ECS Fargate: Frontend + Backend services
- RDS PostgreSQL: Managed database
- S3: File storage buckets
- Secrets Manager: Environment secrets
- ECR: Container registry

### CI/CD (Future)

GitHub Actions workflow for:
- Build Docker images
- Push to ECR
- Deploy to ECS
- Run Prisma migrations

---

## 11) Development Commands

```bash
# Root level
npm install              # Install all workspaces
npm run docker:up        # Start Postgres + MinIO
npm run docker:down      # Stop containers

# Backend
npm run dev:backend      # Start API (port 4000)
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to DB
npm run db:migrate       # Run migrations
npm run db:seed          # Seed demo data

# Frontend
npm run dev:admin        # Start Next.js (port 3000)
```

---

## 12) Future Enhancements

- [ ] Password reset flow
- [ ] Two-factor authentication
- [ ] Plan tiers and pricing
- [ ] Advanced analytics (portfolio health, arrears aging)
- [ ] Bank/FPX payment integration
- [ ] PDF receipt and invoice generation
- [ ] Schedule A PDF export
- [ ] File upload to S3
- [ ] Webhook management UI
- [ ] AWS infrastructure (Terraform)
- [ ] CI/CD pipeline (GitHub Actions)
