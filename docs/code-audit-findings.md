# TrueStack Kredit Code Audit Findings (Calculations, Date/Time, Currency, Safe Math, Security)

Date: 2026-02-14
Scope reviewed: backend loan calculations, late fee logic, schedules, settlement, auth/config, file handling.

## Executive Summary

I found **6 priority issues** that should be addressed before scaling usage:

- **2 High severity** (financial correctness + security hardening)
- **3 Medium severity** (date/math consistency and concurrency reliability)
- **1 Low severity** (operational correctness)

---

## Findings

## 1) Declining-balance schedule breaks when interest rate is 0%
**Severity:** High  
**Category:** Calculation / Safe math

### Evidence
In `calculateDecliningBalance`, EMI is computed with:

```ts
const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, term) /
            (Math.pow(1 + monthlyRate, term) - 1);
```

When `interestRate = 0`, `monthlyRate = 0`, denominator becomes `0`, resulting in `NaN` schedule values.

### Risk
- Loan schedule generation can silently produce invalid numbers (`NaN`) for principal/interest/totalDue/balance.
- Invalid repayment rows can cascade into arrears logic, settlement calculations, reporting, and compliance exports.

### Recommended fix
- Add an explicit 0%-interest branch for declining-balance/effective-rate schedules (e.g., equal principal or equal payment with zero interest).
- Add unit tests for 0% scenarios.

---

## 2) Month-end due-date rollover bug can shift repayment dates incorrectly
**Severity:** High  
**Category:** Date/time accuracy

### Evidence
Schedule generation uses JavaScript month mutation directly:

```ts
dueDate.setMonth(dueDate.getMonth() + i);
```

When disbursement is month-end (e.g., Jan 31), `setMonth` can overflow (e.g., to Mar 2/3 depending timezone/runtime behavior), skipping expected due dates.

### Risk
- Borrowers can be assigned wrong due dates.
- Late-fee and arrears triggers become inaccurate.
- Legal/compliance documents may contain non-contractual schedules.

### Recommended fix
- Use deterministic month-add logic with end-of-month clamping (e.g., if source day is 31 and target month has 30/28 days, clamp to last day of target month).
- Add tests for Jan 29/30/31 across leap and non-leap years.

---

## 3) Late-fee outstanding amount may be understated if allocation `amount` includes late-fee component
**Severity:** Medium  
**Category:** Financial calculation integrity

### Evidence
Late fee processor computes arrears base as:

```ts
const amountPaid = repayment.allocations.reduce((sum, a) => safeAdd(sum, toSafeNumber(a.amount)), 0);
const outstanding = safeSubtract(totalDue, amountPaid);
```

Comment says this is principal+interest only, but implementation sums only `allocation.amount` and ignores whether part of that allocation was late-fee (stored separately in `allocation.lateFee` in other flows).

### Risk
- If `amount` includes late-fee-inclusive payment values in any flow, principal+interest outstanding is reduced too much.
- That lowers future late-fee accrual incorrectly (undercharging).

### Recommended fix
- Make semantics explicit and enforced:
  - Either define `allocation.amount` as principal+interest only everywhere, or
  - Compute principal+interest paid as `amount - lateFee` when applicable.
- Add invariants and migration checks for historical rows.

---

## 4) Receipt number generation has a race condition and can violate unique constraint
**Severity:** Medium  
**Category:** Concurrency / correctness

### Evidence
Receipt number is generated using `count + 1` before transaction insert:

```ts
const existingCount = await prisma.paymentTransaction.count(...);
const receiptNumber = `RCP-${dateStr}-${String(existingCount + 1).padStart(3, '0')}`;
```

`receiptNumber` is unique in schema (`@unique`). Concurrent settlement requests can compute the same next number and one request fails.

### Risk
- Random failures under concurrent traffic.
- Retries may double-submit or produce user confusion around settlement completion.

### Recommended fix
- Move sequencing to DB-atomic mechanism:
  - dedicated daily counter table with row-level lock,
  - PostgreSQL sequence,
  - or retry loop on unique conflict.

---

## 5) Weak JWT default secrets create misconfiguration security risk
**Severity:** Medium  
**Category:** Security hardening

### Evidence
Config falls back to static development secrets:

```ts
secret: process.env.JWT_SECRET || 'dev-secret-change-in-production'
refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret'
```

### Risk
- If production env vars are missing/misconfigured, tokens become forgeable with known defaults.
- Tenant boundary and auth integrity can be compromised.

### Recommended fix
- Fail fast on startup in non-development environments when JWT secrets are missing/weak.
- Add minimum entropy checks and bootstrap validation.

---

## 6) File path normalization lacks traversal hardening in local storage helpers
**Severity:** Low  
**Category:** Security / file handling

### Evidence
Local read/delete/path helpers transform a URL-ish path and then `path.join` directly:

```ts
const relativePath = filePath ...;
const fullPath = path.join(UPLOAD_DIR, relativePath);
```

No `path.resolve` + prefix-check is used to guarantee resulting path stays under `UPLOAD_DIR`.

### Risk
- If a manipulated DB path or unsafe input reaches these functions, traversal outside upload directory may be possible.
- Mostly defense-in-depth, but worthwhile to harden.

### Recommended fix
- Resolve and verify path:
  - `resolved = path.resolve(UPLOAD_DIR, relativePath)`
  - reject unless `resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)`
- Reject any `..`, absolute paths, or protocol-like inputs for local mode.

---

## Suggested remediation order
1. **Fix schedule math/date correctness first** (Findings #1 and #2).  
2. **Stabilize payment/late-fee correctness** (Findings #3 and #4).  
3. **Harden security defaults and file-path handling** (Findings #5 and #6).  

## Suggested validation tests after fixes
- Zero-interest schedule generation (flat/declining/effective).
- Month-end schedule fixtures (Jan 31, Feb leap/non-leap, DST-neutral assertions in UTC/MYT).
- Late-fee accrual with mixed principal/interest + late-fee allocations.
- Concurrent settlement API test (parallel requests same tenant/day).
- Startup config validation tests for JWT secrets.
- Path traversal negative tests on storage helper functions.
