# Pinjocep Branding Guide

Reference branding for **Pinjocep** — the borrower frontend for TrueKredit Pro. Each client can customize colors, fonts, and assets; this file defines the default.

---

## ⚠️ Do NOT Hardcode Colors

**Never hardcode hex codes or raw Tailwind colors** (e.g. `#8a0304`, `red-500`, `emerald-500`, `amber-500`) in pages or components. Semantic colors are defined centrally in **`tailwind.config.ts`** (`lightThemeCssVars` / `darkThemeCssVars`) — change once to update globally.

| Use this | Not this |
|----------|----------|
| `text-error`, `border-error`, `bg-error/10` | `text-red-500`, `border-red-500` |
| `text-success`, `bg-success/10` | `text-emerald-500`, `bg-emerald-500/10` |
| `text-warning`, `bg-warning/10` | `text-amber-500`, `bg-amber-500/10` |
| `text-primary`, `border-primary`, `bg-primary` | `#8a0304`, `text-red-500` (except in this file or theme config) |

---

## 1) Client Identity

- **Client name**: Pinjocep
- **Product**: Digital license KPKT borrowing
- **Domain**: (Configure per deployment — e.g. `loans.pinjocep.com`)

---

## 2) Typography

### Fonts

- **Headings**: Rethink Sans
- **Body**: Inter

### Size Scale

| Role | Size | Notes |
|------|------|-------|
| Page headings | `text-3xl` (30px) | Main page titles |
| Section headings | `text-xl` (20px) | Card titles |
| Body / form text | `text-base` (16px) | Default |
| Labels / metadata | `text-sm` (14px) | Form labels |
| Small metadata | `text-xs` (12px) | Badges, timestamps |

---

## 3) Color System

### Dark Theme (Default)

- **Background:** #0A0A0A
- **Surface:** #171717
- **Border:** #292929
- **Text Primary:** #FAFAFA
- **Text Secondary:** #8C8C8C

### Light Theme

- **Background:** #FFFFFF
- **Surface:** #FAFAFA
- **Border:** #E5E5E5
- **Text Primary:** #0A0A0A
- **Text Secondary:** #737373

### Primary / Accent (Pinjocep)

- **Logo asset:** `public/pinjocep-logo.png` may use a brighter red; **UI primary (light)** is **`#8a0304`** (deep crimson) — tokens, not hex in components.
- **Light:** `primary` / `ring` ≈ HSL `0 96% 28%` (~`#8a0304`); `primary-foreground` near-white — see **`tailwind.config.ts`** (`lightThemeCssVars`).
- **Dark:** same palette as **`apps/borrower_pro/Demo_Client`** — neutral borrower theme: **`primary`** ≈ near-white, **`primary-foreground`** dark on filled controls, **`ring`** near-white; status colors match that app’s dark tokens (`darkThemeCssVars` in Pinjocep mirrors Demo_Client).
- **Do not** paste brand hex into TSX; use `text-primary`, `bg-primary`, `border-primary`, etc.
- **`error` / `destructive`:** in **light**, tuned vs crimson `primary`; in **dark**, standard semantic reds per Demo_Client — see **`tailwind.config.ts`**.

### Status Colors

All defined in **`tailwind.config.ts`** — change once to update globally.

- **Success:** #22C55E (`--success`) — use `text-success`, `bg-success/10`, `border-success`
- **Warning:** #F59E0B (`--warning`) — use `text-warning`, `bg-warning/10`
- **Error:** (`--error`) — light/dark tokens in config; use `text-error`, `border-error`, `bg-error/10`
- **Info:** #3B82F6 (`--info`) — use `text-info`, `bg-info/10`

---

## 4) Component Styling (ShadCN)

- Buttons, cards, inputs from shared `borrower_pro/components/`.
- Client overrides via CSS variables in **`tailwind.config.ts`** and `ThemeProvider` in Pinjocep.

---

## 5) Customization for New Clients

When copying a client folder to a new client:

1. Update this `brand.md` with client name, colors, fonts.
2. Add client logo, favicon in `public/`.
3. Adjust theme tokens in **`tailwind.config.ts`** (and `app/layout.tsx` / `ThemeProvider` if needed).
4. Shared components inherit theme — no code changes in `borrower_pro/components/`.
