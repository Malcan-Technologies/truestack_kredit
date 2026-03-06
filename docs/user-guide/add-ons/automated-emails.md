---
title: TrueSend™
order: 1
---

# TrueSend™ — Automated Email Delivery

TrueKredit already generates all loan-related documents automatically — receipts, reminder letters, arrears notices, default notices, and discharge letters. **TrueSend™** takes it a step further by delivering these documents directly to your borrowers' inbox, without any manual effort from your team.

Every email is branded with your company name, professionally formatted, and includes the relevant PDF attachment where applicable. All delivery activity is tracked in real time.

---

## Emails Sent Automatically

### Payment Receipts

Sent immediately after a payment is recorded — whether it's a regular repayment or an early settlement. The borrower receives the generated PDF receipt confirming the payment amount, receipt number, and payment details.

| Detail | Value |
|--------|-------|
| Trigger | Payment recorded (regular or early settlement) |
| Frequency | 1x per payment |
| Attachment | Payment receipt PDF |

### Payment Reminders

Sent before each repayment due date to help reduce late payments. Borrowers are reminded of their upcoming amount due, giving them time to arrange funds.

| Detail | Value |
|--------|-------|
| Trigger | Upcoming repayment due date |
| Frequency | Tenant-configurable, up to 3x per milestone (default: 3 days, 1 day, and on due day) |
| Attachment | None |

### Late Payment Notices

Sent when a borrower has one or more overdue repayments. Multiple late milestones are consolidated into a single email.

| Detail | Value |
|--------|-------|
| Trigger | Overdue repayment(s) detected |
| Frequency | Tenant-configurable, up to 3x after due date (default: day 3, day 7, day 10; capped by arrears period) |
| Attachment | None |

### Arrears Notices

Triggered when a loan enters the arrears period, or when an admin manually generates an updated arrears letter. The borrower receives the formal notice with all outstanding amounts and late fees.

| Detail | Value |
|--------|-------|
| Trigger | Loan status changes to In Arrears, or admin generates arrears letter |
| Frequency | 1x automatic + manual 1x per day |
| Attachment | Arrears letter PDF |

### Default Notices

Sent when a loan is marked as defaulted, or when an admin manually generates an updated default letter. The borrower receives the formal notice of default with the total amount due.

| Detail | Value |
|--------|-------|
| Trigger | Loan status changes to Default, or admin generates default letter |
| Frequency | 1x automatic + manual 1x per day |
| Attachment | Default letter PDF |

### Disbursement Confirmations

Sent once when a loan is disbursed. The borrower receives confirmation of the loan amount, interest rate, term, and disbursement reference.

| Detail | Value |
|--------|-------|
| Trigger | Loan disbursed |
| Frequency | 1x per loan |
| Attachment | None |

### Discharge Letters

Sent when a loan is fully settled — whether through normal completion or early settlement. The borrower receives a formal confirmation that all obligations have been fulfilled.

| Detail | Value |
|--------|-------|
| Trigger | Loan completed or early settled |
| Frequency | 1x per loan |
| Attachment | Discharge letter PDF |

---

## Email Delivery Tracking

Every TrueSend™ email is tracked in real time. You can monitor the delivery status of each email from the loan detail page under the **TrueSend Emails** section.

### Delivery Statuses

| Status | Description |
|--------|-------------|
| **Pending** | Email has been queued for delivery |
| **Sent** | Email has been sent to the mail server |
| **Delivered** | Email was successfully delivered to the recipient's inbox |
| **Bounced** | Email could not be delivered (invalid address, full mailbox, etc.) |
| **Failed** | Email delivery failed due to a technical error |
| **Delayed** | Email delivery is delayed but still being retried |
| **Complained** | Recipient marked the email as spam |

### Resending Failed Emails

If an email fails to deliver (bounced, failed, or complained), an administrator can trigger a resend directly from the email log. Resends are rate-limited to **1 per day** per email to prevent abuse.

Emails that have already been successfully delivered cannot be resent from the email log.

---

## Benefits

- **Eliminates manual emailing** — no more downloading PDFs and attaching them to emails one by one
- **Receipts sent instantly** — borrowers get their payment receipt within seconds of payment being recorded
- **Improves borrower communication** — professional, timely correspondence builds trust
- **Reduces late payments** — reminder emails sent before due dates improve on-time collection rates
- **Creates a verifiable digital trail** — all email correspondence is recorded and traceable with delivery status
- **Frees your staff** — your team can focus on higher-value tasks instead of routine email work
- **Delivery assurance** — real-time tracking lets you confirm emails reached borrowers, and resend if they didn't

---

## Do I Still Get PDFs Without TrueSend™?

**Yes.** All documents — payment receipts, reminder letters, arrears notices, default notices, and discharge letters — are generated automatically in TrueKredit regardless of whether you subscribe to TrueSend™.

TrueSend™ **only automates the sending** of these documents via email. Without it, you can still download and manually send any document from the loan detail page.

---

## How It Works

1. A loan event occurs (e.g., payment recorded, due date approaching, arrears entered, loan completed)
2. TrueKredit generates the corresponding document as usual
3. With TrueSend™ enabled, the system automatically sends the document to the borrower's email on file
4. The email delivery status is tracked in real time and logged in the loan's email history
5. If delivery fails, an admin can trigger a one-click resend

No configuration is needed beyond subscribing to the add-on. Emails are sent using the borrower's email address stored in their profile.

---

## Pricing

| Plan | Price | Coverage |
|------|-------|----------|
| Per block | **RM 50/month** | Up to 500 active loans |

TrueSend™ covers all automated email sending for up to **500 active loans**. If you have more than 500 loans, simply add another block at the same rate (RM 50 per extra block). The pricing scales alongside your TrueKredit subscription. See [Billing & Subscription](?doc=administration/billing-and-subscription) for subscription and add-on management.

---

## Frequently Asked Questions

### What if a borrower doesn't have an email address?

If no email address is on file for the borrower, the document will still be generated as a PDF but the email will not be sent. You can always download and send it manually.

### Can I disable emails for specific loan events?

Currently, TrueSend™ sends emails for all supported document types when enabled. Granular control per event type may be available in a future update.

### Are email deliveries tracked?

Yes. Every TrueSend™ email is tracked with real-time delivery status (delivered, bounced, failed, etc.) visible on the loan detail page. All email activity is also recorded in the loan's audit trail.

### Can I resend a failed email?

Yes. From the loan detail page, you can click "Resend" on any failed, bounced, or complained email. Resends are limited to once per day per email.

### How do I subscribe to TrueSend™?

Go to **Billing** in the sidebar, then click **Choose plan** (or **Subscription** from the Plan page). On the Subscription page, toggle TrueSend™ on and click **Proceed to payment** or **Make payment now**. The add-on switch reflects your backend status — if TrueSend is active in the system, the switch shows as on. The add-on is tied to your base subscription and remains active as long as your TrueKredit subscription is valid.

For full billing details, see [Billing & Subscription](?doc=administration/billing-and-subscription).
