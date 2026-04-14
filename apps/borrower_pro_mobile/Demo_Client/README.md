# Borrower Pro mobile — Demo_Client (Expo)

Native shell for **TrueKredit Pro** borrowers, aligned with `apps/borrower_pro/Demo_Client` (Next.js). The **backend API** (`backend_pro`) is shared across clients; **branding and env** are per white-label build.

Monorepo context: [`docs/mobile-development-expo.md`](../../../docs/mobile-development-expo.md) (route map, auth spike notes, shared-code strategy).

## Prerequisites

- Node.js 20+ (match repo `engines`)
- For device/simulator workflows, see [Expo’s environment docs](https://docs.expo.dev/workflow/android-studio-emulator/) (Android) and [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)

## Get started

1. **Environment** — copy env template and adjust URLs for your machine:

   ```bash
   cp .env.example .env
   ```

   `EXPO_PUBLIC_*` values are inlined at bundle time. Defaults mirror web Demo_Client ports (`AUTH` ≈ `NEXT_PUBLIC_APP_URL`, `BACKEND` ≈ `NEXT_PUBLIC_BACKEND_URL`).

2. **Install** — from the **repository root** (workspace):

   ```bash
   npm install
   ```

3. **Start Metro**:

   ```bash
   # from repo root
   npm run dev:borrower_pro_mobile

   # or from this directory
   npm run dev
   ```

   Then open a [development build](https://docs.expo.dev/develop/development-builds/introduction/), **Android emulator**, **iOS simulator**, or [Expo Go](https://expo.dev/go) (limited vs native modules).

## Project layout

| Area | Purpose |
|------|--------|
| `src/app/_layout.tsx` | Root stack: main app vs auth modal |
| `src/app/(app)/` | Tabbed shell — home, explore (template screens) |
| `src/app/(auth)/` | Auth stack (e.g. `sign-in` stub until Better Auth + native spike) |
| `src/brand/` | **White-label tokens** — `clients/*.ts` + `active.ts` (switch client here or in CI) |
| `src/constants/theme.ts` | Semantic colors from active brand (use `useTheme()`, not raw hex in UI) |
| `src/lib/config/env.ts` | Reads `EXPO_PUBLIC_*` |
| `src/lib/api/client.ts` | Thin `fetch` helper toward `EXPO_PUBLIC_BACKEND_URL` |

Editing routes: [Expo Router — file-based routing](https://docs.expo.dev/router/introduction/). App source lives under **`src/app/`** (not repo-root `app/`).

## New client / rebrand

1. Add `src/brand/clients/<client-id>.ts` (copy `demo-client.ts`, adjust palette + copy from that client’s brand guide).
2. Point `src/brand/active.ts` at the new export.
3. Update `app.config.ts` / EAS: **name**, **slug**, **scheme**, icons, splash, bundle/package IDs, and any associated domains.
4. Set per-build **`.env`** or EAS secrets for `EXPO_PUBLIC_*`.

## Passkeys

- Passkeys are **not supported in Expo Go**. Use a native development build or production build.
- Keep the relying-party host env-driven with `EXPO_PUBLIC_PASSKEY_RP_ID`. If it is blank, the app derives it from `EXPO_PUBLIC_AUTH_BASE_URL`.
- Web passkeys can use `localhost`, but **native iOS/Android passkeys cannot**. For native development, point `EXPO_PUBLIC_AUTH_BASE_URL` or `EXPO_PUBLIC_PASSKEY_RP_ID` to an HTTPS tunnel or deployed domain.
- iOS associated domains and similar native config should be generated from env in `app.config.ts`, not hardcoded to a single client domain.

Web counterpart for colors/copy reference: `apps/borrower_pro/Demo_Client/docs/planning/brand.md`.

## Tooling

- **TypeScript** — [`Using TypeScript` (Expo)](https://docs.expo.dev/guides/typescript/)
- **Lint** — `npm run lint` / `npx expo lint`; [ESLint & Prettier](https://docs.expo.dev/guides/using-eslint/)
- **Tests** — [Unit testing with Jest](https://docs.expo.dev/develop/unit-testing/) (not wired by default)

## `reset-project` (optional)

`npm run reset-project` is the stock **create-expo-app** reset: it moves or deletes `src/` and replaces `src/app` with a minimal stack. **Do not run it** unless you intend to throw away this Borrower Pro scaffold.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo GitHub](https://github.com/expo/expo)
