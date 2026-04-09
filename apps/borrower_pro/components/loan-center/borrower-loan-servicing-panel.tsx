"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck,
  Loader2,
  MoreHorizontal,
  FileText,
  Shield,
  ShieldCheck,
  Receipt,
  TrendingUp,
  User,
  XCircle,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { CopyField } from "../ui/copy-field";
import { RefreshButton } from "../ui/refresh-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  getBorrowerLoanTimeline,
  getBorrowerLoanSchedule,
  getBorrowerLoanMetrics,
  listBorrowerManualPaymentRequests,
  getBorrowerEarlySettlementQuote,
  listBorrowerEarlySettlementRequests,
  borrowerLoanViewSignedAgreementUrl,
  borrowerLoanViewBorrowerSignedAgreementUrl,
  borrowerDisbursementProofUrl,
  borrowerStampCertificateUrl,
  borrowerTransactionReceiptUrl,
  borrowerTransactionProofUrl,
} from "../../lib/borrower-loans-client";
import type {
  BorrowerLoanDetail,
  BorrowerLoanMetrics,
  BorrowerLoanTimelineEvent,
} from "../../lib/borrower-loan-types";
import type { EarlySettlementQuoteData } from "../../lib/borrower-loans-client";
import { toAmountNumber } from "../../lib/application-form-validation";
import { borrowerLoanStatusBadgeVariant, loanStatusBadgeLabelFromDb } from "../../lib/loan-status-label";
import { formatICForDisplay } from "../../lib/borrower-form-display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { PhoneDisplay } from "../ui/phone-display";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
}

function humanizeWords(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    status: "Status",
    reason: "Reason",
    amount: "Amount",
    totalAmount: "Amount",
    totalDue: "Total due",
    totalPaid: "Total paid",
    totalFeeCharged: "Late fee charged",
    totalLateFees: "Late fees",
    totalLateFeesPaid: "Late fees paid",
    lateFee: "Late fee",
    discountAmount: "Discount",
    settlementAmount: "Settlement amount",
    receiptNumber: "Receipt number",
    reference: "Reference",
    filename: "File",
    originalName: "File",
    agreementDate: "Agreement date",
    documentType: "Document type",
    repaymentsAffected: "Repayments affected",
    cancelledRepayments: "Cancelled repayments",
    paymentDate: "Payment date",
    disbursementDate: "Disbursement date",
    borrowerName: "Borrower",
    borrowerIc: "Borrower IC",
    attestationStatus: "Attestation status",
    proposalStartAt: "Proposed start",
    proposalEndAt: "Proposed end",
    meetingStartAt: "Meeting start",
    meetingEndAt: "Meeting end",
  };
  return labels[key] ?? humanizeWords(key);
}

function formatAuditValue(value: unknown, key: string): string {
  if (value == null) return "(empty)";
  if (typeof value === "number") {
    if (Number.isFinite(value) && /(amount|fee|paid|due|value|discount|settlement|principal|interest|total)/i.test(key)) {
      return formatRm(value);
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const asDate = formatDateTime(value);
    if (asDate && (/date|at/i.test(key) || /^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value))) {
      return asDate;
    }
    if (key === "status" || key.endsWith("Status") || key === "documentType") {
      return humanizeWords(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(none)";
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null) return JSON.stringify(item);
        return String(item);
      })
      .join("; ");
  }
  return JSON.stringify(value);
}

function getAuditChanges(
  previousData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
): Array<{ field: string; from: string; to: string }> {
  if (!previousData || !newData) return [];
  const keys = Array.from(new Set([...Object.keys(previousData), ...Object.keys(newData)]));
  return keys
    .filter((key) => JSON.stringify(previousData[key]) !== JSON.stringify(newData[key]))
    .map((key) => ({
      field: fieldLabel(key),
      from: formatAuditValue(previousData[key], key),
      to: formatAuditValue(newData[key], key),
    }));
}

function formatRelativeTime(iso: string): string {
  const createdAt = new Date(iso);
  const diffMs = createdAt.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}

function borrowerTimelineActionInfo(action: string): {
  icon: typeof Clock;
  label: string;
} {
  switch (action) {
    case "CREATE":
      return { icon: CheckCircle, label: "Loan created" };
    case "DISBURSE":
      return { icon: Banknote, label: "Loan disbursed" };
    case "BORROWER_MANUAL_PAYMENT_REQUEST_CREATED":
      return { icon: CreditCard, label: "Manual payment submitted" };
    case "BORROWER_MANUAL_PAYMENT_APPROVED":
      return { icon: CheckCircle, label: "Manual payment approved" };
    case "BORROWER_MANUAL_PAYMENT_REJECTED":
      return { icon: XCircle, label: "Manual payment rejected" };
    case "BORROWER_ATTESTATION_MEETING_REQUESTED":
      return { icon: Calendar, label: "Attestation meeting requested" };
    case "BORROWER_ATTESTATION_RESTARTED":
      return { icon: Clock, label: "Attestation restarted" };
    case "BORROWER_EARLY_SETTLEMENT_REQUEST_CREATED":
      return { icon: Percent, label: "Early settlement request submitted" };
    case "BORROWER_EARLY_SETTLEMENT_APPROVED":
      return { icon: CheckCircle, label: "Early settlement approved" };
    case "BORROWER_EARLY_SETTLEMENT_REJECTED":
      return { icon: XCircle, label: "Early settlement request declined" };
    case "RECORD_PAYMENT":
      return { icon: CreditCard, label: "Payment recorded" };
    case "BORROWER_ATTESTATION_SLOT_PROPOSED":
      return { icon: Calendar, label: "Attestation slot proposed" };
    case "ADMIN_ATTESTATION_PROPOSAL_ACCEPTED":
      return { icon: Calendar, label: "Attestation slot accepted" };
    case "BORROWER_ATTESTATION_COMPLETE":
      return { icon: CheckCircle, label: "Attestation completed" };
    case "BORROWER_UPLOAD_AGREEMENT":
      return { icon: FileText, label: "Signed agreement uploaded" };
    case "UPLOAD_AGREEMENT":
      return { icon: FileText, label: "Signed agreement uploaded" };
    case "UPLOAD_DISBURSEMENT_PROOF":
      return { icon: FileText, label: "Proof of disbursement uploaded" };
    case "UPLOAD_STAMP_CERTIFICATE":
      return { icon: Shield, label: "Stamp certificate uploaded" };
    case "STATUS_UPDATE":
      return { icon: Clock, label: "Loan status updated" };
    case "LATE_FEE_ACCRUAL":
      return { icon: AlertTriangle, label: "Late fees charged" };
    case "DEFAULT_READY":
      return { icon: AlertTriangle, label: "Default threshold reached" };
    case "EARLY_SETTLEMENT":
      return { icon: Banknote, label: "Early settlement recorded" };
    case "EXPORT":
      return { icon: FileText, label: "Document exported" };
    case "COMPLETE":
      return { icon: CheckCircle, label: "Loan completed" };
    case "MARK_DEFAULT":
      return { icon: XCircle, label: "Loan marked default" };
    case "BORROWER_DIGITAL_SIGN_AGREEMENT":
      return { icon: ShieldCheck, label: "Agreement digitally signed" };
    case "SIGNED_AGREEMENT_EMAILED":
      return { icon: FileCheck, label: "Signed agreement emailed" };
    case "SIGNED_AGREEMENT_EMAIL_FAILED":
      return { icon: FileCheck, label: "Agreement email failed" };
    case "INTERNAL_SIGN_COMPANY_REP":
      return { icon: ShieldCheck, label: "Company rep signed" };
    case "INTERNAL_SIGN_WITNESS":
      return { icon: ShieldCheck, label: "Witness signed" };
    default:
      return { icon: Clock, label: humanizeWords(action) };
  }
}

function borrowerTimelineActorLabel(event: BorrowerLoanTimelineEvent): string | null {
  if (event.user?.name || event.user?.email) return event.user.name || event.user.email;
  if (event.action === "BORROWER_MANUAL_PAYMENT_APPROVED" || event.action === "BORROWER_MANUAL_PAYMENT_REJECTED") {
    return "Admin";
  }
  if (event.action.startsWith("BORROWER_")) return "You";
  if (event.action.startsWith("ADMIN_")) return "Admin";
  if (
    event.action === "DISBURSE" ||
    event.action === "STATUS_UPDATE" ||
    event.action === "RECORD_PAYMENT" ||
    event.action === "LATE_FEE_ACCRUAL" ||
    event.action === "EARLY_SETTLEMENT" ||
    event.action === "UPLOAD_DISBURSEMENT_PROOF" ||
    event.action === "UPLOAD_STAMP_CERTIFICATE" ||
    event.action === "UPLOAD_AGREEMENT" ||
    event.action === "EXPORT" ||
    event.action === "COMPLETE" ||
    event.action === "MARK_DEFAULT" ||
    event.action === "INTERNAL_SIGN_COMPANY_REP" ||
    event.action === "INTERNAL_SIGN_WITNESS" ||
    event.action === "SIGNED_AGREEMENT_EMAILED" ||
    event.action === "SIGNED_AGREEMENT_EMAIL_FAILED"
  ) {
    return "Admin";
  }
  if (event.user) return "Admin";
  return null;
}

function BorrowerTimelineItem({ event }: { event: BorrowerLoanTimelineEvent }) {
  const actionInfo = borrowerTimelineActionInfo(event.action);
  const Icon = actionInfo.icon;
  const actorLabel = borrowerTimelineActorLabel(event);
  const changes = getAuditChanges(event.previousData, event.newData);
  const nd = event.newData;
  const isManualPaymentLifecycle =
    event.action === "BORROWER_MANUAL_PAYMENT_REQUEST_CREATED" ||
    event.action === "BORROWER_MANUAL_PAYMENT_APPROVED" ||
    event.action === "BORROWER_MANUAL_PAYMENT_REJECTED";
  const isRecordPayment = event.action === "RECORD_PAYMENT";

  let amount: number | null = null;
  let reference = "";
  if (isManualPaymentLifecycle && nd) {
    amount = toAmountNumber(nd.amount ?? 0);
    reference = String(nd.reference ?? "").trim();
  } else if (isRecordPayment && nd) {
    amount = toAmountNumber(nd.totalAmount ?? nd.amount ?? 0);
    reference = String(nd.reference ?? "").trim();
  }

  const rejectReason =
    event.action === "BORROWER_MANUAL_PAYMENT_REJECTED" && nd?.reason != null
      ? String(nd.reason).trim()
      : "";

  const showAmountBox =
    (amount != null && amount > 0 && (isManualPaymentLifecycle || isRecordPayment)) ||
    (event.action === "BORROWER_MANUAL_PAYMENT_REJECTED" && rejectReason !== "");

  const renderDetail = () => {
    if (showAmountBox) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          {amount != null && amount > 0 ? (
            <p className="text-xs text-muted-foreground">
              Amount: <span className="font-medium text-foreground">{formatRm(amount)}</span>
              {reference ? <span className="ml-2 break-all">Ref: {reference}</span> : null}
            </p>
          ) : null}
          {rejectReason ? (
            <p className="text-xs text-muted-foreground">
              Reason: <span className="text-foreground">{rejectReason}</span>
            </p>
          ) : null}
        </div>
      );
    }

    if (event.action === "STATUS_UPDATE" && nd) {
      const prevStatus = event.previousData?.status;
      const nextStatus = nd.status;
      const reason = nd.reason;
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            {prevStatus ? (
              <>
                <span className="font-medium text-foreground">{formatAuditValue(prevStatus, "status")}</span>
                {" -> "}
                <span className="font-medium text-foreground">{formatAuditValue(nextStatus, "status")}</span>
              </>
            ) : (
              <span className="font-medium text-foreground">{formatAuditValue(nextStatus, "status")}</span>
            )}
          </p>
          {reason ? (
            <p className="text-xs text-muted-foreground">
              Reason: <span className="text-foreground">{formatAuditValue(reason, "reason")}</span>
            </p>
          ) : null}
        </div>
      );
    }

    if (event.action === "LATE_FEE_ACCRUAL" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            Fee charged:{" "}
            <span className="font-medium text-foreground">
              {formatAuditValue(nd.totalFeeCharged, "totalFeeCharged")}
            </span>
          </p>
          {nd.repaymentsAffected != null ? (
            <p className="text-xs text-muted-foreground">
              Repayments affected:{" "}
              <span className="font-medium text-foreground">
                {formatAuditValue(nd.repaymentsAffected, "repaymentsAffected")}
              </span>
            </p>
          ) : null}
        </div>
      );
    }

    if (event.action === "EARLY_SETTLEMENT" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            Settlement amount:{" "}
            <span className="font-medium text-foreground">
              {formatAuditValue(nd.settlementAmount, "settlementAmount")}
            </span>
          </p>
          {nd.discountAmount != null ? (
            <p className="text-xs text-muted-foreground">
              Discount:{" "}
              <span className="font-medium text-foreground">
                {formatAuditValue(nd.discountAmount, "discountAmount")}
              </span>
            </p>
          ) : null}
          {nd.receiptNumber ? (
            <p className="text-xs text-muted-foreground">
              Receipt: <span className="font-medium text-foreground">{formatAuditValue(nd.receiptNumber, "receiptNumber")}</span>
            </p>
          ) : null}
        </div>
      );
    }

    if (
      (event.action === "BORROWER_UPLOAD_AGREEMENT" ||
        event.action === "UPLOAD_AGREEMENT" ||
        event.action === "UPLOAD_DISBURSEMENT_PROOF" ||
        event.action === "UPLOAD_STAMP_CERTIFICATE") &&
      nd
    ) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            File:{" "}
            <span className="font-medium text-foreground">
              {formatAuditValue(nd.filename ?? nd.originalName ?? nd.path, "filename")}
            </span>
          </p>
          {nd.agreementDate ? (
            <p className="text-xs text-muted-foreground">
              Agreement date:{" "}
              <span className="font-medium text-foreground">
                {formatAuditValue(nd.agreementDate, "agreementDate")}
              </span>
            </p>
          ) : null}
        </div>
      );
    }

    if (event.action === "DISBURSE" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          {nd.disbursementDate ? (
            <p className="text-xs text-muted-foreground">
              Disbursed on:{" "}
              <span className="font-medium text-foreground">
                {formatAuditValue(nd.disbursementDate, "disbursementDate")}
              </span>
            </p>
          ) : null}
          {nd.reference ? (
            <p className="text-xs text-muted-foreground">
              Reference: <span className="font-medium text-foreground">{formatAuditValue(nd.reference, "reference")}</span>
            </p>
          ) : null}
        </div>
      );
    }

    if (event.action === "EXPORT" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            Document:{" "}
            <span className="font-medium text-foreground">
              {formatAuditValue(nd.documentType, "documentType")}
            </span>
          </p>
          {nd.borrowerName ? (
            <p className="text-xs text-muted-foreground">
              Borrower:{" "}
              <span className="font-medium text-foreground">{formatAuditValue(nd.borrowerName, "borrowerName")}</span>
            </p>
          ) : null}
        </div>
      );
    }

    if (event.action === "BORROWER_DIGITAL_SIGN_AGREEMENT" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            Version <span className="font-medium text-foreground">v{nd.version as number}</span>
            {nd.agreementDate ? (
              <>
                <span className="mx-1.5">|</span>
                Date: <span className="font-medium text-foreground">{formatAuditValue(nd.agreementDate, "agreementDate")}</span>
              </>
            ) : null}
          </p>
        </div>
      );
    }

    if (event.action === "SIGNED_AGREEMENT_EMAILED" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground truncate">
            Sent to <span className="font-medium text-foreground">{(nd.recipientName as string) || (nd.recipientEmail as string) || "-"}</span>
          </p>
        </div>
      );
    }

    if (event.action === "SIGNED_AGREEMENT_EMAIL_FAILED" && nd) {
      return (
        <div className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-xs text-destructive truncate">
            Failed to email signed agreement
          </p>
        </div>
      );
    }

    if ((event.action === "INTERNAL_SIGN_COMPANY_REP" || event.action === "INTERNAL_SIGN_WITNESS") && nd) {
      const roleLabel = (nd.role as string) === "COMPANY_REP" ? "Company Rep" : "Witness";
      return (
        <div className="space-y-1 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            {roleLabel}: <span className="font-medium text-foreground">{(nd.signerName as string) || "-"}</span>
          </p>
          {typeof nd.agreementVersion === "number" && (
            <p className="text-xs text-muted-foreground">
              Version <span className="font-medium text-foreground">v{nd.agreementVersion as number}</span>
            </p>
          )}
        </div>
      );
    }

    if (changes.length > 0) {
      return (
        <div className="space-y-2 rounded-lg border border-border bg-secondary p-3">
          {changes.map((change) => (
            <div key={`${event.id}-${change.field}`} className="text-xs space-y-0.5">
              <p className="font-medium text-foreground">{change.field}</p>
              <p className="text-muted-foreground">
                <span className="line-through">{change.from}</span>
                {" -> "}
                <span className="font-medium text-foreground">{change.to}</span>
              </p>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="mt-2 min-h-[8px] w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 pb-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(event.createdAt)}</span>
        </div>
        {actorLabel ? <p className="mb-2 text-sm text-muted-foreground">by {actorLabel}</p> : null}
        {renderDetail()}
        <p className="mt-2 text-xs text-muted-foreground">{formatDateShort(event.createdAt)}</p>
      </div>
    </div>
  );
}

/** Matches admin loan detail progress donut (loans/[loanId]/page.tsx). */
function ProgressDonut({
  percent,
  size = 68,
  strokeWidth = 7,
  status,
  className,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  status?: string;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;

  // Match admin_pro loans/[loanId] ProgressDonut stroke semantics
  let strokeColor = "stroke-foreground";
  if (status === "COMPLETED") {
    strokeColor = "stroke-emerald-500";
  } else if (status === "DEFAULTED" || status === "WRITTEN_OFF") {
    strokeColor = "stroke-red-500";
  } else if (status === "IN_ARREARS") {
    strokeColor = "stroke-amber-500";
  }

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted/40"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={strokeColor}
        />
      </svg>
      <span className="absolute text-sm font-heading font-bold text-foreground">
        {Math.round(percent)}%
      </span>
    </div>
  );
}

function loanStatusIcon(status: string) {
  switch (status) {
    case "ACTIVE":
      return <TrendingUp className="h-4 w-4" />;
    case "IN_ARREARS":
      return <AlertTriangle className="h-4 w-4" />;
    case "COMPLETED":
      return <CheckCircle className="h-4 w-4" />;
    case "DEFAULTED":
    case "WRITTEN_OFF":
      return <XCircle className="h-4 w-4" />;
    default:
      return null;
  }
}

function repaymentStatusBadgeVariant(
  st: string
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (st) {
    case "PAID":
      return "success";
    case "OVERDUE":
      return "destructive";
    case "PARTIAL":
      return "warning";
    case "CANCELLED":
      return "secondary";
    default:
      return "outline";
  }
}

type SchedulePayload = {
  schedule: {
    repayments: Array<{
      id: string;
      dueDate: string;
      principal?: unknown;
      interest?: unknown;
      totalDue: unknown;
      status: string;
      lateFeeAccrued?: unknown;
      lateFeesPaid?: unknown;
      allocations?: Array<{
        id?: string;
        amount: unknown;
        allocatedAt?: string;
        transaction?: {
          id: string;
          receiptPath?: string | null;
          proofPath?: string | null;
        } | null;
      }>;
    }>;
  } | null;
  summary?: {
    totalOutstanding?: unknown;
    totalPaid?: unknown;
    overdueCount?: number;
  };
};

export function BorrowerLoanServicingPanel({
  loanId,
  loan,
  onRefresh,
  /** When embedded (e.g. pre-disbursement tabs), parent supplies back navigation. */
  hideBackLink = false,
}: {
  loanId: string;
  loan: BorrowerLoanDetail;
  onRefresh: () => void;
  hideBackLink?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [scheduleData, setScheduleData] = useState<SchedulePayload | null>(null);
  const [metrics, setMetrics] = useState<BorrowerLoanMetrics | null>(null);
  const [pendingManualPayments, setPendingManualPayments] = useState(0);
  const [timeline, setTimeline] = useState<BorrowerLoanTimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [earlyQuote, setEarlyQuote] = useState<EarlySettlementQuoteData | null>(null);
  const [earlyRequests, setEarlyRequests] = useState<
    Array<{
      id: string;
      status: string;
      borrowerNote?: string | null;
      reference?: string | null;
      rejectionReason?: string | null;
      createdAt: string;
      snapshotTotalSettlement?: unknown;
      paymentTransaction?: { id: string; receiptNumber?: string | null } | null;
    }>
  >([]);
  const canPay =
    loan.status === "ACTIVE" || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sch, met, manual, timelineRes] = await Promise.all([
        getBorrowerLoanSchedule(loanId),
        getBorrowerLoanMetrics(loanId),
        listBorrowerManualPaymentRequests(loanId).catch(() => ({ success: true, data: [] })),
        getBorrowerLoanTimeline(loanId, { limit: 10 }).catch(() => ({
          success: true,
          data: [],
          pagination: { hasMore: false, nextCursor: null },
        })),
      ]);
      setScheduleData(sch.data as SchedulePayload);
      setMetrics(met.data);
      const pend = (manual.data ?? []).filter((r) => r.status === "PENDING").length;
      setPendingManualPayments(pend);
      setTimeline(timelineRes.data ?? []);
      setHasMoreTimeline(timelineRes.pagination?.hasMore ?? false);
      setTimelineCursor(timelineRes.pagination?.nextCursor ?? null);

      if (
        (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") &&
        loan.product?.earlySettlementEnabled
      ) {
        try {
          const [q, r] = await Promise.all([
            getBorrowerEarlySettlementQuote(loanId),
            listBorrowerEarlySettlementRequests(loanId),
          ]);
          setEarlyQuote(q.data);
          setEarlyRequests(r.data ?? []);
        } catch {
          setEarlyQuote(null);
          setEarlyRequests([]);
        }
      } else {
        setEarlyQuote(null);
        setEarlyRequests([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [loanId, loan.status, loan.product?.earlySettlementEnabled]);

  const loadMoreTimeline = useCallback(async () => {
    if (!timelineCursor) return;
    setLoadingMoreTimeline(true);
    try {
      const res = await getBorrowerLoanTimeline(loanId, { limit: 10, cursor: timelineCursor });
      setTimeline((current) => [...current, ...(res.data ?? [])]);
      setHasMoreTimeline(res.pagination?.hasMore ?? false);
      setTimelineCursor(res.pagination?.nextCursor ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load more activity");
    } finally {
      setLoadingMoreTimeline(false);
    }
  }, [loanId, timelineCursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const repayments = scheduleData?.schedule?.repayments ?? [];
  const summary = scheduleData?.summary;
  const product = loan.product;
  const applicationId = loan.application?.id;
  const borrower = loan.borrower;
  const pendingEarlySettlement = earlyRequests.filter((r) => r.status === "PENDING").length;
  const hasLoanDocuments = Boolean(loan.agreementPath || loan.disbursementProofPath || loan.stampCertPath);
  const isCorporate = borrower?.borrowerType === "CORPORATE";
  const borrowerDisplayName =
    isCorporate && borrower?.companyName?.trim()
      ? borrower.companyName
      : (borrower?.name ?? "—");

  const handleRefreshPage = async () => {
    onRefresh();
    await load();
  };

  const showEarlySettlementCard =
    product?.earlySettlementEnabled &&
    (loan.status === "ACTIVE" || loan.status === "IN_ARREARS");

  const showEarlySettlementHeader =
    loan.status === "ACTIVE" || loan.status === "IN_ARREARS";

  const earlySettlementHeaderDisabledReason = !product?.earlySettlementEnabled
    ? "Early settlement is not enabled for this product."
    : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Header — matches admin_pro dashboard/loans/[loanId] */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {!hideBackLink ? (
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link href="/loans">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-gradient">Loan</h1>
              <Badge variant="outline" className="text-xs shrink-0">
                {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
              </Badge>
              <Badge variant={borrowerLoanStatusBadgeVariant(loan)} className="flex items-center gap-1 shrink-0">
                {loanStatusIcon(loan.status)}
                {loanStatusBadgeLabelFromDb(loan)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {borrowerDisplayName} • {product?.name ?? "Loan"}
            </p>
          </div>
        </div>
        {pendingManualPayments > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">
            <span className="font-medium">Pending payment approval: </span>
            {pendingManualPayments} manual payment notification(s) awaiting your lender. Your schedule will update after
            approval.
          </div>
        ) : null}
        {pendingEarlySettlement > 0 ? (
          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-950 dark:text-blue-50">
            <span className="font-medium">Early settlement: </span>
            {pendingEarlySettlement} request(s) awaiting lender approval. You will be notified when the loan is settled.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 justify-end">
          <RefreshButton
            onRefresh={() => void handleRefreshPage()}
            showLabel
            showToast
            successMessage="Loan data refreshed"
          />
          {canPay ? (
            <Button size="sm" asChild>
              <Link href={`/loans/${loanId}/payment`}>
                <CreditCard className="h-4 w-4 mr-2" />
                Make payment
              </Link>
            </Button>
          ) : null}
          {showEarlySettlementHeader ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    {earlySettlementHeaderDisabledReason ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        className="pointer-events-none opacity-50"
                      >
                        <Banknote className="h-4 w-4 mr-2" />
                        Early settlement
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/loans/${loanId}/early-settlement`}>
                          <Banknote className="h-4 w-4 mr-2" />
                          Early settlement
                        </Link>
                      </Button>
                    )}
                  </span>
                </TooltipTrigger>
                {earlySettlementHeaderDisabledReason ? (
                  <TooltipContent className="max-w-xs">
                    <p>{earlySettlementHeaderDisabledReason}</p>
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Progress — admin-style single card */}
          <Card>
            <CardContent className="pt-4">
              {!metrics?.hasSchedule ? (
                <p className="text-sm text-muted-foreground py-2">
                  {loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION"
                    ? "Progress will show here once your repayment schedule is available (after disbursement)."
                    : "No repayment schedule yet."}
                </p>
              ) : metrics ? (
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <ProgressDonut
                    percent={Math.min(100, metrics.progressPercent ?? 0)}
                    status={loan.status}
                    size={68}
                    strokeWidth={7}
                  />
                  <div className="min-w-0 shrink-0">
                    <p className="text-2xl font-heading font-bold text-foreground tabular-nums">
                      {formatRm(metrics.totalPaid ?? 0)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      of {formatRm(metrics.totalDue ?? 0)}
                    </p>
                    {(metrics.totalDue ?? 0) - (metrics.totalPaid ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Outstanding:{" "}
                        <span className="font-semibold text-foreground">
                          {formatRm(metrics.totalOutstanding ?? 0)}
                        </span>
                      </p>
                    )}
                    {metrics.progressPercent != null &&
                      metrics.progressPercent >= 100 &&
                      (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && (
                        <Badge variant="success" className="mt-1.5 inline-flex gap-1 text-xs">
                          <CheckCircle className="h-3 w-3" />
                          Ready to complete
                        </Badge>
                      )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3 flex-1 min-w-0 ml-0 sm:ml-6">
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">Paid </span>
                      <span className="text-sm font-heading font-bold tabular-nums">
                        {metrics.paidCount ?? 0}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        / {metrics.totalRepayments ?? 0}
                      </span>
                    </div>
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">Overdue </span>
                      <span
                        className={cn(
                          "text-sm font-heading font-bold tabular-nums",
                          (metrics.overdueCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {metrics.overdueCount ?? 0}
                      </span>
                      {(metrics.oldestOverdueDays ?? 0) > 0 && (
                        <span className="text-xs text-destructive ml-0.5">
                          ({metrics.oldestOverdueDays}d)
                        </span>
                      )}
                    </div>
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">Late </span>
                      <span
                        className={cn(
                          "text-sm font-heading font-bold tabular-nums",
                          (metrics.totalLateFees ?? 0) > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {formatRm(metrics.totalLateFees ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">On-Time </span>
                      <span
                        className={cn(
                          "text-sm font-heading font-bold tabular-nums",
                          (metrics.repaymentRate ?? 0) >= 80
                            ? "text-success"
                            : (metrics.repaymentRate ?? 0) >= 50
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive"
                        )}
                      >
                        {metrics.repaymentRate != null ? `${metrics.repaymentRate}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Loading…</p>
              )}
            </CardContent>
          </Card>

          {showEarlySettlementCard ? (
            <Card id="borrower-early-settlement">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Percent className="h-5 w-5 text-muted-foreground" />
                  Early settlement
                </CardTitle>
                <CardDescription>
                  Settle your loan in full using your product&apos;s discounted early settlement amount — same steps as
                  making a payment (bank transfer + request for lender approval).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading && !earlyQuote ? (
                  <p className="text-sm text-muted-foreground">Loading quote…</p>
                ) : earlyQuote && !earlyQuote.eligible ? (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="font-medium">Not available right now</p>
                    <p className="text-muted-foreground mt-1">{earlyQuote.reason ?? "See product terms."}</p>
                  </div>
                ) : earlyQuote?.eligible ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md border border-border p-3">
                        <p className="text-muted-foreground text-xs">Estimated settlement</p>
                        <p className="text-xl font-heading font-bold tabular-nums">
                          {formatRm(earlyQuote.totalSettlement ?? 0)}
                        </p>
                        {earlyQuote.totalSavings != null && earlyQuote.totalSavings > 0 ? (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                            Includes interest discount: {formatRm(earlyQuote.totalSavings)}
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-md border border-border p-3 space-y-1 text-xs text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground">Principal:</span>{" "}
                          {formatRm(earlyQuote.remainingPrincipal ?? 0)}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Late fees:</span>{" "}
                          {formatRm(earlyQuote.outstandingLateFees ?? 0)}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Unpaid instalments:</span>{" "}
                          {earlyQuote.unpaidInstallments ?? "—"}
                        </p>
                      </div>
                    </div>
                    {pendingEarlySettlement > 0 ? (
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        You already have a pending request. Please wait for your lender to respond.
                      </p>
                    ) : (
                      <Button className="w-full sm:w-auto" asChild>
                        <Link href={`/loans/${loanId}/early-settlement`}>
                          <Banknote className="h-4 w-4 mr-2" />
                          Continue to early settlement
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Unable to load settlement quote.</p>
                )}

                {earlyRequests.length > 0 ? (
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-sm font-medium">Your requests</p>
                    <ul className="space-y-2 text-sm">
                      {earlyRequests.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <span>
                            {formatRelativeTime(r.createdAt)} ·{" "}
                            <span className="font-medium">{r.status}</span>
                            {r.status === "APPROVED" && r.paymentTransaction?.receiptNumber ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · Receipt {r.paymentTransaction.receiptNumber}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatRm(r.snapshotTotalSettlement ?? 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Borrower + Loan details — admin_pro dashboard/loans/[loanId] */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isCorporate ? (
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                    Borrower
                  </CardTitle>
                  {isCorporate ? (
                    <Badge variant="secondary" className="text-xs">
                      <Building2 className="h-3 w-3 mr-1" />
                      Corporate
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      <User className="h-3 w-3 mr-1" />
                      Individual
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {borrower ? (
                  <>
                    <div>
                      <p className="font-medium text-lg">{borrowerDisplayName}</p>
                      {isCorporate && borrower.companyName && (
                        <p className="text-sm text-muted-foreground">Rep: {borrower.name}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <CopyField
                        label={
                          isCorporate
                            ? "SSM"
                            : borrower.documentType === "IC"
                              ? "IC Number"
                              : "Passport"
                        }
                        value={formatICForDisplay(borrower.icNumber ?? undefined)}
                      />
                      {borrower.phone ? <PhoneDisplay label="Phone" value={borrower.phone} /> : null}
                      {borrower.email ? <CopyField label="Email" value={borrower.email} /> : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Borrower details unavailable.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-muted-foreground" />
                    Loan details
                  </CardTitle>
                  {product?.loanScheduleType === "JADUAL_K" ? (
                    <Badge variant="default" className="text-xs shrink-0">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Jadual K
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs shrink-0">
                      <Shield className="h-3 w-3 mr-1" />
                      Jadual J
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-heading font-bold">{formatRm(loan.principalAmount)}</p>
                  <p className="text-sm text-muted-foreground">
                    {toAmountNumber(loan.interestRate)}% p.a. · {loan.term} months
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-xs">
                    {product?.interestModel === "RULE_78"
                      ? "Rule 78"
                      : (product?.interestModel ?? "—").replace(/_/g, " ")}
                  </Badge>
                </div>
                {product?.loanScheduleType === "JADUAL_K" && loan.collateralType && (
                  <div className="border-t pt-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Collateral</p>
                    <p className="text-sm font-medium">{loan.collateralType}</p>
                    {loan.collateralValue != null && (
                      <p className="text-sm text-muted-foreground">
                        Value: {formatRm(loan.collateralValue)}
                      </p>
                    )}
                  </div>
                )}
                {loan.disbursementDate && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground">Disbursed</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatDateShort(loan.disbursementDate)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {hasLoanDocuments && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Loan documents
                </CardTitle>
                <CardDescription>Files shared by your lender (view or download).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {loan.agreementPath ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                    <div className="min-w-0">
                      <p className="font-medium">Signed loan agreement</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {loan.agreementOriginalName ?? "Agreement on file"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={borrowerLoanViewSignedAgreementUrl(loanId)} target="_blank" rel="noopener noreferrer">
                          View / download
                        </a>
                      </Button>
                      {loan.borrowerSignedAgreementPath && loan.loanChannel === "ONLINE" && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={borrowerLoanViewBorrowerSignedAgreementUrl(loanId)} target="_blank" rel="noopener noreferrer">
                            Borrower-only copy
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}
                {loan.disbursementProofPath ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                    <span className="font-medium">Proof of disbursement</span>
                    <Button variant="outline" size="sm" asChild>
                      <a href={borrowerDisbursementProofUrl(loanId)} target="_blank" rel="noopener noreferrer">
                        View / download
                      </a>
                    </Button>
                  </div>
                ) : null}
                {loan.stampCertPath ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                    <span className="font-medium">Stamp certificate</span>
                    <Button variant="outline" size="sm" asChild>
                      <a href={borrowerStampCertificateUrl(loanId)} target="_blank" rel="noopener noreferrer">
                        View / download
                      </a>
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Repayment schedule — admin-style columns */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Repayment schedule
              </CardTitle>
              <CardDescription>
                {summary ? (
                  <>
                    Outstanding (schedule): {formatRm(summary.totalOutstanding ?? 0)} · Paid:{" "}
                    {formatRm(summary.totalPaid ?? 0)}
                    {summary.overdueCount != null && summary.overdueCount > 0 ? (
                      <span className="text-destructive"> · Overdue rows: {summary.overdueCount}</span>
                    ) : null}
                  </>
                ) : (
                  "Installments and payment status for this loan."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : repayments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION"
                    ? "Your expected instalment timeline will show here once the repayment schedule is available on your loan. If it is still empty after your loan is approved, contact your lender."
                    : "No repayment schedule yet."}
                </p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Due date</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Interest</TableHead>
                        <TableHead className="text-right">Total due</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Late fees</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[52px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repayments.map((r, i) => {
                        const principalDue = toAmountNumber(r.principal ?? 0);
                        const interestDue = toAmountNumber(r.interest ?? 0);
                        const totalDue = toAmountNumber(r.totalDue);
                        const paid = (r.allocations ?? []).reduce(
                          (s, a) => s + toAmountNumber(a.amount),
                          0
                        );
                        const lateAccrued = toAmountNumber(r.lateFeeAccrued ?? 0);
                        const latePaid = toAmountNumber(r.lateFeesPaid ?? 0);
                        const isCancelled = r.status === "CANCELLED";
                        const isOverdue =
                          new Date(r.dueDate) < new Date() &&
                          r.status !== "PAID" &&
                          !isCancelled;
                        const balance = isCancelled
                          ? 0
                          : Math.max(0, totalDue - paid);
                        const st = r.status.replace(/_/g, " ");
                        const transactionGroups = Array.from(
                          (r.allocations ?? []).reduce((map, allocation, allocationIndex) => {
                            const tx = allocation.transaction;
                            if (!tx) return map;

                            const existing = map.get(tx.id);
                            const amount = toAmountNumber(allocation.amount);
                            if (existing) {
                              existing.amount += amount;
                              existing.count += 1;
                              return map;
                            }

                            map.set(tx.id, {
                              id: tx.id,
                              amount,
                              count: 1,
                              receiptPath: tx.receiptPath ?? null,
                              proofPath: tx.proofPath ?? null,
                              sortKey: allocation.allocatedAt ?? `${allocationIndex}`,
                            });
                            return map;
                          }, new Map<string, {
                            id: string;
                            amount: number;
                            count: number;
                            receiptPath: string | null;
                            proofPath: string | null;
                            sortKey: string;
                          }>())
                          .values()
                        ).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
                        const hasReceipt = transactionGroups.some((tx) => Boolean(tx.receiptPath));
                        const hasProof = transactionGroups.some((tx) => Boolean(tx.proofPath));
                        return (
                          <TableRow
                            key={r.id}
                            className={cn(
                              isCancelled && "opacity-50",
                              isOverdue && "bg-destructive/5"
                            )}
                          >
                            <TableCell className="font-medium">{i + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {formatDue(r.dueDate)}
                                {isOverdue ? (
                                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatRm(principalDue)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatRm(interestDue)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatRm(totalDue)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatRm(balance)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {lateAccrued > 0 ? (
                                <span className="text-destructive font-medium">
                                  {formatRm(lateAccrued)}
                                  {latePaid > 0 ? (
                                    <span className="text-xs text-muted-foreground block">
                                      {formatRm(latePaid)} paid
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div>
                                <div className="flex items-center justify-end gap-1">
                                  <span className={paid > 0 ? "text-success tabular-nums" : "tabular-nums"}>
                                    {formatRm(paid)}
                                  </span>
                                  {transactionGroups.length > 0 ? (
                                    <>
                                      <span title={hasReceipt ? "Has payment receipt" : "Receipt not yet generated"}>
                                        <Receipt className={cn("h-3.5 w-3.5", hasReceipt ? "text-success" : "text-amber-500")} />
                                      </span>
                                      <span title={hasProof ? "Has proof of payment" : "Proof of payment not yet uploaded"}>
                                        <FileCheck className={cn("h-3.5 w-3.5", hasProof ? "text-success" : "text-amber-500")} />
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={repaymentStatusBadgeVariant(r.status)}
                                className="shrink-0 capitalize"
                              >
                                {isOverdue && r.status !== "PAID" ? "OVERDUE" : st}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {transactionGroups.length > 0 ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-72">
                                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                      {transactionGroups.length} Payment
                                      {transactionGroups.length > 1 ? "s" : ""} Recorded
                                    </div>
                                    <DropdownMenuSeparator />
                                    {transactionGroups.map((tx, transactionIndex) => {
                                      const hasTransactionReceipt = Boolean(tx.receiptPath);
                                      const hasTransactionProof = Boolean(tx.proofPath);
                                      return (
                                        <div key={tx.id}>
                                          {transactionIndex > 0 ? <DropdownMenuSeparator /> : null}
                                          <div className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
                                            Payment {transactionIndex + 1}: {formatRm(tx.amount)}
                                            {tx.count > 1 ? ` • ${tx.count} allocations` : ""}
                                          </div>
                                          {hasTransactionReceipt ? (
                                            <DropdownMenuItem asChild>
                                              <a
                                                href={borrowerTransactionReceiptUrl(tx.id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                              >
                                                <Receipt className="mr-2 h-4 w-4" />
                                                View Receipt
                                              </a>
                                            </DropdownMenuItem>
                                          ) : null}
                                          {hasTransactionProof ? (
                                            <DropdownMenuItem asChild>
                                              <a
                                                href={borrowerTransactionProofUrl(tx.id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                              >
                                                <Download className="mr-2 h-4 w-4" />
                                                View Proof of Payment
                                              </a>
                                            </DropdownMenuItem>
                                          ) : null}
                                          {!hasTransactionReceipt && !hasTransactionProof ? (
                                            <DropdownMenuItem disabled>No documents yet</DropdownMenuItem>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Info — matches admin_pro right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Loan ID</span>
                <span className="font-mono text-xs truncate max-w-[55%] text-right" title={loanId}>
                  {loanId.slice(0, 12)}…
                </span>
              </div>
              <div className="flex justify-between gap-2 items-start">
                <span className="text-muted-foreground shrink-0">Status</span>
                <span className="text-right font-medium">{loanStatusBadgeLabelFromDb(loan)}</span>
              </div>
              {loan.createdAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDateShort(loan.createdAt)}</span>
                </div>
              )}
              {loan.updatedAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Last updated</span>
                  <span>{formatDateShort(loan.updatedAt)}</span>
                </div>
              )}
              {loan.disbursementDate && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Disbursed</span>
                  <span>{formatDateShort(loan.disbursementDate)}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 items-start">
                <span className="text-muted-foreground shrink-0">Product</span>
                <span className="text-right font-medium">{product?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Schedule</span>
                <span>{product?.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Arrears period</span>
                <span>{product?.arrearsPeriod ?? "—"} days</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Default period</span>
                <span>{product?.defaultPeriod ?? "—"} days</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Late payment rate</span>
                <span>{toAmountNumber(product?.latePaymentRate)}% p.a.</span>
              </div>
              {product?.earlySettlementEnabled && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Lock-in period</span>
                    <span>
                      {product.earlySettlementLockInMonths && product.earlySettlementLockInMonths > 0
                        ? `${product.earlySettlementLockInMonths} months`
                        : "None"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Settlement discount</span>
                    <span>
                      {product.earlySettlementDiscountType === "PERCENTAGE"
                        ? `${toAmountNumber(product.earlySettlementDiscountValue)}%`
                        : formatRm(product.earlySettlementDiscountValue)}
                    </span>
                  </div>
                </>
              )}
              {applicationId && (
                <div className="flex justify-between gap-2 items-center pt-1 border-t border-border">
                  <span className="text-muted-foreground">Application</span>
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link href={`/applications/${applicationId}`} className="inline-flex items-center gap-1">
                      View
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setTimelineExpanded((current) => !current)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    Activity Timeline
                  </CardTitle>
                  <CardDescription>History of changes and events</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTimelineExpanded((current) => !current);
                  }}
                >
                  {timelineExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {timelineExpanded && (
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No activity recorded yet</p>
                ) : (
                  <div className="space-y-0">
                    {timeline.map((event) => (
                      <BorrowerTimelineItem key={event.id} event={event} />
                    ))}
                    {hasMoreTimeline ? (
                      <div className="pt-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void loadMoreTimeline()}
                          disabled={loadingMoreTimeline}
                        >
                          {loadingMoreTimeline ? "Loading..." : "Load More"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
