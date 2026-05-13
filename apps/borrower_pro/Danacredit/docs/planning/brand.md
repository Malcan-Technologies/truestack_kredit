# DanaKredit Branding Guide

Reference branding for **DanaKredit** — the borrower-facing TrueKredit Pro host app at `apps/borrower_pro/Danacredit`.

---

## ⚠️ Do NOT Hardcode Colors

**Never hardcode hex codes or raw Tailwind colors** (e.g. `#6151ca`, `red-500`) in pages or components. Palette tokens live in **`tailwind.config.ts`** (injected as CSS variables); use semantic utilities:

| Use this | Not this |
|----------|----------|
| `text-error`, `border-error`, `bg-error/10` | `text-red-500`, `border-red-500` |
| `text-success`, `bg-success/10` | `text-emerald-500` |
| `text-primary`, `bg-primary`, `ring-primary` | hardcoded blues |

---

## 1) Client Identity

- **Client name**: DanaKredit
- **Product**: Digital license KPKT borrowing
- **Domain**: Configure per deployment (e.g. `https://www.danakredit.my`)

### Brand colours (reference)

- **Light theme primary**: `#1145A1` — CTAs, focus ring (see `--primary` in `tailwind.config.ts`).
- **Dark theme primary**: `#3B82F6`.

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

Neutrals and semantic status colours (`success`, `warning`, `error`, `info`) are defined as HSL in **`tailwind.config.ts`** for `:root` and `.dark`. Prefer utilities such as `bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`.

### Status Colors

Use the semantic tokens: `success`, `warning`, `error`, `info` (see `tailwind.config.ts`).

---

## 4) Component Styling (ShadCN)

- Buttons, cards, inputs from shared `borrower_pro/components/`.
- DanaKredit theme tokens apply via `tailwind.config.ts` and `ThemeProvider` (`storageKey="danacredit-theme"`).

---

## 5) Org / legal copy

Centralise borrower-facing legal identity in **`app/components/legal/danacredit-site.ts`** (`LENDER_*` constants). Tenant APIs may override display fields where wired.
