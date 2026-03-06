---
title: Roles & Permissions
order: 3
---

# Roles & Permissions

TrueKredit uses a simple role-based access system to control what each team member can do within your organization. Your role is set per tenant, so you may have different roles across different organizations.

---

## The Three Roles

### Owner

The Owner is the primary account holder for the tenant. Each tenant has exactly one Owner.

- Full access to every feature
- Manage billing and subscription
- Add, activate, and deactivate team members
- Switch member roles (Admin ↔ Staff)
- Transfer ownership to another member
- Cannot be removed or deactivated

### Admin

Admins have broad management access but cannot transfer ownership.

- Approve and reject loan applications
- Create, edit, and delete loan products
- Manage team members (add users, but cannot transfer ownership)
- Edit organization information and logo
- Access admin logs
- View and manage billing and subscription

### Staff

Staff members handle day-to-day loan operations with limited administrative access.

- Create and manage borrowers
- Create loan applications (but **cannot approve or reject** them)
- Record payments, disburse loans, process early settlements and discharges
- View loan products (but **cannot create, edit, or delete** them)
- Access compliance reports and exports
- Use the loan calculator and help center
- View organization info and team list in Settings (read-only)
- Change their own password and view their login activity

---

## Permission Reference

| Feature | Owner | Admin | Staff |
|---------|-------|-------|-------|
| **Dashboard** | Full | Full | Full |
| **Borrowers** (create, view, edit) | Full | Full | Full |
| **Applications** (create, view) | Full | Full | Full |
| **Applications** (approve / reject) | Yes | Yes | No |
| **Loans** (payments, disburse, settle, discharge) | Full | Full | Full |
| **Products** (create, edit, delete) | Full | Full | View only |
| **Compliance & Exports** | Full | Full | Full |
| **Billing** | Full | Full | Blocked |
| **Admin Logs** | Full | Full | Blocked |
| **Settings** (org info, team, role switching) | Full | Full | View only |
| **Settings** (own password, login history) | Full | Full | Full |
| **Promotions** | Full | Full | Full |
| **Calculator / Help** | Full | Full | Full |

---

## How Roles Appear in the App

### Sidebar

Pages you cannot access appear **greyed out** with a lock icon. You can still see them, but clicking is disabled.

### Page-Level Blocking

If you navigate directly to a restricted page (e.g., Billing), you will see an **Access Denied** message instead of the page content.

### Action-Level Restrictions

On pages you can access, restricted actions are hidden. For example, Staff users can view the Products page but will not see the "Add Product" or "Edit" buttons.

### Settings Page

Staff members can view the Settings page in **read-only mode**:

- **Organization Information** is visible but the "Edit Information" button is hidden
- **Team Members** list is visible but the "Add User" button, role switching, and other member actions are hidden
- **Security** section (change password, login history) is fully accessible

---

## Role Differences Per Tenant

Your role is specific to each tenant. If you belong to multiple tenants, you may have different roles in each:

```
john@example.com:
├── "ABC Money Lending" → Owner
├── "XYZ Credit Services" → Admin
└── "Partner Finance Co." → Staff
```

When you switch tenants using the tenant switcher, your role and permissions change accordingly.

---

## Checking Your Role

Your current role is displayed in the sidebar at the bottom, next to your name. It shows a badge with your role (Owner, Admin, or Staff) for the currently active tenant.

---

## Changing Roles

Only the **Owner** can change a team member's role. The Owner can switch any active non-Owner member between **Admin** and **Staff** directly from the Team Members table in Settings.

1. Go to **Settings** > **Team Members**
2. Click the **arrow icon** (Switch to Admin / Switch to Staff) next to the member
3. The change takes effect immediately

Role changes are recorded in [Admin Logs](?doc=administration/admin-logs). If you are not the Owner, contact your organization's Owner to request a role change.

---

## Next Steps

- [Team Management](?doc=administration/team-management) — Learn how to add and manage team members
- [Billing & Subscription](?doc=administration/billing-and-subscription) — Manage your subscription and add-ons
- [Settings](?doc=administration/settings) — Configure your organization
