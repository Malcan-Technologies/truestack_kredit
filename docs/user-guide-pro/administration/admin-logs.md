---
title: Admin Logs
order: 4
---

# Admin Logs

The **Admin Logs** page is your tamper-resistant audit trail of administrative actions inside TrueKredit Pro. Every sensitive action — approvals, rejections, role changes, disbursement, ownership transfers — is recorded with the actor, timestamp, and relevant metadata.

---

## Who Can Access

**Permission:** `audit.view`

By default this is held by Owner, Super Admin, Ops Admin, Compliance Officer, and Auditor Read-only.

---

## What Is Logged

The log captures events across the following areas:

| Domain | Example events |
|--------|----------------|
| Applications | Created, submitted, sent to L2, approved, rejected, returned for amendments, counter-offer sent/accepted/declined |
| Loans | Disbursed, payment recorded, early settlement requested/approved, default handled, discharge |
| Borrowers | Created, updated, document uploaded/deleted, KYC session started/completed |
| Products | Created, edited, deleted |
| Agreements & signing | Signing certificate issued, borrower signed, admin signed, witness signed, verification performed |
| Attestation | Meeting scheduled / witnessed, attestation completed |
| Team | Invite, role change, deactivation, reactivation |
| Roles | Role created, edited, deleted, reset |
| Tenant | Ownership transferred, settings updated |
| Compliance | Report generated, export downloaded |

`APPLICATION_SEND_TO_L2` is recorded on the L1 handoff specifically, so reviewers can trace who sent a given application into the L2 queue.

---

## What Each Entry Shows

Typical columns on the Admin Logs page:

| Column | Description |
|--------|-------------|
| When | Timestamp (hover for exact date/time) |
| Actor | User who performed the action |
| Role | Actor's role at the time |
| Action | The audit action code (e.g. `LOAN_DISBURSED`) |
| Target | The entity affected (borrower, loan, application, role, etc.) |
| Notes / Metadata | Stage decision notes, reason for rejection, before/after values |

---

## Filtering

Filter the log by:

- Date range
- Action type
- Actor
- Target entity (e.g. a specific loan or borrower)

---

## Relationship to Application Timeline

The detail page for each application, loan, and borrower shows a **scoped timeline** — a filtered slice of the audit log relevant to that entity. The full log combines every entity, which is useful for compliance and investigation.

---

## Exporting

If you need the audit log as a CSV for regulatory inspection, see [Data Exports](?doc=compliance/data-exports).

---

## Frequently Asked Questions

### Can I delete entries from the log?

No. The audit log is append-only. This is intentional — the log's value depends on its integrity.

### Does deactivating a user wipe their actions?

No. Deactivated users keep their entire history in the log. Their name still appears as the actor.

### Can Staff see Admin Logs?

By default, **General Staff** does not hold `audit.view`. Grant it explicitly via a custom role if you need staff-level auditors.

### How long is the log retained?

Retention follows your deployment configuration. By default, logs are retained indefinitely for compliance purposes.

---

## Related Documentation

- [Compliance Overview](?doc=compliance/compliance-overview)
- [Data Exports](?doc=compliance/data-exports)
- [Roles & Permissions](?doc=getting-started/roles-and-permissions)
