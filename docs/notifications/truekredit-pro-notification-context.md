# TrueKredit Pro Notification Context

This document captures the current unified notification implementation for TrueKredit Pro after reconciling the work-in-progress notification branch with the latest `main` branch updates.

## Current Baseline

- The latest `main` branch did **not** include a separate borrower/admin notification module yet.
- It did introduce the new L1/L2 application approval workflow and `PENDING_L2_APPROVAL` status, which affects applicant targeting and approval-related notification behavior.
- The notification implementation in this branch is therefore built **on top of** that newer `main` baseline.

## Goals

- Keep existing TrueSend email flows as the formal email channel.
- Add borrower in-app notifications for web and mobile.
- Add mobile push delivery for borrower mobile only.
- Give tenant admins one place to manage automation toggles, broadcast announcements, and view delivery history.
- Keep notifications enabled by default for new tenants.
- Tie access to tenant RBAC.

## Channel Rules

- `email`
  - Backed by existing TrueSend email delivery.
  - Used for formal lifecycle notices and reminders.
- `in_app` (**Web + App** in admin UI)
  - Stored in `BorrowerNotification`.
  - Visible in borrower **web** and **mobile in-app** notification centers (one canonical row per event).
- `push` (**App (Push)** in admin UI)
  - **Add-on channel**, not a substitute for the inbox.
  - Mobile-only: sent through **Expo** using registered devices in `BorrowerPushDevice`.
  - Borrower web does not receive browser push in this implementation.

### Push requires Web + App (product rule)

**`push` never stands alone.** If mobile OS push is enabled for an automation or broadcast, the system **always** treats **`in_app` as enabled** for that send:

- **Orchestration** (`NotificationOrchestrator.notifyBorrowerEvent`): after resolving tenant toggles and overrides, if `effectiveChannels.push` is true, **`effectiveChannels.in_app` is forced to true** so the borrower always gets the shared inbox record plus any push fan-out.
- **Tenant settings** (`getNotificationChannelState`): effective **`in_app`** is **`true`** when either the `in_app` or `push` row is enabled in `TenantNotificationSetting` (so push cannot imply “no inbox”).
- **Saving automations** (`updateNotificationSettings`): if the payload enables `push` for an event, **`in_app` is persisted as enabled** for that event.
- **Campaign drafts** (`createDraft`): if `channels` includes `push`, **`in_app` is added** to the stored campaign.
- **Publishing legacy campaigns** that only list `push`: **`in_app` is injected** at publish time so fan-out matches the rule above.

**Admin UI** (`admin_pro` notifications module): Web + App and App (Push) checkboxes are coupled — enabling Push enables Web + App; clearing Web + App clears Push. Delivery logs still show **separate rows** per channel (`in_app` vs `push`) when both fire.

Broadcasts are limited to `in_app` and `push`. They do not use email.

## Data Model

Added in `apps/backend_pro/prisma/schema.prisma`:

- `TenantNotificationSetting`
  - Per-tenant per-event per-channel toggle.
- `BorrowerNotification`
  - Canonical borrower inbox record.
- `BorrowerNotificationDelivery`
  - Delivery log for in-app and push fan-out.
- `BorrowerPushDevice`
  - Registered Expo push tokens for borrower mobile devices.
- `NotificationCampaign`
  - Draft/published/cancelled manual broadcasts.

Related model updates:

- `Borrower` now relates to borrower notifications and push devices.
- `User` can be associated to push devices.

## Notification Catalog

Canonical definitions live in `apps/backend_pro/src/modules/notifications/catalog.ts` (`NOTIFICATION_DEFINITIONS`). Tenant automation toggles and admin UI are generated from this list.

### Borrower scope (web and mobile)

- Borrower inbox records (`BorrowerNotification`) and push fan-out are scoped to the **active borrower profile** (`borrowerId` on the session), not the user account alone.
- Switching organization/borrower in the app changes which inbox rows and devices apply.
- **Account-level** events (for example pure auth/security activity with no borrower context) are **not** modeled here; do not expect those in the borrower notification center.

### Categories

| Category | Meaning |
|----------|---------|
| `payments` | Repayment-related |
| `collections` | Delinquency and formal notices |
| `loan_lifecycle` | Disbursement, agreements, attestation, KYC, signing prep |
| `applications` | Application workflow |
| `announcements` | Manual broadcasts |

### Full automation list (keys, labels, channels)

Channels are the maximum set a tenant may enable; orchestration still respects tenant toggles. **`email`** uses TrueSend where applicable; **`in_app`** persists to `BorrowerNotification`; **`push`** is Expo to registered devices (mobile only).

| Key | Label | Category | Channels |
|-----|-------|----------|----------|
| `payment_receipt` | Payment receipts | `payments` | email, in_app, push |
| `payment_reminder` | Payment reminders | `payments` | email, in_app, push |
| `late_payment_notice` | Late payment notices | `collections` | email, in_app, push |
| `arrears_notice` | Arrears notices | `collections` | email, in_app, push |
| `default_notice` | Default notices | `collections` | email, in_app, push |
| `loan_disbursed` | Loan disbursed | `loan_lifecycle` | email, in_app, push |
| `loan_completed` | Loan completed | `loan_lifecycle` | email, in_app, push |
| `signed_agreement_ready` | Signed agreement ready | `loan_lifecycle` | email, in_app, push |
| `loan_attestation_complete` | Attestation complete | `loan_lifecycle` | in_app, push |
| `loan_kyc_completed` | KYC verification complete | `loan_lifecycle` | in_app, push |
| `loan_signing_certificate_ready` | Digital signing certificate ready | `loan_lifecycle` | in_app, push |
| `attestation_meeting_reminder` | Attestation meeting reminders | `loan_lifecycle` | email, in_app, push |
| `application_submitted` | Application submitted | `applications` | in_app, push |
| `application_approved` | Application approved | `applications` | in_app, push |
| `application_rejected` | Application rejected | `applications` | in_app, push |
| `application_counter_offer` | Lender counter offer | `applications` | in_app, push |
| `application_returned_for_amendments` | Returned for amendments | `applications` | in_app, push |
| `announcement_broadcast` | Announcements | `announcements` | in_app, push |

**Mobile implementation note:** each inbox row includes `notificationKey` and `category` (see `BorrowerNotificationItem` in `packages/borrower/src/types/notifications.ts`). Use `notificationKey` as a stable identifier for copy, icons, or routing; do not hardcode titles from the catalog labels on the client—prefer `title` / `body` from the API.

### Broadcasts (`announcement_broadcast`)

Audience segments for broadcasts:

- `ALL_BORROWERS`
- `ACTIVE_BORROWERS`
- `OVERDUE_BORROWERS`
- `APPLICANTS`

`APPLICANTS` now includes:

- `SUBMITTED`
- `UNDER_REVIEW`
- `PENDING_L2_APPROVAL`

That alignment is important after the L1/L2 approval flow from `main`.

## Backend Responsibilities

### Settings

`apps/backend_pro/src/modules/notifications/settings.ts`

- Ensures default tenant settings exist for every event/channel pair.
- Reads and updates tenant notification toggles.
- Reuses existing TrueSend cadence settings for:
  - payment reminder days
  - late payment notice days

### Orchestration

`apps/backend_pro/src/modules/notifications/orchestrator.ts`

- Resolves whether an event/channel is enabled for the tenant.
- Persists the borrower inbox record.
- Writes delivery logs.
- Sends Expo push for active borrower devices.
- Supports `channelOverrides` so campaigns can explicitly choose `in_app` and/or `push`.
- **If `push` is effective, forces `in_app` on** so push is never “alert-only without inbox” (see *Push requires Web + App* above).

### Campaigns

`apps/backend_pro/src/modules/notifications/campaignService.ts`

- Creates draft campaigns.
- Resolves audience segments.
- Publishes campaigns by fanning out through the same orchestrator.
- Cancels drafts.

### Admin API

`apps/backend_pro/src/modules/notifications/routes.ts`

Admin endpoints:

- `GET /api/notifications/settings`
- `PATCH /api/notifications/settings`
- `GET /api/notifications/campaigns`
- `POST /api/notifications/campaigns`
- `POST /api/notifications/campaigns/:campaignId/publish`
- `POST /api/notifications/campaigns/:campaignId/cancel`
- `GET /api/notifications/deliveries`

Legacy compatibility remains for:

- generic notification list/send/retry endpoints
- TrueSend resend endpoint

### Borrower API

`apps/backend_pro/src/modules/borrower-notifications/routes.ts`

Borrower endpoints under `/api/borrower-auth`:

- `GET /notifications`
- `POST /notifications/read-all`
- `POST /notifications/:notificationId/read`
- `POST /push-devices`
- `POST /push-devices/revoke`
- `DELETE /push-devices/:deviceId`

## Event Emitters and Integration Points

Notification fan-out is invoked from multiple modules. The following aligns **catalog keys** with primary call sites (not exhaustive for every code path):

| Catalog key | Primary integration |
|-------------|---------------------|
| `payment_receipt`, `payment_reminder`, `late_payment_notice`, `arrears_notice`, `default_notice`, `loan_disbursed`, `loan_completed`, `signed_agreement_ready` | `TrueSendService` (email + orchestrated in-app/push where enabled) |
| `attestation_meeting_reminder` | `attestationCronProcessors.ts` (scheduled reminders) |
| `loan_attestation_complete` | `loans/routes.ts`, `borrower-loans/routes.ts` (attestation step completion) |
| `loan_kyc_completed` | `webhooks/truestackKycWebhook.ts` (successful KYC) |
| `loan_signing_certificate_ready` | `loanLifecycleNotify.ts` (certificate detected / enrollment) |
| `application_submitted` | `borrower-applications/routes.ts` |
| `application_approved`, `application_rejected` | `loans/routes.ts` |
| `application_counter_offer`, `application_returned_for_amendments` | `loans/routes.ts` |
| `announcement_broadcast` | `campaignService.ts` / published campaigns |

Other infrastructure:

- `cronJobs.ts` — schedules late payment and related processors that drive TrueSend + orchestration.

## Admin UI

Primary page:

- `apps/admin_pro/app/(dashboard)/dashboard/modules/notifications/page.tsx`

Capabilities:

- channel toggles for automated events (Web + App and App (Push) are coupled: Push requires Web + App)
- TrueSend cadence editing
- draft/publish/cancel broadcast flow (same channel coupling; legacy push-only drafts get `in_app` added on publish)
- delivery log view across email, inbox, and push (separate rows per channel when both fire)

Navigation:

- Sidebar label is now `Notifications`
- Legacy `TrueSend` route redirects to the unified notifications page

## Borrower Web UI

Primary page:

- `apps/borrower_pro/Demo_Client/app/(dashboard)/notifications/page.tsx`

Capabilities:

- list borrower notifications
- unread/read state
- mark one as read
- mark all as read
- deep-link into relevant application/loan pages

## Borrower Mobile UI and Push (Expo — `borrower_pro_mobile`)

### Shared package (types and API)

Use `@kredit/borrower` for typed responses and HTTP helpers:

- `packages/borrower/src/types/notifications.ts` — `BorrowerNotificationItem`, pagination, push device types.
- `packages/borrower/src/api/notifications-client.ts` — `createNotificationsApiClient(baseUrl, fetchFn)`.

Export `createNotificationsApiClient` is re-exported from `packages/borrower/src/index.ts` for mobile imports.

### Base URL and routes

Mobile should call borrower APIs with:

- **Base path:** `{BACKEND_URL}/api/borrower-auth` (same origin as other borrower mobile clients).
- **Relative paths** (appended by the client factory):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/notifications?page=&pageSize=` | Paginated inbox |
| POST | `/notifications/read-all` | Mark all read |
| POST | `/notifications/:id/read` | Mark one read |
| POST | `/push-devices` | Register Expo push token |
| POST | `/push-devices/revoke` | Revoke by token (e.g. sign-out) |
| DELETE | `/push-devices/:deviceId` | Revoke by device id |

Reference wiring:

- `apps/borrower_pro_mobile/Demo_Client/src/lib/api/borrower.ts` — `notificationsClient = createNotificationsApiClient(BASE, sessionFetch)` where `BASE` is `${backendUrl}/api/borrower-auth`.

### Session and prerequisites

- **Authenticated session** (cookie via `sessionFetch` or equivalent) is required for all borrower notification endpoints.
- **Active borrower profile** must be set on the session (`requireActiveBorrower` on the server). Without it, inbox and push registration fail until onboarding selects a borrower.
- Push targets **devices registered for the current `borrowerId` + tenant**, not merely the user id.

### Inbox UI (notification center)

- **Not a tab** — the app keeps a **5-tab** bar per mobile navigation guidelines; notifications are not a root destination.
- **Header bell** (root tab screens only): `apps/borrower_pro_mobile/Demo_Client/src/components/notification-header-button.tsx`, rendered from `PageScreen` beside the borrower profile switcher. Shows unread count; disabled until the user has at least one borrower profile.
- **Full inbox (stack screen):** `apps/borrower_pro_mobile/Demo_Client/src/app/(app)/notifications.tsx` — opened from the header bell (primary entry). Uses `showBackButton`; tab bar is hidden on this drill-down screen.
- Render list from `BorrowerNotificationItem`: use `title`, `body`, `readAt`, `createdAt`, and optionally `notificationKey` / `category` for badges or navigation.
- **Deep links:** `deepLink` may be a path inside the app (e.g. loan or application routes). When opening from a push, prefer navigating to `deepLink` after resolving the route table.

### Push (Expo)

Key files:

- `apps/borrower_pro_mobile/Demo_Client/src/lib/notifications/push-provider.tsx` — lifecycle / listeners.
- `apps/borrower_pro_mobile/Demo_Client/src/lib/notifications/push-registration.ts` — permission, token, register with backend.
- `apps/borrower_pro_mobile/Demo_Client/src/lib/notifications/device-storage.ts` — persisted token for revoke on sign-out.

**Incoming push payload** (for handling taps and marking read): server sends at least `notificationId` and optional `deepLink` in the notification `data` object. Helpers such as `getNotificationData()` in `push-registration.ts` read these fields.

**Behavior (Demo Client):**

- Push registration runs when session + active borrower exist, on a physical device, and after notification permission (see `push-registration.ts` for guards).
- Tapping a notification navigates using `deepLink` when present; flows may mark the row read via `notificationId`.
- Sign-out should revoke the stored token (`revokePushDeviceByToken`) before clearing the session.

**Expo project setup:**

- `expo-notifications` dependency and Expo config plugin in `apps/borrower_pro_mobile/Demo_Client/app.config.ts`.
- EAS / project id: `EXPO_PUBLIC_EXPO_PROJECT_ID` or `extra.eas.projectId` for push (see `resolveExpoProjectId` in `push-registration.ts`).

### Implementation checklist (new screens or forks)

1. Point `createNotificationsApiClient` at `{BACKEND_URL}/api/borrower-auth` with an authenticated fetch that sends session cookies (or the auth mechanism your app uses consistently with `backend_pro`).
2. Ensure onboarding or borrower switcher sets `activeBorrowerId` before expecting inbox or push to work.
3. Map `notificationKey` only for UX affordances; server remains source of truth for `title`/`body`.
4. Handle `deepLink` from both inbox rows and push `data` for consistent navigation.
5. On logout: revoke push token then clear local session/device storage.

## RBAC Mapping

Shared RBAC catalog:

- `packages/shared/src/rbac.ts`

Notification permissions:

- `notifications.view`
- `notifications.manage_settings`
- `notifications.send_broadcast`
- `notifications.view_logs`

Frontend access mapping:

- `apps/admin_pro/lib/permissions.ts`

Default roles updated with notification access where relevant, including:

- `OPS_ADMIN`
- `GENERAL_STAFF`
- `CREDIT_OFFICER_L1`
- `APPROVAL_AUTHORITY_L2`
- `FINANCE_OFFICER`
- `AUDITOR_READONLY`

## Tests Added

Focused backend tests:

- `campaignService.test.ts`
  - verifies applicant targeting includes `PENDING_L2_APPROVAL`
- `orchestrator.test.ts`
  - verifies in-app plus push fan-out and borrower scoping
- `rbac.test.ts`
  - verifies notification permissions exist in the shared RBAC catalog and seeded roles

## Validation Performed

Completed during implementation:

- `npm run build -w @kredit/shared`
- `npm run build -w @kredit/borrower`
- `npm run db:generate -w apps/backend_pro`
- `npm run lint -w apps/backend_pro`
- `npm run lint -w apps/admin_pro`
- `npm run lint -w apps/borrower_pro/Demo_Client`
- `npm run lint -w demo_client`
- `npm run test -w apps/backend_pro -- src/modules/notifications/campaignService.test.ts src/modules/notifications/orchestrator.test.ts src/modules/notifications/rbac.test.ts`

## Migration and Deployment Notes

If the Pro notification tables are not yet applied in your environment, create and run a migration from `apps/backend_pro` (use a descriptive name; `add_pro_notification_center` was used when this feature landed):

```bash
cd apps/backend_pro
npx prisma migrate dev --name add_pro_notification_center
```

After schema is applied:

- restart `backend_pro`
- rebuild or restart `admin_pro`
- rebuild or restart `borrower_pro` (web borrower)
- rebuild `apps/borrower_pro_mobile/Demo_Client` (Expo) if native dependencies or plugins changed

## Known Follow-up Considerations

- Push delivery currently records Expo send acceptance, not downstream receipt webhooks.
- Borrower web/mobile notification centers currently show the latest feed but do not yet expose pagination controls in the UI.
- Broadcast scheduling is modeled in `NotificationCampaign` but publish is still immediate-only.
