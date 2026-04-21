---
title: Single-Tenant Deployment Model
order: 2
---

# Single-Tenant Deployment Model

TrueKredit Pro is **single-tenant per deployment**. This page explains what that means for you as an end user and why you will not see things like a tenant switcher, multi-tenant billing, or SaaS-style self-service tenant creation.

---

## One Deployment, One Lender

Each TrueKredit Pro installation runs as a dedicated environment for **one lender organisation**. Everything you interact with in the admin app — borrowers, loans, products, reports, signing certificates — belongs to that single organisation.

| Aspect | Behaviour in Pro |
|--------|------------------|
| Tenants per deployment | **One** |
| Tenant switcher in sidebar | **Not shown** |
| Self-service tenant creation | **Not available** |
| Database / storage | Isolated to this deployment |
| Users | Tied to this one tenant |
| Borrower portal | Branded for this client |

> If you have worked with TrueKredit SaaS before, the mental model is: in SaaS, one email address can belong to many tenants and you switch between them. In Pro, your login *is* the tenant — there is nothing to switch to.

---

## Who Owns What

Although the app is single-tenant from a user's perspective, ownership is still split between **TrueStack** (the platform provider) and **your organisation** (the operator).

| Layer | Owned by |
|-------|----------|
| Infrastructure and deployment (AWS account, DNS, secrets) | TrueStack or your IT team, depending on the licensing agreement |
| Platform code (admin_pro, backend_pro, borrower_pro) | TrueStack |
| Data, borrowers, loans, documents | **Your organisation** |
| Role catalogue customisations and custom tenant roles | **Your organisation** |
| Organisation information, logo, licence numbers | **Your organisation** |

For architectural details, see `docs/architecture_plan.md` and `docs/admin_pro_product_notes.md` in the repository.

---

## What This Means Day to Day

### There Is No Tenant Switcher

You sign in, and you land on the dashboard for your organisation. The sidebar does not contain a tenant dropdown. Any link that behaves like a tenant switcher in SaaS (e.g. "Switch tenant") simply does not exist in Pro.

### Billing Is Not In-App

TrueKredit Pro does **not** show a Core-plan or add-on subscription page inside the admin. There is no `/dashboard/billing`, `/dashboard/plan`, or `/dashboard/subscription` in Pro.

Licensing, payment, and renewals for the Pro deployment itself are handled out of band — typically through your commercial agreement with TrueStack. Ask your Owner or Super Admin if you are not sure how your deployment is licensed.

### The Borrower Portal Is Yours

Your borrower-facing portal (`borrower_pro`) is deployed as **your** application, usually on a subdomain of your own brand (for example, `loans.example.com`). Borrowers who register there land inside your tenant, and only your tenant.

### Team Capacity Is Not Capped Like SaaS

In SaaS, each tenant is capped at 5 team members. In Pro, there is no hard 5-member cap built into the app — team capacity follows your licensing agreement. Ask your Owner or Super Admin for the effective limit before scaling the team.

---

## Future Direction — Multiple Tenants Per Account

The product is designed to **keep the option open** for a future where one account manages several tenants under the same Pro deployment (for example, a group operator with multiple shops under one TrueKredit Pro purchase). That evolution has not been released yet.

Until then:

- Pro remains one-tenant-per-deployment
- Tenant switching, per-tenant billing, and tenant creation UI are intentionally absent
- All your data lives in a single tenant record

---

## Ownership & Role Transfer

Although there is only one tenant, you still have the concept of a tenant Owner, plus a catalogue of other roles.

- The **Owner** is the single top-level account for this deployment
- Ownership can be transferred to another active member, who then becomes **Owner**
- The previous Owner is automatically demoted to **Super Admin**
- You cannot deactivate, remove, or change the role of the Owner row directly

See [Team Management](?doc=administration/team-management) for the full ownership-transfer flow.

---

## Frequently Asked Questions

### Can I create another tenant from inside the admin?

No. Pro is one deployment = one tenant. Additional tenants mean a new deployment (and usually a new licence).

### Where do I manage billing?

Licensing for the Pro deployment itself is handled outside the admin app, through your agreement with TrueStack. There is no in-app Billing or Subscription page like in SaaS.

### Do borrowers share the tenant with other lenders?

No. Every borrower, application, loan, document, and audit log in your environment belongs only to your tenant.

### Can multiple organisations use the same borrower portal?

No. Each Pro deployment has its own borrower portal branded for that client.

### What if our borrower also borrows from another TrueKredit Pro client?

That other client has a completely separate deployment and dataset — the two environments do not share borrower records.

---

## Next Steps

- [Roles & Permissions](?doc=getting-started/roles-and-permissions) — The 11 default Pro roles and their permissions
- [Team Management](?doc=administration/team-management) — Invite users and transfer ownership
- [Settings](?doc=administration/settings) — Organisation information and licence numbers
