# Pinjocep Branding Guide

Reference branding for **Pinjocep** — the borrower frontend for TrueKredit Pro. Each client can customize colors, fonts, and assets; this file defines the default.

---

## ⚠️ Do NOT Hardcode Colors

**Never hardcode hex codes or raw Tailwind colors** (e.g. `#8a0304`, `#f22526`, `red-500`) in pages or components. Semantic colors are defined centrally in **`tailwind.config.ts`** (`lightThemeCssVars` / `darkThemeCssVars`) — change once to update globally.

| Use this | Not this |
|----------|----------|
| `text-error`, `border-error`, `bg-error/10` | `text-red-500`, `border-red-500` |
| `text-success`, `bg-success/10` | `text-emerald-500`, `bg-emerald-500/10` |
| `text-warning`, `bg-warning/10` | `text-amber-500`, `bg-amber-500/10` |
| `Button` default variant, `bg-primary`, `ring` (focus), small highlights | Raw brand hex in TSX; **`border-primary` / `bg-primary` on notification rows or large promo cards** |

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

Theme tokens in **`tailwind.config.ts`** — do not paste brand hex into TSX.

| Mode | Brand use (`--primary`, `--ring`) | Where not to use primary |
|------|-------------------------------------|---------------------------|
| **Light** | **`#8a0304`** (~HSL `0 96% 28%`) — buttons, focus ring, avatar initials, deliberate fills | Notification list rows, large dashboard promo cards, onboarding sidebar chrome — use **`border`** / **`muted`** / **`foreground`** |
| **Dark** | **`#f22526`** (~HSL `0 89% 55%`) — same classes, brighter coral on dark UI | Same: lists and broad surfaces stay **neutral** |

- **Inline body links** typically use **`text-foreground`** + underline, not **`text-primary`**, so tertiary copy does not flood with brand color.
- **Logo asset** (`public/pinjocep-logo.png`) may differ; UI follows tokens above.

### Status Colors

All defined in **`tailwind.config.ts`** — change once to update globally.

- **Success:** #22C55E (`--success`) — use `text-success`, `bg-success/10`, `border-success`
- **Warning:** #F59E0B (`--warning`) — use `text-warning`, `bg-warning/10`
- **Error:** (`--error`) — distinct from brand `primary` in each mode; use `text-error`, `border-error`, `bg-error/10`
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
