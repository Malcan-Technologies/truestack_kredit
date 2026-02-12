---
title: Settings
order: 2
---

# Settings

The Settings page lets you view and manage your organization details, team members, and account security. What you can do on this page depends on your role.

---

## Who Can Access What

| Section | Owner | Admin | Staff |
|---------|-------|-------|-------|
| Organization Information | View & Edit | View & Edit | View only |
| Team Members | Full management | Add users | View only |
| Security (own password, login history) | Full | Full | Full |

Staff members see the Settings page in **read-only mode** — all information is visible but management actions (edit, add, activate/deactivate) are hidden.

---

## Organization Information

Your organization details appear on official documents including payment receipts, Jadual J, Jadual K, and compliance reports.

### Details

| Field | Description | Editable |
|-------|-------------|----------|
| Company Logo | Displayed in the sidebar and on documents | Yes (Owner/Admin) |
| Company Name | Your registered business name | Yes (Owner/Admin) |
| Tenant Slug | Unique identifier for your organization | No |
| License Type | PPW (Pemberi Pinjam Wang) or PPG (Pemberi Pajak Gadai) | No |
| Status | Active or inactive | No |
| KPKT License Number | Your KPKT-issued license number | Yes (Owner/Admin) |
| Registration Number (SSM) | Business registration number | Yes (Owner/Admin) |
| Company Email | Organization contact email | Yes (Owner/Admin) |
| Contact Number | Organization phone number | Yes (Owner/Admin) |
| Business Address | Registered business address | Yes (Owner/Admin) |

### Editing Organization Information

**Requires:** Owner or Admin role

1. Click **Edit Information**
2. Update the desired fields
3. Click **Save Changes**

### Company Logo

Your logo appears in the sidebar and on generated documents.

**Uploading a logo:**

1. Click **Edit Information**
2. Click **Upload Logo**
3. Select an image file

**Logo requirements:**
- Maximum file size: 2MB
- Supported formats: JPEG, PNG, WebP

**Removing a logo:**

1. Click **Edit Information**
2. Click **Remove Logo** below the current logo

The logo updates immediately across the application after upload or removal.

---

## Team Members

Manage users who have access to your organization. Each organization can have a **maximum of 5 team members** including the Owner. The current usage is displayed (e.g., "3/5 members used").

For full details on adding members, roles, and ownership transfer, see [Team Management](?doc=administration/team-management).

### Quick Reference

| Action | Who Can Do It |
|--------|---------------|
| View team list | Everyone |
| Add a user | Owner, Admin |
| Activate/deactivate a user | Owner only |
| Switch a member's role (Admin ↔ Staff) | Owner only |
| Transfer ownership | Owner only |

---

## Security

Manage your own account security. This section is available to **all roles**.

### Change Password

1. Click **Change Password**
2. Enter your current password
3. Enter your new password
4. Confirm your new password
5. Click **Update Password**

**Password requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

**Important:** After changing your password, you will be logged out and redirected to the login page. All active sessions are invalidated.

### Password Visibility

Use the eye icon next to password fields to show or hide the password as you type.

### Last Password Change

Shows when your password was last changed. If it says "Never", consider setting a strong password.

---

## Recent Login Activity

Monitor your account access with the login history table.

| Column | Description |
|--------|-------------|
| Date & Time | When the login occurred (hover for full date) |
| Device | Device type detected (Desktop, Mobile, etc.) |
| IP Address | The IP address used for login |

**Security tips:**
- Review login history regularly for suspicious activity
- If you see unfamiliar logins, change your password immediately
- Report suspicious activity to your administrator

---

## Frequently Asked Questions

### Can Staff members see Settings?

Yes. Staff can view organization information and the team list, and manage their own password and login history. They cannot edit organization details, add users, or manage team members.

### Can I change my email address?

No. Contact support if you need to use a different email.

### What happens when I deactivate a user?

- The user cannot log in
- Their data and audit logs remain intact
- The slot still counts towards your 5-member limit
- You can reactivate them at any time

### Can I delete a user completely?

No. Users can only be deactivated to maintain audit trail integrity.

### How do I change a member's role?

The **Owner** can switch any non-Owner member between Admin and Staff. In the Team Members table, click the **arrow icon** (Switch to Admin / Switch to Staff) next to the member. The change takes effect immediately and is recorded in Admin Logs.

### How do I upgrade my role?

Contact your organization's Owner to request a role change.

### Where does my organization information appear?

Your details (company name, registration number, address, logo) appear on:
- Payment receipts
- Jadual J (Schedule J) reports
- Jadual K (Schedule K) reports
- Lampiran A reports
- Compliance reports and official documents
