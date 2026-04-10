# Borrower company members & Better Auth organizations

This document is the **source of truth** for the borrower (`borrower_pro`) feature that maps each **corporate** `Borrower` to exactly one **Better Auth** `Organization`, manages **invitations** (email + shareable open link), and keeps **Better Auth membership** in sync with **`BorrowerProfileLink`** (borrower-app access).

Individual (`INDIVIDUAL`) borrowers **never** get an organization.

## Data model

| Concept | Location |
|--------|----------|
| Corporate borrower | `Borrower` (`borrowerType === CORPORATE`) |
| 1:1 org mapping | `BorrowerOrganizationLink` (`borrowerId` ↔ `organizationId`, `tenantId`) |
| Better Auth org | `Organization` (slug `co-{borrowerId}`, `metadata` may include `borrowerId`) |
| Membership / roles | `Member` (`role` includes comma-separated values; **`owner`**, **`admin`**, **`member`**) |
| Invitations | `Invitation` (`inviteKind`: `email` \| `open_link`) |

Session fields (Better Auth `Session` in DB): `activeBorrowerId`, `activeOrganizationId`, and `activeTeamId` (organization plugin session shape) — borrower flows update borrower/org fields when switching profile, accepting invite, onboarding corporate borrower, or leaving org.

## Ownership & permissions

- **`owner`**: full control (implicit in product; avoid removing last owner).
- **`admin`**: can edit the **company profile** (backend guard) and **manage members / invitations** (same as owner for management UI).
- **`member`**: no management; can **leave** the company workspace.

Backend helpers: `borrowerCompanyOrg.ts` (`canManageCompanyProfile`, `canManageCompanyMembers`, `getOrgRoleForBorrower`, open-invite email helpers).

## Sync boundaries

| Event | Behavior |
|-------|----------|
| Corporate onboarding completes | `createBorrowerCompanyOrgAndLink` creates `Organization` + `Member(owner)` + `BorrowerOrganizationLink`; session gets `activeOrganizationId`. |
| PATCH borrower (corporate) | Requires org **`owner`/`admin`** for mutations; updates org **display name** from borrower. |
| Better Auth `afterAcceptInvitation` | Upserts `BorrowerProfileLink` (CORPORATE); sets session `activeBorrowerId` + `activeOrganizationId`. |
| Better Auth `afterRemoveMember` | Deletes `BorrowerProfileLink` for that user + borrower. |
| `POST /company-members/leave` | Deletes `Member`, deletes profile link, patches session if needed. |
| `POST /switch-profile` | For corporate borrowers, runs **lazy org repair** if `BorrowerOrganizationLink` is missing (same rules as backfill), then sets `activeOrganizationId` when a link exists. |
| Lazy repair (server) | `lazyEnsureBorrowerCompanyOrganization` in `borrowerCompanyOrg.ts` — on company-members context, open-invitation, or switch-profile, creates org + members + link from existing `BorrowerProfileLink` when missing (no manual backfill required in normal cases). |

Drift is avoided by keeping hooks and HTTP routes as the **only** writers for org membership vs profile links.

## Invitations

### Email (`inviteKind: email`)

- Created via Better Auth `organization.inviteMember` (borrower UI: profile **Company members** card).
- Email uses `sendEmail` / Resend; link format: `/accept-invitation?invitationId=…`.
- `requireEmailVerificationOnInvitation: true` — invitee must have a **verified** email that **matches** the invitation before accept.

### Shareable open link (`inviteKind: open_link`)

- Created via `POST /api/borrower-auth/company-members/open-invitation` (synthetic email `open-link-*@borrower-invite.invalid`).
- **Anyone with the link** can bind the invite to **their** signed-in account (`POST …/bind-open-invitation`), then `acceptInvitation`.
- UX warns that the link is sensitive; **revoke** removes pending invite.

## Accept flow (strict order)

1. Sign in / sign up  
2. **Verify email** if required  
3. **2FA** if required (returnTo preserved on `/two-factor`)  
4. **Security setup** (passkey or TOTP) — `/security-setup?returnTo=…` continues back to acceptance  
5. **`/accept-invitation`** — preview kind (`GET …/invitation-preview`), optional **bind** for open links, then `organization.acceptInvitation`  
6. Hooks create **profile link** + session; redirect **`/profile`** (generic **onboarding** skipped once link exists)

Public route: **`/accept-invitation`** (see `Demo_Client/proxy.ts`). Pending path is also stored in `sessionStorage` (`borrower_pending_accept_invitation`) so **sign-up → verify → sign-in** still resumes the invite.

**Post-login routing**: `lib/finish-login.ts` — `returnTo` query wins, then pending invite path, then `profileCount` → `/dashboard` or `/onboarding`.

## Backend routes (borrower-auth)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/company-members/invitation-preview` | Pending invite `inviteKind` + expiry (session required). |
| GET | `/company-members/context` | Org id, role, `canManageMembers`, `canEditCompanyProfile`, `needsOrgBackfill`. |
| POST | `/company-members/open-invitation` | Create open-link invitation (`role`: member \| admin). |
| POST | `/company-members/bind-open-invitation` | Replace synthetic email with signed-in user’s email. |
| POST | `/company-members/leave` | Leave org + remove profile link. |

Other org operations go through **Better Auth** (`/api/auth/...`) via `Demo_Client/lib/auth-client.ts` (`org*` helpers).

## Frontend modules

| Area | Path |
|------|------|
| Better Auth server (org plugin, hooks, emails) | `apps/borrower_pro/Demo_Client/lib/auth-server.ts` |
| Auth client (`organizationClient`, org APIs) | `apps/borrower_pro/Demo_Client/lib/auth-client.ts` |
| Borrower API proxy client | `apps/borrower_pro/lib/borrower-auth-client.ts` |
| Post-login destination | `apps/borrower_pro/lib/finish-login.ts` |
| Accept page | `apps/borrower_pro/Demo_Client/app/accept-invitation/page.tsx` |
| Dashboard gates | `apps/borrower_pro/Demo_Client/app/(dashboard)/layout.tsx` |
| Company members UI | `apps/borrower_pro/components/company-members-card.tsx` |
| Profile | `apps/borrower_pro/Demo_Client/app/(dashboard)/profile/page.tsx` |

## Backfill (existing corporate borrowers)

Script: **`apps/backend_pro/scripts/backfill-borrower-company-orgs.ts`**

```bash
npm run db:backfill:borrower-orgs -w @kredit/backend_pro
```

- Skips borrowers that already have `BorrowerOrganizationLink`.  
- Skips corporates with **no** `BorrowerProfileLink` (reported in summary).  
- **Owner**: user with earliest link (by `createdAt`); others → `member`.  
- Logs JSON summary with counts and first errors.

## Edge cases & risks

- **Open links** are weaker than email-bound invites; pair with clear copy and **revoke**.  
- **Last owner** cannot **leave** (server enforced).  
- **Backfill** must run once per environment after migration.  
- If **`needsOrgBackfill`** appears in UI context, invitations are disabled until mapping exists.

## Related migration

Prisma migrations: `20260409120000_borrower_company_organization` (org tables, `activeOrganizationId`, …); `20260410120000_session_active_team_id` (`Session.activeTeamId` for the organization plugin).
