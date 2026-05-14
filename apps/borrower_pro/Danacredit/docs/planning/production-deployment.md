# DanaKredit — production deployment checklist

Use this when DanaKredit has its **own** backend (`backend_pro`), database, and domain—not when sharing a local dev `backend_pro` with another borrower host.

## Frontend (`apps/borrower_pro/Danacredit`)

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | Public URL, e.g. `https://app.danakredit.my` |
| `NEXT_PUBLIC_BACKEND_URL` | Production API URL the browser/proxy calls |
| `BACKEND_URL` | Server-side backend URL if used |
| `BETTER_AUTH_SECRET` | **32+ chars**, cryptographically random; **must match** production `backend_pro` |
| `DATABASE_URL` | Same Postgres as `backend_pro` for Better Auth adapter (Prisma in this host app) |
| `RESEND_API_KEY` | Transactional email (verification, reset password, etc.) |
| `NEXT_PUBLIC_SKIP_SECURITY_SETUP_REDIRECT` | Omit or `false` in production |
| `BORROWER_AUTH_DEV_SKIP_*` | **Unset** in production |

Build:

```bash
cd apps/borrower_pro/Danacredit
npm run build
npm run start   # default listen port from package.json (3010); map reverse proxy / platform port as needed
```

`next.config.ts` uses `output: "standalone"` for container / self-hosted deploys.

## Backend (`apps/backend_pro`)

| Variable | Notes |
|----------|--------|
| `PRODUCT_MODE` | `pro` |
| `CLIENT_ID` | e.g. `danacredit` |
| `BETTER_AUTH_SECRET` | **Same as** DanaKredit frontend |
| `FRONTEND_URL` | DanaKredit borrower URL (Better Auth base URL context) |
| `DATABASE_URL` | Dedicated production Postgres |
| S3 / file storage | Per tenant configuration |

After schema updates:

```bash
cd apps/backend_pro
npx prisma migrate deploy
```

## DNS & TLS

- Point borrower hostname (e.g. `app.danakredit.my`) at your frontend host.
- TLS certificate (managed TLS on Vercel/AWS ALB/etc.).
- Align `NEXT_PUBLIC_APP_URL` and `FRONTEND_URL`.

## Dev vs production secrets

For **local development**, `BETTER_AUTH_SECRET` in DanaKredit `.env` must match whatever `backend_pro` uses on that machine (often shared with other Pro hosts). For **production DanaKredit**, provision a **new** secret pair (frontend + backend) and never reuse development values.
