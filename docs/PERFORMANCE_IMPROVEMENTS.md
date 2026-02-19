# Performance Improvements: Borrower, Application, and Loan Detail Pages

This document summarizes the performance optimizations applied to the detail pages and provides additional recommendations for future work.

## Implemented Changes

### 1. Application Detail Page (`/dashboard/applications/[id]`)

**Before:** 3 parallel API calls on load
- `GET /api/loans/applications/:id` (application)
- `GET /api/loans/applications/:id/documents` (documents)
- `GET /api/proxy/loans/applications/:id/timeline` (timeline)

**After:** 2 API calls
- `GET /api/loans/applications/:id` now **includes documents** in the response
- Timeline still fetched separately (cursor-based pagination)

**Backend changes:**
- Added `documents` to the application GET include
- Replaced `borrower: true` with `borrower: { select: {...} }` — only fetches id, name, borrowerType, icNumber, documentType, phone, email, companyName, documentVerified
- Replaced `loan: { include: scheduleVersions... }` with `loan: { select: { id, status } }` — the full schedule was only needed for approved loans; the frontend only needs loan id/status for the "View Loan" link

**Impact:** ~33% fewer requests, smaller payload, faster initial load.

### 2. Borrower Detail Page (`/dashboard/borrowers/[id]`)

**Backend changes:**
- `loans` and `applications` now use `select` instead of `include` to reduce payload size
- Loans: id, status, principalAmount, createdAt, product.name
- Applications: id, status, amount, createdAt, product.name

**Impact:** Smaller JSON payload, less data over the wire.

### 3. Loan Detail Page (`/dashboard/loans/[loanId]`)

**Before:** Blocked rendering until both loan and timeline were loaded.

**After:** Progressive loading
- Renders as soon as the loan is loaded
- Timeline fetches in the background (no await)
- Metrics and schedule preview still load conditionally based on loan status

**Impact:** Faster time-to-interactive; user sees main content sooner.

---

## Additional Recommendations (Not Implemented)

### Backend

1. **Loan GET: Slim borrower select**
   - The loan detail includes full `borrower` and `product`. Consider `select` for borrower (id, name, borrowerType, companyName, icNumber, documentType, phone, email, documentVerified, bankName, bankNameOther, bankAccountNo).

2. **Repayment pagination**
   - For long-term loans (e.g. 60+ months), the full schedule with allocations can be large. Consider paginating repayments or lazy-loading allocations.

3. **Database indexes**
   - Ensure indexes on `tenantId`, `entityType`, `entityId` for `AuditLog` (timeline queries).
   - Indexes on `applicationId`, `borrowerId` for document tables.

4. **Timeline: Skip redundant existence check**
   - Borrower/application timeline routes verify the entity exists before fetching audit logs. Could combine into a single query or rely on the audit log query returning empty.

### Frontend

1. **Skeleton loading**
   - Replace "Loading..." with skeleton placeholders for cards/sections to improve perceived performance.

2. **React Query / SWR**
   - Consider a data-fetching library for caching, background refetch, and deduplication of requests.

3. **Prefetch on list hover**
   - On the borrowers/applications/loans list pages, prefetch detail data when the user hovers over a row (for faster navigation).

---

## Summary Table

| Page        | Before                         | After                          |
|------------|---------------------------------|--------------------------------|
| Applications | 3 requests, full borrower/loan | 2 requests, slim borrower/loan |
| Borrowers  | Full loans/applications         | Slim loans/applications        |
| Loans      | Block on loan + timeline        | Block on loan only             |
