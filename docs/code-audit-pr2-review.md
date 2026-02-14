# PR Review + Fresh Code Audit

Date: 2026-02-14  
PR reviewed (as provided): `feat: Receipt numbers, config validation, billing & profile improvements#2`

## 1) Verification of prior findings

### Finding A — 0% declining-balance schedule (`NaN` risk)
**Status:** ❌ Not fixed

`calculateDecliningBalance` still computes EMI with the standard formula and has no zero-rate guard. At `interestRate = 0`, denominator becomes zero.

---

### Finding B — Month-end due-date rollover (`setMonth` overflow)
**Status:** ❌ Not fixed

Schedule generation still uses `Date#setMonth` directly in both flat and declining schedule loops, so end-of-month overflow risk remains.

---

### Finding C — Allocation semantics in late-fee base calculation
**Status:** ✅ Prior concern appears invalid / mitigated by model usage

On payment allocation paths, `paymentAllocation.amount` is treated as principal+interest and late fee is tracked separately via `paymentAllocation.lateFee`. Based on current flows, my earlier concern is not supported as an active bug.

---

### Finding D — Receipt number race condition
**Status:** ❌ Not fixed

`count + 1` receipt generation is still used and remains racy under concurrent requests.

Additionally, this pattern exists in **multiple endpoints** (regular payment and early settlement), so collision risk remains system-wide.

---

### Finding E — Weak JWT default secret fallback
**Status:** ❌ Not fixed

Config still allows static fallback JWT secrets if env vars are absent.

---

### Finding F — Local storage path traversal hardening
**Status:** ❌ Not fixed

Local path mapping still joins potentially attacker-influenced relative paths without `resolve` + root-prefix validation.

## 2) Additional issues found in this fresh audit

### New Finding G — Weak webhook signing secret fallback
**Severity:** Medium  
**Category:** Security hardening

Webhook emitter signs payloads with:
- `process.env.WEBHOOK_SECRET || 'dev-webhook-secret'`

If a production deploy is missing this env var, signatures become predictable, weakening trust in webhook authenticity.

**Recommendation:** Fail fast in non-dev when missing; no static default in production.

---

### New Finding H — Receipt sequencing logic duplicated across modules
**Severity:** Medium  
**Category:** Correctness / maintainability

The same non-atomic `count + 1` receipt number generation is duplicated in multiple modules. Even if one endpoint is fixed later, others may still collide.

**Recommendation:** Centralize receipt generation in one DB-atomic helper/service and use it everywhere.

## 3) Updated remediation order

1. Fix schedule correctness first (zero-rate + month-end date handling).  
2. Replace all receipt numbering with DB-atomic centralized sequencing.  
3. Enforce startup secret validation (JWT + webhook secrets).  
4. Apply local filesystem path traversal hardening (`path.resolve` + prefix checks).  

## 4) Targeted validation tests to add

- 0% interest schedule fixtures for declining/effective models.  
- End-of-month due-date fixtures (31st, leap/non-leap).  
- Parallel payment/settlement requests asserting unique receipt generation.  
- Startup config tests for required secrets in production mode.  
- Path traversal negative tests for local storage helpers.
