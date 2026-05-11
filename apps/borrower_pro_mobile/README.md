# Borrower Pro mobile (Expo)

Native shells for **TrueKredit Pro** borrowers, aligned with the web borrower portals in `apps/borrower_pro/<Client>` (Next.js). The **backend API** (`backend_pro`) is shared across all clients; **branding and env** are per white-label build.

This folder mirrors `apps/borrower_pro/` on the web side: shared code lives at this level; each client is a thin app folder.

```
apps/borrower_pro_mobile/
  app/            # SHARED — Expo Router routes (all clients render this tree)
  components/     # SHARED — RN components (use `@/components/*`)
  constants/      # SHARED — theme tokens (`constants/theme.ts`)
  hooks/          # SHARED — `use-theme`, `use-brand`, `use-color-scheme`
  lib/            # SHARED — api clients, auth, format, domain helpers, toast, …
  brand/          # SHARED — `tokens.ts`, `clients/<id>.ts`, `active.ts` (registry)
  assets/         # SHARED — images, illustrations, attestation video
  global.css      # SHARED — react-native-web fonts
  docs/planning/  # SHARED — brand.md + navigation-ux.md
  Demo_Client/            # THIN client — identity + native config only
  Proficient_Premium/     # THIN client — identity + native config only
```

A client folder contains only: `app.config.ts` (name / slug / scheme / bundle IDs; points Expo Router at `../app`), `metro.config.js`, `tsconfig.json` (`@/*` → `../*`), `eslint.config.js`, `.gitignore`, `.env.example`, `scripts/`. Generated dirs (`android/`, `ios/`, `.expo/`, `expo-env.d.ts`) are git-ignored and produced by `expo prebuild` / `expo start` as needed.

Imports: `@/*` resolves to `apps/borrower_pro_mobile/*` from any client app (`@/components/page-screen`, `@/lib/api/borrower`, `@/brand`, `@/assets/...`, `@/global.css`). The active brand is chosen at bundle time from `EXPO_PUBLIC_CLIENT_ID`.

Monorepo context: [`docs/mobile-development-expo.md`](../../docs/mobile-development-expo.md) (route map, auth spike notes, shared-code strategy).

## Prerequisites

- Node.js 20+ (match repo `engines`)
- For device/simulator workflows, see [Expo's environment docs](https://docs.expo.dev/workflow/android-studio-emulator/) (Android) and [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)

## Get started

1. **Install** — from the **repository root** (workspace): `npm install`, then `npm run build:packages` (builds `@kredit/shared`, `@kredit/borrower`).

2. **Environment** — in the client folder you want to run: `cp .env.example .env` and adjust URLs for your machine. `EXPO_PUBLIC_*` values are inlined at bundle time. Defaults mirror the matching web client's ports (`Demo_Client` ≈ `:3006`, `Proficient_Premium` ≈ `:3007`; backend `:4001`).

3. **Start Metro** — from a client folder:

   ```bash
   cd apps/borrower_pro_mobile/Demo_Client   # or Proficient_Premium
   npm run dev
   ```

   Or from repo root: `npm run dev:borrower_pro_mobile` (Demo_Client) / `npm run dev:borrower_pro_mobile:proficient_premium` (Proficient_Premium). Then open a [development build](https://docs.expo.dev/develop/development-builds/introduction/), **Android emulator**, **iOS simulator**, or [Expo Go](https://expo.dev/go) (limited vs native modules).

## Add a new client

1. **Brand** — copy `brand/clients/demo-client.ts` → `brand/clients/<new-id>.ts`; set `id`, `displayName`, `productTagline` (and colors only if it diverges from the neutral palette). Register the export in `brand/active.ts` (`brandsById`).
2. **Client folder** — copy an existing client folder (e.g. `Demo_Client/`) → `<NewClient>/` and update:
   - `package.json` → `name` (e.g. `new_client`).
   - `app.config.ts` → `name`, `slug`, `scheme`, `ios.bundleIdentifier`, `android.package` (keep `['expo-router', { root: '../app' }]` and the `../assets/*` paths).
   - `.env.example` → `EXPO_PUBLIC_CLIENT_ID=<new-id>`, `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_AUTH_BASE_URL`, optional `EXPO_PUBLIC_UNIVERSAL_LINK_HOST` (the deployed borrower web origin from `config/clients/<id>.yaml`).
   - `tsconfig.json` → already includes the shared dirs; no change needed beyond the copy.
3. **Workspace** — `npm install` from repo root picks up the new workspace automatically (`apps/borrower_pro_mobile/*`). Add convenience scripts in the root `package.json` if you like.
4. **Artwork** — both shipped clients currently point at the neutral `../assets/images/*` icons/splash. Add client-specific files under `assets/` and repoint that client's `app.config.ts` when real artwork is available.
5. **Native projects** — `npx expo prebuild` inside the client folder generates `ios/` + `android/` from `app.config.ts` (git-ignored). EAS build profiles per client are future work (see `docs/mobile-development-expo.md` §7).

## Sign-in (native)

- These apps use **email + password** and **TOTP (2FA)** via `backend_pro` (`/api/borrower-auth/auth`). They do **not** ship `expo-better-auth-passkey` or other native passkey modules.
- **Passkeys** for borrower accounts are supported on the **web** borrower app (`apps/borrower_pro/...`), not in the Expo clients.
- **Password reset and email verification:** screens exist at `/(auth)/reset-password?token=…` and `/(auth)/verify-email/confirm?token=…`, calling Better Auth on `backend_pro`. For email links to open the **native** app, set `EXPO_PUBLIC_UNIVERSAL_LINK_HOST` and host `apple-app-site-association` / `assetlinks.json` on that client's borrower web origin (see `docs/mobile-development-expo.md`).
- **Company invitations:** org invite URLs may point at the **web** borrower app; native handling is optional.

## Web vs mobile (quick)

| Area | Web (`borrower_pro/<Client>`) | Mobile (`borrower_pro_mobile/<Client>`) |
|------|-------------------------------|------------------------------------------|
| Meetings hub | `/meetings` | `/meetings` (stack) — attestation list + actions |
| Landing / marketing | `/` | Not in scope for native |
| Passkeys | Supported | Not supported — use web |
| Per-client structure | thin app + shared `components/`, `lib/` | thin app + shared `app/`, `components/`, `lib/`, `hooks/`, `constants/`, `brand/`, `assets/` |

Web counterparts for colors/copy reference: `apps/borrower_pro/<Client>/docs/planning/brand.md` and the repo-level `docs/planning/brand.md`.

## Tooling

- **TypeScript** — `npx tsc --noEmit` inside a client folder (path aliases + shared dirs are wired in its `tsconfig.json`).
- **Lint** — `npm run lint` / `npx expo lint`.
- **Tests** — [Unit testing with Jest](https://docs.expo.dev/develop/unit-testing/) (not wired by default).

## `reset-project` (do not run)

`npm run reset-project` is the stock **create-expo-app** reset and predates this shared layout — it would try to move a `src/` that no longer exists here. Do not run it.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router — file-based routing](https://docs.expo.dev/router/introduction/)
