# TrueStack Kredit Billing Module Code Audit

Date: 2026-03-10  
Scope: `modules/billing`, `lib/billingCronService`, `lib/subscription`, `lib/invoiceNumberService`, billing-related webhooks, `middleware/billingGuard`.

## Executive Summary

I found **6 priority issues** in the billing code:

- **2 High severity** (date/month-end correctness, financial math consistency)
- **3 Medium severity** (safe math adoption, overdue cutoff semantics, credit note handling)
- **1 Low severity** (manual payment validation)

---

## Findings

## 1) Month-end date overflow in subscription period extension

**Severity:** High  
**Category:** Date/time accuracy (same pattern as loan audit Finding #2)

### Evidence

Billing routes and webhooks extend subscription period using raw `setMonth` / `setUTCMonth`:

**`apps/backend/src/modules/billing/routes.ts`** (manual payment recording):
```ts
const newPeriodEnd = new Date(newPeriodStart);
newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
```

**`apps/backend/src/lib/billingCronService.ts`** (addMonth helper):
```ts
function addMonth(date: Date): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
```

**`apps/backend/src/modules/webhooks/trueIdentityPaymentWebhook.ts`**:
```ts
newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
```

When `currentPeriodStart` or `newPeriodStart` is month-end (e.g., Jan 31), `setMonth(getMonth() + 1)` can overflow to Mar 2/3, shifting the billing period incorrectly.

### Risk

- Subscription periods can be assigned wrong dates.
- Renewal invoices may be generated for incorrect periods.
- Grace period and cancellation logic depend on correct period boundaries.

### Recommended fix

- Use `addMonthsClamped` from `lib/math.ts` (already used by loans) for all month additions in billing.
- Replace local `addMonth` in `billingCronService.ts` with `addMonthsClamped`.
- Add tests for period extension from Jan 29/30/31 across leap/non-leap years.

---

## 2) Billing module does not use safe math utilities

**Severity:** High  
**Category:** Financial calculation integrity

### Evidence

The billing module uses raw arithmetic and a custom `roundHalfUp2` instead of `lib/math.ts` utilities:

- **`roundHalfUp2`** – Local implementation; `lib/math.ts` has `safeRound`.
- **SST / subtotal / total** – Uses `sum + value`, `value * SST_RATE`, `subtotal + sstAmount` etc.
- **Proration** – `(monthlyAmountMyr * remainingDays) / totalDays` (raw division).
- **Credit note application** – `Number(invoice.amount) - amount` (raw subtraction).
- **Invoice line item aggregation** – `.reduce((s, li) => s + Number(li.amount), 0)`.

Backend rules specify: *"Never use raw arithmetic for currency calculations"* and *"Use utilities from lib/math.ts"*. Loans and internal admin use `safeAdd`, `safeSubtract`, `safeRound`, `toSafeNumber`; billing does not.

### Risk

- Floating-point precision errors (e.g. `0.1 + 0.2`) can affect SST, prorations, and invoice totals.
- Inconsistent rounding may produce mismatched line-item vs invoice totals.
- Edge cases (e.g. many small amounts) can accumulate rounding drift.

### Recommended fix

- Import `safeRound`, `safeAdd`, `safeSubtract`, `safeMultiply`, `safeDivide`, `toSafeNumber` from `lib/math.ts`.
- Replace `roundHalfUp2` with `safeRound`.
- Replace all currency sums/differences with `safeAdd` / `safeSubtract` / `safeMultiply` / `safeDivide`.
- Use `toSafeNumber()` when reading Prisma Decimal/numeric fields.

---

## 3) Overdue cutoff gives extra day of grace

**Severity:** Medium  
**Category:** Business logic / date semantics

### Evidence

In `billingCronService.ts`, `markOverdue` uses:

```ts
const cutoff = new Date(now);
cutoff.setUTCDate(cutoff.getUTCDate() - 1);

const overdueInvoices = await prisma.invoice.findMany({
  where: {
    status: { in: ['ISSUED', 'PENDING_APPROVAL'] },
    dueAt: { lte: cutoff },
  },
  ...
});
```

So invoices are marked overdue only when `dueAt <= yesterday`. Invoices with `dueAt = today` are not marked overdue until the next cron run (tomorrow).

### Risk

- Tenants whose due date is today retain ISSUED/PAID status for an extra day.
- May be intentional (e.g. end-of-day batch) or unintentional — semantics are unclear.

### Recommended fix

- Clarify intent in a comment.
- If overdue should apply when `dueAt` has passed: use `dueAt: { lt: startOfMytDayUtc(addDays(now, 1)) }` or `dueAt: { lte: now }` depending on whether “due today” should be overdue.
- Add a unit test for “invoice due today, cron runs today” to lock in behavior.

---

## 4) Manual payment recording lacks amount validation

**Severity:** Medium  
**Category:** Data integrity / operational correctness

### Evidence

In `POST /api/billing/payments`:

```ts
const recordPaymentSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
});
```

- No check that `amount` equals (or is at least) the invoice total.
- No validation that `amount` is a reasonable currency value (e.g. max 2 decimal places).
- Admin can record arbitrary positive amounts; overpayment/underpayment is not enforced.

### Risk

- Accidental overpayment or underpayment without guardrails.
- Possible data inconsistencies between `invoice.amount`, receipts, and line items.

### Recommended fix

- Validate `amount >= Number(invoice.amount)` (or support explicit overpayment flow with credit logic).
- Optionally validate `amount` has at most 2 decimal places.
- Optionally log or flag when `amount` ≠ `invoice.amount` for reconciliation.

---

## 5) Credit note application uses raw subtraction

**Severity:** Medium  
**Category:** Financial calculation integrity

### Evidence

In `billingCronService.ts`, `applyCreditNotes`:

```ts
const newAmount = Math.max(0, Number(invoice.amount) - amount);
```

- Uses raw `Number(invoice.amount) - amount`.
- Line item uses `amount: -amount`; no use of `safeSubtract` for invoice total.

### Risk

- Floating-point precision issues when credit is close to invoice amount.
- Inconsistent with project rule to use safe math for currency.

### Recommended fix

- Use `safeSubtract` and `safeRound` from `lib/math.ts`:
  - `const newAmount = Math.max(0, safeRound(safeSubtract(toSafeNumber(invoice.amount), amount), 2));`

---

## 6) Invoice number generation is already robust

**Severity:** N/A (positive finding)

Invoice numbers use `InvoiceSequence` with `lastSeq: { increment: 1 }` in an upsert. This is DB-atomic and avoids the race condition pattern seen with receipt numbers in the loan audit. No change needed.

---

## Suggested Remediation Order

1. **Fix month-end date handling** (Finding #1) — use `addMonthsClamped` everywhere.
2. **Adopt safe math** (Findings #2 and #5) — replace raw arithmetic and `roundHalfUp2`.
3. **Clarify overdue cutoff** (Finding #3) and add tests.
4. **Add amount validation** to manual payments (Finding #4).

---

## Suggested Validation Tests

- Period extension from Jan 29, 30, 31 (leap and non-leap years).
- Proration with `remainingDays` edge cases (0, 1, full period).
- SST and total calculations with many line items; verify sum of line items = invoice total.
- Credit note application when credit ≈ invoice amount.
- Overdue marking for `dueAt` = today when cron runs today.
- Manual payment with `amount` < invoice total (should fail or be explicitly allowed).
