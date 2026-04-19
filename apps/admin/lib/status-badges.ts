/**
 * Shared status → Badge variant + human labels for loan applications and loans (admin UI parity).
 */
export type StatusBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "secondary";

/** Badge `variant` for application statuses */
export const APPLICATION_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
  DRAFT: "secondary",
  SUBMITTED: "warning",
  UNDER_REVIEW: "warning",
  PENDING_L2_APPROVAL: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

export function applicationStatusLabel(status: string): string {
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "L1 Review";
  if (status === "PENDING_L2_APPROVAL") return "L2 Review";
  return status.replace(/_/g, " ");
}

/** For charts / pie labels (HSL) */
export const CHART_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "hsl(0, 0%, 20%)",
  IN_ARREARS: "hsl(38, 92%, 50%)",
  COMPLETED: "hsl(142, 71%, 45%)",
  DEFAULTED: "hsl(0, 84%, 60%)",
  WRITTEN_OFF: "hsl(0, 0%, 65%)",
  PENDING_ATTESTATION: "hsl(38, 92%, 55%)",
  PENDING_DISBURSEMENT: "hsl(142, 71%, 65%)",
  DRAFT: "hsl(0, 0%, 65%)",
  SUBMITTED: "hsl(217, 91%, 60%)",
  UNDER_REVIEW: "hsl(38, 92%, 50%)",
  PENDING_L2_APPROVAL: "hsl(199, 89%, 48%)",
  APPROVED: "hsl(142, 71%, 45%)",
  REJECTED: "hsl(0, 84%, 60%)",
  CANCELLED: "hsl(0, 0%, 50%)",
};

export const CHART_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  IN_ARREARS: "In Arrears",
  COMPLETED: "Completed",
  DEFAULTED: "Defaulted",
  WRITTEN_OFF: "Written Off",
  PENDING_ATTESTATION: "Pending Attestation",
  PENDING_DISBURSEMENT: "Pending Disbursement",
  DRAFT: "Draft",
  SUBMITTED: "L1 Review",
  UNDER_REVIEW: "L1 Review",
  PENDING_L2_APPROVAL: "L2 Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** Badge `variant` for loan statuses */
export const LOAN_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
  PENDING_ATTESTATION: "warning",
  PENDING_DISBURSEMENT: "warning",
  ACTIVE: "info",
  IN_ARREARS: "warning",
  COMPLETED: "success",
  DEFAULTED: "destructive",
  WRITTEN_OFF: "destructive",
};

export function loanStatusBadgeLabel(status: string): string {
  return CHART_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
