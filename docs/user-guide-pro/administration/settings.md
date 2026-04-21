---
title: Settings
order: 2
---

# Settings

Manage your organisation details, team members, and personal account security. Access to each section depends on the permissions granted by your role.

> TrueKredit Pro is single-tenant — there is **no subscription, plan, or billing section** inside the admin app. Licensing for your deployment is handled outside the app (see [Single-Tenant Deployment Model](?doc=getting-started/deployment-model)).

---

## Section Access

| Section | Required permission |
|---------|---------------------|
| View Organisation Information | `settings.view` |
| Edit Organisation Information | `settings.edit` |
| View Team Members | `settings.view` |
| Manage Team Members | `team.invite`, `team.edit_roles`, `team.deactivate` |
| Security (own password, login history) | Available to everyone |

Users without the corresponding permissions see the section in read-only mode or not at all.

---

## Organisation Information

Your organisation details appear on official documents (payment receipts, Jadual J, Jadual K, Lampiran A, compliance reports, signed agreements).

### Fields

| Field | Editable by |
|-------|-------------|
| Company Logo | `settings.edit` |
| Company Name | `settings.edit` |
| Tenant Slug | Read-only |
| Licence Type (PPW / PPG) | Read-only |
| Status (Active / Inactive) | Read-only |
| KPKT Licence Number | `settings.edit` |
| SSM Registration Number | `settings.edit` |
| Company Email | `settings.edit` |
| Contact Number | `settings.edit` |
| Business Address | `settings.edit` |

### Editing

1. Click **Edit Information**
2. Update fields
3. Click **Save Changes**

### Company Logo

Appears in the sidebar and on generated documents.

- Max file size: **2 MB**
- Formats: JPEG, PNG, WebP
- Upload: **Edit Information → Upload Logo**
- Remove: **Edit Information → Remove Logo**

Changes apply immediately across the admin app and borrower portal.

---

## Team Members

Every team member belongs to your (single) tenant. Each member has exactly one role from the tenant role catalogue.

### Quick Reference

| Action | Permission |
|--------|------------|
| View team list | `settings.view` |
| Add user | `team.invite` |
| Change a member's role | `team.edit_roles` |
| Activate / deactivate a user | `team.deactivate` |
| Transfer ownership | Current Owner only |

For walkthroughs, see [Team Management](?doc=administration/team-management) and [Roles Management](?doc=administration/roles-management).

---

## Security

Available to **all users**.

### Change Password

1. Click **Change Password**
2. Enter current password
3. Enter new password (requirements below)
4. Confirm new password
5. Click **Update Password**

**Password requirements:**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

After changing your password, all active sessions are invalidated and you are logged out.

### Password Visibility

Use the eye icon to show or hide passwords as you type.

### Last Password Change

Shows when your password was last changed. "Never" means you are still on the initial password — change it immediately.

---

## Multi-Factor Authentication (MFA)

If enabled on your deployment, MFA is managed via Better Auth. Your deployment may show an MFA setup flow on first sign-in or from the Security section. Follow the in-app prompts to enrol a TOTP app or hardware key.

Ownership of the sign-in and MFA surfaces is with Better Auth, not TrueKredit directly.

---

## Recent Login Activity

Monitor access to your account.

| Column | Description |
|--------|-------------|
| Date & Time | When the login occurred |
| Device | Detected device type |
| IP Address | IP used for login |

Review the list regularly. If you see logins you did not make, **change your password immediately** and notify the Owner or Super Admin.

---

## Where Organisation Info Appears

- Payment receipts
- Jadual J (Schedule J) reports
- Jadual K (Schedule K) reports
- Lampiran A reports
- Compliance reports and CSV exports
- Signed loan agreements (company name, licence number, registration number)
- Borrower portal branding (company name, logo)

Keep this information accurate — it flows into regulatory documents.

---

## Frequently Asked Questions

### Why is there no billing / subscription page here?

TrueKredit Pro is licensed at the deployment level. There is no in-app subscription to manage. See [Single-Tenant Deployment Model](?doc=getting-started/deployment-model).

### Can read-only users see Settings?

Yes. Anyone with `settings.view` can open Settings and see Organisation Information and the Team list in read-only form. Action buttons are hidden unless the user holds the corresponding `settings.edit` / `team.*` permissions.

### Can I change my email address?

No — contact your deployment owner or TrueStack support.

### What happens when I deactivate a user?

- They cannot sign in
- Their audit trail and created records are preserved
- They can be reactivated at any time

### Can I delete a user completely?

No. Users are deactivated to preserve audit trail integrity. This is by design for compliance.

### How is my organisation info used on Lampiran A?

See [Lampiran A](?doc=compliance/lampiran-a).

---

## Related Documentation

- [Team Management](?doc=administration/team-management)
- [Roles Management](?doc=administration/roles-management)
- [Admin Logs](?doc=administration/admin-logs)
- [Single-Tenant Deployment Model](?doc=getting-started/deployment-model)
