---
title: Roles Management
order: 3
---

# Roles Management

The **Roles** page (`/dashboard/roles`) is where users with the `roles.manage` permission inspect and customise the tenant role catalogue. This page is Pro-only — SaaS does not expose role-matrix editing.

---

## Who Can Access This Page

**Permission:** `roles.manage`

By default, this is held by **Owner**, **Super Admin**, and **Ops Admin**. You can grant it to other roles if your operational model requires.

---

## What You Can Do

- View every seeded and custom role in this tenant
- Open any **editable** default or custom role and adjust its permission matrix
- Create a new **custom tenant role** with a unique key
- **Clone** an existing role as the starting point for a new custom role
- **Reset** an editable default role back to the platform default
- See whether a role is system-managed (not editable) or editable

---

## The Role Catalogue

See [Roles & Permissions](?doc=getting-started/roles-and-permissions) for the full default catalogue and permission domains.

- `OWNER` and `SUPER_ADMIN` are **immutable** — they appear in the list but cannot be edited
- All other default roles (`OPS_ADMIN`, `GENERAL_STAFF`, `CREDIT_OFFICER_L1`, etc.) are editable, and your edits persist through platform upgrades (they are only overwritten when you click **Reset to default**)
- Custom roles are fully tenant-owned and are never overwritten by platform changes

---

## Creating a Custom Role

1. Go to **Roles**
2. Click **New Role** (or **Clone** on an existing role)
3. Fill in:
   - **Name** — human-readable label shown in the team table
   - **Description** — optional
   - **Permissions** — tick the `resource.action` permissions this role should hold
4. Click **Save**

The platform generates a unique tenant-local role key for the new role. From now on, this role is selectable in the team **Add User** and **Change Role** flows (subject to `team.edit_roles`).

---

## Editing an Existing Role

1. Open the role from the Roles list
2. Toggle permissions on or off
3. Click **Save**

The change affects every existing member assigned to that role at the next request — they re-read their permissions from `GET /api/auth/me`.

> Editing `OWNER` and `SUPER_ADMIN` is not permitted. If you need to restrict a full-access role, create a new role and re-assign members to it.

---

## Resetting a Default Role

If you have customised an editable default (e.g. `OPS_ADMIN`) and want to go back to the platform template:

1. Open the role
2. Click **Reset to default**
3. Confirm

The role's permission matrix is replaced with the current platform template. Custom roles never show this action.

---

## Assigning Roles to Members

Role assignment is done in **Settings → Team Members**, not on this page. See [Team Management](?doc=administration/team-management).

If a user has `team.invite` but not `team.edit_roles`:

- They can invite members, but new invites default to **General Staff**
- The role dropdown at invite time is disabled

---

## How the Catalogue Stays In Sync

The platform keeps a shared role catalogue definition (`packages/shared/src/rbac.ts`) with a revision number. When you open a role-aware page:

- Missing **preset** roles (e.g. a newly-introduced default) are **inserted** on demand
- Existing editable defaults with your customisations are **not overwritten**
- Immutable presets (`OWNER`, `SUPER_ADMIN`) are re-aligned from the template on a full sync
- Per-process caching means a fully-synced tenant skips re-seeding on every request — reloading the Roles page does not re-run inserts/updates

If an older tenant was created before a new preset existed, the next time a role-aware route is hit, that preset is quietly added. You can also click **Reset** on any editable default to pick up platform improvements.

---

## Audit Trail

All role creations, edits, deletions, and resets are logged. See [Admin Logs](?doc=administration/admin-logs).

---

## Frequently Asked Questions

### Can I delete a default role?

No. Default roles can be edited or reset, but not deleted.

### Can I delete a custom role?

Yes, as long as no active members are assigned to it. Re-assign or deactivate those members first.

### What happens to members if I change a role's permissions?

They keep the same role key, but their effective permissions follow the new matrix on their next request. No re-invite or password reset is needed.

### Why can't I assign Super Admin when inviting someone?

`SUPER_ADMIN` is reserved — it is only assigned automatically when the current Owner transfers ownership to another active member. This is a hard rule, not a UI restriction.

### Does the Owner always hold every permission?

Yes. `OWNER` is an immutable preset with full permissions; it cannot be edited or narrowed.

---

## Related Documentation

- [Roles & Permissions](?doc=getting-started/roles-and-permissions)
- [Team Management](?doc=administration/team-management)
- [Admin Logs](?doc=administration/admin-logs)
