// Shared types and constants for TrueKredit

// ============================================
// Enums
// ============================================

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
}

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum BillingEventType {
  INVOICE_ISSUED = 'INVOICE_ISSUED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  GRACE_PERIOD_STARTED = 'GRACE_PERIOD_STARTED',
  ACCESS_BLOCKED = 'ACCESS_BLOCKED',
  ACCESS_RESTORED = 'ACCESS_RESTORED',
}

export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum LoanStatus {
  PENDING_DISBURSEMENT = 'PENDING_DISBURSEMENT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DEFAULTED = 'DEFAULTED',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export enum RepaymentStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum InterestModel {
  FLAT = 'FLAT',
  RULE_78 = 'RULE_78',
  DECLINING_BALANCE = 'DECLINING_BALANCE',
  EFFECTIVE_RATE = 'EFFECTIVE_RATE',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  DISBURSE = 'DISBURSE',
  PAYMENT = 'PAYMENT',
}

export enum EventStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/** Aligns with Prisma `BorrowerManualPaymentRequestStatus` in backend_pro. */
export enum BorrowerManualPaymentRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** Aligns with Prisma `LoanApplicationOfferParty` in backend_pro. */
export enum LoanApplicationOfferParty {
  ADMIN = 'ADMIN',
  BORROWER = 'BORROWER',
}

/** Aligns with Prisma `LoanApplicationOfferStatus` in backend_pro. */
export enum LoanApplicationOfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
}

// ============================================
// Constants
// ============================================

export const GRACE_PERIOD_DAYS = 3;

export const TENANT_SCOPED_MODELS = [
  'User',
  'Borrower',
  'Product',
  'LoanApplication',
  'Loan',
  'LoanScheduleVersion',
  'LoanRepayment',
  'PaymentAllocation',
  'Invoice',
  'Receipt',
  'BillingEvent',
  'AuditLog',
  'File',
  'Notification',
] as const;

// ============================================
// Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

export interface ScheduleParams {
  principal: number;
  interestRate: number;
  term: number;
  disbursementDate: Date;
  interestModel: InterestModel;
}

export interface ScheduleOutput {
  repayments: {
    dueDate: Date;
    principal: number;
    interest: number;
    totalDue: number;
  }[];
  totalInterest: number;
  totalPayable: number;
}
