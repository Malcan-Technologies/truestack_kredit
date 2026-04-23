# Borrower Pro mobile (Expo): Demo_Client mapping & effort

This document maps `apps/borrower_pro/Demo_Client` (Next.js) to the **Expo (React Native)** app at `apps/borrower_pro_mobile/Demo_Client/`, lists **tools**, and gives **rough effort** for planning. It complements [architecture_plan.md](./architecture_plan.md) and [authentication-context.md](./authentication-context.md).

**Scope:** one native app per Pro client (e.g. Demo_Client → one iOS + one Android product). **Not in scope:** admin apps, SaaS borrower, or replacing the web borrower app.

---

## 0. Current Status (as of 2026-04-11)

### What has been built

**`packages/borrower` (`@kredit/borrower`)** — shared workspace package used by both web and mobile:
- Full TypeScript type definitions for all borrower domains (borrower, application, loan, auth, signing)
- Matching Zod validation schemas
- Five API client factories: `createBorrowerApiClient`, `createApplicationsApiClient`, `createLoansApiClient`, `createBorrowerAuthApiClient`, `createSigningApiClient`
- Standalone URL helpers for loan agreements, disbursement proofs, transaction receipts
- See [packages-borrower.md](./packages-borrower.md) for full API reference

**`apps/borrower_pro_mobile/Demo_Client/`** — Expo app scaffold is in place with:

| File | What it does |
|------|-------------|
| `src/lib/auth/session-store.ts` | Persists Better Auth session token in `expo-secure-store`; exports `getSessionToken`, `setSessionToken`, `clearSessionToken`, `buildCookieHeader` |
| `src/lib/auth/session-fetch.ts` | `sessionFetch: FetchFn` — reads stored token on every call and injects `Cookie: truestack-borrower.session_token=<token>` |
| `src/lib/auth/auth-api.ts` | Better Auth helpers for email auth, passkeys, account/security fetches, password reset, and verification resend |
| `src/lib/auth/session-context.tsx` | `SessionProvider` + `useSession()` React Context; validates token against server on mount; exposes `session`, `user`, `isLoading`, `signOut`, `refresh` |
| `src/lib/auth/index.ts` | Barrel export for the auth module |
| `src/lib/api/borrower.ts` | All five API clients instantiated with `sessionFetch`; screens import e.g. `borrowerClient.fetchBorrower()` |
| `src/app/_layout.tsx` | Root layout with `SessionProvider` + `AuthGate` (Expo Router auth guard) |
| `src/app/(auth)/*.tsx` | Sign-in, sign-up, forgot-password, and verify-email screens wired to Better Auth mobile helpers |
| `src/app/(app)/account.tsx` | Mobile account tab with profile edit, email/password actions, passkey management, and login activity |
| `src/app/(app)/applications.tsx`, `src/app/(app)/loans.tsx` | Placeholder tab screens so the borrower menu structure is in place while auth is being built out |
| `metro.config.js` | Monorepo-aware Metro config: watches `packages/` so Metro can resolve `@kredit/borrower` |

**Web app import consolidation** — zero behavior change, all tests pass:
- `apps/borrower_pro/lib/borrower-*-client.ts` files now import types from `@kredit/borrower` and re-export them for backward compat
- `apps/borrower_pro/lib/application-form-types.ts` and `borrower-loan-types.ts` deleted (types live in the shared package)

### Auth transport approach

Better Auth session tokens are read from the sign-in response body (`result.token`) — more reliable than parsing `Set-Cookie` on React Native. Tokens are stored in `expo-secure-store` (available in Expo Go; no custom build required). On every API call, `sessionFetch` reads the token and manually injects it as a `Cookie` header. The Better Auth server sees an identical cookie to the one set in a browser session.

### Known gaps / not yet started

- **2FA screen**: Sign-in still detects `twoFactorRedirect: true` and shows an unsupported message. A `/(auth)/two-factor` screen with TOTP entry still needs to be built.
- **Deep linking**: Password-reset and email-verification links still open the borrower web app until Universal Links / App Links are configured.
- **Passkeys**: Borrower passkeys are **web-only** (`apps/borrower_pro`). The Expo app does not include `expo-better-auth-passkey`.
- **Core borrower screens**: Dashboard, applications, and loans tabs are scaffolded with placeholders only.

---

## 1. Architectural placement

| Concern | Web (today) | Mobile (target) |
|--------|----------------|-------------------|
| Repo | Stay in **monorepo** (`truestack_kredit`) | Same; e.g. `apps/borrower_mobile/Demo_Client` or `apps/borrower_pro_mobile/Demo_Client` |
| API | `backend_pro` via **Next proxy** (`/api/proxy/...`) + **cookie** forwarding | Call **`backend_pro` directly** (or via a thin BFF later). Session transport must be **designed for native** (see §4). |
| Auth owner | **Next.js** hosts Better Auth (`/api/auth/*`), Resend emails | **Spike required:** Better Auth + native (deep links, storage, passkeys). Web auth routes remain for browser users. |
| Shared UI | `apps/borrower_pro/components` (ShadCN), `apps/borrower_pro/lib` | **No ShadCN on RN.** Reuse **Zod, types, API shapes, copy** via `packages/*`; rebuild screens with RN primitives or a RN UI kit. |

---

## 2. Route / feature map: Demo_Client → Expo screens

Expo uses a **navigator** (e.g. Expo Router file-based routes, or React Navigation). Below: **Next route** → **mobile equivalent** and notes.

### 2.1 Auth & account

| Next.js (Demo_Client) | Expo screen group | Notes |
|----------------------|-------------------|--------|
| `/` (landing) | `index` / marketing or redirect to app home | May deep-link from email. |
| `(auth)/sign-in` | `SignIn` | Password, passkey strategy on native TBD. |
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

### Still to do

- **Deep linking**: `verify-email`, `reset-password`, `change-email` links need iOS Universal Links + Android App Links configured in `app.json` + server-side `apple-app-site-association` / `assetlinks.json`.
- **2FA**: `signInWithEmail` detects `twoFactorRedirect: true`; a `/(auth)/two-factor` TOTP screen needs to be built.
- **Passkeys**: Not part of the native borrower client; use the web borrower app to register or sign in with a passkey.
- **TOTP UI**: `twoFactorRedirect` is still not handled in-app; use the borrower web app for authenticator flows until a dedicated mobile screen is built.

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
| **A. Spike** | Expo app shell, env per client, **auth end-to-end** (sign-in, session, one protected API call) | **Done** | `@kredit/borrower` package + auth stack (session-store, session-fetch, auth-api, session-context, sign-in screen, auth guard) |
| **B. Foundation** | Navigation, theming (dark default per brand), API client abstraction, secure storage | **Done** | `sessionFetch` wired into all 5 API clients; metro.config.js; theme system in place |
| **C. Auth parity** | Sign-up, forgot/reset, verify email, 2FA, deep links, security-setup gating | **In progress** | Sign-up API ready, UI not started. 2FA detection exists, screen not started. Deep links not configured. |
| **D. Core borrower** | Onboarding wizard, applications list/apply/detail/documents, loans list/detail/payment | **Not started** | Largest chunk; forms + uploads. |
| **E. Secondary** | Help, legal, about, loan extras (video, meeting) | **Not started** | Can parallelize partially. |
| **F. Hardening** | Offline/error states, accessibility, store listings, screenshots, EAS profiles per client | **Not started** | |

**Rough remaining effort for MVP parity:** Phase C (~2–3 weeks) → Phase D (~4–8 weeks) → Phases E+F (~2–4 weeks). **~8–15 weeks** from here for one developer.

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
