/**
 * Shared helpers for TrueSight cross-tenant insights display.
 */

export type DataConsistencyLevel =
  | "EXACT_MATCH"
  | "ALMOST_FULL_MATCH"
  | "PARTIAL_MATCH"
  | "NOT_MATCHING"
  | "NOT_AVAILABLE";

export type BorrowerPerformanceRiskLevel =
  | "NO_HISTORY"
  | "GOOD"
  | "WATCH"
  | "HIGH_RISK"
  | "DEFAULTED";

export interface CrossTenantLoanInsight {
  id?: string;
  lenderName?: string | null;
  tenantName?: string | null;
  loanAmountRange?: string | null;
  principalAmountRange?: string | null;
  amountRange?: string | null;
  status?: string | null;
  paymentPerformance?: { onTimeRateRange?: string | null };
  agreementDate?: string | null;
  disbursementDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivityAt?: string | null;
}

export interface CrossTenantInsightsData {
  hasHistory: boolean;
  otherLenderCount: number;
  lenderNames: string[];
  totalLoans: number;
  activeLoans: number;
  completedLoans: number;
  defaultedLoans: number;
  latePaymentsCount?: number;
  totalBorrowedRange: string | null;
  paymentPerformance: {
    rating: BorrowerPerformanceRiskLevel | string;
    onTimeRateRange: string | null;
  };
  lastBorrowedAt: string | null;
  lastActivityAt: string | null;
  nameConsistency?: DataConsistencyLevel | string;
  phoneConsistency?: DataConsistencyLevel | string;
  addressConsistency?: DataConsistencyLevel | string;
  loanDetails?: CrossTenantLoanInsight[];
  recentLoans?: CrossTenantLoanInsight[];
  loans?: CrossTenantLoanInsight[];
}

export function getPerformanceBadgeMeta(
  riskLevel: BorrowerPerformanceRiskLevel | string | null | undefined
): { label: string; variant: "destructive" | "warning" | "info" | "success" | "outline" } {
  const level = String(riskLevel || "").toUpperCase();
  switch (level) {
    case "DEFAULTED":
      return { label: "Defaulted", variant: "destructive" };
    case "HIGH_RISK":
      return { label: "High Risk", variant: "warning" };
    case "WATCH":
      return { label: "Watch", variant: "info" };
    case "GOOD":
      return { label: "Good", variant: "success" };
    default:
      return { label: "No History", variant: "outline" };
  }
}

export function getConsistencyMeta(
  level: DataConsistencyLevel | string | null | undefined
): {
  label: string;
  variant: "success" | "warning" | "destructive" | "outline" | "info";
  showAlert: boolean;
} {
  const normalized = String(level || "").toUpperCase();
  switch (normalized) {
    case "EXACT_MATCH":
      return { label: "Exact match", variant: "success", showAlert: false };
    case "ALMOST_FULL_MATCH":
      return { label: "Almost full match", variant: "success", showAlert: false };
    case "PARTIAL_MATCH":
      return { label: "Partial match", variant: "warning", showAlert: true };
    case "NOT_MATCHING":
      return { label: "Not matching", variant: "destructive", showAlert: true };
    default:
      return { label: "Not available", variant: "outline", showAlert: false };
  }
}

export function formatLoanStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCrossTenantLoanTimestamp(loan: CrossTenantLoanInsight): number | null {
  const candidate =
    loan.disbursementDate ??
    loan.agreementDate ??
    loan.createdAt ??
    loan.updatedAt ??
    loan.lastActivityAt;
  if (!candidate) return null;
  const timestamp = new Date(candidate).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getCrossTenantLoanItems(
  insights: CrossTenantInsightsData | null | undefined
): CrossTenantLoanInsight[] {
  const loanItems =
    insights?.loanDetails ??
    insights?.recentLoans ??
    insights?.loans ??
    [];
  return [...loanItems].sort((a, b) => {
    const aTime = getCrossTenantLoanTimestamp(a) ?? 0;
    const bTime = getCrossTenantLoanTimestamp(b) ?? 0;
    return bTime - aTime;
  });
}

export function getCrossTenantLoanLenderName(loan: CrossTenantLoanInsight): string {
  return (
    loan.lenderName?.trim() ||
    loan.tenantName?.trim() ||
    "Other lender"
  );
}

export function getCrossTenantLoanAmountRange(loan: CrossTenantLoanInsight): string | null {
  return (
    loan.loanAmountRange?.trim() ||
    loan.principalAmountRange?.trim() ||
    loan.amountRange?.trim() ||
    null
  );
}

export function getPaymentPerformanceBadgeVariant(
  onTimeRateRange: string | null | undefined
): "success" | "warning" | "destructive" | "outline" {
  if (!onTimeRateRange?.trim()) return "outline";
  const match = onTimeRateRange.match(/^(\d+)/);
  const lower = match ? parseInt(match[1], 10) : NaN;
  if (Number.isNaN(lower)) return "outline";
  if (lower >= 80) return "success";
  if (lower >= 50) return "warning";
  return "destructive";
}
