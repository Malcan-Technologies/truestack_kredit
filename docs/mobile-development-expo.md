# Borrower Pro mobile (Expo): Demo_Client mapping & effort

This document maps `apps/borrower_pro/Demo_Client` (Next.js) to a future **Expo (React Native)** app, lists **tools**, and gives **rough effort** for planning. It complements [architecture_plan.md](./architecture_plan.md) and [authentication-context.md](./authentication-context.md).

**Scope:** one native app per Pro client (e.g. Demo_Client → one iOS + one Android product). **Not in scope:** admin apps, SaaS borrower, or replacing the web borrower app.

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

## 4. Auth & session (critical path)

Today: **Better Auth on Next**, **session cookies**, **passkeys** with `rpId` / filtered passkey list via `backend_pro` ([authentication-context.md](./authentication-context.md)).

For Expo, plan a **dedicated spike** before full UI work:

1. **Sign-in / sign-up / session refresh** on device (Better Auth REST endpoints from the **borrower web origin** or a documented mobile base URL).
2. **Deep linking:** `verify-email`, `reset-password`, `change-email` links must open the app when installed (iOS Universal Links + Android App Links) or fall back to Safari/Chrome.
3. **Storage:** `expo-secure-store` (or similar) for sensitive tokens if you add a token path; cookie jars if staying cookie-based.
4. **Passkeys:** evaluate **expo-passkey** / platform WebAuthn and **Better Auth** mobile docs; may differ from web `rpId` story.
5. **Email:** still sent from **Next borrower** (Resend); no change unless you centralize auth email later.

Until this is settled, treat **auth effort as the main schedule risk**.

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

| Phase | Scope | Calendar (1 dev) | Notes |
|-------|--------|-------------------|--------|
| **A. Spike** | Expo app shell, env per client, **auth end-to-end** (sign-in, session, one protected API call), one deep link path | **1–3 weeks** | Blocks confident planning for the rest. |
| **B. Foundation** | Navigation, theming (dark default per brand), API client abstraction, error/toast UX, secure storage | **1–2 weeks** | After spike. |
| **C. Auth parity** | Sign-up, forgot/reset, verify email, 2FA, security-setup gating aligned with web policy | **2–4 weeks** | Highly dependent on Better Auth + passkey decisions. |
| **D. Core borrower** | Onboarding wizard, applications list/apply/detail/documents, loans list/detail/payment | **4–8 weeks** | Largest chunk; forms + uploads. |
| **E. Secondary** | Help, legal, about, loan extras (video, meeting) | **1–2 weeks** | Can parallelize partially. |
| **F. Hardening** | Offline/error states, accessibility, store listings, screenshots, EAS profiles per client | **1–2 weeks** | |

**Rough total for MVP parity with current Demo_Client scope:** **~10–20 weeks** single developer, or **~3–5 months** calendar with integration risk; **shorter** if auth stays “open in browser + return to app” and **longer** if full in-app passkey + pixel parity.

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

Last updated: 2026-04-03.
