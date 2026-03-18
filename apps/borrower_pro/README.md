# TrueKredit Pro — Borrower Frontend

Borrower-facing frontend for TrueKredit Pro (digital license KPKT borrowing). Each client has their own folder; shared components live here to avoid duplication.

---

## Structure

```
borrower_pro/
├── components/           # SHARED — ShadCN, UI primitives (all clients use)
│   └── ui/              # Add ShadCN components here
├── lib/                 # SHARED — utils, theme (optional)
├── Demo_Client/         # Client app — template for new clients
├── Client_B/            # Future: another client
└── README.md
```

---

## Shared Components

- **Location**: `components/` at this level
- **Purpose**: ShadCN UI, forms, buttons, inputs — reusable across all client apps
- **Usage**: Client apps (e.g. Demo_Client) import from `../components` or via path alias
- **Rule**: Do not copy ShadCN or shared components into client folders. Add new shared components here.

---

## Adding a New Client

1. Copy `Demo_Client` → `NewClientName/`
2. Update `docs/planning/brand.md` and rules in `.cursor/rules/`
3. Shared components are automatically available — no changes needed

---

## Current Clients

- **Demo_Client** — Template / demo borrower app
