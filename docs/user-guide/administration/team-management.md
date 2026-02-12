---
title: Team Management
order: 1
---

# Team Management

Manage your team members and control access to your TrueKredit workspace.

---

## Team Member Limits

Each tenant can have a **maximum of 5 team members**, including the Owner.

| Role | Count Towards Limit |
|------|---------------------|
| Owner | Yes |
| Admin | Yes |
| Staff | Yes |

If you need additional team members, please contact support.

---

## User Roles

TrueKredit uses three roles to control access. For a full permission breakdown, see [Roles & Permissions](?doc=getting-started/roles-and-permissions).

### Owner

- Full access to all features
- Manage billing and subscription
- Add, activate, and deactivate team members
- Switch member roles (Admin ↔ Staff)
- Transfer ownership to another member
- Access admin logs
- Cannot be removed or deactivated

### Admin

- Approve and reject loan applications
- Create, edit, and delete loan products
- Add team members (cannot transfer ownership or activate/deactivate users)
- Edit organization information and logo
- Access admin logs and billing
- Generate compliance reports and exports

### Staff

- Create and manage borrowers
- Create loan applications (cannot approve or reject)
- Record payments, disburse loans, early settlements, and discharges
- View loan products (cannot create, edit, or delete)
- Access compliance reports and exports
- View Settings page in read-only mode (team list, organization info)
- Cannot access billing or admin logs

---

## Adding Team Members

**Requires:** Owner or Admin role

1. Navigate to **Settings** from the sidebar
2. In the **Team Members** section, click **Add User**
3. Fill in the required information:
   - **Email** (required): The user's login email
   - **Name** (optional): Display name
   - **Password** (required): Temporary password (min 8 characters)
   - **Role** (required): Select Admin or Staff
4. Click **Add User**

The new team member can immediately log in using the provided credentials.

---

## Managing Existing Members

### Activating/Deactivating Users

**Requires:** Owner role

1. Go to **Settings** > **Team Members**
2. Find the user in the table
3. Click the activate/deactivate button

- Deactivated users cannot log in
- Their data and audit history is preserved
- The slot still counts towards your 5-member limit
- You can reactivate them at any time

### Switching a Member's Role

**Requires:** Owner role

The Owner can switch any active non-Owner member between **Admin** and **Staff**.

1. Go to **Settings** > **Team Members**
2. Find the user in the table
3. Click the **arrow icon** (Switch to Admin / Switch to Staff)

The role change takes effect immediately. The member's permissions update the next time they load a page. This action is recorded in [Admin Logs](?doc=administration/admin-logs).

### Transferring Ownership

**Requires:** Owner role

Ownership transfer designates a different team member as the organization Owner.

1. Ensure the target user is **active**
2. Find the user in the team table
3. Click the **crown icon** (Transfer Ownership)
4. Review the warning carefully
5. Click **Transfer Ownership** to confirm

**What happens:**
- You will be demoted from Owner to Admin
- The selected user becomes the new Owner
- Only the new Owner can transfer ownership back

**Warning:** This action cannot be undone by you.

---

## Multi-Tenant Access

A single email can belong to multiple tenants with different roles:

```
john@example.com:
├── "ABC Money Lending" → Owner
├── "XYZ Credit Services" → Admin
└── "Partner Finance Co." → Staff
```

Use the **tenant switcher** in the sidebar to switch between tenants. Your role and permissions change with each switch.

---

## Security Best Practices

- Use strong, unique passwords for each team member
- Regularly review team member access
- Deactivate users who no longer need access
- Monitor the login history in Settings > Security
