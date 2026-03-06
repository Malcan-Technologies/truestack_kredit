---
title: Tenants & Switching
order: 2
---

# Understanding Tenants

In TrueKredit, a **tenant** represents a single business entity or shop operating under its own money lending license. Each tenant is a completely separate workspace with its own data, users, and billing.

---

## What is a Tenant?

A tenant is your isolated business environment in TrueKredit. Think of it as:

- **One shop** = One tenant
- **One license** = One tenant
- **One billing account** = One tenant

### Key Characteristics

| Aspect | Description |
|--------|-------------|
| Data Isolation | Each tenant's borrowers, loans, and records are completely separate |
| Team Members | Each tenant has its own team (up to 5 members including owner) |
| Billing | Each tenant is billed separately based on its subscription |
| Settings | Each tenant has its own configuration and preferences |

---

## Multi-Tenant Access

A single user (email) can belong to multiple tenants. This is useful for:

- **Business owners** managing multiple shops
- **Accountants** overseeing multiple client businesses
- **Consultants** assisting different organizations

### Example Scenario

```
john@example.com belongs to:
├── "ABC Money Lending Sdn Bhd" (Role: Owner)
├── "XYZ Credit Services" (Role: Admin)
└── "Partner Finance Co." (Role: Staff)
```

Each tenant is independent — actions in one tenant do not affect others.

---

## Switching Between Tenants

If you have access to multiple tenants, you can easily switch between them.

### Using the Tenant Switcher

1. Look for the **tenant switcher** in the sidebar (below the TrueKredit logo)
2. Click on the current tenant name
3. Select the tenant you want to switch to
4. The page will reload with the new tenant's data

### What Changes When You Switch

| Changes | Stays the Same |
|---------|----------------|
| All displayed data (borrowers, loans, etc.) | Your login session |
| Team members list | Your email/password |
| Billing information | Your personal profile name |
| Your role (may differ per tenant) | |

---

## Team Members Per Tenant

Each tenant can have up to **5 team members**, including the owner.

### Team Structure

| Role | Count Limit | Notes |
|------|-------------|-------|
| Owner | 1 | Created when tenant is registered |
| Admin | Up to 4 | Can manage most operations |
| Staff | Up to 4 | Limited permissions |
| **Total** | **5** | Combined across all roles |

### Examples

**Valid configurations:**
- 1 Owner + 4 Staff = 5 members ✓
- 1 Owner + 2 Admins + 2 Staff = 5 members ✓
- 1 Owner + 1 Admin + 1 Staff = 3 members ✓

**Invalid:**
- 1 Owner + 5 Staff = 6 members ✗ (exceeds limit)

### Need More Users?

Contact support to discuss enterprise options if your business requires more than 5 team members.

---

## Billing Per Tenant

Each tenant has its own subscription and billing cycle.

### How Billing Works

- **Separate invoices** for each tenant
- **Independent subscription status** (one tenant's expired subscription doesn't affect others)
- **Grace period** applies per tenant
- Billing periods use same-day boundaries (e.g. 3 Mar – 3 Apr); payment is due on the renewal date

### Managing Multiple Tenants

If you own multiple tenants:

1. Switch to each tenant individually
2. Navigate to **Billing** in the sidebar
3. Manage that tenant's subscription (invoices, add-ons, payment)

For full billing details, see [Billing & Subscription](?doc=administration/billing-and-subscription).

---

## Creating a New Tenant

To register a new tenant (new shop/license):

1. Contact TrueKredit support
2. Provide your business registration details
3. A new tenant will be created and linked to your account

**Note:** Self-service tenant creation is not available. All new tenants must be verified by our team to ensure compliance.

---

## Frequently Asked Questions

### Can I merge two tenants?

No, tenants cannot be merged. Each tenant represents a separate legal entity with its own records.

### Can I transfer ownership of a tenant?

Yes. As the Owner, go to **Settings** > **Team Members**, find an active user, and click the crown icon to transfer ownership. You will be demoted to Admin and the selected user becomes the new Owner.

### Do team members automatically have access to all my tenants?

No. Team members must be added to each tenant individually. A user in Tenant A does not automatically have access to Tenant B.

### Can I have different roles in different tenants?

Yes. Your role is determined per-tenant. You might be an Owner in one tenant and a Staff member in another.

### What happens if one tenant's subscription expires?

Only that specific tenant is affected. Your other tenants continue to operate normally.

### How do I know which tenant I'm currently viewing?

The current tenant name is displayed in the sidebar's tenant switcher. All data shown on the page belongs to that tenant.
