---
title: Settings
order: 2
---

# Settings

The Settings page is your central hub for managing your personal profile, organization details, team members, and account security.

---

## Accessing Settings

Navigate to **Settings** from the sidebar under Administration to access all configuration options.

---

## My Profile

View and manage your personal account information.

### Viewing Your Profile

Your profile displays:

| Field | Description |
|-------|-------------|
| Name | Your display name |
| Email | Your login email (cannot be changed) |
| Role | Your permission level in this organization |

### Editing Your Profile

1. Click **Edit Profile**
2. Update your name
3. Click **Save Changes**

**Note:** Your email address cannot be changed. Contact support if you need to use a different email.

---

## Organization Information

Manage your organization's details. This information appears on official documents including receipts, Jadual J, Jadual K, and compliance reports.

### Organization Details

| Field | Description | Editable |
|-------|-------------|----------|
| Company Logo | Your organization's logo displayed in the sidebar and documents | Yes (Owner/Admin) |
| Company Name | Your organization's registered name | Yes (Owner/Admin) |
| Tenant Slug | Unique identifier for your organization | No |
| Status | Active or inactive status | No |
| Registration Number (SSM) | Business registration number | Yes (Owner/Admin) |
| Company Email | Organization contact email | Yes (Owner/Admin) |
| Contact Number | Organization phone number | Yes (Owner/Admin) |
| Business Address | Registered business address | Yes (Owner/Admin) |

### Editing Organization Information

**Requirements:** You must be an Owner or Admin to edit organization information.

1. Click **Edit Information**
2. Update the desired fields
3. Click **Save Changes**

### Company Logo

Your company logo appears in the sidebar and on generated documents. Owners and Admins can manage the logo.

#### Uploading a Logo

1. Click **Edit Information** in the Organization Information section
2. Click **Upload Logo**
3. Select an image file from your computer
4. The logo uploads automatically

**Logo Requirements:**
- Maximum file size: 2MB
- Supported formats: JPEG, PNG, WebP
- Recommended: Square or rectangular logo with transparent background

#### Removing a Logo

1. Click **Edit Information** in the Organization Information section
2. Click **Remove Logo** below the current logo
3. Confirm the deletion

**Note:** After uploading or removing a logo, it updates immediately across the application, including the sidebar.

---

## Team Members

Manage users who have access to your TrueKredit workspace.

### Team Limits

Each organization can have a **maximum of 5 team members**, including the owner. The current usage is displayed (e.g., "3/5 members used").

### Viewing Team Members

The team table shows:

| Column | Description |
|--------|-------------|
| User | Name and email |
| Role | Owner, Admin, or Staff |
| Status | Active or Inactive |
| Joined | Date the user was added |
| Actions | Activate/deactivate and transfer ownership options |

### Adding a New User

**Requirements:** You must be an Owner or Admin to add users.

1. Click **Add User** (disabled if limit reached)
2. Fill in the user details:
   - **Email** (required): The user's login email
   - **Name** (optional): Display name
   - **Password** (required): Temporary password (min 8 characters)
   - **Role** (required): Staff or Admin
3. Click **Add User**

The new user can immediately log in with the provided credentials.

### User Roles

| Role | Permissions |
|------|-------------|
| Owner | Full access, billing, can manage all users, can transfer ownership, cannot be removed |
| Admin | Manage loans/borrowers, add/edit users (except Owner), view billing |
| Staff | Create borrowers, loan applications, view loans/products |

### Activating/Deactivating Users

**Requirements:** Only Owners can activate/deactivate users.

1. Find the user in the team table
2. Click the activate/deactivate button in the Actions column

**Note:** 
- Deactivated users cannot log in
- The Owner account cannot be deactivated
- Deactivating preserves the user's data and audit history

### Transferring Ownership

**Requirements:** Only the current Owner can transfer ownership to another user.

Ownership transfer allows you to designate a different team member as the organization Owner. This is useful when company leadership changes or when you need to hand over administrative responsibilities.

#### How to Transfer Ownership

1. Ensure the target user is **active** (inactive users cannot receive ownership)
2. Find the user in the team table
3. Click the **crown icon** (Transfer Ownership) in the Actions column
4. Review the warning message carefully
5. Click **Transfer Ownership** to confirm

#### What Happens When You Transfer Ownership

- **You** will be demoted from Owner to Admin
- **The selected user** will become the new Owner
- Only the new Owner can transfer ownership back to you
- All your existing data and audit logs remain intact

**Warning:** This action cannot be undone by you. Only the new Owner can transfer ownership back.

---

## Security

Manage your account security settings.

### Change Password

1. Click **Change Password**
2. Enter your current password
3. Enter your new password (minimum requirements below)
4. Confirm your new password
5. Click **Update Password**

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

**Important:** After changing your password, you will be logged out and redirected to the login page. All active sessions will be invalidated.

### Password Visibility Toggle

Use the eye icon next to password fields to show/hide the password as you type.

### Last Password Change

The Security section shows when your password was last changed. If displayed as "Never", consider setting a strong password.

---

## Recent Login Activity

Monitor your account access with the login history table.

### Login History Table

| Column | Description |
|--------|-------------|
| Date & Time | When the login occurred (relative time, hover for full date) |
| Device | Device type detected (Desktop, Mobile, etc.) |
| IP Address | The IP address used for login |

### Security Tips

- Review login history regularly for suspicious activity
- If you see unfamiliar logins, change your password immediately
- Report suspicious activity to your administrator

---

## Frequently Asked Questions

### Can I change my email address?

No, email addresses cannot be changed through the Settings page. Contact support if you need to use a different email.

### Can I edit my organization's information?

Yes, if you are the Owner or Admin. Click **Edit Information** in the Organization Information section to update company name, registration number, email, contact number, and business address.

### What happens when I deactivate a user?

- The user cannot log in
- Their data remains intact
- Audit logs are preserved
- The user slot is still counted towards your limit
- You can reactivate them at any time

### Can I delete a user completely?

No, users can only be deactivated to maintain audit trail integrity. Deactivated users don't affect your daily operations.

### How do I upgrade my role?

Role changes must be made by an Owner. Contact your organization's Owner to request a role change.

### What if I forget my password?

Use the "Forgot Password" link on the login page to reset your password via email.

### Can I remove the Owner?

No, the Owner account cannot be removed or deactivated. However, the Owner can transfer ownership to another active team member.

### How do I transfer ownership of my organization?

As the Owner, go to Team Members, find an active user, and click the crown icon to transfer ownership. You will be demoted to Admin, and the selected user will become the new Owner.

### Why can't I add more users?

Each organization is limited to 5 users. You can:
- Deactivate unused accounts (they still count towards limit)
- Contact support to discuss enterprise options

### Where does my organization information appear?

Your organization details (company name, registration number, address, logo) appear on:
- Payment receipts
- Jadual J (Schedule J) reports
- Jadual K (Schedule K) reports
- Compliance reports and official documents
