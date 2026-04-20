/**
 * View types for the borrower loan application flow (aligned with backend JSON).
 */

export type ApplicationStep =
  | "product"
  | "loan_details"
  | "personal"
  | "documents"
  | "review";

export interface RequiredDocumentItem {
  key: string;
  label: string;
  required: boolean;
}

/** Product row from GET /api/borrower-auth/products */
export interface BorrowerProduct {
  id: string;
  name: string;
  description: string | null;
  interestModel: string;
  interestRate: unknown;
  latePaymentRate: unknown;
  arrearsPeriod: number;
  defaultPeriod: number;
  minAmount: unknown;
  maxAmount: unknown;
  minTerm: number;
  maxTerm: number;
  /** Months between allowed terms when `allowedTerms` is empty (default 1). */
  termInterval?: number;
  /** Explicit allowed tenures; when set, borrower may only pick these values. */
  allowedTerms?: number[] | null;
  legalFeeType: string;
  legalFeeValue: unknown;
  stampingFeeType: string;
  stampingFeeValue: unknown;
  requiredDocuments: RequiredDocumentItem[] | null;
  eligibleBorrowerTypes: string;
  loanScheduleType: string;
  isActive: boolean;
  /** Present when API returns full product row (application detail). */
  earlySettlementEnabled?: boolean;
  earlySettlementLockInMonths?: number;
  earlySettlementDiscountType?: string;
  earlySettlementDiscountValue?: unknown;
}

export interface LoanPreviewData {
  loanAmount: number;
  term: number;
  interestRate: number;
  interestModel: string;
  legalFee: number;
  legalFeeType: string;
  stampingFee: number;
  stampingFeeType: string;
  totalFees: number;
  netDisbursement: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayable: number;
}

export interface ApplicationDocumentRow {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  uploadedAt: string;
  /** Server path for opening the file (e.g. `/uploads/...`). */
  path?: string;
}

export interface LoanApplicationDetail {
  id: string;
  tenantId: string;
  borrowerId: string;
  productId: string;
  amount: unknown;
  term: number;
  status: string;
  loanChannel?: "ONLINE" | "PHYSICAL";
  notes: string | null;
  collateralType: string | null;
  collateralValue: unknown;
  createdAt: string;
  updatedAt: string;
  product: BorrowerProduct;
  documents: ApplicationDocumentRow[];
  borrower?: Record<string, unknown>;
  /** Set when application is approved and a loan exists */
  loan?: { id: string; status: string } | null;
  /** List API may return minimal `{ id, status, fromParty }` rows; detail includes full rounds. */
  offerRounds?: Array<{
    id: string;
    amount?: unknown;
    term?: number;
    fromParty: string;
    status: string;
    createdAt?: string;
  }>;
  /**
   * When present (borrower list/detail API), true if the lender returned this online draft for amendments.
   * Falls back to notes/timeline heuristics in the UI when omitted.
   */
  returnedForAmendment?: boolean;
}
