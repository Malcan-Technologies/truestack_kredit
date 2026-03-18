# Demo_Client Branding Guide

Reference branding for **Demo_Client** — the template/demo borrower frontend for TrueKredit Pro. Each client can customize colors, fonts, and assets; this file defines the default.

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

### Status Colors

- **Success:** #22C55E
- **Warning:** #F59E0B
- **Error:** #EF4444
- **Info:** #3B82F6

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
