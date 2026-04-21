---
title: Team Management
order: 1
---

# Team Management

Invite and manage the users who have access to your TrueKredit Pro deployment. Unlike SaaS (which caps each tenant at 5 members and uses 3 fixed roles), Pro supports the full role catalogue and as many members as your licence allows.

---

## Who Can Manage the Team

| Action | Permission required |
|--------|---------------------|
| View team list | `settings.view` (everyone with dashboard access typically has this) |
| Invite a user | `team.invite` |
| Assign a role other than the default invite role | `team.edit_roles` |
| Deactivate / reactivate a user | `team.deactivate` |
| Transfer ownership | Caller must be the current **Owner** |

If a user has `team.invite` but not `team.edit_roles`, new invites default to **General Staff** and the role cannot be changed at invite time.

---

## Team Capacity

Pro does **not** enforce the SaaS 5-member cap inside the app. Team capacity follows your licensing agreement with TrueStack. Confirm your effective cap with the Owner or Super Admin before scaling.

---

## Adding Team Members

**Requires:** `team.invite`

1. Navigate to **Settings → Team Members**
2. Click **Add User**
3. Fill in the required information:
   - **Email** (required)
   - **Name** (optional display name)
   - **Password** (required — temporary, min 8 characters)
   - **Role** — pick from the tenant role catalogue
4. Click **Add User**

The new user can immediately sign in. They will land in your tenant and see only the pages and actions allowed by their role.

> `SUPER_ADMIN` is **not selectable** as an invite role. It is only assigned when the current Owner transfers ownership to an existing member.

---

## Switching a Member's Role

**Requires:** `team.edit_roles` (or Owner)

1. Go to **Settings → Team Members**
2. Find the user
3. Click the **role picker** next to their row
4. Choose a role from the tenant role catalogue

The change takes effect the next time the member loads a page (permissions are re-read from `GET /api/auth/me`).

Role changes are recorded in [Admin Logs](?doc=administration/admin-logs).

> The Owner row is protected. You cannot change the Owner's role from this flow.

---

## Deactivating / Reactivating Users

**Requires:** `team.deactivate`

- Deactivated users **cannot log in**
- Their audit trail, created loans/payments/notes are preserved
- You can reactivate them at any time
- The Owner row **cannot be deactivated** by anyone

---

## Transferring Ownership

**Requires:** caller is the current Owner

Ownership transfer designates a different active member as the new Owner.

1. Ensure the target user is **active**
2. Find the user in the team table
3. Click the **crown icon** (Transfer Ownership)
4. Confirm in the dialog

**What happens:**

- The target user becomes the new **Owner**
- You are automatically demoted to **Super Admin** (same permissions, different role key)
- Only the new Owner can transfer ownership back

Under the hood this calls `POST /api/tenants/transfer-ownership`, which uses the tenant's catalogue `SUPER_ADMIN` role id. The role is auto-seeded on demand if your tenant was created before `SUPER_ADMIN` existed.

---

## Role Catalogue at a Glance

For the full permission breakdown, see [Roles & Permissions](?doc=getting-started/roles-and-permissions) and [Roles Management](?doc=administration/roles-management).

| Role | Typical use |
|------|-------------|
| Owner | Tenant owner, only one per deployment |
| Super Admin | Full permissions, assigned on ownership transfer |
| Ops Admin | Operational admin |
| Credit Officer L1 | Stage-1 application reviewer |
| Approval Authority L2 | Stage-2 final approver |
| Finance Officer | Disbursement, payment & settlement approvals |
| Attestor | Attestation scheduling and witness signing |
| Collections Officer | Arrears and default handling |
| Compliance Officer | KPKT reports and exports |
| General Staff | Day-to-day operations |
| Auditor Read-only | Read-only audit access |

---

## Security Best Practices

- Use unique passwords for each team member
- Review team membership regularly, especially after staff changes
- Deactivate (don't delete) users who leave — this preserves their audit trail
- Monitor **Settings → Recent Login Activity** for suspicious access
- Require L1 and L2 approvers to be different people for segregation of duties

---

## Frequently Asked Questions

### Why can't I assign Super Admin from the invite form?

`SUPER_ADMIN` is reserved for the previous Owner after an ownership transfer. It is never a choice at invite time or role-change time.

### Can I delete a user?

No. Users are deactivated, not deleted, so audit history stays intact.

### What happens to a deactivated user's data?

It stays exactly where it was — loans they created, payments they recorded, notes they wrote. Only their login is disabled.

### Does inviting a user fire any external email?

Depends on the deployment — if outbound email is configured, the platform may send a welcome email with credentials. Check with your deployment owner.

### How do I reset a user's password?

Users manage their own password from Settings → Security. If they are locked out, contact support or the Owner to re-issue credentials.

---

## Related Documentation

- [Settings](?doc=administration/settings)
- [Roles Management](?doc=administration/roles-management)
- [Roles & Permissions](?doc=getting-started/roles-and-permissions)
- [Admin Logs](?doc=administration/admin-logs)
