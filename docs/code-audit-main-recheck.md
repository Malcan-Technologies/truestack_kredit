# Main Branch Re-Review Audit (Re-run)

Date: 2026-02-14

## Scope & branch check

I attempted to switch to `main`, but this repository currently only has a local `work` branch in this environment.
So this review is based on the latest available HEAD in this checkout.

## Status of previously reported issues

1. **0% declining-balance schedule NaN risk** — **NOT FIXED**  
   `calculateDecliningBalance` still uses EMI formula without zero-rate guard.

2. **Month-end due-date rollover from `Date#setMonth`** — **NOT FIXED**  
   Schedule generation still uses direct `setMonth` in flat and declining loops.

3. **Allocation semantics concern (late-fee base)** — **LIKELY INVALID**  
   Current payment allocation model clearly separates principal+interest (`amount`) and late fee (`lateFee`) in repayment allocation flow.

4. **Receipt number race condition (`count + 1`)** — **NOT FIXED**  
   Still present in both early-settlement and repayment recording paths.

5. **JWT static fallback secrets** — **NOT FIXED**  
   JWT config still allows known default fallback values.

6. **Local path traversal hardening in storage helpers** — **NOT FIXED**  
   Path mapping still uses `path.join` without `resolve` + root-prefix enforcement.

7. **Webhook signing fallback secret** — **NOT FIXED**  
   Outbox webhook signature still falls back to a static dev secret.

---

## Additional finding from this pass

### Billing payment marks invoice PAID without validating full settlement
**Severity:** High  
**Category:** Financial correctness / security abuse risk

### Evidence
In billing payment route, the API accepts arbitrary positive `data.amount`, creates a receipt for that amount, and then sets invoice status to `PAID` unconditionally:
- receipt amount uses client-supplied `data.amount`
- invoice status updated to `PAID` regardless of whether amount equals invoice balance

### Risk
- Underpayment can unlock subscription/access restoration while invoice is treated as fully paid.
- Creates accounting integrity issues and potential abuse vector.

### Recommendation
- Enforce exact payment amount (or tracked partial payment logic with remaining balance + status).
- Add server-side validation: `data.amount >= outstandingAmount` for full-settlement endpoint, or support explicit partial payment state transitions.
- Record and reconcile cumulative paid amount atomically.

---

## Suggested immediate priorities

1. Fix billing payment validation (new High issue).  
2. Fix schedule math/date correctness (0% rate + month-end handling).  
3. Replace receipt number generation with one DB-atomic centralized service.  
4. Enforce production startup secret requirements (JWT + webhook).  
5. Harden local file path resolution checks.
