/**
 * Borrower API clients for mobile.
 *
 * All five factory clients share a single `sessionFetch` that reads the stored
 * session token from SecureStore and attaches it as a Cookie header.
 * Auth transport is handled transparently — screens just call e.g.
 * `borrowerClient.fetchBorrower()` without worrying about cookies.
 */

import {
  createApplicationsApiClient,
  createBorrowerApiClient,
  createBorrowerAuthApiClient,
  createLoansApiClient,
  createSigningApiClient,
} from '@kredit/borrower';
import { getEnv } from '@/lib/config/env';
import { sessionFetch } from '@/lib/auth/session-fetch';

const BASE = `${getEnv().backendUrl}/api/borrower-auth`;

export const borrowerClient = createBorrowerApiClient(BASE, sessionFetch);
export const applicationsClient = createApplicationsApiClient(BASE, sessionFetch);
export const loansClient = createLoansApiClient(BASE, sessionFetch);
export const borrowerAuthClient = createBorrowerAuthApiClient(BASE, sessionFetch);
export const signingClient = createSigningApiClient(`${BASE}/signing`, sessionFetch);
