// Types
export * from './types/borrower';
export * from './types/application';
export * from './types/loan';
export * from './types/auth';
export * from './types/signing';
export * from './types/notifications';
export * from './types/meeting';

// Schemas
export * from './schemas/borrower';
export * from './schemas/application';
export * from './schemas/loan';
export * from './schemas/auth';
export * from './schemas/signing';

// API shared utilities
export type { FetchFn } from './api/shared';
export { parseJson } from './api/shared';

// Notification category helpers (UI mapping)
export {
  borrowerNotificationCategoryLabel,
  resolveBorrowerNotificationCategoryKind,
  type BorrowerNotificationCategoryKind,
} from './lib/borrower-notification-category';

// API factories
export { createBorrowerApiClient } from './api/borrower-client';
export { createApplicationsApiClient } from './api/applications-client';
export { createLoansApiClient } from './api/loans-client';
export { createBorrowerAuthApiClient } from './api/borrower-auth-client';
export { createSigningApiClient } from './api/signing-client';
export { createNotificationsApiClient } from './api/notifications-client';
export { createMeetingsApiClient } from './api/meetings-client';

export { resolveBorrowerSecurityStatus, type BorrowerSecurityStatus } from './lib/security-status';

// URL helpers
export {
  borrowerLoanGenerateAgreementUrl,
  borrowerLoanViewSignedAgreementUrl,
  borrowerDisbursementProofUrl,
  borrowerStampCertificateUrl,
  borrowerTransactionReceiptUrl,
  borrowerTransactionProofUrl,
} from './api/loans-client';
