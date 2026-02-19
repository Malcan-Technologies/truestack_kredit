# Performance Improvements

This document summarizes performance optimizations applied across the Truestack Kredit admin app and provides recommendations for future work.

---

## Implemented Changes

### 1. Dashboard Stats API (GET /api/dashboard/stats)

**File:** `apps/backend/src/modules/dashboard/routes.ts`

- **PaymentAllocation:** Replaced loading all allocation rows for 1000+ repayments via large IN clause with a single `groupBy` aggregation returning `SUM(amount)` per `repaymentId`.
- **readyToCompleteLoans:** Removed separate query; now computed from the main loans loop.
- **Query parallelization:** Replaced sequential waterfall of ~15 queries with 3 parallel batches: (1) counts, (2) loans+allocations, (3) trends+products+recent.

**Impact:** Eliminated large PaymentAllocation query, removed duplicate loan fetch, reduced total request time.

---

### 2. Applications List Page (/dashboard/applications)

**Files:** `apps/admin/app/(dashboard)/dashboard/applications/page.tsx`, `apps/backend/src/modules/loans/routes.ts`

- **Action-needed counts:** Replaced 2 API calls (fetching page 1 with pageSize=1 for SUBMITTED and UNDER_REVIEW) with a single `GET /api/loans/applications/counts` returning `{ submitted, underReview }`.
- **Sorted list:** Wrapped in `useMemo` with deps `[applications, sortField, sortDir]`.

**Impact:** One fewer request on load/refresh; avoids redundant sort work on re-renders.

---

### 3. Loans List Page (/dashboard/loans)

**File:** `apps/admin/app/(dashboard)/dashboard/loans/page.tsx`

- **Filtered loans:** Wrapped in `useMemo` with deps `[allLoans, filter]`.
- **Sorted loans:** Wrapped in `useMemo` with deps `[filteredLoans, sortField, sortDir]`.

**Impact:** Avoids redundant filter/sort work on re-renders.

---

### 4. Borrowers List Page (/dashboard/borrowers)

**File:** `apps/admin/app/(dashboard)/dashboard/borrowers/page.tsx`

- **Sorted list:** Wrapped in `useMemo` with deps `[borrowers, sortField, sortDir]`.

**Impact:** Avoids redundant sort work on re-renders.

---

### 5. Application Detail Page (/dashboard/applications/[id])

- **API calls:** Reduced from 3 to 2 by including documents in the main application response.
- **Payload:** Slim `select` for borrower and loan (id, status) instead of full include.

**Impact:** ~33% fewer requests, smaller payload.

---

### 6. Borrower Detail Page (/dashboard/borrowers/[id])

- **Loans/applications:** Uses slim `select` (id, status, principalAmount/amount, createdAt, product.name) instead of full include.

**Impact:** Smaller JSON payload.

---

### 7. Loan Detail Page (/dashboard/loans/[loanId])

- **Loading:** Renders when loan loads; timeline fetches in background instead of blocking.

**Impact:** Faster time-to-interactive.

---

## Possible Future Improvements

### Backend

- **DB aggregation for trends:** Use raw SQL with `date_trunc('month', ...)` for disbursement/collection trends instead of loading all rows and grouping in JS. (Medium effort, high impact)
- **Composite indexes:** Add `@@index([tenantId, disbursementDate])` on Loan and `@@index([tenantId, paymentDate])` on PaymentTransaction for date-range queries. (Low effort)
- **Response caching:** Cache dashboard stats (e.g. Redis or in-memory) for 1–5 minutes. (Medium effort)
- **Loans READY_TO_COMPLETE / READY_FOR_DEFAULT:** Add backend support for these virtual statuses instead of fetching all loans and filtering client-side. (Medium effort)
- **Loan GET slim borrower select:** Use `select` for borrower fields instead of full include. (Low effort)
- **Repayment pagination:** For long-term loans (60+ months), paginate repayments or lazy-load allocations. (Medium effort)
- **Timeline skip redundant existence check:** Combine entity existence check with audit log query. (Low effort)

### Frontend

- **SWR / React Query:** Add caching, background refetch, and request deduplication. (Medium effort)
- **Skeleton loading:** Replace "Loading..." with skeleton placeholders for better perceived performance. (Low effort)
- **Prefetch on list hover:** Prefetch detail data when hovering over a row for faster navigation. (Medium effort)

---

## Summary

| Area | Key Change |
|------|------------|
| Dashboard API | PaymentAllocation aggregation, parallelized batches, removed duplicate query |
| Applications list | Dedicated counts endpoint, useMemo for sorted list |
| Loans list | useMemo for filtered and sorted lists |
| Borrowers list | useMemo for sorted list |
| Application detail | Documents in main response, slim selects |
| Borrower detail | Slim loans/applications selects |
| Loan detail | Progressive loading (loan first, timeline in background) |
