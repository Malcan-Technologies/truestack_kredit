# Authentication Context

This document captures the current authentication architecture and policy across the `truestack_kredit` apps so future work can build on the same assumptions.

## Current Auth Owners

- `apps/admin` owns Better Auth for the non-pro admin frontend.
- `apps/admin_pro` owns Better Auth for the pro admin frontend.
- `apps/borrower_pro/Demo_Client` owns Better Auth for the borrower frontend.
- `apps/backend` and `apps/backend_pro` do not send auth emails. They verify sessions created by the frontend auth owners and share the same database and `BETTER_AUTH_SECRET` for their stack.

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
- Signup/login onboarding helpers live in `packages/shared/src/auth-onboarding.ts`.
- `packages/shared/src/auth-onboarding.ts` also stores pending authenticator setup state in session storage so the QR flow can survive client remounts until the user verifies or cancels.
- Current shared timings:
  - auth links: 15 minutes
  - TOTP challenge cookie: 10 minutes
  - trusted device window: 7 days

## Frontend Flow Summary

### Admin + Admin Pro

- Login pages offer passkey-first sign-in and email/password fallback.
- If password sign-in requires TOTP, the app redirects to `/two-factor`.
- If email is unverified, login redirects to `/verify-email` and preserves the pending email in session storage.
- After first verified login, the app can continue to `/dashboard/security-setup` based on the saved setup preference.
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

Auth emails are sent directly from the auth-owning Next.js apps:

- `apps/admin/lib/sendEmail.ts`
- `apps/admin_pro/lib/sendEmail.ts`
- `apps/borrower_pro/Demo_Client/lib/sendEmail.ts`

Required env vars on those frontend apps:

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
- Shared auth helpers normalize pathful `BETTER_AUTH_URL` values back to bare browser origins before generating auth emails, trusted origins, and passkey origin settings.
- Passkey origin/RP ID can be overridden with:
  - `BETTER_AUTH_PASSKEY_ORIGINS`
  - `BETTER_AUTH_PASSKEY_RP_ID`

## Deployment Notes

- Frontend auth email delivery depends on the frontend task/container receiving `RESEND_API_KEY`.
- Borrower production wiring was previously the main gap and has already been patched.
- Admin and admin_pro were already wired for `RESEND_API_KEY`; their auth UI is now aligned with borrower as well.
- Backend ECS tasks may also carry auth-related secrets for shared stack consistency, but auth email sending happens in the frontend auth owners.

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

## Known Intentional Behavior

- Passkey-only users are allowed to keep using password login unless TOTP is also enabled.
- The app-level security gate is stricter than Better Auth defaults, but it is not the same as "require TOTP on every password sign-in."
- If product policy changes later, the safest place to update it is in:
  - frontend security gating (`fetchSecurityStatus` consumers)
  - login completion handling after `signIn.email(...)`
  - Better Auth plugin/server configuration if stronger native enforcement is needed
