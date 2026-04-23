# Authentication Context

This document captures the current authentication architecture and policy across the `truestack_kredit` apps so future work can build on the same assumptions.

## Current Auth Owners

- `apps/admin` owns Better Auth for the non-pro admin frontend.
- `apps/admin_pro` owns Better Auth for the pro admin frontend.
- `apps/borrower_pro/Demo_Client` owns Better Auth for the borrower frontend (web).
- `apps/borrower_pro_mobile/Demo_Client` is the Expo mobile app for borrowers. It authenticates directly against a dedicated Better Auth instance inside `apps/backend_pro` at `/api/borrower-auth/auth`.
- `apps/backend` does not own Better Auth. It verifies sessions created by `apps/admin`.
- `apps/backend_pro` is split:
  - it verifies sessions created by `apps/admin_pro`
  - it also owns a dedicated borrower Better Auth server for Expo/mobile sign-in
- In the pro borrower stack, web and mobile share the same database and `BETTER_AUTH_SECRET`, but they do not share the same HTTP auth handler.

## Stack-Level Rules

- Each auth-owning Next.js app uses Better Auth with:
  - email verification
  - email/password sign-in
  - TOTP two-factor authentication
  - passkeys
- Password sign-in requires verified email.
- Trusted devices suppress the extra TOTP challenge for 7 days after a successful password + 2FA sign-in.
- Password reset and email verification use Better Auth native token-link flows.
- Security setup is considered complete when either:
  - `twoFactorEnabled === true`, or
  - the user has at least one registered passkey

## Important Policy Nuance

- A passkey satisfies the app-level "security setup complete" gate.
- A passkey does not automatically force a second factor after password sign-in.
- The `/two-factor` challenge only appears when Better Auth returns `twoFactorRedirect`, which currently depends on TOTP 2FA actually being enabled for that user.
- This means a user with only a passkey can still sign in with email/password without being prompted for TOTP.

## Shared Helpers

- Shared auth constants and URL/origin helpers live in `packages/shared/src/auth-config.ts`.
- Shared auth URL helpers normalize pathful auth endpoint URLs such as `https://example.com/api/auth` back to bare origins like `https://example.com` before building user-facing links, trusted origins, or passkey origins.
- Onboarding helpers (pending verification email, pending TOTP setup) live in `packages/shared/src/auth-onboarding.ts`.
- `packages/shared/src/auth-onboarding.ts` stores pending authenticator setup state in session storage so the QR flow can survive client remounts until the user verifies or cancels.
- Current shared timings:
  - auth links: 15 minutes
  - TOTP challenge cookie: 10 minutes
  - trusted device window: 7 days

## Frontend Flow Summary

### Admin + Admin Pro

- Login pages offer passkey-first sign-in and email/password fallback.
- If password sign-in requires TOTP, the app redirects to `/two-factor`.
- If email is unverified, login redirects to `/verify-email` and preserves the pending email in session storage.
- Dashboard layout blocks non-security pages until the user has either a passkey or authenticator configured.
- If a security-status check fails, security pages are still allowed, but non-security pages redirect back to `/dashboard/security-setup` instead of failing open.
- `apps/admin` is the SaaS admin app: users can self-sign up, and access is gated by tenant membership/active tenant selection rather than a separate admin-access allowlist.
- `apps/admin_pro` is the invite-based admin app: post-login completion should verify that the user has at least one admin membership before sending them into the dashboard.
- `apps/admin_pro` should only revoke the session on definitive admin-access failures (invalid session or confirmed empty memberships). Transport, proxy, or parsing failures while checking memberships are retryable and must not force sign-out.

### Borrower Pro

- Uses the same Better Auth patterns as the admin apps.
- Adds borrower-specific onboarding rules on top of security setup.
- New borrowers without profiles are redirected to `/onboarding`, except for exempt pages like `/dashboard`, `/account`, `/about`, `/help`, `/security-setup`.
- Sidebar items that require a borrower profile are visually disabled until onboarding is complete.
- If a security-status check fails, security pages remain accessible, but other protected pages redirect back to `/security-setup`.

### Borrower Mobile

- Uses `expoClient()` plus `twoFactorClient()` from Better Auth for borrower password sign-in and TOTP verification.
- Password sign-in can redirect to the mobile `/two-factor` route when Better Auth returns `twoFactorRedirect`.
- The mobile root auth gate must only block on the initial session bootstrap. If it replaces the navigator during later `useSession()` refetches, it can unmount `/two-factor` mid-challenge and bounce the user back to `/sign-in`.
- Mobile still relies on `backend_pro` for the actual auth HTTP endpoints, while borrower web uses the embedded Next.js auth handler.

## Security UI Conventions

All three auth-owning frontends now follow the same security-management behavior:

- client-side security-status checks should trust `session.user.twoFactorEnabled` as a local source of truth before depending on passkey list requests
- transient passkey lookup failures must not downgrade a session that already has `twoFactorEnabled === true` into a forced security-setup redirect
- passkey add/remove UI
- authenticator setup starts by enabling pending 2FA with the current password and then requesting the TOTP URI
- authenticator setup button is inline with the password field
- authenticator QR and verification flow appear in a modal rather than inline in the card
- pending authenticator setup is restored from session storage until the user verifies or cancels
- badge text uses `Required for 2FA`
- disable-two-factor action is inline with the password field
- credential-based account screens must keep an authenticated password-change form available from the security card
- password changes from the frontend should use Better Auth's client `changePassword` action instead of bespoke proxy fetches when the app already owns auth
- backup-code view/regeneration UI is intentionally hidden from the account screen

## Email Delivery

Auth emails are sent directly from the auth-owning web apps plus the dedicated borrower mobile auth server:

- `apps/admin/lib/sendEmail.ts`
- `apps/admin_pro/lib/sendEmail.ts`
- `apps/borrower_pro/Demo_Client/lib/sendEmail.ts`
- `apps/backend_pro/src/lib/borrower-auth.ts` (borrower mobile auth)

Required env vars on the auth sender:

- `RESEND_API_KEY`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`

Defaults exist for sender name/address, but `RESEND_API_KEY` must be present or auth emails will fail.

## Environment Wiring

### Non-Pro Stack

- `apps/admin` and `apps/backend` must share:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET`
- `apps/admin` needs:
  - `NEXT_PUBLIC_APP_URL`
  - `BACKEND_URL`
  - `RESEND_API_KEY` for auth emails
- `apps/backend` uses `BETTER_AUTH_BASE_URL` or `BETTER_AUTH_URL` or `FRONTEND_URL` to validate sessions and origins. If those env vars include `/api/auth`, shared helpers normalize them back to the browser origin before trusted-origin checks.

### Pro Stack

- `apps/admin_pro`, `apps/borrower_pro/Demo_Client`, and `apps/backend_pro` must share:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET`
- `apps/backend_pro` trusted origins must include both admin and borrower browser origins.
- `apps/admin_pro` and `apps/borrower_pro/Demo_Client` each need their own:
  - `NEXT_PUBLIC_APP_URL`
  - backend URL
  - `RESEND_API_KEY` for auth emails
- `apps/backend_pro` also needs `RESEND_API_KEY` because borrower mobile auth emails are sent from its dedicated Better Auth server.
- Shared auth helpers normalize pathful `BETTER_AUTH_URL` values back to bare browser origins before generating auth emails, trusted origins, and passkey origin settings.
- Passkey origin/RP ID can be overridden with:
  - `BETTER_AUTH_PASSKEY_ORIGINS`
  - `BETTER_AUTH_PASSKEY_RP_ID`

## Mobile (Expo) Auth

The Expo borrower app uses the official `@better-auth/expo` integration. This avoids
the HMAC signed-cookie mismatch that occurs when mobile stores only the raw session
token from the response body instead of the full signed cookie value.

### How it works

1. `apps/backend_pro` runs a dedicated Better Auth instance at `basePath: /api/borrower-auth/auth`,
   mounted via `toNodeHandler(borrowerAuth)` before `express.json()`.
2. The mobile app creates an auth client with `createAuthClient` + `expoClient` from `@better-auth/expo/client`.
3. The mobile app also enables Better Auth `twoFactorClient()` so TOTP verification writes the resulting session/trusted-device cookies through the Expo fetch pipeline instead of bypassing cookie persistence.
4. `expoClient` intercepts `Set-Cookie` response headers, extracts the full signed cookie value
   (e.g. `truestack-borrower.session_token=<token.hmac>`) and stores it in `expo-secure-store`.
5. `authClient.getCookie()` returns the stored signed cookie string for use in subsequent API requests.
6. `authClient.useSession()` is a React hook that reads the cached session from SecureStore, reducing
   loading states on app relaunch.

### Configuration

**Server (`apps/backend_pro/src/lib/borrower-auth.ts`):**
- `expo()` plugin from `@better-auth/expo` is added to the `plugins` array.
- `democlient://` and `exp://` are added to `trustedOrigins` for the Expo app scheme.
- Cookie prefix: `truestack-borrower` (via `AUTH_COOKIE_PREFIXES.borrower`).

**Mobile (`apps/borrower_pro_mobile/Demo_Client/src/lib/auth/auth-client.ts`):**
```typescript
createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_BACKEND_URL,
  basePath: '/api/borrower-auth/auth',
  plugins: [
    expoClient({
      scheme: 'democlient',
      storagePrefix: 'truestack-borrower',
      cookiePrefix: 'truestack-borrower',
      storage: SecureStore,
    }),
    twoFactorClient(),
  ],
})
```

### Differences from web auth

| Aspect | Web (borrower_pro) | Mobile (borrower_pro_mobile) |
|--------|-------------------|------------------------------|
| Auth server | Next.js app at port 3006 | backend_pro at `/api/borrower-auth/auth` |
| Session storage | Browser cookies (automatic) | `expo-secure-store` via `expoClient` |
| Session transport | Cookie header (browser) | `authClient.getCookie()` set manually |
| `useSession()` source | Better Auth React hook | Same, backed by SecureStore cache |
| Passkeys | Supported (web borrower) | Not implemented on native; use email/password + TOTP against `borrower-auth` |
| 2FA | TOTP supported | TOTP supported via `/two-factor` screen and `twoFactorClient()` |

### Important borrower pro/mobile nuance

- Borrower web and borrower mobile are separate Better Auth servers.
- Both default to the same pro database and `BETTER_AUTH_SECRET`.
- Borrower web currently generates Prisma Client from `apps/backend_pro/prisma/schema.prisma`:
  - `apps/borrower_pro/Demo_Client/package.json`
  - `db:generate = prisma generate --schema=../../backend_pro/prisma/schema.prisma`
- This means schema changes in `backend_pro` can affect borrower web runtime even though the web app still owns its own auth handler.
- If the web dev server and `backend_pro` are regenerated/restarted at different times, auth behavior can drift in confusing ways.

### Better Auth 1.6.2 `TwoFactor.verified`

- Better Auth `1.6.2` expects the `TwoFactor` model to include `verified Boolean @default(false)`.
- On successful TOTP confirmation, Better Auth marks the `TwoFactor` row as `verified = true`.
- Existing rows created before this field existed can fail in two stages:
  - before the field exists in Prisma: successful verification can crash with a Prisma validation error while trying to update `verified`
  - after the field exists but legacy rows remain `verified = false`: sign-in TOTP verification can return `TOTP not enabled`
- For already-enrolled legacy users, backfill `verified = true` on their `TwoFactor` rows after adding the field.
- Changing a user's email does not invalidate TOTP or passkeys because both are bound to `userId`, not email.

### Mobile environment variables

Required in `apps/borrower_pro_mobile/Demo_Client/.env`:
- `EXPO_PUBLIC_BACKEND_URL` — URL of backend_pro (e.g. `http://192.168.x.x:4001`)
- `EXPO_PUBLIC_AUTH_BASE_URL` — URL of borrower web app (for email link callbacks)

### Files to check first (mobile)

- `apps/borrower_pro_mobile/Demo_Client/src/lib/auth/auth-client.ts`
- `apps/borrower_pro_mobile/Demo_Client/src/lib/auth/auth-api.ts`
- `apps/borrower_pro_mobile/Demo_Client/src/lib/auth/session-context.tsx`
- `apps/borrower_pro_mobile/Demo_Client/src/lib/auth/session-fetch.ts`
- `apps/borrower_pro_mobile/Demo_Client/src/app/(auth)/sign-in.tsx`
- `apps/borrower_pro_mobile/Demo_Client/src/app/(auth)/sign-up.tsx`
- `apps/borrower_pro_mobile/Demo_Client/src/app/(app)/account.tsx`
- `apps/backend_pro/src/lib/borrower-auth.ts`

---

## Deployment Notes

- Frontend auth email delivery depends on the frontend task/container receiving `RESEND_API_KEY`.
- Borrower production wiring was previously the main gap and has already been patched.
- Admin and admin_pro were already wired for `RESEND_API_KEY`; their auth UI is now aligned with borrower as well.
- `backend_pro` borrower auth is the exception: it sends borrower auth emails for the Expo/mobile-owned auth flow, while still redirecting users back to borrower web URLs for email verification and reset-password completion.
- Backend ECS tasks may also carry auth-related secrets for shared stack consistency, but auth email sending otherwise happens in the auth-owning frontend apps.

## Files To Check First

When changing auth behavior in the future, start with these files:

- `packages/shared/src/auth-config.ts`
- `packages/shared/src/auth-onboarding.ts`
- `apps/admin/lib/auth-client.ts`
- `apps/admin/lib/auth-server.ts`
- `apps/admin/app/(auth)/login/page.tsx`
- `apps/admin/app/(dashboard)/layout.tsx`
- `apps/admin/components/account-security-card.tsx`
- `apps/admin_pro/lib/auth-client.ts`
- `apps/admin_pro/lib/auth-server.ts`
- `apps/admin_pro/lib/finish-login.ts`
- `apps/admin_pro/app/(auth)/login/page.tsx`
- `apps/admin_pro/app/(dashboard)/layout.tsx`
- `apps/admin_pro/components/account-security-card.tsx`
- `apps/borrower_pro/Demo_Client/lib/auth-client.ts`
- `apps/borrower_pro/Demo_Client/app/(auth)/sign-in/page.tsx`
- `apps/borrower_pro/Demo_Client/app/(dashboard)/layout.tsx`
- `apps/borrower_pro/components/account-security-card.tsx`
- `apps/backend/src/lib/auth.ts`
- `apps/backend_pro/src/lib/auth.ts`
- `apps/backend_pro/src/lib/borrower-auth.ts`
- `apps/borrower_pro_mobile/Demo_Client/src/lib/auth/auth-client.ts`
- `apps/borrower_pro_mobile/Demo_Client/src/lib/auth/auth-api.ts`

## Passkey rpId Scoping (Pro Stack)

- The `Passkey` model has an optional `rpId` column that records the domain that registered the passkey.
- Better Auth `databaseHooks` in `admin_pro` and `borrower_pro` automatically stamp `rpId` on every new passkey.
- The custom `GET /api/auth/passkeys?rpId=` endpoint in `backend_pro` filters passkeys by `rpId` (plus legacy passkeys where `rpId` is null).
- Frontend `listUserPasskeys()` calls the filtered endpoint so each subdomain only shows passkeys registered on that subdomain.
- TOTP/Authenticator is shared across subdomains by design — no rpId scoping needed.

## Change Email Flow

All three auth-owning frontends support email address changes via Better Auth's built-in `changeEmail` endpoint.

### How it works

1. User enters a new email in the Security card's email verification sub-card and confirms via a dialog.
2. Better Auth's `POST /change-email` sends a verification link to the **new** email address using the existing `emailVerification.sendVerificationEmail` handler.
3. The user clicks the link in their new email inbox.
4. The existing `/verify-email/confirm?token=` page processes the token, atomically updating the email.

### Configuration

- `user.changeEmail.enabled: true` is set in each app's `auth-server.ts`.
- No `sendChangeEmailConfirmation` callback is configured — this means the flow is a single step (verification sent directly to the new email) rather than requiring approval from the old email first.
- `changeEmail` is exported from each app's `auth-client.ts`.

### Anti-enumeration

Better Auth silently returns success (HTTP 200) without sending any email if the new email already belongs to another user. The confirmation dialog warns users about this.

### Impact on other credentials

- **Passkeys**: Unaffected — bound to `userId` + `rpId`, not email.
- **TOTP/Authenticator**: Unaffected — bound to `userId`.
- **Password**: Unchanged — stored in the `Account` table by `userId`.

## Known Intentional Behavior

- Passkey-only users are allowed to keep using password login unless TOTP is also enabled.
- The app-level security gate is stricter than Better Auth defaults, but it is not the same as "require TOTP on every password sign-in."
- If product policy changes later, the safest place to update it is in:
  - frontend security gating (`fetchSecurityStatus` consumers)
  - login completion handling after `signIn.email(...)`
  - Better Auth plugin/server configuration if stronger native enforcement is needed
