# @kredit/borrower

Cross-platform borrower types, Zod validation schemas, and API client factories shared between the web app (`apps/borrower_pro/`) and the mobile Expo app (`apps/borrower_pro_mobile/`).

---

## 1. Purpose

Before this package, borrower-facing TypeScript types and API client logic lived exclusively in `apps/borrower_pro/lib/`. The mobile Expo app needed the same types and API calls but could not import from a Next.js app directory.

`@kredit/borrower` solves this by extracting all platform-independent code into a shared workspace package. Both the web and mobile apps depend on it, ensuring type consistency and eliminating duplication.

---

## 2. Package Structure

```
packages/borrower/
  package.json
  tsconfig.json
  src/
    index.ts                     # barrel — re-exports everything
    types/
      borrower.ts                # BorrowerDetail, BorrowerDocument, etc.
      application.ts             # LoanApplicationDetail, BorrowerProduct, etc.
      loan.ts                    # BorrowerLoanDetail, LoanCenterOverview, LenderBankInfo, etc.
      auth.ts                    # BorrowerProfile, BorrowerMeResponse, LenderInfo, etc.
      signing.ts                 # SigningHealthResult, CertStatusResult, etc.
    schemas/
      borrower.ts                # Zod schemas matching types/borrower.ts
      application.ts             # Zod schemas matching types/application.ts
      loan.ts                    # Zod schemas matching types/loan.ts
      auth.ts                    # Zod schemas matching types/auth.ts
      signing.ts                 # Zod schemas matching types/signing.ts
    api/
      shared.ts                  # FetchFn type alias and parseJson helper
      borrower-client.ts         # createBorrowerApiClient factory
      applications-client.ts     # createApplicationsApiClient factory
      loans-client.ts            # createLoansApiClient factory + URL helpers
      borrower-auth-client.ts    # createBorrowerAuthApiClient factory
      signing-client.ts          # createSigningApiClient factory
  dist/                          # compiled output (gitignored)
```

---

## 3. What the Package Exports

### Types

All borrower-domain TypeScript interfaces and type aliases:

- **Borrower**: `BorrowerDetail`, `BorrowerDocument`, `BorrowerDirector`, `UpdateBorrowerPayload`, `TruestackKycSessionRow`, `TruestackKycStatusData`
- **Application**: `ApplicationStep`, `RequiredDocumentItem`, `BorrowerProduct`, `LoanPreviewData`, `ApplicationDocumentRow`, `LoanApplicationDetail`
- **Loan**: `LoanCenterOverview`, `SignedAgreementReviewStatus`, `AttestationStatus`, `LoanChannel`, `BorrowerLoanListItem`, `BorrowerLoanBorrowerSnapshot`, `BorrowerLoanDetail`, `BorrowerLoanMetrics`, `BorrowerLoanTimelineEvent`, `RecordBorrowerPaymentBody`, `LenderBankInfo`
- **Auth**: `BorrowerProfile`, `BorrowerMeResponse`, `LenderInfo`, `LenderInfoResponse`, `CrossTenantInsights`, `OnboardingPayload`, `CompanyMembersContext`
- **Signing**: `SigningHealthResult`, `CertStatusResult`, `OtpResult`, `EnrollResult`, `SignAgreementResult`, `SigningAuthMethod`, `CheckEmailChangeResult`, `ConfirmEmailChangeResult`

### Zod Schemas

Every type above has a corresponding `*Schema` export (e.g. `BorrowerDetailSchema`, `LoanApplicationDetailSchema`). Schemas export only `const XxxSchema = z.object({...})` -- they do not export inferred types to avoid conflicts with the hand-written interfaces.

### API Client Factories

Five factory functions, each taking `(baseUrl: string, fetchFn: FetchFn)` and returning an object of async methods:

| Factory | Methods |
|---------|---------|
| `createBorrowerApiClient` | `fetchBorrower`, `updateBorrower`, `fetchBorrowerDocuments`, `uploadBorrowerDocument`, `deleteBorrowerDocument`, `startTruestackKycSession`, `getTruestackKycStatus`, `refreshTruestackKycSession` |
| `createApplicationsApiClient` | `fetchBorrowerProducts`, `previewBorrowerApplication`, `createBorrowerApplication`, `updateBorrowerApplication`, `getBorrowerApplication`, `listBorrowerApplications`, `submitBorrowerApplication`, `uploadApplicationDocument`, `deleteApplicationDocument`, `postBorrowerCounterOffer`, `postBorrowerAcceptOffer`, `postBorrowerRejectOffers` |
| `createLoansApiClient` | `fetchLoanCenterOverview`, `listBorrowerLoans`, `getBorrowerLoan`, `getBorrowerLoanSchedule`, `getBorrowerLoanMetrics`, `listBorrowerLoanPayments`, `recordBorrowerLoanPayment`, `postAttestationVideoComplete`, `postAttestationProceedToSigning`, `postAttestationRequestMeeting`, `postAttestationRestart`, `getAttestationAvailability`, `postAttestationProposeSlot`, `postAttestationAcceptCounter`, `postAttestationDeclineCounter`, `postAttestationCancelLoan`, `postAttestationCompleteMeeting`, `uploadBorrowerSignedAgreement`, `createBorrowerManualPaymentRequest`, `listBorrowerManualPaymentRequests`, `getBorrowerLoanTimeline`, `getBorrowerApplicationTimeline`, `withdrawBorrowerApplication`, `fetchBorrowerLender` |
| `createBorrowerAuthApiClient` | `fetchBorrowerMe`, `fetchLenderInfo`, `fetchBorrowerProfiles`, `switchBorrowerProfile`, `fetchCompanyMembersContext`, `fetchBorrowerInvitationPreview`, `bindOpenCompanyInvitation`, `createOpenCompanyInvitation`, `leaveCompanyOrganization`, `submitOnboarding`, `fetchCrossTenantInsights` |
| `createSigningApiClient` | `checkSigningGatewayHealth`, `getSigningCertStatus`, `requestEnrollmentOTP`, `enrollSigningCert`, `fetchAgreementPreview`, `requestSigningOTP`, `signAgreement`, `checkEmailChange`, `confirmEmailChange` |

### URL Helpers

Standalone functions exported from the loans client (they build URLs without needing fetch):

- `borrowerLoanGenerateAgreementUrl(baseUrl, loanId, agreementDate?)`
- `borrowerLoanViewSignedAgreementUrl(baseUrl, loanId)`
- `borrowerDisbursementProofUrl(baseUrl, loanId)`
- `borrowerStampCertificateUrl(baseUrl, loanId)`
- `borrowerTransactionReceiptUrl(baseUrl, transactionId)`
- `borrowerTransactionProofUrl(baseUrl, transactionId)`

### Shared Utilities

- `FetchFn` type: `(url: string, init?: RequestInit) => Promise<Response>`
- `parseJson<T>(res: Response): Promise<T>` helper

---

## 4. What Is NOT in the Package

The following stay in `apps/borrower_pro/lib/` because they depend on browser APIs (`window`, `localStorage`, `sessionStorage`, `dispatchEvent`, `CustomEvent`):

- `setPendingAcceptInvitationPath` / `peekPendingAcceptInvitationPath` / `consumePendingAcceptInvitationPath` / `clearPendingAcceptInvitationPath` -- invitation session persistence using `localStorage` and `sessionStorage`
- `dispatchBorrowerProfileSwitched` / `BORROWER_PROFILE_SWITCHED_EVENT` -- DOM `CustomEvent` dispatch
- `resolveBorrowerLenderLogoSrc` -- Next.js proxy URL resolution logic

The package compiles with `lib: ["ES2022"]` (no DOM) to guarantee it never accidentally references browser globals.

---

## 5. How to Use: Web (Next.js)

The web app does **not** use the factory functions. Instead, it keeps its existing per-file API clients in `apps/borrower_pro/lib/` which call `fetch()` directly with `credentials: "include"` for cookie-based auth through the Next.js proxy.

The web app imports **types** from `@kredit/borrower`:

```ts
import type { BorrowerLoanDetail, LoanCenterOverview } from "@kredit/borrower";
```

Each web API client file re-exports the types it uses for backward compatibility:

```ts
// apps/borrower_pro/lib/borrower-loans-client.ts
export type { BorrowerLoanDetail, LoanCenterOverview } from "@kredit/borrower";
```

---

## 6. How to Use: Mobile (Expo)

The mobile app uses the factory functions. All five clients are instantiated in one file and share a `sessionFetch` that automatically attaches the stored session token as a `Cookie` header on every request:

```ts
// apps/borrower_pro_mobile/Demo_Client/src/lib/api/borrower.ts
import {
  createBorrowerApiClient,
  createApplicationsApiClient,
  createLoansApiClient,
  createBorrowerAuthApiClient,
  createSigningApiClient,
} from '@kredit/borrower';
import { getEnv } from '@/lib/config/env';
import { sessionFetch } from '@/lib/auth/session-fetch';

const BASE = `${getEnv().backendUrl}/api/borrower-auth`;

export const borrowerClient     = createBorrowerApiClient(BASE, sessionFetch);
export const applicationsClient = createApplicationsApiClient(BASE, sessionFetch);
export const loansClient        = createLoansApiClient(BASE, sessionFetch);
export const borrowerAuthClient = createBorrowerAuthApiClient(BASE, sessionFetch);
export const signingClient      = createSigningApiClient(`${BASE}/signing`, sessionFetch);
```

`sessionFetch` lives in `src/lib/auth/session-fetch.ts`. It reads the session token from `expo-secure-store` on every call and injects it as `Cookie: truestack-borrower.session_token=<token>`. Screens never touch auth headers directly.

---

## 7. The Naming Conflict: LenderBankInfo vs LenderInfo

Two different "lender info" types exist:

| Type | Source | Purpose |
|------|--------|---------|
| `LenderBankInfo` | `types/loan.ts` | Bank account details for the lender (bank code, account number) -- used for payment instructions |
| `LenderInfo` | `types/auth.ts` | Lender company information (name, license, address, logo) -- used for the borrower "About" page |

The web app previously had `BorrowerLenderInfo` (in `borrower-loans-client.ts`) which is the same shape as `LenderBankInfo`. For backward compatibility, the web loans client re-exports:

```ts
export type { LenderBankInfo as BorrowerLenderInfo } from "@kredit/borrower";
```

---

## 8. How to Add a New API Endpoint

### Step 1: Add types (if needed)

Add any new request/response interfaces to the appropriate file in `packages/borrower/src/types/`.

### Step 2: Add Zod schema (if needed)

Add a matching schema in `packages/borrower/src/schemas/`.

### Step 3: Add to the factory

Add the method to the appropriate factory function in `packages/borrower/src/api/`. Follow the existing pattern:

```ts
async function myNewEndpoint(id: string): Promise<{ success: boolean; data: MyType }> {
  const res = await fetchFn(`${baseUrl}/my-endpoint/${encodeURIComponent(id)}`);
  const json = await parseJson<{ success: boolean; data?: MyType; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed");
  }
  return { success: true, data: json.data! };
}
```

Add it to the factory's return object.

### Step 4: Rebuild

```bash
npm run build -w @kredit/borrower
```

### Step 5: Web wrapper

Add the web-specific version in the corresponding `apps/borrower_pro/lib/` file with `credentials: "include"` and the `/api/proxy/borrower-auth` base URL.

### Step 6: Mobile usage

The mobile app gets it automatically through the factory instance (e.g. `loansClient.myNewEndpoint(id)`).

---

## 9. Next Steps

- **Additional mobile screens**: Build loan center, application flow, and profile screens in the Expo app using the shared clients. See `docs/mobile-development-expo.md` for the full screen map and phase breakdown.
- **Signing screen**: The `createSigningApiClient` factory is ready; the mobile signing UI still needs to be built.
- **Early settlement**: The early settlement endpoints (`getBorrowerEarlySettlementQuote`, `createBorrowerEarlySettlementRequest`, `listBorrowerEarlySettlementRequests`) remain web-only in `borrower-loans-client.ts` for now; extract to the package when mobile needs them.
- **TanStack Query**: Consider wrapping API client calls in `useQuery` / `useMutation` hooks for caching, loading, and error state management across screens.
