# Changelog draft — April 2026 (borrower Meetings & attestation)

## Borrower web

- **Meetings hub** — New sidebar entry and `/meetings` route listing attestation meeting activity across loans (tabs: action needed, upcoming, past). Sidebar badge when action is required.
- **Attestation** — New status **`MEETING_COMPLETED`** after admin marks the meeting complete; borrower must **accept** (continues to e-KYC/signing path) or **reject** (loan cancelled per product rules). Shown on loan attestation and Meetings cards.
- **Security** — Shared security-status helper; session refresh after TOTP setup so the “complete security” banner clears without a full reload. Sign-in copy clarifies **passkey or 2FA** (either is sufficient).

## Admin

- **Applications** — **Decision notes** panel on application detail for L1 and L2 notes with reviewer and timestamps (RBAC-gated).

## Backend

- `GET /api/borrower-auth/meetings` — aggregate meetings for the active borrower.
- `POST .../attestation/accept-after-meeting` and `.../reject-after-meeting` — post–`MEETING_COMPLETED` transitions.
- Admin **complete meeting** sets `MEETING_COMPLETED` and records `attestationMeetingAdminCompletedAt` (separate from borrower terms acceptance timestamp).
- **Email** — tenant display name on `From:`; body copy de-emphasizes platform name in favor of lender context; footer may still show “Powered by TrueKredit”.

## Mobile (borrower)

- Loan attestation screen supports **MEETING_COMPLETED** accept/reject using the same borrower-auth endpoints as web.

## Migration

- Prisma migration adds enum value `MEETING_COMPLETED` and optional columns `attestationMeetingAdminCompletedAt`, `attestationTermsAcceptedAt` (see `backend_pro` migration history).
