# Borrower Pro mobile (Expo): Demo_Client mapping & effort

This document maps `apps/borrower_pro/Demo_Client` (Next.js) to the **Expo (React Native)** app at `apps/borrower_pro_mobile/Demo_Client/`, lists **tools**, and gives **rough effort** for planning. It complements [architecture_plan.md](./architecture_plan.md) and [authentication-context.md](./authentication-context.md).

**Scope:** one native app per Pro client (e.g. Demo_Client → one iOS + one Android product). **Not in scope:** admin apps, SaaS borrower, or replacing the web borrower app.

---

## 0. Current Status (as of 2026-04-23)

### What has been built

**`packages/borrower` (`@kredit/borrower`)** — shared workspace package used by both web and mobile:
- Full TypeScript type definitions for all borrower domains (borrower, application, loan, auth, signing)
- Matching Zod validation schemas
- API client factories: `createBorrowerApiClient`, `createApplicationsApiClient`, `createLoansApiClient`, `createBorrowerAuthApiClient`, `createNotificationsApiClient`, `createMeetingsApiClient`, `createSigningApiClient` (the mobile host wires the subset it needs; see [packages-borrower.md](./packages-borrower.md))
- Standalone URL helpers for loan agreements, disbursement proofs, transaction receipts

**`apps/borrower_pro_mobile/Demo_Client/`** — production-shaped borrower shell:

| File | What it does |
|------|-------------|
| `src/lib/auth/session-store.ts` | Persists Better Auth session token in `expo-secure-store`; cookie header helpers |
| `src/lib/auth/session-fetch.ts` | `sessionFetch` — injects `Cookie: truestack-borrower.session_token=…` for API calls |
| `src/lib/auth/auth-api.ts` | Better Auth helpers: email, TOTP/2FA, account/security, password reset, verification resend |
| `src/lib/auth/verify-email-api.ts` | `GET` email verification against `backend_pro` Better Auth mount (`/api/borrower-auth/auth/verify-email`) |
| `src/lib/api/borrower.ts` | `borrowerClient`, `applicationsClient`, `loansClient`, `borrowerAuthClient`, `notificationsClient`, `meetingsClient`, `signingClient` with `sessionFetch` |
| `src/app/_layout.tsx` | `SessionProvider` + `AuthGate` (allows `(auth)/reset-password`, `(auth)/verify-email/confirm` without a session) |
| `src/app/(auth)/*` | Sign-in, sign-up, forgot-password, **reset-password** (token), verify-email, **verify-email/confirm** (token), two-factor |
| `src/app/(app)/*` | Tabbed dashboard, applications, loans, profile, settings; stack routes for **meetings** hub, loan detail, attestation, payments, onboarding, help, about, account, notifications, apply flow, etc. |
| `app.config.ts` | Optional `EXPO_PUBLIC_UNIVERSAL_LINK_HOST` → iOS `associatedDomains` + Android `intentFilters` for `/reset-password` and `/verify-email` paths |
| `metro.config.js` | Monorepo Metro config for `@kredit/borrower` |

**Web app import consolidation** — zero behavior change, all tests pass:
- `apps/borrower_pro/lib/borrower-*-client.ts` files now import types from `@kredit/borrower` and re-export them for backward compat
- `apps/borrower_pro/lib/application-form-types.ts` and `borrower-loan-types.ts` deleted (types live in the shared package)

### Auth transport approach

Better Auth session tokens are read from the sign-in response body (`result.token`) — more reliable than parsing `Set-Cookie` on React Native. Tokens are stored in `expo-secure-store` (available in Expo Go; no custom build required). On every API call, `sessionFetch` reads the token and manually injects it as a `Cookie` header. The Better Auth server sees an identical cookie to the one set in a browser session.

### Known gaps / intentional differences

- **2FA**: Implemented via `/(auth)/two-factor` and `twoFactorClient`; keep aligned with Better Auth upgrades.
- **Universal / App Links**: App config and env are ready (`EXPO_PUBLIC_UNIVERSAL_LINK_HOST`). Each Pro client must still publish `apple-app-site-association` and `assetlinks.json` on the **borrower web** host, and point Resend links at paths that match (`/reset-password?token=…`, `/verify-email/confirm?token=…` or the backend-issued URL that resolves to the app).
- **Passkeys**: Borrower passkeys are **web-only** (`apps/borrower_pro`). The Expo app does not include `expo-better-auth-passkey`.
- **Invitations (org)**: Company-member invite links can remain web-first; see mobile README.

---

## 1. Architectural placement

| Concern | Web (today) | Mobile (target) |
|--------|----------------|-------------------|
| Repo | Stay in **monorepo** (`truestack_kredit`) | Same; e.g. `apps/borrower_mobile/Demo_Client` or `apps/borrower_pro_mobile/Demo_Client` |
| API | `backend_pro` via **Next proxy** (`/api/proxy/...`) + **cookie** forwarding | Call **`backend_pro` directly** (or via a thin BFF later). Session transport must be **designed for native** (see §4). |
| Auth owner | **Next.js** hosts Better Auth (`/api/auth/*`), Resend emails | **backend_pro** `borrower-auth` for native (tokens, deep links); passkeys remain **web-only**. |
| Shared UI | `apps/borrower_pro/components` (ShadCN), `apps/borrower_pro/lib` | **No ShadCN on RN.** Reuse **Zod, types, API shapes, copy** via `packages/*`; rebuild screens with RN primitives or a RN UI kit. |

---

## 2. Route / feature map: Demo_Client → Expo screens

Expo uses a **navigator** (e.g. Expo Router file-based routes, or React Navigation). Below: **Next route** → **mobile equivalent** and notes.

### 2.1 Auth & account

| Next.js (Demo_Client) | Expo screen group | Notes |
|----------------------|-------------------|--------|
| `/` (landing) | `index` / marketing or redirect to app home | May deep-link from email. |
| `(auth)/sign-in` | `SignIn` | Email/password; TOTP step when enabled (no native passkeys). |
| `(auth)/sign-up` | `SignUp` | Same validation as web; reuse Zod from shared package where possible. |
| `(auth)/forgot-password` | `ForgotPassword` | Email link → **universal link / app link** into app or web fallback. |
| `(auth)/reset-password` | `ResetPassword` | Token via query param from deep link. |
| `(auth)/verify-email` | `VerifyEmail` | Pending state UI. |
| `(auth)/verify-email/confirm` | `VerifyEmailConfirm` | **Deep link** handler. |
| `(auth)/two-factor` | `TwoFactor` | TOTP entry; align with Better Auth mobile flow. |
| `(dashboard)/security-setup` | `SecuritySetup` | Passkey / authenticator onboarding parity with web policy. |
| `(dashboard)/account` | `Account` | Password change, email change, security cards (simplified for RN). |

### 2.2 Borrower core

| Next.js | Expo | Notes |
|---------|------|--------|
| `(dashboard)/onboarding` | `Onboarding` | Wizard: reuse **business rules**; replace `localStorage` keys with **AsyncStorage** or secure storage; align with `@borrower_pro/lib/onboarding-storage-keys` concept. |
| `(dashboard)/dashboard` | `Home` / `Dashboard` | Summary cards, banners, navigation hub. |
| `(dashboard)/profile` | `Profile` | KYC / profile fields; shared validation from `borrower-form-*` where extracted. |
| `(dashboard)/applications` | `ApplicationsList` | List + filters. |
| `(dashboard)/applications/apply` | `ApplicationApply` | Large form; highest UI effort. |
| `(dashboard)/applications/[id]` | `ApplicationDetail` | Status, actions. |
| `(dashboard)/applications/[id]/documents` | `ApplicationDocuments` | **Camera / document picker** + presigned S3 upload (native modules). |
| `(dashboard)/loans` | `LoansList` | |
| `(dashboard)/loans/[loanId]` | `LoanDetail` | |
| `(dashboard)/loans/[loanId]/payment` | `LoanPayment` | Amounts: use shared safe-math/display helpers if extracted to universal package. |
| `(dashboard)/loans/[loanId]/watch-video` | `WatchVideo` | **expo-av** or WebView to provider URL. |
| `(dashboard)/loans/[loanId]/schedule-meeting` | `ScheduleMeeting` | Calendar / deep link to external meeting. |

### 2.3 Content & legal

| Next.js | Expo | Notes |
|---------|------|--------|
| `(dashboard)/about` | `About` | Static / markdown or WebView for long copy. |
| `(dashboard)/help`, `help/[slug]` | `Help`, `HelpArticle` | Reuse `@borrower_pro/lib/help-docs` content or fetch; **react-markdown** has RN alternatives or WebView. |
| `legal/*` (terms, privacy, pdpa, cookies, security) | `LegalStack` | WebView to deployed web URLs **or** in-app scroll views. |

### 2.4 Not ported 1:1 (host-only on web)

| Web-only | Mobile approach |
|----------|-----------------|
| `app/api/auth/[...all]` | Auth still **served** by Next (or future dedicated auth service); native app **consumes** it via HTTP + deep links, not duplicate route handlers in RN. |
| `app/api/proxy/[...path]` | Replace with **direct `BACKEND_URL`** fetch from app + correct **Cookie** or **token** header strategy. |
| `proxy.ts` (Next 16) | **Expo Router** plugins / linking config; no Next proxy. |
| `lib/auth-server.ts`, `borrower-auth-server.ts` | **No direct port;** use secure storage + session API on device. |

---

## 3. Shared code strategy (monorepo)

**Extract or reuse in `packages/` (incremental):**

- Zod schemas and TypeScript types for applications, loans, profile (from `borrower-form-*`, `application-form-*`, `borrower-api-client` request/response shapes).
- Constants: `packages/shared` auth helpers already; extend only if mobile needs the same URL/origin rules.
- Date/currency formatting: either **duplicate thin wrappers** using `date-fns-tz` + same MYT rules, or move **pure functions** to a small `packages/formatting` with no DOM dependency.

**Stay web-only (do not expect to import in RN):**

- Anything under `@borrower_pro/components/ui` (Radix/ShadCN).
- Next `app/` layouts and server components.

**Borrower shared lib (`apps/borrower_pro/lib`):**

- **`borrower-api-client.ts`**: refactor to accept a **fetch implementation + base URL + credentials mode** so the same client runs in Next (cookie) and Expo (cookie jar or auth header).
- Files that import `window`, `document`, or Next-only APIs need **platform splits** (`*.native.ts` / separate entry) or move browser code behind interfaces.

---

## 4. Auth & session

Today: **Better Auth on Next**, **session cookies**, **passkeys** with `rpId` / filtered passkey list via `backend_pro` ([authentication-context.md](./authentication-context.md)).

### Completed (Expo mobile)

The auth spike is done. The approach chosen:

1. **Sign-in**: POST to `${BACKEND_URL}/api/auth/sign-in/email` — token is read from the **response body** (`result.token`), not `Set-Cookie`. This is more reliable in React Native where `Set-Cookie` parsing varies by fetch implementation.
2. **Storage**: Token persisted in **`expo-secure-store`** — works in Expo Go without a custom build. Key: `ba_session_token`. Cookie name: `truestack-borrower.session_token`.
3. **Session transport**: Every API call goes through `sessionFetch`, which reads the stored token and injects it as a `Cookie` header. The backend sees the same cookie structure as a browser session.
4. **Session validation**: On app start, `SessionProvider` calls `GET /api/auth/get-session` with the stored token. If invalid/expired, clears local state and redirects to sign-in.
5. **Auth guard**: `AuthGate` component uses Expo Router's `<Redirect>` — no flash; runs inside `SessionProvider`.
6. **Email**: still sent from **Next borrower** (Resend); no change.

### Still to do / ops

- **Universal Links verification**: `EXPO_PUBLIC_UNIVERSAL_LINK_HOST` + app config are not enough for stores — each domain needs Apple/Google hosted association files and Play App Signing.
- **Change-email** links (if used): same deep-link pattern as other auth flows; no dedicated screen beyond Better Auth client behaviour.
- **Passkeys**: Not part of the native borrower client; use the web borrower app to register or sign in with a passkey.

---

## 5. Tools & accounts

### 5.1 Development

| Tool | Purpose |
|------|---------|
| **Node.js** (LTS) | JS/TS toolchain, align with repo. |
| **Expo CLI** / **create-expo-app** | Bootstrap app; **Expo SDK** pinned to a supported version. |
| **Expo Router** (optional but typical) | File-based routes analogous to App Router mental model. |
| **TypeScript** | Same as monorepo. |
| **EAS CLI** | Cloud builds, submit, updates. |

### 5.2 Native tooling

| Tool | Purpose |
|------|---------|
| **Xcode** (macOS) | iOS simulator, device builds, App Store submission prep. |
| **Android Studio** | Android emulator, SDK, keystore workflow. |
| **EAS Build** | CI-friendly iOS/Android builds without everyone maintaining identical local native stacks. |

### 5.3 Product / ops

| Tool | Purpose |
|------|---------|
| **Apple Developer Program** | iOS distribution. |
| **Google Play Console** | Android distribution. |
| **Expo Application Services (EAS)** | Build profiles per client (demo-client vs client-a). |
| **Deep link domains** | Associated domains (iOS) + Digital Asset Links (Android) on **borrower web host** for each client. |

### 5.4 Recommended RN ecosystem (indicative)

- **TanStack Query** — parity with common web data-fetching patterns (if web adopts or already uses similar).
- **Zod** — already in repo; share schemas.
- **react-native-reanimated** / **gesture-handler** — UX polish (often pulled in by Expo templates).
- **expo-image-picker** / **expo-document-picker** — KYC uploads aligned with `backend_pro` presigned URLs.

Exact versions should be chosen at implementation time against Expo SDK compatibility.

---

## 6. Effort estimates (order of magnitude)

Assumptions: **one** borrower client (Demo_Client pattern), **experienced** RN/Expo dev or strong React dev learning Expo, **backend_pro** APIs stable, **no** admin mobile.

| Phase | Scope | Status | Notes |
|-------|--------|--------|--------|
| **A. Spike** | Expo app shell, env per client, **auth end-to-end** (sign-in, session, protected API) | **Done** | Auth stack + `@kredit/borrower` |
| **B. Foundation** | Navigation, theming, API clients, secure storage | **Done** | Multiple API clients in `src/lib/api/borrower.ts`; meetings client added for hub screen |
| **C. Auth parity** | Sign-up, forgot/reset, verify email, 2FA, app-link config for reset + verify | **Largely done** | In-app `reset-password`, `verify-email/confirm`, optional `EXPO_PUBLIC_UNIVERSAL_LINK_HOST`. Passkeys remain web-only. |
| **D. Core borrower** | Onboarding, applications, loans, payments, attestation, **meetings hub** | **Largely done** | Ongoing polish; not every web-only route has a 1:1 file (e.g. separate application “documents” route). |
| **E. Secondary** | Help, about, legal via in-app browser, loan extras (video, schedule meeting) | **Largely done** | |
| **F. Hardening** | Store listings, EAS, a11y, offline | **Ongoing** | |

**MVP:** treat remaining work as per-client **ops** (universal links, Resend URL shapes) and product polish, not greenfield app build.

**Per additional Pro client:** mostly **branding, bundle ID, env, store assets, deep link host** — **~3–10 days** if the app is white-labeled; more if forked behavior.

---

## 7. CI/CD (future)

Align with [architecture_plan.md](./architecture_plan.md) §10:

- Add workflows that build **EAS** on tags or release branches for `demo-client`.
- External clients: **manual** promotion; separate EAS project or profiles per client registry entry (`config/clients/*.yaml`).

Details belong in a follow-up when the first `app.json` / `eas.json` exists.

---

## 8. Quick reference: Demo_Client file map

| Area | Primary locations (web) |
|------|-------------------------|
| Host routes | `apps/borrower_pro/Demo_Client/app/**` |
| Auth API | `apps/borrower_pro/Demo_Client/app/api/auth/[...all]/route.ts` |
| Backend proxy | `apps/borrower_pro/Demo_Client/app/api/proxy/[...path]/route.ts` |
| Shared borrower UI/logic | `apps/borrower_pro/components/**`, `apps/borrower_pro/lib/**` |
| Backend | `apps/backend_pro` |

---

## 9. Document maintenance

Update this file when:

- Auth strategy for mobile is decided (cookie vs token, passkey scope).
- First Expo app path is chosen under `/apps`.
- MVP scope is cut (e.g. phase 1 without passkeys or without document upload).

Last updated: 2026-04-11.
