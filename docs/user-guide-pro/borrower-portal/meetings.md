---
title: Borrower Meetings hub
order: 3
---

# Borrower Meetings hub

The borrower web portal includes a **Meetings** area (sidebar) that aggregates **attestation meeting** activity across all of the borrower’s loans for the active tenant.

## Purpose

- Borrowers can see **upcoming** slots, items that **need action** (for example counter-proposals, expired slots, or **post-meeting accept/reject**), and **past** meeting history where applicable.
- Reduces the need to visit each loan separately to find Meet links, deadlines, or next steps.

## Behaviour

- Data is loaded from `GET /api/borrower-auth/meetings` (with optional `include=past` for history).
- The sidebar can show a **badge** when at least one meeting row is in an “action” state.
- After an admin marks an attestation meeting complete, status becomes **`MEETING_COMPLETED`** until the borrower **accepts** (moves attestation forward) or **rejects** (cancels via the configured pathway). This is mirrored on the loan’s attestation panel and in **Meetings**.

## Related

- [Agreements & Attestation](?doc=digital-signing/agreements-and-attestation) — attestation and signing context.
- [Loan applications (L1 / L2)](?doc=loan-management/loan-applications) — pre-loan review.
