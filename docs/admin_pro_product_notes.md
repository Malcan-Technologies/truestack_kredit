# TrueKredit Pro — product notes (`admin_pro` / `backend_pro`)

Stakeholder-facing constraints and a **future direction** so engineering does not paint the product into a corner.

## Current (temporary) model

- **One staff/admin user account is tied to at most one tenant** in a given Pro deployment.
- The **`admin_pro` UI** does not offer tenant creation or a tenant switcher; the expectation is **deployment/bootstrap** (seed, migrations, or ops) to create the single tenant and membership.
- **TrueIdentity / KYC** for Pro is aligned with the **public TrueStack KYC** model (same family as `borrower_pro`), not the SaaS “TrueStack Admin provisions a tenant client + add-on billing” flow.

This matches a **single client deployment** per purchase: one logical lender org per environment.

## Future evolution (when product allows)

The business may want **multiple tenants under one account** (e.g. one operator managing several orgs). The intended shape to keep in mind:

- **Still one TrueKredit Pro purchase / one client** (e.g. **ClientA**).
- **ClientA** receives:
  - A **branded admin URL** (TrueKredit Pro admin),
  - A **borrower-facing site** (their borrower web app),
  - **One TrueIdentity client** for that client — shared across the tenants that belong to that account, not one TI client per tenant in a way that multiplies cost or admin sprawl.

So: **multiple tenants per account** may appear later, but they should remain **one client deployment**, **one TI client**, with UX/API evolved to switch tenants or scope operations — not a return to full SaaS multi-tenant marketplace behavior unless explicitly designed.

## Implementation reminders

- Prefer **`PRODUCT_MODE` / feature flags** and session semantics over forking `admin_pro` per client.
- Any future **multi-tenant-on-one-account** work should:
  - Reintroduce **tenant switching** only when data model and auth story are defined,
  - Keep **TrueIdentity** usage consistent with “one client → one TI integration surface,”
  - Avoid re-coupling to **TrueStack Admin tenant provisioning** unless product requires it.

## Related code / docs

- Architecture overview: `docs/architecture_plan_edited.md`
- Local dev: root `README.md` (TrueKredit Pro section)
- Pro admin env: `apps/admin_pro/.env.example`
