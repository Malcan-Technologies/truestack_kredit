Absolutely. Below is a **clean, copy-paste-ready `PROMPT.md`** you can hand directly to Cursor.
It is written as an **execution-grade build plan**, assumes your **existing Prisma + Better Auth codebase**, and walks Cursor **step by step** with zero ambiguity.

---

# Profile Page & Referral Code Feature

**Execution Prompt for Cursor**

---

## Project Context

This is an **existing multi-tenant Loan Management SaaS** (Investor Portal only).

### Core concepts

* **User (Profile)**

  * Identity layer (Better Auth compatible)
  * Signs in via email
  * Can belong to multiple tenants
* **Tenant**

  * Investor organization
  * Applies for loans
  * Manages borrowers (manual registration only)

There is **no borrower self-signup flow**.

The codebase already includes:

* Authenticated routing
* Sidebar layout
* Bottom-left user dropdown menu
* `/settings` page
* Prisma + PostgreSQL
* Better Auth models
* Existing UI components for cards, buttons, toasts

---

## Objective

Implement a **new `/profile` page** and a **User-level Referral Code feature**, and refactor existing UI so:

* Profile-related UI lives in `/profile`
* `/settings` becomes tenant-only
* Referral code is stored in the database
* `/profile` is accessible from the user dropdown menu

Do **not** rebuild or restructure existing architecture.

---

## Step 1 — Database Change (Prisma)

### Requirement

Referral codes belong to the **User**, not the Tenant.

### Action

Extend the existing `User` model with a referral code field.

### Prisma schema change

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  emailVerified Boolean  @default(false)
  name          String?
  image         String?
  referralCode  String?  @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  isActive          Boolean   @default(true)
  passwordChangedAt DateTime?

  sessions Session[]
  accounts Account[]
  memberships TenantMember[]
  adminAuditLogs AdminAuditLog[]

  @@index([email])
  @@index([referralCode])
}
```

### Migration

Generate and apply a Prisma migration.

Referral codes must:

* Be unique
* Be persistent
* Never rotate automatically

---

## Step 2 — Referral Code Logic

### Business Rules

* Referral code is generated **once per user**
* Generated lazily (on first access)
* Stored permanently
* Uppercase alphanumeric
* 6–8 characters
* Human-friendly (avoid ambiguous characters)

### Required helper

Create a reusable backend function:

```ts
getOrCreateReferralCode(userId)
```

Behavior:

* If `User.referralCode` exists → return it
* Else → generate, save, return

Code should be structured for API usage even if currently called server-side.

---

## Step 3 — Create `/profile` Page

### Routing

* Add a new authenticated route: `/profile`
* Use the same layout as other authenticated pages (sidebar, top bar)

---

### Page Content

#### 1. Profile Card (Existing UI)

Move the existing **“My Profile” card** from `/settings` to `/profile`.

The card displays:

* Name
* Email
* Role
* Edit Profile button

Do not change:

* Data source
* Edit behavior
* Validation logic

This is a **UI relocation only**.

---

#### 2. Referral Code Card (New)

Add a new card below the Profile card.

##### Card details

**Title:** Referral Code

**Content:**

* Referral Code (6 alphanumeric, e.g. `7K3P9A`)
* Referral Link
  `https://app.<domain>/signup?ref=<code>`

##### Actions

* Copy referral code button
* Copy referral link button
* Show success feedback (toast or inline state)

##### Behavior

* On page load:

  * Fetch referral code via `getOrCreateReferralCode`
* If code does not exist:

  * Generate and persist automatically

---

## Step 4 — Refactor `/settings` Page

### Remove

* Remove the **Profile card** from `/settings`

### Keep unchanged

* Tenant Information
* Team Members
* All tenant-level actions

After refactor:

* `/settings` = tenant-focused only
* `/profile` = user-focused only

---

## Step 5 — Navigation Update

### Bottom-Left User Dropdown

Modify the existing user dropdown menu.

#### Add / update menu items

* **Account** → navigates to `/profile`
* Notifications → unchanged
* Switch to Issuer Portal → unchanged
* Logout → unchanged

Clicking avatar or username should **not** auto-navigate.

---

## Step 6 — UX & Code Standards

* Reuse existing components and styles
* Follow current spacing and card design
* Keep logic separated:

  * UI components
  * referral code logic
  * data fetching
* No breaking changes
* No tenant schema changes
* No new tables

If assumptions are required:

* Document them in comments
* Do not invent new product behavior

---

## Acceptance Criteria

* `/profile` page exists and is accessible
* Profile card moved successfully
* Referral code is:

  * Generated once
  * Stored in database
  * Copyable
* `/settings` contains no user profile UI
* Navigation works correctly
* No Prisma or runtime errors

---

## Notes

This implementation is **v1-safe** and supports future:

* Referral tracking
* Analytics
* Rewards
* Multi-tenant growth

Do not over-engineer beyond the steps above.

---

If you want next:

* I can generate a **Cursor “implementation checklist”**
* Or write the **exact Prisma + TS helper function**
* Or design the **signup → tenant creation flow using referral codes**

Just say the word 🚀
