# Demo_Client Branding Guide

Reference branding for **Demo_Client** — the template/demo borrower frontend for TrueKredit Pro. Each client can customize colors, fonts, and assets; this file defines the default.

---

## ⚠️ Do NOT Hardcode Colors

**Never hardcode hex codes or raw Tailwind colors** (e.g. `#6151ca`, `red-500`, `emerald-500`, `amber-500`) in pages or components. All colors are defined centrally in `app/globals.css` — change once to update globally.

| Use this | Not this |
|----------|----------|
| `text-error`, `border-error`, `bg-error/10` | `text-red-500`, `border-red-500` |
| `text-success`, `bg-success/10` | `text-emerald-500`, `bg-emerald-500/10` |
| `text-warning`, `bg-warning/10` | `text-amber-500`, `bg-amber-500/10` |
| `text-primary`, `border-primary` | `#6151ca`, `text-purple-500` |

---

## 1) Client Identity

- **Client name**: Demo Client
- **Product**: Digital license KPKT borrowing
- **Domain**: (Configure per deployment — e.g. `loans.demo-client.com`)

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

### Primary / Accent

- Use for CTAs, links, focus. Client can override.
- Default: neutral (dark/light adapts to theme).
- **To change brand color** (e.g. to `#6151ca`): update `--primary` in `app/globals.css`.

### Status Colors

All defined in `app/globals.css` — change once to update globally.

- **Success:** #22C55E (`--success`) — use `text-success`, `bg-success/10`, `border-success`
- **Warning:** #F59E0B (`--warning`) — use `text-warning`, `bg-warning/10`
- **Error:** #EF4444 (`--error`) — use `text-error`, `border-error`, `bg-error/10`
- **Info:** #3B82F6 (`--info`) — use `text-info`, `bg-info/10`

---

## 4) Component Styling (ShadCN)

- Buttons, cards, inputs from shared `borrower_pro/components/`.
- Client overrides via CSS variables or theme provider in Demo_Client.

---

## 5) Customization for New Clients

When copying Demo_Client to a new client:

1. Update this `brand.md` with client name, colors, fonts.
2. Add client logo, favicon in `public/`.
3. Adjust theme in `app/layout.tsx` or theme provider.
4. Shared components inherit theme — no code changes in `borrower_pro/components/`.
