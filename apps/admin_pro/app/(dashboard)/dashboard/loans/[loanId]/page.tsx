"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  X,
  User,
  Users,
  CreditCard,
  Clock,
  Plus,
  Pencil,
  FileText,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Building2,
  TrendingUp,
  Shield,
  ShieldCheck,
  Fingerprint,
  ChartPie,
  XCircle,
  RefreshCw,
  Download,
  Receipt,
  MoreHorizontal,
  FileCheck,
  Copy,
  Eye,
  Mail,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyField } from "@/components/ui/copy-field";
import { VerificationBadge } from "@/components/verification-badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { PhoneDisplay } from "@/components/ui/phone-display";
import {
  useTenantPermissions,
} from "@/components/tenant-context";
import { api } from "@/lib/api";
import { formatLoanStatusLabelForDisplay } from "@/lib/loan-status-label";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  toSafeNumber,
  safeMultiply,
  safeDivide,
  safeAdd,
  safeSubtract,
  safeRound,
  safePercentage,
  formatSmartDateTime,
  formatDateForInput,
} from "@/lib/utils";
import { TrueSendEmailLog } from "@/components/truesend-email-log";
import { TrueSendBadge } from "@/components/truesend-badge";
import { InternalStaffNotesPanel } from "@/components/internal-staff-notes-panel";
import InternalSigningCard from "@/components/internal-signing-card";
import { AccessDeniedCard } from "@/components/role-gate";
import { getLoanSignatures, type InternalSignature } from "@/lib/admin-signing-client";
import { useSession } from "@/lib/auth-client";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";

// ============================================
// Types
// ============================================

interface PaymentReceipt {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: string;
}

interface PaymentAllocation {
  id: string;
  amount: string;
  allocatedAt: string;
  reference: string | null;
  notes: string | null;
  lateFee: string | null;
  isEarlyPayment: boolean;
  receipt: PaymentReceipt | null;
}

interface LoanRepayment {
  id: string;
  dueDate: string;
  principal: string;
  interest: string;
  totalDue: string;
  status: string;
  lateFeeAccrued: string;
  lateFeesPaid: string;
  allocations: PaymentAllocation[];
}

interface LoanScheduleVersion {
  id: string;
  version: number;
  interestModel: string;
  createdAt: string;
  repayments: LoanRepayment[];
}

interface Loan {
  id: string;
  principalAmount: string;
  interestRate: string;
  term: number;
  status: string;
  loanChannel?: "ONLINE" | "PHYSICAL";
  disbursementDate: string | null;
  disbursementReference: string | null;
  disbursementProofPath: string | null;
  disbursementProofName: string | null;
  completedAt: string | null;
  dischargeNotes: string | null;
  dischargeLetterPath: string | null;
  totalLateFees: string;
  repaymentRate: string | null;
  // Early settlement fields
  earlySettlementDate: string | null;
  earlySettlementAmount: string | null;
  earlySettlementDiscount: string | null;
  earlySettlementNotes: string | null;
  earlySettlementWaiveLateFees: boolean;
  readyForDefault: boolean;
  defaultReadyDate: string | null;
  arrearsStartDate: string | null;
  arrearsLetterPath: string | null;
  defaultLetterPath: string | null;
  createdAt: string;
  // Agreement fields
  agreementDate: string | null;
  agreementPath: string | null;
  agreementOriginalName: string | null;
  agreementVersion: number;
  agreementUploadedAt: string | null;
  borrowerSignedAgreementPath?: string | null;
  signedAgreementReviewStatus?: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  signedAgreementReviewedAt?: string | null;
  signedAgreementReviewNotes?: string | null;
  attestationCompletedAt?: string | null;
  attestationStatus?: string;
  attestationMeetingLink?: string | null;
  // Stamp certificate fields
  stampCertPath: string | null;
  stampCertOriginalName: string | null;
  stampCertVersion: number;
  stampCertUploadedAt: string | null;
  // Collateral fields (Jadual K)
  collateralType: string | null;
  collateralValue: string | null;
  borrower: {
    id: string;
    name: string;
    borrowerType: string;
    icNumber: string;
    documentType: string;
    phone: string | null;
    email: string | null;
    companyName: string | null;
    documentVerified: boolean;
    verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
    bankName: string | null;
    bankNameOther: string | null;
    bankAccountNo: string | null;
  };
  product: {
    id: string;
    name: string;
    interestModel: string;
    latePaymentRate: string;
    arrearsPeriod: number;
    defaultPeriod: number;
    loanScheduleType: string;
    legalFeeType: string;
    legalFeeValue: string;
    stampingFeeType: string;
    stampingFeeValue: string;
    earlySettlementEnabled: boolean;
    earlySettlementLockInMonths: number;
    earlySettlementDiscountType: string;
    earlySettlementDiscountValue: string;
  };
  application: {
    id: string;
    status: string;
  };
  guarantors: Array<{
    id: string;
    borrowerId: string;
    order: number;
    name: string;
    borrowerType: string;
    companyName: string | null;
    documentType: string;
    icNumber: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    agreementGeneratedAt: string | null;
    agreementPath: string | null;
    agreementOriginalName: string | null;
    agreementVersion: number;
    agreementUploadedAt: string | null;
    borrower?: {
      documentVerified: boolean;
      verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
    } | null;
  }>;
  scheduleVersions: LoanScheduleVersion[];
}

interface SchedulePreview {
  loanId: string;
  principal: string;
  interestRate: string;
  term: number;
  interestModel: string;
  disbursementDate: string;
  repayments: Array<{
    dueDate: string;
    principal: number;
    interest: number;
    totalDue: number;
    balance: number;
  }>;
  totalInterest: number;
  totalPayable: number;
}

interface LoanMetrics {
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  totalLateFees: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  totalRepayments: number;
  repaymentRate: number;
  paidOnTime: number;
  paidLate: number;
  oldestOverdueDays: number;
  arrearsPeriod: number;
  defaultPeriod: number;
  isInArrears: boolean;
  isDefaulted: boolean;
  progressPercent: number;
  earlySettlement?: {
    isEarlySettled: boolean;
    settlementAmount: number | null;
    discountAmount: number | null;
  } | null;
}

interface InternalScheduleRepayment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principal: number;
  interest: number;
  totalDue: number;
  paidAmount: number;
  remainingAmount: number;
  status: "PENDING" | "PARTIAL" | "PAID";
}

interface InternalScheduleView {
  interestModel: string;
  interestRate: number;
  term: number;
  baseDate: string;
  totalInterest: number;
  totalPayable: number;
  totalPaid: number;
  totalRemaining: number;
  repayments: InternalScheduleRepayment[];
}

interface InternalScheduleResponse {
  enabled: boolean;
  schedule?: InternalScheduleView;
}

interface TimelineEvent {
  id: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

// ============================================
// Helpers
// ============================================

/** Extract generation date from a letter path filename (e.g. ARR-20260209-143025-abc.pdf or ARR-20260209-abc.pdf) */
function parseLetterDate(letterPath: string): Date | null {
  const filename = letterPath.split("/").pop() || "";
  // New format: PREFIX-YYYYMMDD-HHmmss-id.pdf
  const match = filename.match(/^\w+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`);
  }
  // Legacy format: PREFIX-YYYYMMDD-id.pdf
  const legacy = filename.match(/^\w+-(\d{4})(\d{2})(\d{2})-/);
  if (legacy) {
    const [, y, m, d] = legacy;
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  return null;
}

// ============================================
// Status Colors
// ============================================

const loanStatusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING_ATTESTATION: "warning",
  PENDING_DISBURSEMENT: "warning",
  ACTIVE: "info",
  IN_ARREARS: "warning",
  COMPLETED: "success",
  DEFAULTED: "destructive",
  WRITTEN_OFF: "destructive",
};

/** Matches `loanStatusDisplay` on loans list (`/dashboard/loans`). */
function loanDetailStatusDisplay(loan: {
  status: string;
  attestationCompletedAt?: string | null;
  loanChannel?: "ONLINE" | "PHYSICAL";
}): { label: string; variant: "default" | "success" | "warning" | "destructive" | "info" } {
  const label = formatLoanStatusLabelForDisplay(loan);
  const variant =
    loan.status === "PENDING_ATTESTATION" ||
    (loan.status === "PENDING_DISBURSEMENT" &&
      loan.loanChannel === "ONLINE" &&
      !loan.attestationCompletedAt)
      ? "warning"
      : loanStatusColors[loan.status] || "default";
  return { label, variant };
}

const repaymentStatusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "secondary" as "default",
  PARTIAL: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  CANCELLED: "secondary" as "default",
};

// ============================================
// Progress Donut (for Progress card)
// ============================================

function ProgressDonut({
  percent,
  size = 80,
  strokeWidth = 8,
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

  // Color follows status: green for completed, red for defaulted/written-off, amber for in-arrears, black otherwise
  let strokeColor = "stroke-foreground";
  if (status === "COMPLETED") {
    strokeColor = "stroke-emerald-500";
  } else if (status === "DEFAULTED" || status === "WRITTEN_OFF") {
    strokeColor = "stroke-red-500";
  } else if (status === "IN_ARREARS") {
    strokeColor = "stroke-amber-500";
  }

  return (
    <div className={cn("relative inline-flex items-center justify-center", size <= 56 ? "" : "mt-2", className)}>
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

// ============================================
// Timeline Component
// ============================================

function timelineActorLabel(event: TimelineEvent, borrowerDisplayName: string | null): string | null {
  if (event.user) {
    return event.user.name || event.user.email;
  }
  if (
    event.action === "BORROWER_MANUAL_PAYMENT_APPROVED" ||
    event.action === "BORROWER_MANUAL_PAYMENT_REJECTED"
  ) {
    return "Admin";
  }
  if (event.action.startsWith("BORROWER_")) {
    return borrowerDisplayName;
  }
  if (event.action.startsWith("ADMIN_")) {
    return "Admin";
  }
  return null;
}

function TimelineItem({
  event,
  borrowerDisplayName,
}: {
  event: TimelineEvent;
  borrowerDisplayName: string | null;
}) {
  const getActionInfo = (action: string, ev?: TimelineEvent) => {
    const isReplacement = ev?.previousData != null;
    switch (action) {
      case "DISBURSE":
        return { icon: Banknote, label: "Disbursed" };
      case "RECORD_PAYMENT":
        return { icon: CreditCard, label: "Payment Recorded" };
      case "UPLOAD_PROOF_OF_PAYMENT":
        return { icon: Upload, label: "Proof of Payment Uploaded" };
      case "DELETE_PROOF_OF_PAYMENT":
        return { icon: Trash2, label: "Proof of Payment Deleted" };
      case "UPLOAD_RECEIPT":
        return { icon: Upload, label: "Proof of Payment Uploaded" };
      case "DELETE_RECEIPT":
        return { icon: Trash2, label: "Proof of Payment Deleted" };
      case "STATUS_UPDATE":
        return { icon: RefreshCw, label: "Status Updated" };
      case "COMPLETE":
        return { icon: CheckCircle, label: "Completed" };
      case "MARK_DEFAULT":
        return { icon: XCircle, label: "Marked Default" };
      case "UPLOAD_DISBURSEMENT_PROOF":
        return { icon: Upload, label: isReplacement ? "Disbursement Proof Replaced" : "Disbursement Proof Uploaded" };
      case "UPLOAD_AGREEMENT":
        return { icon: FileText, label: isReplacement ? "Agreement Replaced" : "Agreement Uploaded" };
      case "UPLOAD_STAMP_CERTIFICATE":
        return { icon: Shield, label: isReplacement ? "Stamp Certificate Replaced" : "Stamp Certificate Uploaded" };
      case "GENERATE_GUARANTOR_AGREEMENT":
        return { icon: FileText, label: "Guarantor Agreement Generated" };
      case "UPLOAD_GUARANTOR_AGREEMENT":
        return { icon: Upload, label: isReplacement ? "Guarantor Agreement Replaced" : "Guarantor Agreement Uploaded" };
      case "CREATE":
        return { icon: Plus, label: "Loan Created" };
      case "LATE_FEE_ACCRUAL":
        return { icon: AlertTriangle, label: "Late Fees Charged" };
      case "DEFAULT_READY":
        return { icon: AlertTriangle, label: "Default Ready" };
      case "LATE_FEE_PROCESSING":
        return { icon: RefreshCw, label: "Late Fee Processing" };
      case "GENERATE_ARREARS_LETTER":
        return { icon: FileText, label: "Arrears Letter Generated" };
      case "GENERATE_DEFAULT_LETTER":
        return { icon: FileText, label: "Default Letter Generated" };
      case "GENERATE_DISCHARGE_LETTER":
        return { icon: FileText, label: "Discharge Letter Generated" };
      case "EARLY_SETTLEMENT":
        return { icon: Banknote, label: "Early Settlement" };
      case "EXPORT":
        return { icon: Download, label: "Document Exported" };
      case "BORROWER_MANUAL_PAYMENT_REQUEST_CREATED":
        return { icon: CreditCard, label: "Manual Payment Requested" };
      case "BORROWER_MANUAL_PAYMENT_APPROVED":
        return { icon: CheckCircle, label: "Manual Payment Approved" };
      case "BORROWER_MANUAL_PAYMENT_REJECTED":
        return { icon: XCircle, label: "Manual Payment Rejected" };
      case "BORROWER_ATTESTATION_SLOT_PROPOSED":
        return { icon: Calendar, label: "Attestation Slot Proposed" };
      case "ADMIN_ATTESTATION_PROPOSAL_ACCEPTED":
        return { icon: Calendar, label: "Attestation Slot Accepted" };
      case "BORROWER_ATTESTATION_COMPLETE":
        return { icon: CheckCircle, label: "Attestation Completed" };
      case "BORROWER_DIGITAL_SIGN_AGREEMENT":
        return { icon: ShieldCheck, label: "Borrower Digitally Signed" };
      case "SIGNED_AGREEMENT_EMAILED":
        return { icon: Mail, label: "Signed Agreement Emailed" };
      case "SIGNED_AGREEMENT_EMAIL_FAILED":
        return { icon: Mail, label: "Agreement Email Failed" };
      case "INTERNAL_SIGN_COMPANY_REP":
        return { icon: ShieldCheck, label: "Company Rep Signed" };
      case "INTERNAL_SIGN_WITNESS":
        return { icon: ShieldCheck, label: "Witness Signed" };
      default:
        return { icon: Clock, label: action };
    }
  };

  const actionInfo = getActionInfo(event.action, event);
  const Icon = actionInfo.icon;
  const actorLabel = timelineActorLabel(event, borrowerDisplayName);

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-foreground">{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        {actorLabel ? <p className="text-sm text-muted-foreground mb-2">by {actorLabel}</p> : null}
        {event.newData && event.action === "BORROWER_MANUAL_PAYMENT_REQUEST_CREATED" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Amount:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(toSafeNumber(data.amount as number))}
                </span>
                {data.reference ? (
                  <span className="ml-2 text-foreground">Ref: {String(data.reference)}</span>
                ) : null}
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "BORROWER_MANUAL_PAYMENT_APPROVED" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Amount:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(toSafeNumber(data.amount as number))}
                </span>
                {data.reference ? (
                  <span className="ml-2 text-foreground">Ref: {String(data.reference)}</span>
                ) : null}
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "BORROWER_MANUAL_PAYMENT_REJECTED" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                Amount:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(toSafeNumber(data.amount as number))}
                </span>
                {data.reference ? (
                  <span className="ml-2 text-foreground">Ref: {String(data.reference)}</span>
                ) : null}
              </p>
              {data.reason ? (
                <p className="text-xs text-muted-foreground">
                  Reason: <span className="text-foreground">{String(data.reason)}</span>
                </p>
              ) : null}
            </div>
          );
        })()}
        {event.newData && event.action === "RECORD_PAYMENT" && (() => {
          const data = event.newData as Record<string, unknown>;
          const amount = data.totalAmount ?? data.amount;
          const lateFee = data.totalLateFeesPaid ?? data.totalLateFees ?? data.lateFee;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Amount: <span className="font-medium text-foreground">
                  {formatCurrency(toSafeNumber(amount as number))}
                </span>
                {lateFee && toSafeNumber(lateFee as number) > 0 ? (
                  <span className="ml-2 text-foreground">
                    + {formatCurrency(toSafeNumber(lateFee as number))} late fee paid
                  </span>
                ) : null}
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "LATE_FEE_ACCRUAL" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Fee charged: <span className="font-medium text-foreground">
                  {formatCurrency(toSafeNumber(data.totalFeeCharged as number))}
                </span>
                <span className="ml-2">({data.repaymentsAffected as number} repayment{(data.repaymentsAffected as number) !== 1 ? "s" : ""})</span>
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "STATUS_UPDATE" && (() => {
          const data = event.newData as Record<string, unknown>;
          const prev = event.previousData as Record<string, unknown> | null;
          const fromStatus = prev?.status as string | undefined;
          const toStatus = data.status as string | undefined;
          const reason = data.reason as string | undefined;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                {fromStatus && toStatus ? (
                  <>
                    <span className="font-medium text-foreground">{fromStatus.replace(/_/g, " ")}</span>
                    {" → "}
                    <span className="font-medium text-foreground">{toStatus.replace(/_/g, " ")}</span>
                  </>
                ) : (
                  <span className="font-medium text-foreground">{toStatus?.replace(/_/g, " ")}</span>
                )}
              </p>
              {reason && (
                <p className="text-xs text-muted-foreground mt-1">{reason}</p>
              )}
            </div>
          );
        })()}
        {event.newData && event.action === "EARLY_SETTLEMENT" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-foreground">Early Settlement</p>
              <p className="text-xs text-muted-foreground">
                Amount: <span className="font-medium text-foreground">{formatCurrency(toSafeNumber(data.settlementAmount as number))}</span>
                <span className="mx-1.5">|</span>
                Discount: <span className="font-medium text-foreground">{formatCurrency(toSafeNumber(data.discountAmount as number))}</span>
              </p>
              {(data.waiveLateFees as boolean) && (
                <p className="text-xs text-muted-foreground">Late fees waived</p>
              )}
              <p className="text-xs text-muted-foreground">
                Receipt: <span className="font-medium text-foreground">{data.receiptNumber as string}</span>
                <span className="mx-1.5">|</span>
                {data.cancelledRepayments as number} installment{(data.cancelledRepayments as number) !== 1 ? "s" : ""} cancelled
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "DEFAULT_READY" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Days overdue: <span className="font-medium text-foreground">{data.daysOverdue as number}</span>
                <span className="ml-2">(default period: {data.defaultPeriod as number} days)</span>
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "EXPORT" && (() => {
          const data = event.newData as Record<string, unknown>;
          const docType = data.documentType as string | undefined;
          const docLabels: Record<string, string> = {
            LAMPIRAN_A: "Lampiran A (Lejar Akaun Peminjam)",
            KPKT: "KPKT Portal CSV",
          };
          const label = docType ? (docLabels[docType] || docType.replace(/_/g, " ")) : "Document";
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                <Download className="inline h-3 w-3 mr-1 -mt-0.5" />
                {label}
              </p>
              {typeof data.borrowerName === "string" && data.borrowerName && (
                <p className="text-xs text-muted-foreground mt-1">
                  Borrower: <span className="font-medium text-foreground">{data.borrowerName}</span>
                  {typeof data.borrowerIc === "string" && data.borrowerIc && (
                    <span className="ml-1.5 text-muted-foreground">({data.borrowerIc})</span>
                  )}
                </p>
              )}
            </div>
          );
        })()}
        {event.newData && event.action === "GENERATE_GUARANTOR_AGREEMENT" && (() => {
          const data = event.newData as Record<string, unknown>;
          const guarantorName = data.guarantorName as string | undefined;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Generated for{" "}
                <span className="font-medium text-foreground">{guarantorName || "Guarantor"}</span>
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "UPLOAD_GUARANTOR_AGREEMENT" && (() => {
          const data = event.newData as Record<string, unknown>;
          const guarantorName = data.guarantorName as string | undefined;
          const version = data.version as number | undefined;
          const filename = data.filename as string | undefined;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                Guarantor: <span className="font-medium text-foreground">{guarantorName || "Guarantor"}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                File: <span className="font-medium text-foreground">{filename || "-"}</span>
                {typeof version === "number" && (
                  <>
                    <span className="mx-1.5">|</span>
                    Version <span className="font-medium text-foreground">v{version}</span>
                  </>
                )}
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "BORROWER_DIGITAL_SIGN_AGREEMENT" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                Signer: <span className="font-medium text-foreground">{(data.signerName as string) || "-"}</span>
                {data.signerIc ? (
                  <span className="ml-1.5 text-muted-foreground">({data.signerIc as string})</span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Version <span className="font-medium text-foreground">v{data.version as number}</span>
                {data.agreementDate ? (
                  <>
                    <span className="mx-1.5">|</span>
                    Date: <span className="font-medium text-foreground">{formatDate(data.agreementDate as string)}</span>
                  </>
                ) : null}
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "SIGNED_AGREEMENT_EMAILED" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-secondary border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground truncate">
                Sent to <span className="font-medium text-foreground">{(data.recipientName as string) || (data.recipientEmail as string) || "-"}</span>
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "SIGNED_AGREEMENT_EMAIL_FAILED" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-xs text-destructive truncate">
                Failed to email to {(data.recipientEmail as string) || "-"}
              </p>
            </div>
          );
        })()}
        {event.newData && (event.action === "INTERNAL_SIGN_COMPANY_REP" || event.action === "INTERNAL_SIGN_WITNESS") && (() => {
          const data = event.newData as Record<string, unknown>;
          const roleLabel = (data.role as string) === "COMPANY_REP" ? "Company Rep" : "Witness";
          return (
            <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                {roleLabel}: <span className="font-medium text-foreground">{(data.signerName as string) || "-"}</span>
                {data.signerIc ? (
                  <span className="ml-1.5 text-muted-foreground">({data.signerIc as string})</span>
                ) : null}
              </p>
              {typeof data.agreementVersion === "number" && (
                <p className="text-xs text-muted-foreground">
                  Version <span className="font-medium text-foreground">v{data.agreementVersion as number}</span>
                </p>
              )}
            </div>
          );
        })()}
        <p className="text-xs text-muted-foreground mt-2">
          {formatDate(event.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const loanId = params.loanId as string;
  const permissions = useTenantPermissions();
  const canDisburseLoans = hasPermission(permissions, "loans.disburse");
  const canManageLoanLifecycle = hasPermission(permissions, "loans.manage");
  const canManageCollections = hasAnyPermission(permissions, "loans.manage", "collections.manage");
  const canApprovePayments = hasAnyPermission(permissions, "payments.approve", "loans.manage");
  const canApproveSettlement = hasPermission(permissions, "settlements.approve");
  const canViewAgreements = hasPermission(permissions, "agreements.view");
  const canManageAgreementDocs = hasPermission(permissions, "agreements.manage");
  const canApproveSignedAgreement = hasAnyPermission(
    permissions,
    "loans.disburse",
    "applications.approve_l2"
  );
  const canManageInternalSigning = hasAnyPermission(
    permissions,
    "signing_certificates.manage",
    "attestation.witness_sign"
  );
  const canExportCompliance = hasPermission(permissions, "compliance.export");
  const canViewInternalSchedule = hasAnyPermission(
    permissions,
    "applications.approve_l1",
    "applications.approve_l2",
    "loans.manage",
    "loans.disburse"
  );

  // State
  const [loan, setLoan] = useState<Loan | null>(null);
  const [metrics, setMetrics] = useState<LoanMetrics | null>(null);
  const [internalSchedule, setInternalSchedule] = useState<InternalScheduleView | null>(null);
  const [scheduleView, setScheduleView] = useState<"standard" | "internal">("standard");
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialog states
  const [showDisburseDialog, setShowDisburseDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDefaultDialog, setShowDefaultDialog] = useState(false);
  const [showEarlySettlementDialog, setShowEarlySettlementDialog] = useState(false);

  // Payment dialog state
  const [paymentAmount, setPaymentAmount] = useState<number | "" | string>("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [applyLateFee, setApplyLateFee] = useState(true);

  // Complete dialog state
  const [dischargeNotes, setDischargeNotes] = useState("");

  // Early settlement state
  interface EarlySettlementQuote {
    eligible: boolean;
    reason?: string;
    remainingPrincipal?: number;
    remainingInterest?: number;
    remainingFutureInterest?: number;
    discountType?: string;
    discountValue?: number;
    discountAmount?: number;
    outstandingLateFees?: number;
    totalWithoutLateFees?: number;
    totalSettlement?: number;
    totalSavings?: number;
    lockInEndDate?: string | null;
    unpaidInstallments?: number;
  }
  const [settlementQuote, setSettlementQuote] = useState<EarlySettlementQuote | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementReference, setSettlementReference] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [settlementPaymentDate, setSettlementPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [settlementWaiveLateFees, setSettlementWaiveLateFees] = useState(false);
  const [settlementProofFile, setSettlementProofFile] = useState<File | null>(null);

  // Default dialog state
  const [defaultReason, setDefaultReason] = useState("");

  // Upload proof of payment dialog state
  const [showUploadProofDialog, setShowUploadProofDialog] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Disbursement state
  const [disbursementDate, setDisbursementDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [disbursementReference, setDisbursementReference] = useState("");
  const [disbursementProofFile, setDisbursementProofFile] = useState<File | null>(null);

  // Upload disbursement proof dialog state (for uploading after disbursement)
  const [showUploadDisbursementProofDialog, setShowUploadDisbursementProofDialog] = useState(false);
  const [disbursementProofUploadFile, setDisbursementProofUploadFile] = useState<File | null>(null);
  const [uploadingDisbursementProof, setUploadingDisbursementProof] = useState(false);

  // Loan agreement dialog state
  const [showUploadAgreementDialog, setShowUploadAgreementDialog] = useState(false);
  const [agreementFile, setAgreementFile] = useState<File | null>(null);
  const [uploadingAgreement, setUploadingAgreement] = useState(false);
  
  // Stamp certificate dialog state
  const [showUploadStampCertDialog, setShowUploadStampCertDialog] = useState(false);
  const [stampCertFile, setStampCertFile] = useState<File | null>(null);
  const [uploadingStampCert, setUploadingStampCert] = useState(false);
  const stampCertInputRef = useRef<HTMLInputElement>(null);

  // Generate agreement dialog state
  const [showGenerateAgreementDialog, setShowGenerateAgreementDialog] = useState(false);
  const [agreementDate, setAgreementDate] = useState<string>("");
  const [generatingAgreement, setGeneratingAgreement] = useState(false);
  const [regeneratingAgreement, setRegeneratingAgreement] = useState(false);
  const [generatingGuarantorId, setGeneratingGuarantorId] = useState<string | null>(null);

  const [showRejectSignedAgreementDialog, setShowRejectSignedAgreementDialog] = useState(false);
  const [rejectSignedAgreementNotes, setRejectSignedAgreementNotes] = useState("");
  const [approvingSignedAgreement, setApprovingSignedAgreement] = useState(false);

  // Internal signing state
  const { data: authSession } = useSession();
  const currentUserId = authSession?.user?.id || "";
  const [internalSignatures, setInternalSignatures] = useState<InternalSignature[]>([]);

  // Guarantor agreement dialog state
  const [showUploadGuarantorAgreementDialog, setShowUploadGuarantorAgreementDialog] = useState(false);
  const [selectedGuarantorId, setSelectedGuarantorId] = useState<string | null>(null);
  const [guarantorAgreementFile, setGuarantorAgreementFile] = useState<File | null>(null);
  const [uploadingGuarantorAgreement, setUploadingGuarantorAgreement] = useState(false);

  // Generate letter states
  const [showGenerateArrearsLetterDialog, setShowGenerateArrearsLetterDialog] = useState(false);
  const [showGenerateDefaultLetterDialog, setShowGenerateDefaultLetterDialog] = useState(false);
  const [generatingArrearsLetter, setGeneratingArrearsLetter] = useState(false);
  const [generatingDefaultLetter, setGeneratingDefaultLetter] = useState(false);

  // Lampiran A download state
  const [downloadingLampiranA, setDownloadingLampiranA] = useState(false);

  // TrueSend email log refresh key — increment to trigger re-fetch
  const [emailLogRefreshKey, setEmailLogRefreshKey] = useState(0);
  const refreshEmailLog = useCallback(() => setEmailLogRefreshKey((k) => k + 1), []);

  // ============================================
  // Data Fetching
  // ============================================

  const fetchInternalSchedule = useCallback(async () => {
    if (!canViewInternalSchedule) {
      setInternalSchedule(null);
      setScheduleView("standard");
      return;
    }

    const res = await api.get<InternalScheduleResponse>(`/api/loans/${loanId}/schedule/internal`);
    if (res.success && res.data?.enabled && res.data.schedule) {
      setInternalSchedule(res.data.schedule);
      return;
    }

    setInternalSchedule(null);
    setScheduleView("standard");
  }, [canViewInternalSchedule, loanId]);

  const fetchInternalSignatures = useCallback(async () => {
    try {
      const res = await getLoanSignatures(loanId);
      if (res.success) {
        setInternalSignatures(res.signatures);
      }
    } catch {
      // Non-critical, ignore
    }
  }, [loanId]);

  const fetchLoan = useCallback(async (): Promise<"ok" | "forbidden" | "missing"> => {
    const res = await api.get<Loan>(`/api/loans/${loanId}`);
    if (res.success && res.data) {
      setLoan(res.data);
      setAccessDenied(false);
      if (res.data.loanChannel === "ONLINE" && res.data.agreementPath) {
        fetchInternalSignatures();
      }
      await fetchInternalSchedule();
      return "ok";
    }

    setLoan(null);
    setInternalSchedule(null);
    setScheduleView("standard");
    setAccessDenied(res.status === 403);

    return res.status === 403 ? "forbidden" : "missing";
  }, [fetchInternalSchedule, fetchInternalSignatures, loanId]);

  const fetchMetrics = useCallback(async () => {
    const res = await api.get<LoanMetrics>(`/api/loans/${loanId}/metrics`);
    if (res.success && res.data) {
      setMetrics(res.data);
    }
  }, [loanId]);

  const fetchSchedulePreview = useCallback(async () => {
    const res = await api.get<SchedulePreview>(
      `/api/loans/${loanId}/schedule/preview?disbursementDate=${new Date(disbursementDate).toISOString()}`
    );
    if (res.success && res.data) {
      setSchedulePreview(res.data);
    }
  }, [loanId, disbursementDate]);

  const fetchTimeline = useCallback(async (cursor?: string, append = false) => {
    try {
      if (append) {
        setLoadingMoreTimeline(true);
      }
      const res = await fetch(`/api/proxy/loans/${loanId}/timeline?limit=10${cursor ? `&cursor=${cursor}` : ''}`, {
        credentials: "include",
      });
      const json = await res.json() as { 
        success: boolean; 
        data: TimelineEvent[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      };
      if (json.success && json.data) {
        if (append) {
          setTimeline((prev) => [...prev, ...json.data]);
        } else {
          setTimeline(json.data);
        }
        setHasMoreTimeline(json.pagination?.hasMore ?? false);
        setTimelineCursor(json.pagination?.nextCursor ?? null);
      }
    } catch (error) {
      console.error("Failed to fetch timeline:", error);
    } finally {
      setLoadingMoreTimeline(false);
    }
  }, [loanId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const result = await fetchLoan();
      setLoading(false);
      if (result !== "ok") {
        return;
      }
      refreshEmailLog();
      fetchTimeline();
    };
    loadData();
  }, [fetchLoan, fetchTimeline, refreshEmailLog]);

  // Fetch metrics when loan is loaded and has a schedule (runs in parallel with timeline)
  useEffect(() => {
    if (
      loan &&
      loan.status !== "PENDING_DISBURSEMENT" &&
      loan.status !== "PENDING_ATTESTATION"
    ) {
      fetchMetrics();
    }
  }, [loan, fetchMetrics]);

  // Fetch schedule preview when loan is pending disbursement
  useEffect(() => {
    if (
      loan &&
      (loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION")
    ) {
      fetchSchedulePreview();
    }
  }, [loan, fetchSchedulePreview]);

  // ============================================
  // Handlers
  // ============================================

  const handleDisburse = async () => {
    setActionLoading("disburse");
    
    try {
      let res;
      
      if (disbursementProofFile) {
        // Use FormData for multipart upload
        const formData = new FormData();
        formData.append("file", disbursementProofFile);
        formData.append("disbursementDate", new Date(disbursementDate).toISOString());
        formData.append("reference", disbursementReference);
        
        const response = await fetch(`/api/proxy/loans/${loanId}/disburse`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        res = await response.json();
      } else {
        // Use JSON for no file
        res = await api.post(`/api/loans/${loanId}/disburse`, {
          disbursementDate: new Date(disbursementDate).toISOString(),
          reference: disbursementReference,
        });
      }
      
      if (res.success) {
        toast.success("Loan disbursed successfully");
        if (res.emailSent) toast("TrueSend™ email sent to borrower", { icon: "📨" });
        setShowDisburseDialog(false);
        setDisbursementReference("");
        setDisbursementProofFile(null);
        await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]); refreshEmailLog();
        window.dispatchEvent(new CustomEvent("loans-count-changed"));
      } else {
        toast.error(res.error || "Failed to disburse loan");
      }
    } catch {
      toast.error("Failed to disburse loan");
    }
    
    setActionLoading(null);
  };

  const handleRecordPayment = async () => {
    const amount = paymentAmount === "" ? NaN : Number(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setActionLoading("payment");

    // Record payment at the loan level - backend handles allocation and spillover
    const paymentRes = await api.post(
      `/api/schedules/loan/${loanId}/payments`,
      {
        amount,
        reference: paymentReference || undefined,
        notes: paymentNotes || undefined,
        applyLateFee,
        paymentDate: new Date(paymentDate).toISOString(),
      },
      {
        headers: {
          "idempotency-key": crypto.randomUUID(),
        },
      }
    );

    if (!paymentRes.success) {
      toast.error(paymentRes.error || "Failed to record payment");
      setActionLoading(null);
      return;
    }

    // If there's a file, upload it for each created transaction
    if (paymentFile && paymentRes.data) {
      const data = paymentRes.data as {
        transaction?: { id: string };
        transactions?: Array<{ id: string }>;
      };
      const transactionIds = (data.transactions?.map((tx) => tx.id).filter(Boolean) ?? []).length
        ? data.transactions!.map((tx) => tx.id).filter(Boolean)
        : data.transaction?.id
          ? [data.transaction.id]
          : [];

      if (transactionIds.length > 0) {
        try {
          const uploadResults = await Promise.all(
            transactionIds.map(async (transactionId) => {
              const formData = new FormData();
              formData.append("file", paymentFile);
              const uploadRes = await fetch(`/api/proxy/schedules/transactions/${transactionId}/proof`, {
                method: "POST",
                credentials: "include",
                body: formData,
              });
              return uploadRes.json();
            })
          );
          if (uploadResults.some((uploadJson) => !uploadJson.success)) {
            toast.warning("Payment recorded but failed to upload proof of payment");
          }
        } catch {
          toast.warning("Payment recorded but failed to upload proof of payment");
        }
      }
    }

    // Show allocation breakdown in success message
    const data = paymentRes.data as { allocationBreakdown?: { repaymentId: string; amount: number }[]; defaultCleared?: boolean };
    if (data.defaultCleared) {
      toast.success("Payment recorded — default cleared! Loan is now active again.");
    } else if (data.allocationBreakdown && data.allocationBreakdown.length > 1) {
      toast.success(`Payment recorded and allocated across ${data.allocationBreakdown.length} installments`);
    } else {
      toast.success("Payment recorded successfully");
    }
    if (paymentRes.emailSent) toast("TrueSend™ receipt emailed to borrower", { icon: "📨" });

    setShowPaymentDialog(false);
    resetPaymentDialog();
    await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]); refreshEmailLog();
    setActionLoading(null);
  };

  const handleComplete = async () => {
    setActionLoading("complete");
    const res = await api.post(`/api/loans/${loanId}/complete`, {
      notes: dischargeNotes || undefined,
    });
    if (res.success) {
      toast.success("Loan completed and discharged successfully");
      if (res.emailSent) toast("TrueSend™ discharge letter emailed to borrower", { icon: "📨" });
      setShowCompleteDialog(false);
      setDischargeNotes("");
      await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]); refreshEmailLog();
    } else {
      toast.error(res.error || "Failed to complete loan");
    }
    setActionLoading(null);
  };

  const handleFetchSettlementQuote = async () => {
    setSettlementLoading(true);
    setSettlementQuote(null);
    try {
      const res = await api.get<EarlySettlementQuote>(`/api/loans/${loanId}/early-settlement/quote`);
      if (res.success && res.data) {
        setSettlementQuote(res.data);
      } else {
        toast.error(res.error || "Failed to fetch settlement quote");
      }
    } catch {
      toast.error("Failed to fetch settlement quote");
    }
    setSettlementLoading(false);
  };

  const handleOpenEarlySettlement = () => {
    setSettlementReference("");
    setSettlementNotes("");
    setSettlementPaymentDate(new Date().toISOString().split("T")[0]);
    setSettlementWaiveLateFees(false);
    setSettlementProofFile(null);
    setShowEarlySettlementDialog(true);
    handleFetchSettlementQuote();
  };

  const handleConfirmEarlySettlement = async () => {
    setActionLoading("settlement");
    try {
      const res = await api.post(
        `/api/loans/${loanId}/early-settlement/confirm`,
        {
          paymentDate: settlementPaymentDate ? new Date(settlementPaymentDate).toISOString() : undefined,
          reference: settlementReference || undefined,
          notes: settlementNotes || undefined,
          waiveLateFees: settlementWaiveLateFees,
        },
        {
          headers: {
            "idempotency-key": crypto.randomUUID(),
          },
        }
      );
      if (res.success) {
        // Upload proof of payment if provided
        const responseData = res.data as { transactionId?: string };
        if (settlementProofFile && responseData?.transactionId) {
          try {
            const formData = new FormData();
            formData.append("file", settlementProofFile);
            const uploadRes = await fetch(`/api/proxy/schedules/transactions/${responseData.transactionId}/proof`, {
              method: "POST",
              credentials: "include",
              body: formData,
            });
            const uploadJson = await uploadRes.json();
            if (!uploadJson.success) {
              toast.warning("Settlement completed but failed to upload proof of payment");
            }
          } catch {
            toast.warning("Settlement completed but failed to upload proof of payment");
          }
        }

        toast.success("Early settlement completed successfully. Loan is now discharged.");
        if (res.emailSent) toast("TrueSend™ email sent to borrower", { icon: "📨" });
        setShowEarlySettlementDialog(false);
        await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(res.error || "Failed to process early settlement");
      }
    } catch {
      toast.error("Failed to process early settlement");
    }
    setActionLoading(null);
  };

  const handleMarkDefault = async () => {
    setActionLoading("default");
    const res = await api.post(`/api/loans/${loanId}/mark-default`, {
      reason: defaultReason || undefined,
    });
    if (res.success) {
      toast.success("Loan marked as defaulted");
      if (res.emailSent) toast("TrueSend™ default notice emailed to borrower", { icon: "📨" });
      setShowDefaultDialog(false);
      setDefaultReason("");
      await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]); refreshEmailLog();
    } else {
      toast.error(res.error || "Failed to mark loan as defaulted");
    }
    setActionLoading(null);
  };

  const handleRefreshPage = async () => {
    await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]);
    refreshEmailLog();
  };

  const handleGenerateArrearsLetter = async () => {
    setGeneratingArrearsLetter(true);
    try {
      const res = await api.post(`/api/loans/${loanId}/generate-arrears-letter`, {});
      if (res.success) {
        toast.success("Arrears letter generated successfully");
        if (res.emailSent) toast("TrueSend™ arrears notice emailed to borrower", { icon: "📨" });
        setShowGenerateArrearsLetterDialog(false);
        await Promise.all([fetchLoan(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(res.error || "Failed to generate arrears letter");
      }
    } catch {
      toast.error("Failed to generate arrears letter");
    }
    setGeneratingArrearsLetter(false);
  };

  const handleGenerateDefaultLetter = async () => {
    setGeneratingDefaultLetter(true);
    try {
      const res = await api.post(`/api/loans/${loanId}/generate-default-letter`, {});
      if (res.success) {
        toast.success("Default letter generated successfully");
        if (res.emailSent) toast("TrueSend™ default notice emailed to borrower", { icon: "📨" });
        setShowGenerateDefaultLetterDialog(false);
        await Promise.all([fetchLoan(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(res.error || "Failed to generate default letter");
      }
    } catch {
      toast.error("Failed to generate default letter");
    }
    setGeneratingDefaultLetter(false);
  };

  // Handle Lampiran A PDF download
  const handleDownloadLampiranA = async () => {
    setDownloadingLampiranA(true);
    try {
      const response = await fetch(`/api/proxy/compliance/exports/lampiran-a/${loanId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || "Failed to generate Lampiran A");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `Lampiran-A-${loanId.substring(0, 8)}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Lampiran A downloaded successfully");

      // Refresh timeline to show the new export audit entry
      fetchTimeline();
    } catch {
      toast.error("Failed to generate Lampiran A");
    }
    setDownloadingLampiranA(false);
  };

  const openPaymentDialog = () => {
    // Calculate next payment due amount (for the first unpaid/partial repayment)
    if (currentSchedule) {
      const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== "PAID");
      if (unpaidRepayments.length > 0) {
        const nextRepayment = unpaidRepayments[0];
        const paid = nextRepayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
        const remaining = safeSubtract(toSafeNumber(nextRepayment.totalDue), paid);
        const outstandingLateFees = Math.max(0, safeSubtract(toSafeNumber(nextRepayment.lateFeeAccrued), toSafeNumber(nextRepayment.lateFeesPaid)));
        const totalRemaining = safeAdd(remaining, outstandingLateFees);
        setPaymentAmount(totalRemaining);
      }
    }
    setShowPaymentDialog(true);
  };

  const resetPaymentDialog = () => {
    setPaymentAmount("");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentFile(null);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setApplyLateFee(true);
  };

  const openUploadProofDialog = (transactionId: string) => {
    setSelectedTransactionId(transactionId);
    setProofFile(null);
    setShowUploadProofDialog(true);
  };

  const handleUploadProof = async () => {
    if (!selectedTransactionId || !proofFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append("file", proofFile);
      formData.append("category", "BANK_SLIP");

      const response = await fetch(`/api/proxy/schedules/transactions/${selectedTransactionId}/proof`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const result = await response.json();

      if (result.success) {
        toast.success("Proof of payment uploaded successfully");
        setShowUploadProofDialog(false);
        setSelectedTransactionId(null);
        setProofFile(null);
        await Promise.all([fetchLoan(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(result.error || "Failed to upload proof of payment");
      }
    } catch (error) {
      toast.error("Failed to upload proof of payment");
    }
    setUploadingProof(false);
  };

  const handleUploadDisbursementProof = async () => {
    if (!disbursementProofUploadFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploadingDisbursementProof(true);
    try {
      const formData = new FormData();
      formData.append("file", disbursementProofUploadFile);

      const response = await fetch(`/api/proxy/loans/${loanId}/disbursement-proof`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const result = await response.json();

      if (result.success) {
        toast.success("Proof of disbursement uploaded successfully");
        setShowUploadDisbursementProofDialog(false);
        setDisbursementProofUploadFile(null);
        await Promise.all([fetchLoan(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(result.error || "Failed to upload proof of disbursement");
      }
    } catch {
      toast.error("Failed to upload proof of disbursement");
    }
    setUploadingDisbursementProof(false);
  };

  // Handle generate agreement PDF download
  const handleGenerateAgreement = async () => {
    if (!agreementDate) {
      toast.error("Please select the agreement date");
      return;
    }
    
    setGeneratingAgreement(true);
    try {
      const params = new URLSearchParams();
      params.append("agreementDate", agreementDate);
      
      const response = await fetch(`/api/proxy/loans/${loanId}/generate-agreement?${params.toString()}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate agreement");
        return;
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `Loan_Agreement_${loanId.substring(0, 8)}.pdf`;
      
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Agreement PDF downloaded successfully");
      await fetchLoan();
      setShowGenerateAgreementDialog(false);
    } catch {
      toast.error("Failed to generate agreement PDF");
    } finally {
      setGeneratingAgreement(false);
    }
  };

  const handleRegenerateAgreement = async () => {
    if (!loan?.agreementDate) {
      toast.error("Agreement date is not set");
      return;
    }
    setRegeneratingAgreement(true);
    try {
      const params = new URLSearchParams();
      params.append("agreementDate", formatDateForInput(loan.agreementDate));
      const response = await fetch(`/api/proxy/loans/${loanId}/generate-agreement?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to regenerate agreement");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `Loan_Agreement_${loanId.substring(0, 8)}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Agreement PDF regenerated successfully");
      await fetchLoan();
    } catch {
      toast.error("Failed to regenerate agreement PDF");
    } finally {
      setRegeneratingAgreement(false);
    }
  };

  const handleGenerateGuarantorAgreement = async (guarantorId: string) => {
    setGeneratingGuarantorId(guarantorId);
    try {
      const response = await fetch(`/api/proxy/loans/${loanId}/guarantors/${guarantorId}/generate-agreement`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate guarantor agreement");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `Guarantor_Agreement_${guarantorId.substring(0, 8)}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Guarantor agreement PDF downloaded");
      await Promise.all([fetchLoan(), fetchTimeline()]);
    } catch {
      toast.error("Failed to generate guarantor agreement");
    } finally {
      setGeneratingGuarantorId(null);
    }
  };

  const openUploadGuarantorAgreementDialog = (guarantorId: string) => {
    setSelectedGuarantorId(guarantorId);
    setGuarantorAgreementFile(null);
    setShowUploadGuarantorAgreementDialog(true);
  };

  const handleUploadGuarantorAgreement = async () => {
    if (!selectedGuarantorId || !guarantorAgreementFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploadingGuarantorAgreement(true);
    try {
      const formData = new FormData();
      formData.append("file", guarantorAgreementFile);

      const response = await fetch(`/api/proxy/loans/${loanId}/guarantors/${selectedGuarantorId}/agreement`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Signed guarantor agreement uploaded successfully");
        setShowUploadGuarantorAgreementDialog(false);
        setGuarantorAgreementFile(null);
        setSelectedGuarantorId(null);
        await Promise.all([fetchLoan(), fetchTimeline()]);
      } else {
        toast.error(result.error || "Failed to upload signed guarantor agreement");
      }
    } catch {
      toast.error("Failed to upload signed guarantor agreement");
    } finally {
      setUploadingGuarantorAgreement(false);
    }
  };

  // Handle upload signed agreement
  const handleUploadAgreement = async () => {
    if (!agreementFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploadingAgreement(true);
    try {
      const formData = new FormData();
      formData.append("file", agreementFile);

      const response = await fetch(`/api/proxy/loans/${loanId}/agreement`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const result = await response.json();

      if (result.success) {
        toast.success("Signed agreement uploaded and approved (admin upload)");
        setShowUploadAgreementDialog(false);
        setAgreementFile(null);
        await Promise.all([fetchLoan(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(result.error || "Failed to upload signed agreement");
      }
    } catch {
      toast.error("Failed to upload signed agreement");
    }
    setUploadingAgreement(false);
  };

  const handleApproveSignedAgreement = async () => {
    setApprovingSignedAgreement(true);
    try {
      const response = await fetch(`/api/proxy/loans/${loanId}/signed-agreement/approve`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        toast.success("Signed agreement approved");
        await Promise.all([fetchLoan(), fetchTimeline()]);
      } else {
        toast.error(result.error || "Failed to approve");
      }
    } catch {
      toast.error("Failed to approve signed agreement");
    } finally {
      setApprovingSignedAgreement(false);
    }
  };

  const handleRejectSignedAgreement = async () => {
    setApprovingSignedAgreement(true);
    try {
      const response = await fetch(`/api/proxy/loans/${loanId}/signed-agreement/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: rejectSignedAgreementNotes.trim() || undefined }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("Signed agreement rejected — borrower can upload again");
        setShowRejectSignedAgreementDialog(false);
        setRejectSignedAgreementNotes("");
        await Promise.all([fetchLoan(), fetchTimeline()]);
      } else {
        toast.error(result.error || "Failed to reject");
      }
    } catch {
      toast.error("Failed to reject signed agreement");
    } finally {
      setApprovingSignedAgreement(false);
    }
  };

  // Handle upload stamp certificate
  const handleUploadStampCert = async () => {
    if (!stampCertFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploadingStampCert(true);
    try {
      const formData = new FormData();
      formData.append("file", stampCertFile);

      const response = await fetch(`/api/proxy/loans/${loanId}/stamp-certificate`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const result = await response.json();

      if (result.success) {
        toast.success("Stamp certificate uploaded successfully");
        setShowUploadStampCertDialog(false);
        setStampCertFile(null);
        await Promise.all([fetchLoan(), fetchTimeline()]); refreshEmailLog();
      } else {
        toast.error(result.error || "Failed to upload stamp certificate");
      }
    } catch {
      toast.error("Failed to upload stamp certificate");
    }
    setUploadingStampCert(false);
  };

  // Generate disbursement reference
  const generateDisbursementReference = () => {
    const dateStr = new Date(disbursementDate).toISOString().split("T")[0].replace(/-/g, "");
    const shortId = loanId.substring(0, 8).toUpperCase();
    return `DIS-${dateStr}-${shortId}`;
  };

  // ============================================
  // Render Helpers
  // ============================================

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PENDING_ATTESTATION":
      case "PENDING_DISBURSEMENT":
        return <Clock className="h-4 w-4" />;
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
  };

  // ============================================
  // Loading / Error States
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading loan details...</div>
      </div>
    );
  }

  if (accessDenied) {
    return <AccessDeniedCard />;
  }

  if (!loan) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted">Loan not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const currentSchedule = loan.scheduleVersions[0];
  const hasInternalSchedule = canViewInternalSchedule && !!internalSchedule;
  const isCorporate = loan.borrower.borrowerType === "CORPORATE";
  const borrowerDisplayName = isCorporate && loan.borrower.companyName
    ? loan.borrower.companyName
    : loan.borrower.name;

  // Check if all repayments are paid (or cancelled via early settlement)
  const allRepaymentsPaid = currentSchedule?.repayments.every(r => r.status === "PAID" || r.status === "CANCELLED") ?? false;
  const canComplete = (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && allRepaymentsPaid;

  // Check if early settlement is available
  const hasUnpaidRepayments = currentSchedule?.repayments.some(r => r.status !== "PAID" && r.status !== "CANCELLED") ?? false;
  const canEarlySettle = (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") 
    && loan.product.earlySettlementEnabled 
    && hasUnpaidRepayments;

  // Determine early settlement disabled reason (for tooltip)
  const earlySettlementDisabledReason = !hasUnpaidRepayments
    ? "All repayments are already paid"
    : !loan.product.earlySettlementEnabled
      ? "Early settlement is not enabled for this product. Enable it in the product configuration."
      : null;
  const hasGuarantors = (loan.guarantors || []).length > 0;
  const pendingGuarantorAgreementGeneration = (loan.guarantors || []).filter(
    (guarantor) => !guarantor.agreementGeneratedAt
  );
  const allGuarantorAgreementsGenerated = pendingGuarantorAgreementGeneration.length === 0;
  const hasSignedAgreementFile = Boolean(loan.agreementPath);
  const signedAgreementApproved = (loan.signedAgreementReviewStatus ?? "NONE") === "APPROVED";
  const attestationComplete = Boolean(loan.attestationCompletedAt);
  const isOnlineLoan = loan.loanChannel === "ONLINE";
  const requiresAttestation = isOnlineLoan;
  const isAwaitingDisbursement =
    loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION";
  const statusUi = loanDetailStatusDisplay(loan);
  const canDisburseLoan =
    Boolean(loan.agreementDate) &&
    (!requiresAttestation || attestationComplete) &&
    (!hasGuarantors || allGuarantorAgreementsGenerated) &&
    hasSignedAgreementFile &&
    signedAgreementApproved;
  const disbursementDisabledReason = !loan.agreementDate
    ? isOnlineLoan
      ? "Borrower must finish agreement steps in the borrower portal (agreement date fixed) before disbursement"
      : "Generate the agreement PDF first to fix the agreement date before disbursement"
    : requiresAttestation && !attestationComplete
      ? "Borrower must complete attestation (video or lawyer meeting) in the borrower portal before disbursement"
      : hasGuarantors && !allGuarantorAgreementsGenerated
        ? "Generate all guarantor agreement PDFs before disbursement"
        : !hasSignedAgreementFile
          ? isOnlineLoan
            ? "Borrower must digitally sign the loan agreement in the borrower portal"
            : "Upload the signed loan agreement PDF"
          : !signedAgreementApproved
            ? isOnlineLoan
              ? "Approve the borrower’s signed agreement before disbursement"
              : "Approve the borrower’s signed agreement (or upload on their behalf) before disbursement"
            : undefined;

  // ============================================
  // Main Render
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/loans")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-heading font-bold text-gradient">Loan</h1>
              <Badge variant="outline" className="text-xs">
                {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
              </Badge>
              <Badge variant={statusUi.variant} className="flex items-center gap-1">
                {getStatusIcon(loan.status)}
                {statusUi.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {borrowerDisplayName} • {loan.product.name}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {loan.status === "PENDING_DISBURSEMENT" && canDisburseLoans && (
            <Button 
              onClick={() => {
                // Initialize reference when opening dialog
                setDisbursementReference(generateDisbursementReference());
                setShowDisburseDialog(true);
              }}
              disabled={!canDisburseLoan}
              title={disbursementDisabledReason}
            >
              <Banknote className="h-4 w-4 mr-2" />
              Disburse Loan
            </Button>
          )}
          <RefreshButton
            onRefresh={handleRefreshPage}
            showLabel
            showToast
            successMessage="Loan data refreshed"
          />
          {(loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && (
            <>
              {canApproveSettlement ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          variant="outline"
                          onClick={handleOpenEarlySettlement}
                          disabled={!canEarlySettle}
                          className={!canEarlySettle ? "pointer-events-none opacity-50" : ""}
                        >
                          <Banknote className="h-4 w-4 mr-2" />
                          Early Settlement
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {earlySettlementDisabledReason && (
                      <TooltipContent className="max-w-xs">
                        <p>{earlySettlementDisabledReason}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              {canComplete && canManageLoanLifecycle && (
                <Button onClick={() => setShowCompleteDialog(true)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete Loan
                </Button>
              )}
              {loan.status === "IN_ARREARS" && canManageCollections && (
                <Button variant="destructive" onClick={() => setShowDefaultDialog(true)}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Mark Default
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Card - compact single row */}
          <Card>
            <CardContent className="pt-4">
              {isAwaitingDisbursement ? (
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    {requiresAttestation && !attestationComplete ? (
                      <>
                        <p className="font-medium text-amber-600">Pending Attestation</p>
                        <p className="text-xs text-muted-foreground">
                          Borrower must complete attestation before disbursement can proceed.
                        </p>
                        <p className="text-xs mt-2">
                          <Link
                            href={`/dashboard/truekredit-pro/attestation-meetings/${loan.id}`}
                            className="text-primary underline hover:no-underline"
                          >
                            Attestation meetings
                          </Link>
                          {loan.attestationStatus ? (
                            <span className="text-muted-foreground"> · {loan.attestationStatus}</span>
                          ) : null}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-amber-600">Pending Disbursement</p>
                        <p className="text-xs text-muted-foreground">Awaiting disbursement</p>
                      </>
                    )}
                  </div>
                </div>
              ) : metrics ? (
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <ProgressDonut percent={metrics.progressPercent} status={loan.status} size={68} strokeWidth={7} />
                  <div className="min-w-0 shrink-0">
                    <p className="text-2xl font-heading font-bold text-foreground tabular-nums">
                      {formatCurrency(metrics.totalPaid)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      of {formatCurrency(metrics.totalDue)}
                    </p>
                    {metrics.totalDue - metrics.totalPaid > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Outstanding: <span className="font-semibold text-foreground">{formatCurrency(metrics.totalDue - metrics.totalPaid)}</span>
                      </p>
                    )}
                    {metrics.earlySettlement?.discountAmount && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">incl. {formatCurrency(metrics.earlySettlement.discountAmount)} discount</p>
                    )}
                    {metrics.progressPercent >= 100 && (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && (
                      <Badge variant="success" className="mt-1.5 inline-flex gap-1 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        Ready to complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3 flex-1 min-w-0 ml-4 sm:ml-6">
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">Paid </span>
                      <span className="text-sm font-heading font-bold tabular-nums">{metrics.paidCount}</span>
                      <span className="text-xs text-muted-foreground">/ {metrics.totalRepayments}</span>
                    </div>
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">Overdue </span>
                      <span className={`text-sm font-heading font-bold tabular-nums ${metrics.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {metrics.overdueCount}
                      </span>
                      {metrics.oldestOverdueDays > 0 && (
                        <span className="text-xs text-destructive ml-0.5">({metrics.oldestOverdueDays}d)</span>
                      )}
                    </div>
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">Late </span>
                      <span className={`text-sm font-heading font-bold tabular-nums ${metrics.totalLateFees > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {formatCurrency(metrics.totalLateFees)}
                      </span>
                    </div>
                    <div className="rounded-md bg-secondary border border-border px-3 py-1.5 shrink-0">
                      <span className="text-xs text-muted-foreground">On-Time </span>
                      <span className={`text-sm font-heading font-bold tabular-nums ${metrics.repaymentRate >= 80 ? "text-success" : metrics.repaymentRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                        {metrics.repaymentRate}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* Borrower & Loan Details - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Borrower Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
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
                <div>
                  <Link 
                    href={`/dashboard/borrowers/${loan.borrower.id}`}
                    className="font-medium hover:text-muted-foreground hover:underline transition-colors inline-flex items-center gap-1.5"
                  >
                    {borrowerDisplayName}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                  {isCorporate && loan.borrower.companyName && (
                    <p className="text-sm text-muted-foreground">Rep: {loan.borrower.name}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    <VerificationBadge
                      verificationStatus={loan.borrower.verificationStatus}
                      documentVerified={loan.borrower.documentVerified}
                      size="compact"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <CopyField 
                    label={isCorporate ? "SSM" : (loan.borrower.documentType === "IC" ? "IC Number" : "Passport")}
                    value={loan.borrower.icNumber}
                  />
                  {loan.borrower.phone && (
                    <PhoneDisplay label="Phone" value={loan.borrower.phone} />
                  )}
                  {loan.borrower.email && (
                    <CopyField label="Email" value={loan.borrower.email} />
                  )}
                  {(loan.borrower.bankName || loan.borrower.bankAccountNo) && (
                    <>
                      <div className="border-t pt-2 mt-2" />
                      <CopyField
                        label="Bank"
                        value={
                          loan.borrower.bankName === "OTHER"
                            ? loan.borrower.bankNameOther
                            : loan.borrower.bankName
                        }
                      />
                      {loan.borrower.bankAccountNo && (
                        <CopyField label="Account No." value={loan.borrower.bankAccountNo} />
                      )}
                    </>
                  )}
                  {hasGuarantors && (
                    <>
                      <div className="border-t pt-2 mt-2" />
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Guarantors ({loan.guarantors.length})</p>
                        <div className="space-y-1">
                          {(loan.guarantors || []).map((guarantor) => {
                            const guarantorDisplayName =
                              guarantor.borrowerType === "CORPORATE" && guarantor.companyName
                                ? guarantor.companyName
                                : guarantor.name;
                            return (
                              <div
                                key={guarantor.id}
                                className="rounded-md border bg-secondary/30 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2"
                              >
                                <Link
                                  href={`/dashboard/borrowers/${guarantor.borrowerId}`}
                                  className="text-sm hover:text-muted-foreground hover:underline transition-colors inline-flex items-center gap-1.5"
                                >
                                  {guarantorDisplayName}
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </Link>
                                <VerificationBadge
                                  verificationStatus={guarantor.borrower?.verificationStatus}
                                  documentVerified={guarantor.borrower?.documentVerified}
                                  size="compact"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Loan Details Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-muted-foreground" />
                    Loan Details
                  </CardTitle>
                  {loan.product.loanScheduleType === "JADUAL_K" ? (
                    <Badge variant="default" className="text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Jadual K
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      Jadual J
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-heading font-bold">
                    {formatCurrency(toSafeNumber(loan.principalAmount))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {loan.interestRate}% / {loan.term} months
                  </p>
                </div>
                {/* Collateral info for Jadual K loans */}
                {loan.product.loanScheduleType === "JADUAL_K" && loan.collateralType && (
                  <div className="border-t pt-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Collateral</p>
                    <p className="text-sm font-medium">{loan.collateralType}</p>
                    {loan.collateralValue && (
                      <p className="text-sm text-muted-foreground">
                        Value: {formatCurrency(toSafeNumber(loan.collateralValue))}
                      </p>
                    )}
                  </div>
                )}
                {loan.disbursementDate && (() => {
                  const principal = toSafeNumber(loan.principalAmount);
                  const legalFee = loan.product.legalFeeType === "PERCENTAGE"
                    ? safeMultiply(principal, safeDivide(toSafeNumber(loan.product.legalFeeValue), 100))
                    : toSafeNumber(loan.product.legalFeeValue);
                  const stampingFee = loan.product.stampingFeeType === "PERCENTAGE"
                    ? safeMultiply(principal, safeDivide(toSafeNumber(loan.product.stampingFeeValue), 100))
                    : toSafeNumber(loan.product.stampingFeeValue);
                  const totalFees = safeAdd(legalFee, stampingFee);
                  const netDisbursement = safeSubtract(principal, totalFees);
                  
                  return (
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Disbursed</p>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(netDisbursement)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            on {formatDate(loan.disbursementDate)}
                          </p>
                        </div>
                        {loan.agreementDate && (
                          <div className="sm:text-right">
                            <p className="text-xs text-muted-foreground">Agreement Date</p>
                            <p className="text-sm font-medium">{formatDate(loan.agreementDate)}</p>
                          </div>
                        )}
                      </div>
                      {loan.disbursementReference && (
                        <CopyField
                          label="Reference"
                          value={loan.disbursementReference}
                        />
                      )}

                      <div className="rounded-md border bg-secondary/30 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">Proof of Disbursement</p>
                            <p className="text-xs text-muted-foreground">
                              {loan.disbursementProofPath ? "Uploaded" : "Not uploaded"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {loan.disbursementProofPath ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => window.open(`/api/proxy/loans/${loan.id}/disbursement-proof`, "_blank")}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                                {canDisburseLoans ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => setShowUploadDisbursementProofDialog(true)}
                                  >
                                    <Upload className="h-3 w-3 mr-1" />
                                    Replace
                                  </Button>
                                ) : null}
                              </>
                            ) : (
                              canDisburseLoans ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-900/20"
                                  onClick={() => setShowUploadDisbursementProofDialog(true)}
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  Upload
                                </Button>
                              ) : null
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Loan Documents */}
                      <div className="border-t pt-3 mt-3">
                        <p className="text-xs text-muted-foreground mb-2">Loan Documents</p>
                        <div className="space-y-2">
                          <div className="rounded-md border bg-secondary/30 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">Signed Loan Agreement</p>
                                <p className="text-xs text-muted-foreground">
                                  {loan.agreementPath
                                    ? isOnlineLoan ? "Digitally signed" : "Uploaded"
                                    : isOnlineLoan ? "Awaiting digital signature" : "Not uploaded"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {!isOnlineLoan && loan.agreementDate && canManageAgreementDocs && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={handleRegenerateAgreement}
                                    disabled={regeneratingAgreement}
                                    title={`Regenerate using agreement date ${formatDate(loan.agreementDate)}`}
                                  >
                                    {regeneratingAgreement ? (
                                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <Download className="h-3 w-3 mr-1" />
                                    )}
                                    Regenerate
                                  </Button>
                                )}
                                {loan.agreementPath ? (
                                  <>
                                    {canViewAgreements ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => window.open(`/api/proxy/loans/${loan.id}/agreement`, "_blank")}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        View
                                      </Button>
                                    ) : null}
                                    {!isOnlineLoan && canManageAgreementDocs ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => setShowUploadAgreementDialog(true)}
                                      >
                                        <Upload className="h-3 w-3 mr-1" />
                                        Replace
                                      </Button>
                                    ) : null}
                                  </>
                                ) : !isOnlineLoan && canManageAgreementDocs ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-900/20"
                                    onClick={() => setShowUploadAgreementDialog(true)}
                                  >
                                    <Upload className="h-3 w-3 mr-1" />
                                    Upload
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-md border bg-secondary/30 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">Stamp Certificate</p>
                                <p className="text-xs text-muted-foreground">
                                  {loan.stampCertPath ? "Uploaded" : "Not uploaded"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {loan.stampCertPath ? (
                                  <>
                                    {canViewAgreements ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => window.open(`/api/proxy/loans/${loan.id}/stamp-certificate`, "_blank")}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        View
                                      </Button>
                                    ) : null}
                                    {canManageAgreementDocs ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => setShowUploadStampCertDialog(true)}
                                      >
                                        <Upload className="h-3 w-3 mr-1" />
                                        Replace
                                      </Button>
                                    ) : null}
                                  </>
                                ) : (
                                  canManageAgreementDocs ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs h-7 border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-900/20"
                                      onClick={() => setShowUploadStampCertDialog(true)}
                                    >
                                      <Upload className="h-3 w-3 mr-1" />
                                      Upload
                                    </Button>
                                  ) : null
                                )}
                              </div>
                            </div>
                          </div>

                          {(loan.guarantors || []).map((guarantor) => {
                            const guarantorDisplayName =
                              guarantor.borrowerType === "CORPORATE" && guarantor.companyName
                                ? guarantor.companyName
                                : guarantor.name;
                            const isGenerating = generatingGuarantorId === guarantor.id;
                            return (
                              <div key={guarantor.id} className="rounded-md border bg-secondary/30 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium">Guarantor Agreement - {guarantorDisplayName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {guarantor.agreementPath ? "Signed copy uploaded" : "Signed copy not uploaded"}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {loan.agreementDate && canManageAgreementDocs ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => handleGenerateGuarantorAgreement(guarantor.id)}
                                        disabled={isGenerating}
                                        title={`Regenerate using agreement date ${formatDate(loan.agreementDate)}`}
                                      >
                                        {isGenerating ? (
                                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                          <Download className="h-3 w-3 mr-1" />
                                        )}
                                        Regenerate
                                      </Button>
                                    ) : null}
                                    {guarantor.agreementPath ? (
                                      <>
                                        {canViewAgreements ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs h-7"
                                            onClick={() => window.open(`/api/proxy/loans/${loan.id}/guarantors/${guarantor.id}/agreement`, "_blank")}
                                          >
                                            <Eye className="h-3 w-3 mr-1" />
                                            View
                                          </Button>
                                        ) : null}
                                        {canManageAgreementDocs ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs h-7"
                                            onClick={() => openUploadGuarantorAgreementDialog(guarantor.id)}
                                          >
                                            <Upload className="h-3 w-3 mr-1" />
                                            Replace
                                          </Button>
                                        ) : null}
                                      </>
                                    ) : (
                                      canManageAgreementDocs ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-xs h-7 border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-900/20"
                                          onClick={() => openUploadGuarantorAgreementDialog(guarantor.id)}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          Upload
                                        </Button>
                                      ) : null
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {!isAwaitingDisbursement && canExportCompliance && (
                            <div className="rounded-md border bg-secondary/30 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">Lampiran A (Lejar Akaun Peminjam)</p>
                                  <p className="text-xs text-muted-foreground">Generate and download ledger export</p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={handleDownloadLampiranA}
                                  disabled={downloadingLampiranA}
                                >
                                  {downloadingLampiranA ? (
                                    <>
                                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                      Generating...
                                    </>
                                  ) : (
                                    <>
                                      <Download className="h-3 w-3 mr-1" />
                                      Download
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Online loans: agreement PDF / signing / stamp happen in borrower_pro — staff get view, download, approval only */}
          {isAwaitingDisbursement && isOnlineLoan && (
            <Card
              className={
                (loan.signedAgreementReviewStatus ?? "NONE") === "APPROVED"
                  ? "border-emerald-200 dark:border-emerald-800"
                  : loan.agreementPath
                    ? "border-amber-200 dark:border-amber-800"
                    : undefined
              }
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <FileText className={`h-8 w-8 ${loan.agreementPath ? "text-emerald-600" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Signed loan agreement</h3>
                      {loan.product.loanScheduleType === "JADUAL_K" ? (
                        <Badge variant="default" className="text-xs">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Jadual K
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          Jadual J
                        </Badge>
                      )}
                      {loan.agreementPath ? (
                        <Badge variant="verified" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Digitally signed (v{loan.agreementVersion})
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Awaiting borrower signature
                        </Badge>
                      )}
                      {(loan.signedAgreementReviewStatus ?? "NONE") === "PENDING" && (
                        <Badge variant="secondary" className="text-xs">
                          Awaiting your approval
                        </Badge>
                      )}
                      {(loan.signedAgreementReviewStatus ?? "NONE") === "APPROVED" && (
                        <Badge variant="verified" className="text-xs">
                          Approved
                        </Badge>
                      )}
                      {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && (
                        <Badge variant="destructive" className="text-xs">
                          Rejected
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      The borrower digitally signs the agreement in the borrower portal using PKI. View or download the signed PDF once available.
                      {loan.agreementPath
                        ? ` Signed on: ${formatDate(loan.agreementUploadedAt || "")}.`
                        : ""}
                    </p>
                    {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && loan.signedAgreementReviewNotes && (
                      <p className="text-sm text-destructive mt-2">{loan.signedAgreementReviewNotes}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {loan.agreementPath && canViewAgreements ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/proxy/loans/${loan.id}/agreement`, "_blank")}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View latest
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={`/api/proxy/loans/${loan.id}/agreement`}
                              download={loan.agreementOriginalName || "signed-loan-agreement.pdf"}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download latest
                            </a>
                          </Button>
                          {loan.borrowerSignedAgreementPath && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`/api/proxy/loans/${loan.id}/borrower-signed-agreement`}
                                download={`borrower-signed-${loan.agreementOriginalName || "agreement.pdf"}`}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Borrower-only
                              </a>
                            </Button>
                          )}
                        </>
                      ) : loan.agreementPath ? null : (
                        <p className="text-sm text-muted-foreground">Awaiting digital signature from borrower.</p>
                      )}
                    </div>

                    {/* Internal signing cards — shown when borrower has signed */}
                    {loan.agreementPath &&
                      canManageInternalSigning &&
                      (loan.signedAgreementReviewStatus ?? "NONE") !== "APPROVED" && (
                      <div className="mt-4 space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">Internal signatures required</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                          <InternalSigningCard
                            loanId={loan.id}
                            role="COMPANY_REP"
                            existingSignature={internalSignatures.find(s => s.role === "COMPANY_REP") || null}
                            currentUserId={currentUserId}
                            onSignComplete={async () => {
                              await fetchLoan();
                              await fetchInternalSignatures();
                            }}
                          />
                          <InternalSigningCard
                            loanId={loan.id}
                            role="WITNESS"
                            existingSignature={internalSignatures.find(s => s.role === "WITNESS") || null}
                            currentUserId={currentUserId}
                            onSignComplete={async () => {
                              await fetchLoan();
                              await fetchInternalSignatures();
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agreement Date (required before disbursement) */}
          {loan.status === "PENDING_DISBURSEMENT" && !isOnlineLoan && (
            <Card className={loan.agreementDate ? "border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Calendar className={`h-8 w-8 ${loan.agreementDate ? "text-emerald-600" : "text-amber-600"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Agreement Date</h3>
                      {loan.agreementDate ? (
                        <Badge variant="verified" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Fixed
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loan.agreementDate
                        ? `Agreement date is fixed to ${formatDate(loan.agreementDate)}. The repayment schedule will follow this date during disbursement.`
                        : "Set this first by generating the agreement PDF. Disbursement is blocked until the agreement date is fixed."
                      }
                    </p>
                    {canManageAgreementDocs ? (
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => setShowGenerateAgreementDialog(true)}>
                          <Download className="h-4 w-4 mr-2" />
                          {loan.agreementDate ? "Regenerate Agreement PDF" : "Generate Agreement PDF"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Signed Loan Agreement — required before disbursement; borrower uploads for review */}
          {loan.status === "PENDING_DISBURSEMENT" && !isOnlineLoan && (
            <Card
              className={
                (loan.signedAgreementReviewStatus ?? "NONE") === "APPROVED"
                  ? "border-emerald-200 dark:border-emerald-800"
                  : loan.agreementPath
                    ? "border-amber-200 dark:border-amber-800"
                    : undefined
              }
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <FileText className={`h-8 w-8 ${loan.agreementPath ? "text-emerald-600" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Signed Loan Agreement</h3>
                      {loan.product.loanScheduleType === "JADUAL_K" ? (
                        <Badge variant="default" className="text-xs">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Jadual K
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          Jadual J
                        </Badge>
                      )}
                      {loan.agreementPath ? (
                        <Badge variant="verified" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Uploaded (v{loan.agreementVersion})
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Required before disbursement
                        </Badge>
                      )}
                      {(loan.signedAgreementReviewStatus ?? "NONE") === "PENDING" && (
                        <Badge variant="secondary" className="text-xs">
                          Awaiting approval
                        </Badge>
                      )}
                      {(loan.signedAgreementReviewStatus ?? "NONE") === "APPROVED" && (
                        <Badge variant="verified" className="text-xs">
                          Approved
                        </Badge>
                      )}
                      {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && (
                        <Badge variant="destructive" className="text-xs">
                          Rejected
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loan.agreementPath
                        ? `Last upload: ${formatDate(loan.agreementUploadedAt || "")}. Borrower uploads go to “Awaiting approval” until you approve.`
                        : "Upload the borrower’s signed PDF, or ask them to upload from the borrower portal."}
                    </p>
                    {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && loan.signedAgreementReviewNotes && (
                      <p className="text-sm text-destructive mt-2">{loan.signedAgreementReviewNotes}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {loan.agreementPath ? (
                        <>
                          {canViewAgreements ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/api/proxy/loans/${loan.id}/agreement`, "_blank")}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Agreement
                            </Button>
                          ) : null}
                          {canManageAgreementDocs ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowUploadAgreementDialog(true)}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Replace
                            </Button>
                          ) : null}
                          {(loan.signedAgreementReviewStatus ?? "NONE") === "PENDING" && canApproveSignedAgreement && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => void handleApproveSignedAgreement()}
                                disabled={approvingSignedAgreement}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Approve signed agreement
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowRejectSignedAgreementDialog(true)}
                                disabled={approvingSignedAgreement}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </>
                      ) : canManageAgreementDocs ? (
                        <Button size="sm" onClick={() => setShowUploadAgreementDialog(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Signed Agreement
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Guarantor Agreements (required to generate before disbursement if guarantors exist) */}
          {isAwaitingDisbursement && hasGuarantors && (
            <Card className={allGuarantorAgreementsGenerated ? "border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Users className={`h-8 w-8 ${allGuarantorAgreementsGenerated ? "text-emerald-600" : "text-amber-600"}`} />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Guarantor Agreements</h3>
                      {allGuarantorAgreementsGenerated ? (
                        <Badge variant="verified" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Required Before Disbursement
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Generate one guarantor agreement per guarantor before disbursement. Signed uploads are optional and can be done before or after disbursement.
                    </p>

                    <div className="space-y-3">
                      {(loan.guarantors || []).map((guarantor) => {
                        const guarantorDisplayName =
                          guarantor.borrowerType === "CORPORATE" && guarantor.companyName
                            ? guarantor.companyName
                            : guarantor.name;
                        const generatingThisGuarantor = generatingGuarantorId === guarantor.id;
                        return (
                          <div key={guarantor.id} className="rounded-lg border bg-background p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-medium">{guarantorDisplayName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {guarantor.documentType === "PASSPORT" ? "Passport" : "IC"}: {guarantor.icNumber}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {guarantor.agreementGeneratedAt ? (
                                  <Badge variant="verified" className="text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Generated
                                  </Badge>
                                ) : (
                                  <Badge variant="warning" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Not Generated
                                  </Badge>
                                )}
                                {guarantor.agreementPath ? (
                                  <Badge variant="verified" className="text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Signed Uploaded (v{guarantor.agreementVersion})
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">Signed Optional</Badge>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {canManageAgreementDocs ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={generatingThisGuarantor || !loan.agreementDate}
                                  onClick={() => handleGenerateGuarantorAgreement(guarantor.id)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  {generatingThisGuarantor
                                    ? "Generating..."
                                    : guarantor.agreementGeneratedAt
                                      ? "Regenerate PDF"
                                      : "Generate PDF"}
                                </Button>
                              ) : null}

                              {guarantor.agreementPath ? (
                                <>
                                  {canViewAgreements ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => window.open(`/api/proxy/loans/${loan.id}/guarantors/${guarantor.id}/agreement`, "_blank")}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      View Signed
                                    </Button>
                                  ) : null}
                                  {canManageAgreementDocs ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openUploadGuarantorAgreementDialog(guarantor.id)}
                                    >
                                      <Upload className="h-4 w-4 mr-2" />
                                      Replace Signed
                                    </Button>
                                  ) : null}
                                </>
                              ) : canManageAgreementDocs ? (
                                <Button size="sm" onClick={() => openUploadGuarantorAgreementDialog(guarantor.id)}>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload Signed
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stamp Certificate (optional upload before/after disbursement) */}
          {loan.status === "PENDING_DISBURSEMENT" && !isOnlineLoan && (
            <Card className={loan.stampCertPath ? "border-emerald-200 dark:border-emerald-800" : undefined}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Shield className={`h-8 w-8 ${loan.stampCertPath ? "text-emerald-600" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Stamp Certificate</h3>
                      {loan.stampCertPath ? (
                        <Badge variant="verified" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Uploaded (v{loan.stampCertVersion})
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Optional
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loan.stampCertPath
                        ? `Stamp certificate uploaded on ${formatDate(loan.stampCertUploadedAt || "")}`
                        : "Stamp certificate can be uploaded before or after disbursement."
                      }
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open("https://stamps.hasil.gov.my/stamps/?isStampsSite=true&lang=ms&refererUrl=https%3A%2F%2Fstamps.hasil.gov.my%2Fstamps%2F", "_blank")}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        LHDN Stamp Portal
                      </Button>
                      {loan.stampCertPath ? (
                        <>
                          {canViewAgreements ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/api/proxy/loans/${loan.id}/stamp-certificate`, "_blank")}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Certificate
                            </Button>
                          ) : null}
                          {canManageAgreementDocs ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowUploadStampCertDialog(true)}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Replace
                            </Button>
                          ) : null}
                        </>
                      ) : canManageAgreementDocs ? (
                        <Button size="sm" onClick={() => setShowUploadStampCertDialog(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Stamp Certificate
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schedule Preview (before disbursement) */}
          {isAwaitingDisbursement && schedulePreview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  Schedule Preview
                </CardTitle>
                <CardDescription>
                  Preview of the repayment schedule that will be generated upon disbursement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor="disbursement-date">Disbursement Date</Label>
                    <Input
                      id="disbursement-date"
                      type="date"
                      value={disbursementDate}
                      onChange={(e) => setDisbursementDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Payable</p>
                    <p className="text-xl font-bold">{formatCurrency(schedulePreview.totalPayable)}</p>
                  </div>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Interest</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedulePreview.repayments.map((rep, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{formatDate(rep.dueDate)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(rep.principal)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(rep.interest)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(rep.totalDue)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatCurrency(rep.balance)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row for preview */}
                      {(() => {
                        const totals = schedulePreview.repayments.reduce(
                          (acc, rep) => ({
                            principal: safeAdd(acc.principal, toSafeNumber(rep.principal)),
                            interest: safeAdd(acc.interest, toSafeNumber(rep.interest)),
                            totalDue: safeAdd(acc.totalDue, toSafeNumber(rep.totalDue)),
                          }),
                          { principal: 0, interest: 0, totalDue: 0 }
                        );
                        return (
                          <TableRow className="bg-muted/10 font-semibold border-t-2">
                            <TableCell colSpan={2} className="font-medium">
                              Total
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(totals.principal)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(totals.interest)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(totals.totalDue)}</TableCell>
                            <TableCell />
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Completed Loan Info */}
          {loan.status === "COMPLETED" && (
            <Card className="border-success">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <CheckCircle className="h-8 w-8 text-success" />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-success">
                          {loan.earlySettlementDate ? "Early Settlement Completed" : "Loan Completed"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {loan.earlySettlementDate
                            ? `Settled early on ${formatDate(loan.earlySettlementDate)}`
                            : `Completed on ${loan.completedAt ? formatDate(loan.completedAt) : "N/A"}`}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.open(`/api/proxy/loans/${loan.id}/discharge-letter`, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Discharge Letter
                      </Button>
                    </div>

                    {/* Early Settlement Details */}
                    {loan.earlySettlementDate && (() => {
                      // Find the settlement transaction from cancelled repayments' allocations
                      const cancelledRepayment = currentSchedule?.repayments.find(r => r.status === "CANCELLED");
                      const settlementAlloc = cancelledRepayment?.allocations?.find(
                        (a) => (a as { transaction?: { paymentType?: string } }).transaction?.paymentType === "EARLY_SETTLEMENT"
                      );
                      const settlementTx = (settlementAlloc as { transaction?: { id: string; receiptPath?: string; proofPath?: string } })?.transaction;

                      return (
                        <>
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                            <div>
                              <p className="text-xs text-muted-foreground">Settlement Amount</p>
                              <p className="font-semibold">{formatCurrency(toSafeNumber(loan.earlySettlementAmount))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Discount Given</p>
                              <p className="font-semibold text-emerald-600">{formatCurrency(toSafeNumber(loan.earlySettlementDiscount))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Late Fees</p>
                              <p className="font-semibold">
                                {loan.earlySettlementWaiveLateFees ? (
                                  <span className="text-muted-foreground">Waived</span>
                                ) : (
                                  "Included"
                                )}
                              </p>
                            </div>
                            {loan.repaymentRate && (
                              <div>
                                <p className="text-xs text-muted-foreground">Repayment Rate</p>
                                <p className="font-semibold">{toSafeNumber(loan.repaymentRate)}%</p>
                              </div>
                            )}
                          </div>

                          {/* Settlement Receipt & Proof */}
                          {settlementTx && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {settlementTx.receiptPath && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => window.open(`/api/proxy/schedules/transactions/${settlementTx.id}/receipt`, "_blank")}
                                >
                                  <Receipt className="h-3.5 w-3.5 mr-1.5" />
                                  Settlement Receipt
                                </Button>
                              )}
                              {settlementTx.proofPath && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => window.open(`/api/proxy/schedules/transactions/${settlementTx.id}/proof`, "_blank")}
                                >
                                  <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                                  Proof of Payment
                                </Button>
                              )}
                              {!settlementTx.proofPath && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => openUploadProofDialog(settlementTx.id)}
                                >
                                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                                  Upload Proof
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {!loan.earlySettlementDate && loan.repaymentRate && (
                      <p className="text-sm mt-2">
                        Repayment Rate: <span className="font-medium">{toSafeNumber(loan.repaymentRate)}%</span>
                      </p>
                    )}
                    {loan.dischargeNotes && (
                      <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                        <p className="text-sm font-medium">{loan.earlySettlementDate ? "Settlement Notes" : "Discharge Notes"}</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{loan.dischargeNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Defaulted Loan Info */}
          {loan.status === "DEFAULTED" && currentSchedule && (() => {
            const now = new Date();
            const overdueRepayments = currentSchedule.repayments.filter(
              r => new Date(r.dueDate) < now && r.status !== "PAID" && r.status !== "CANCELLED"
            );
            const overdueBalance = overdueRepayments.reduce((sum, r) => {
              const paid = r.allocations.reduce((s, a) => s + toSafeNumber(a.amount), 0);
              const outstanding = safeSubtract(toSafeNumber(r.totalDue), paid);
              const outstandingLateFees = Math.max(0, safeSubtract(toSafeNumber(r.lateFeeAccrued), toSafeNumber(r.lateFeesPaid)));
              return safeAdd(sum, safeAdd(outstanding, outstandingLateFees));
            }, 0);

            return (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <XCircle className="h-8 w-8 text-destructive" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-destructive">Loan Defaulted</h3>
                      <p className="text-sm text-muted-foreground">
                        This loan has been marked as defaulted. Late interest continues to accrue.
                      </p>
                      {overdueBalance > 0 && (
                        <div className="mt-3 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                          <p className="text-sm font-medium">
                            Overdue Balance to Clear Default: <span className="text-destructive">{formatCurrency(overdueBalance)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Once all overdue repayments (including late fees) are fully paid, the loan will automatically return to active status and continue from there.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Repayment Schedule (after disbursement) */}
          {currentSchedule && !isAwaitingDisbursement && (
            <Card>
              <Tabs
                value={hasInternalSchedule ? scheduleView : "standard"}
                onValueChange={(value) => setScheduleView(value === "internal" && hasInternalSchedule ? "internal" : "standard")}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        Repayment Schedule
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {scheduleView === "internal" && internalSchedule ? (
                          <>
                            Risk-Adjusted • {internalSchedule.interestModel === "RULE_78" ? "Rule 78" : internalSchedule.interestModel.replace(/_/g, " ")}
                            {loan.disbursementDate && ` • Disbursed ${formatDate(loan.disbursementDate)}`}
                          </>
                        ) : (
                          <>
                            Version {currentSchedule.version} • {currentSchedule.interestModel === "RULE_78" ? "Rule 78" : currentSchedule.interestModel.replace(/_/g, " ")}
                            {loan.disbursementDate && ` • Disbursed ${formatDate(loan.disbursementDate)}`}
                          </>
                        )}
                      </CardDescription>
                    </div>
                    {(hasInternalSchedule || (loan.status !== "COMPLETED" && loan.status !== "WRITTEN_OFF")) && (
                      <div className="flex flex-col items-end gap-3">
                        {hasInternalSchedule && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-2">Schedule View</p>
                            <TabsList>
                              <TabsTrigger value="standard">Loan</TabsTrigger>
                              <TabsTrigger value="internal">Risk-Adjusted</TabsTrigger>
                            </TabsList>
                          </div>
                        )}
                        {loan.status !== "COMPLETED" && loan.status !== "WRITTEN_OFF" && (() => {
                          const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== "PAID");
                          if (unpaidRepayments.length === 0) return null;

                          const nextRepayment = unpaidRepayments[0];
                          const paid = nextRepayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
                          const remaining = safeSubtract(toSafeNumber(nextRepayment.totalDue), paid);
                          const outstandingLateFees = Math.max(0, safeSubtract(toSafeNumber(nextRepayment.lateFeeAccrued), toSafeNumber(nextRepayment.lateFeesPaid)));
                          const totalRemaining = safeAdd(remaining, outstandingLateFees);
                          const isOverdue = new Date(nextRepayment.dueDate) < new Date();

                          return (
                            <div className="flex flex-col items-end gap-2">
                              <div className="text-right text-sm">
                                <p className="text-muted-foreground">Next Payment Due</p>
                                <p className={`font-semibold ${isOverdue ? "text-destructive" : ""}`}>
                                  {formatCurrency(totalRemaining)} on {formatDate(nextRepayment.dueDate)}
                                  {isOverdue && " (Overdue)"}
                                </p>
                                {outstandingLateFees > 0 && (
                                  <p className="text-xs text-amber-600">
                                    incl. {formatCurrency(outstandingLateFees)} late fees
                                  </p>
                                )}
                              </div>
                              {canApprovePayments ? (
                                <Button onClick={() => openPaymentDialog()} size="sm">
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  Record Payment
                                </Button>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {hasInternalSchedule && internalSchedule && (() => {
                    const prefix = loan.id.slice(-8);
                    const term = internalSchedule.term;
                    const monthlyRiskIndex = safeRound(safeDivide(internalSchedule.interestRate, 12, 8), 1);
                    const monthlyPayment = internalSchedule.repayments[0]?.totalDue ?? safeRound(safeDivide(internalSchedule.totalPayable, term, 8), 2);
                    const loanIdCode = `${prefix}00${term}00${safeRound(monthlyRiskIndex, 1).toFixed(1)}00${safeRound(monthlyPayment, 2).toFixed(2)}`;
                    return (
                      <div className="px-4 py-3 border-b border-border">
                        <CopyField label="Loan ID" value={loanIdCode} />
                      </div>
                    );
                  })()}
                  <TabsContent value="standard" className="mt-0">
                    <div className="px-4 py-2.5 border-b border-border bg-slate-100 dark:bg-slate-800/60">
                      <div className="flex items-center gap-5 text-xs">
                        <span className="font-medium text-slate-500 dark:text-slate-400">Legend:</span>
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <Receipt className="h-3.5 w-3.5" />
                          <span>Receipt generated</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <FileCheck className="h-3.5 w-3.5" />
                          <span>Proof of payment uploaded</span>
                        </span>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Principal</TableHead>
                          <TableHead className="text-right">Interest</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="text-right">Late Fees</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentSchedule.repayments.map((repayment, idx) => {
                          const paid = repayment.allocations.reduce((s, a) => s + toSafeNumber(a.amount), 0);
                          const totalDue = toSafeNumber(repayment.totalDue);
                          const interestDue = toSafeNumber(repayment.interest);
                          const principalDue = toSafeNumber(repayment.principal);
                          const scheduledBalance = Math.max(0, safeSubtract(totalDue, paid));
                          const interestPaid = Math.min(interestDue, paid);
                          const principalPaid = Math.min(
                            principalDue,
                            Math.max(0, safeSubtract(paid, interestPaid))
                          );
                          const isCancelled = repayment.status === "CANCELLED";
                          const isOverdue = new Date(repayment.dueDate) < new Date() && repayment.status !== "PAID" && !isCancelled;
                          const lateFeeAccrued = toSafeNumber(repayment.lateFeeAccrued);
                          const lateFeesPaid = toSafeNumber(repayment.lateFeesPaid);
                          const hasLateFees = lateFeeAccrued > 0;

                          return (
                            <TableRow key={repayment.id} className={isCancelled ? "opacity-50" : isOverdue ? "bg-destructive/5" : ""}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {formatDate(repayment.dueDate)}
                                  {isOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div>
                                  <span>{formatCurrency(toSafeNumber(repayment.principal))}</span>
                                  {principalPaid > 0 && (
                                    <span className="text-xs text-muted-foreground block">
                                      {formatCurrency(principalPaid)} paid
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div>
                                  <span>{formatCurrency(toSafeNumber(repayment.interest))}</span>
                                  {interestPaid > 0 && (
                                    <span className="text-xs text-muted-foreground block">
                                      {formatCurrency(interestPaid)} paid
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(scheduledBalance)}</TableCell>
                              <TableCell className="text-right">
                                {hasLateFees ? (
                                  <div>
                                    <span className="text-destructive font-medium">{formatCurrency(lateFeeAccrued)}</span>
                                    {lateFeesPaid > 0 && (
                                      <span className="text-xs text-muted-foreground block">
                                        {formatCurrency(lateFeesPaid)} paid
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div>
                                  <div className="flex items-center justify-end gap-1">
                                    <span className={paid > 0 ? "text-success" : ""}>
                                      {formatCurrency(paid)}
                                    </span>
                                    {repayment.allocations.length > 0 && (() => {
                                      const hasReceipt = repayment.allocations.some(
                                        (a) => (a as { transaction?: { receiptPath?: string } }).transaction?.receiptPath
                                      );
                                      const hasProof = repayment.allocations.some(
                                        (a) => (a as { transaction?: { proofPath?: string } }).transaction?.proofPath
                                      );
                                      return (
                                        <>
                                          <span title={hasReceipt ? "Has payment receipt" : "Receipt not yet generated"}>
                                            <Receipt className={`h-3.5 w-3.5 ${hasReceipt ? "text-success" : "text-amber-500"}`} />
                                          </span>
                                          <span title={hasProof ? "Has proof of payment" : "Proof of payment not yet uploaded"}>
                                            <FileCheck className={`h-3.5 w-3.5 ${hasProof ? "text-success" : "text-amber-500"}`} />
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={isCancelled ? "secondary" as "default" : isOverdue ? "destructive" : repaymentStatusColors[repayment.status]}>
                                  {isCancelled ? "SETTLED" : isOverdue && repayment.status !== "PAID" ? "OVERDUE" : repayment.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {repayment.allocations.length > 0 && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" title="View payments & receipts">
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-72">
                                        <DropdownMenuLabel>
                                          {repayment.allocations.length} Payment{repayment.allocations.length > 1 ? "s" : ""} Recorded
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {repayment.allocations.map((allocation, allocIdx) => {
                                          const tx = (allocation as { transaction?: { id: string; proofPath?: string; receiptPath?: string } }).transaction;
                                          const hasProof = !!tx?.proofPath;
                                          const hasReceipt = !!tx?.receiptPath;

                                          return (
                                            <div key={allocation.id}>
                                              {allocIdx > 0 && <DropdownMenuSeparator />}
                                              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground flex items-center justify-between">
                                                <span>
                                                  Payment {allocIdx + 1}: {formatCurrency(toSafeNumber(allocation.amount))}
                                                </span>
                                                <span className="text-xs">{formatDate(allocation.allocatedAt)}</span>
                                              </DropdownMenuLabel>
                                              {tx && hasReceipt && (
                                                <DropdownMenuItem
                                                  onClick={() => window.open(`/api/proxy/schedules/transactions/${tx.id}/receipt`, "_blank")}
                                                >
                                                  <Receipt className="h-4 w-4 mr-2" />
                                                  View Receipt
                                                </DropdownMenuItem>
                                              )}
                                              {tx && hasProof && (
                                                <DropdownMenuItem
                                                  onClick={() => window.open(`/api/proxy/schedules/transactions/${tx.id}/proof`, "_blank")}
                                                >
                                                  <Download className="h-4 w-4 mr-2" />
                                                  View Proof of Payment
                                                </DropdownMenuItem>
                                              )}
                                              {tx && canApprovePayments ? (
                                                <DropdownMenuItem
                                                  onClick={() => openUploadProofDialog(tx.id)}
                                                  className={!hasProof ? "text-amber-500 focus:text-amber-500" : ""}
                                                >
                                                  <Upload className="h-4 w-4 mr-2" />
                                                  {hasProof ? "Replace" : "Upload"} Proof of Payment
                                                </DropdownMenuItem>
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const totals = currentSchedule.repayments.reduce(
                            (acc, r) => {
                              const principal = toSafeNumber(r.principal);
                              const interest = toSafeNumber(r.interest);
                              const lateFeeAccrued = toSafeNumber(r.lateFeeAccrued);
                              const paid = r.allocations.reduce((s, a) => s + toSafeNumber(a.amount), 0);
                              const balance = r.status === "CANCELLED"
                                ? 0
                                : Math.max(0, safeSubtract(toSafeNumber(r.totalDue), paid));
                              return {
                                principal: safeAdd(acc.principal, principal),
                                interest: safeAdd(acc.interest, interest),
                                balance: safeAdd(acc.balance, balance),
                                lateFees: safeAdd(acc.lateFees, lateFeeAccrued),
                                paid: safeAdd(acc.paid, paid),
                              };
                            },
                            { principal: 0, interest: 0, balance: 0, lateFees: 0, paid: 0 }
                          );
                          return (
                            <TableRow className="bg-muted/10 font-semibold border-t-2">
                              <TableCell colSpan={2} className="font-medium">
                                Total
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.principal)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.interest)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.balance)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.lateFees)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(totals.paid)}</TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  {internalSchedule && (
                    <TabsContent value="internal" className="mt-0">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium">Risk-adjusted schedule view</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          This risk-adjusted schedule is provided solely for internal reference and scenario analysis. Risk index and risk term are for internal planning purposes only; their meaning and interpretation are determined by the lender. Under applicable KPKT limits, the maximum permitted interest rate is 18% p.a. for Jadual J financing and 12% p.a. for Jadual K financing; lenders are not permitted to charge above the applicable cap. The lender remains solely responsible for ensuring that all pricing, documentation, and recoveries comply with applicable law and regulatory requirements. This risk-adjusted view does not amend, replace, validate, or supersede the official repayment schedule, contractual terms, or compliance record. Payment actions continue to follow the loan schedule.
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Principal</TableHead>
                            <TableHead className="text-right">Interest</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {internalSchedule.repayments.map((repayment) => {
                            const interestPaid = Math.min(repayment.interest, repayment.paidAmount);
                            const principalPaid = Math.min(
                              repayment.principal,
                              Math.max(0, safeSubtract(repayment.paidAmount, interestPaid)),
                            );
                            const scheduledBalance = Math.max(0, repayment.remainingAmount);
                            const isOverdue =
                              new Date(repayment.dueDate) < new Date() &&
                              repayment.status !== "PAID";

                            return (
                              <TableRow key={repayment.id} className={isOverdue ? "bg-destructive/5" : ""}>
                                <TableCell>{repayment.installmentNumber}</TableCell>
                                <TableCell>{formatDate(repayment.dueDate)}</TableCell>
                                <TableCell className="text-right">
                                  <div>
                                    <span>{formatCurrency(repayment.principal)}</span>
                                    {principalPaid > 0 && (
                                      <span className="text-xs text-muted-foreground block">
                                        {formatCurrency(principalPaid)} paid
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div>
                                    <span>{formatCurrency(repayment.interest)}</span>
                                    {interestPaid > 0 && (
                                      <span className="text-xs text-muted-foreground block">
                                        {formatCurrency(interestPaid)} paid
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(scheduledBalance)}</TableCell>
                                <TableCell className="text-right">
                                  <span className={repayment.paidAmount > 0 ? "text-success" : ""}>
                                    {formatCurrency(repayment.paidAmount)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={isOverdue ? "destructive" : repaymentStatusColors[repayment.status]}>
                                    {isOverdue ? "OVERDUE" : repayment.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/10 font-semibold border-t-2">
                            <TableCell colSpan={2} className="font-medium">
                              Total
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(internalSchedule.repayments.reduce((sum, repayment) => safeAdd(sum, repayment.principal), 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(internalSchedule.totalInterest)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(internalSchedule.totalRemaining)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(internalSchedule.totalPaid)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>
                  )}
                </CardContent>
              </Tabs>
            </Card>
          )}
        </div>

        {/* Right Column - TrueSend, Quick Info & Timeline */}
        <div className="space-y-6">
          {/* TrueSend Email Log */}
          <TrueSendEmailLog loanId={loan.id} refreshKey={emailLogRefreshKey} />

          {/* Quick Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan ID</span>
                <span className="font-mono text-xs">{loan.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-muted-foreground shrink-0">Status</span>
                <span className="text-right font-medium">{statusUi.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(loan.createdAt)}</span>
              </div>
              {loan.disbursementDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disbursed</span>
                  <span>{formatDate(loan.disbursementDate)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Product</span>
                <Link
                  href={`/dashboard/products/${loan.product.id}`}
                  className="text-muted-foreground hover:underline inline-flex items-center gap-1"
                >
                  {loan.product.name}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Arrears Period</span>
                <span>{loan.product.arrearsPeriod} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Default Period</span>
                <span>{loan.product.defaultPeriod} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Late Payment Rate</span>
                <span>{loan.product.latePaymentRate}% p.a.</span>
              </div>
              {loan.product.earlySettlementEnabled && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lock-in Period</span>
                    <span>{loan.product.earlySettlementLockInMonths > 0 ? `${loan.product.earlySettlementLockInMonths} months` : "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settlement Discount</span>
                    <span>
                      {loan.product.earlySettlementDiscountType === "PERCENTAGE"
                        ? `${loan.product.earlySettlementDiscountValue}%`
                        : `RM ${loan.product.earlySettlementDiscountValue}`}
                    </span>
                  </div>
                </>
              )}
              {toSafeNumber(loan.totalLateFees) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Late Fees</span>
                  <span className="text-destructive font-medium">{formatCurrency(toSafeNumber(loan.totalLateFees))}</span>
                </div>
              )}
              {/* Ready for Default indicator */}
              {loan.readyForDefault && loan.status !== "DEFAULTED" && (
                <div className="p-2 border border-destructive/30 bg-destructive/5 rounded-md">
                  <div className="flex items-center gap-2 text-destructive font-medium text-xs mb-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Ready for Default
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default period exceeded. This loan can be marked as defaulted.
                  </p>
                </div>
              )}
              {/* Letters */}
              {(loan.arrearsLetterPath || loan.defaultLetterPath || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED") && (
                <div className="pt-2 border-t space-y-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Letters</span>
                  {/* Arrears Letter Section */}
                  {(loan.arrearsLetterPath || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED") && (
                    <div className="space-y-1">
                      {loan.arrearsLetterPath && (() => {
                        const letterDate = parseLetterDate(loan.arrearsLetterPath!);
                        return (
                          <button
                            onClick={() => window.open(`/api/proxy/loans/${loan.id}/arrears-letter`, "_blank")}
                            className="flex items-center justify-between w-full text-xs group"
                          >
                            <span className="flex items-center gap-2 text-foreground group-hover:underline">
                              <Download className="h-3 w-3" />
                              Arrears Notice
                            </span>
                            {letterDate && (
                              <span className="text-muted-foreground">{formatDate(letterDate.toISOString())}</span>
                            )}
                          </button>
                        );
                      })()}
                      {(loan.status === "IN_ARREARS" || loan.status === "DEFAULTED") && canManageCollections && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={() => setShowGenerateArrearsLetterDialog(true)}
                        >
                          <FileText className="h-3 w-3 mr-1.5" />
                          {loan.arrearsLetterPath ? "Regenerate Arrears Letter" : "Generate Arrears Letter"}
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Default Letter Section */}
                  {(loan.defaultLetterPath || loan.status === "DEFAULTED") && (
                    <div className="space-y-1">
                      {loan.defaultLetterPath && (() => {
                        const letterDate = parseLetterDate(loan.defaultLetterPath!);
                        return (
                          <button
                            onClick={() => window.open(`/api/proxy/loans/${loan.id}/default-letter`, "_blank")}
                            className="flex items-center justify-between w-full text-xs group"
                          >
                            <span className="flex items-center gap-2 text-foreground group-hover:underline">
                              <Download className="h-3 w-3" />
                              Default Notice
                            </span>
                            {letterDate && (
                              <span className="text-muted-foreground">{formatDate(letterDate.toISOString())}</span>
                            )}
                          </button>
                        );
                      })()}
                      {loan.status === "DEFAULTED" && canManageCollections && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={() => setShowGenerateDefaultLetterDialog(true)}
                        >
                          <FileText className="h-3 w-3 mr-1.5" />
                          {loan.defaultLetterPath ? "Regenerate Default Letter" : "Generate Default Letter"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {loan.product.loanScheduleType === "JADUAL_K" && loan.collateralType && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collateral</span>
                    <span className="text-right max-w-[60%]">{loan.collateralType}</span>
                  </div>
                  {loan.collateralValue && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Collateral Value</span>
                      <span>{formatCurrency(toSafeNumber(loan.collateralValue))}</span>
                    </div>
                  )}
                </>
              )}
              <div className="pt-2 border-t">
                <Link
                  href={`/dashboard/applications/${loan.application.id}`}
                  className="text-foreground hover:underline inline-flex items-center gap-1"
                >
                  View Application
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>

          <InternalStaffNotesPanel apiPath={`loans/${loanId}/staff-notes`} canPost={canManageLoanLifecycle} />

          {/* Activity Timeline */}
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setTimelineExpanded((p) => !p)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    Activity Timeline
                  </CardTitle>
                  <CardDescription>History of changes and events</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimelineExpanded((p) => !p);
                  }}
                >
                  {timelineExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            {timelineExpanded && (
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No activity recorded yet
                  </p>
                ) : (
                  <div className="space-y-0">
                    {timeline.map((event) => (
                      <TimelineItem key={event.id} event={event} borrowerDisplayName={borrowerDisplayName ?? null} />
                    ))}
                    {hasMoreTimeline && (
                      <div className="pt-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchTimeline(timelineCursor || undefined, true);
                          }}
                          disabled={loadingMoreTimeline}
                        >
                          {loadingMoreTimeline ? "Loading..." : "Load More"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* ============================================ */}
      {/* Dialogs */}
      {/* ============================================ */}

      {/* Disburse Dialog */}
      <Dialog open={showDisburseDialog} onOpenChange={setShowDisburseDialog}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Disburse Loan</DialogTitle>
            <DialogDescription>
              Confirm disbursement to generate the repayment schedule and activate the loan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Total to Disburse - Main Highlight */}
            {(() => {
              const principal = toSafeNumber(loan.principalAmount);
              const legalFee = loan.product.legalFeeType === "PERCENTAGE"
                ? safeMultiply(principal, safeDivide(toSafeNumber(loan.product.legalFeeValue), 100))
                : toSafeNumber(loan.product.legalFeeValue);
              const stampingFee = loan.product.stampingFeeType === "PERCENTAGE"
                ? safeMultiply(principal, safeDivide(toSafeNumber(loan.product.stampingFeeValue), 100))
                : toSafeNumber(loan.product.stampingFeeValue);
              const totalFees = safeAdd(legalFee, stampingFee);
              const netDisbursement = safeSubtract(principal, totalFees);
              const hasFees = totalFees > 0;

              return (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 rounded-lg p-5">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium mb-1">
                    Total to Disburse
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-heading font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(netDisbursement)}
                    </p>
                    {hasFees && (
                      <span className="text-sm text-muted-foreground">
                        (after fees)
                      </span>
                    )}
                  </div>
                  {hasFees && (
                    <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800 text-sm space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Principal Amount</span>
                        <span>{formatCurrency(principal)}</span>
                      </div>
                      {legalFee > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Legal Fee {loan.product.legalFeeType === "PERCENTAGE" ? `(${loan.product.legalFeeValue}%)` : ""}</span>
                          <span>- {formatCurrency(legalFee)}</span>
                        </div>
                      )}
                      {stampingFee > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Stamping Fee {loan.product.stampingFeeType === "PERCENTAGE" ? `(${loan.product.stampingFeeValue}%)` : ""}</span>
                          <span>- {formatCurrency(stampingFee)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Bank Details for Disbursement */}
            {(loan.borrower.bankName || loan.borrower.bankAccountNo) && (
              <div className="bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                <p className="font-medium mb-3 text-sm">Disbursement Bank Details</p>
                <p className="text-sm text-muted-foreground mb-2">{borrowerDisplayName}</p>
                <div className="space-y-2">
                  <CopyField
                    label="Bank Name"
                    value={
                      loan.borrower.bankName === "OTHER"
                        ? loan.borrower.bankNameOther
                        : loan.borrower.bankName
                    }
                  />
                  <CopyField
                    label="Account Number"
                    value={loan.borrower.bankAccountNo}
                  />
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="disburse-date">Disbursement Date</Label>
                <Input
                  id="disburse-date"
                  type="date"
                  value={disbursementDate}
                  onChange={(e) => {
                    setDisbursementDate(e.target.value);
                    // Auto-update reference when date changes
                    if (!disbursementReference || disbursementReference.startsWith("DIS-")) {
                      const dateStr = new Date(e.target.value).toISOString().split("T")[0].replace(/-/g, "");
                      const shortId = loanId.substring(0, 8).toUpperCase();
                      setDisbursementReference(`DIS-${dateStr}-${shortId}`);
                    }
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="disburse-reference">Reference Number</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="disburse-reference"
                    value={disbursementReference}
                    onChange={(e) => setDisbursementReference(e.target.value)}
                    placeholder={generateDisbursementReference()}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0"
                    onClick={async () => {
                      const refToCopy = disbursementReference || generateDisbursementReference();
                      await navigator.clipboard.writeText(refToCopy);
                      toast.success("Reference copied to clipboard");
                    }}
                    title="Copy reference"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="min-w-0 overflow-hidden">
              <Label htmlFor="disburse-proof">Proof of Disbursement (Optional)</Label>
              <div className="mt-1 overflow-hidden">
                <Input
                  id="disburse-proof"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setDisbursementProofFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Upload bank transfer slip or other proof. You can also upload this later.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisburseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDisburse} disabled={actionLoading === "disburse"}>
              <Banknote className="h-4 w-4 mr-2" />
              {actionLoading === "disburse" ? "Disbursing..." : "Confirm Disbursement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => { setShowPaymentDialog(open); if (!open) resetPaymentDialog(); }}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {currentSchedule && (() => {
                const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== "PAID");
                if (unpaidRepayments.length === 0) return "All payments completed";
                
                const totalOutstanding = unpaidRepayments.reduce((sum, r) => {
                  const p = r.allocations.reduce((s, a) => s + toSafeNumber(a.amount), 0);
                  return safeAdd(sum, safeSubtract(toSafeNumber(r.totalDue), p));
                }, 0);
                
                return `Total Outstanding: ${formatCurrency(totalOutstanding)} • Payments will be allocated chronologically`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment-amount">Amount (RM) *</Label>
                <NumericInput
                  id="payment-amount"
                  mode="float"
                  value={paymentAmount}
                  onChange={setPaymentAmount}
                  placeholder="Enter payment amount"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Prepayments will automatically apply to future installments
                </p>
              </div>
              <div>
                <Label htmlFor="payment-date">Payment Date *</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="payment-reference">Reference</Label>
              <Input
                id="payment-reference"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Transaction reference (optional)"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="payment-notes">Notes</Label>
              <Textarea
                id="payment-notes"
                value={paymentNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPaymentNotes(e.target.value)}
                placeholder="Additional notes (optional)"
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="min-w-0 overflow-hidden">
              <Label htmlFor="payment-receipt">Bank Slip (Optional)</Label>
              <div className="mt-1 overflow-hidden">
                <Input
                  id="payment-receipt"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Upload proof of payment for record keeping
              </p>
            </div>
            {currentSchedule && (() => {
              const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== "PAID");
              const hasOverdue = unpaidRepayments.some(r => new Date(r.dueDate) < new Date());
              if (!hasOverdue) return null;
              
              return (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="apply-late-fee"
                    checked={applyLateFee}
                    onChange={(e) => setApplyLateFee(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="apply-late-fee" className="text-sm">
                    Apply late fees (one or more payments are overdue)
                  </Label>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPaymentDialog(false); resetPaymentDialog(); }}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={actionLoading === "payment"}>
              <Check className="h-4 w-4 mr-2" />
              {actionLoading === "payment" ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Loan Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete & Discharge Loan</DialogTitle>
            <DialogDescription>
              Confirm that all payments have been received and complete this loan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="font-medium">All Repayments Complete</span>
              </div>
              <p className="text-sm text-muted-foreground">
                This loan has {currentSchedule?.repayments.length || 0} repayments, all marked as paid.
              </p>
            </div>
            <div>
              <Label htmlFor="discharge-notes">Discharge Notes (Optional)</Label>
              <Textarea
                id="discharge-notes"
                value={dischargeNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDischargeNotes(e.target.value)}
                placeholder="Any notes about the loan completion..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={actionLoading === "complete"} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              {actionLoading === "complete" ? "Completing..." : "Complete Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Early Settlement Dialog */}
      <Dialog open={showEarlySettlementDialog} onOpenChange={setShowEarlySettlementDialog}>
        <DialogContent className="sm:max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>Early Settlement</DialogTitle>
            <DialogDescription>
              Settle the remaining loan balance with a discount on future interest.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {settlementLoading && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Calculating settlement...</span>
              </div>
            )}

            {settlementQuote && !settlementQuote.eligible && (
              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="font-medium">Not Eligible</span>
                </div>
                {settlementQuote.lockInEndDate ? (
                  <p className="text-sm text-muted-foreground">
                    Loan is in lock-in period. Eligible from: <span className="font-medium text-foreground">{formatDate(settlementQuote.lockInEndDate)}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{settlementQuote.reason}</p>
                )}
              </div>
            )}

            {settlementQuote && settlementQuote.eligible && (
              <>
                {/* Settlement Breakdown */}
                <div className="space-y-2 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <h4 className="text-sm font-medium mb-3">Settlement Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remaining Principal</span>
                      <span className="font-medium">{formatCurrency(settlementQuote.remainingPrincipal ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remaining Interest</span>
                      <span className="font-medium">{formatCurrency(settlementQuote.remainingInterest ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>
                        Discount ({settlementQuote.discountType === "PERCENTAGE" 
                          ? `${settlementQuote.discountValue}% of future interest` 
                          : `RM ${settlementQuote.discountValue} flat`})
                      </span>
                      <span className="font-medium">- {formatCurrency(settlementQuote.discountAmount ?? 0)}</span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{formatCurrency(settlementQuote.totalWithoutLateFees ?? 0)}</span>
                    </div>
                    {(settlementQuote.outstandingLateFees ?? 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className={`text-muted-foreground ${settlementWaiveLateFees ? "line-through" : ""}`}>
                            Outstanding Late Fees
                          </span>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settlementWaiveLateFees}
                              onChange={(e) => setSettlementWaiveLateFees(e.target.checked)}
                              className="rounded"
                            />
                            Waive
                          </label>
                        </div>
                        <span className={`font-medium ${settlementWaiveLateFees ? "line-through text-muted-foreground" : ""}`}>
                          {formatCurrency(settlementQuote.outstandingLateFees ?? 0)}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-border pt-2 flex justify-between text-base font-semibold">
                      <span>Total Settlement</span>
                      <span>
                        {formatCurrency(
                          settlementWaiveLateFees
                            ? (settlementQuote.totalWithoutLateFees ?? 0)
                            : (settlementQuote.totalSettlement ?? 0)
                        )}
                      </span>
                    </div>
                    {(settlementQuote.totalSavings ?? 0) > 0 && (
                      <div className="flex justify-between text-emerald-600 text-xs">
                        <span>Total Savings</span>
                        <span className="font-medium">{formatCurrency(settlementQuote.totalSavings ?? 0)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {settlementQuote.unpaidInstallments} remaining installment{(settlementQuote.unpaidInstallments ?? 0) !== 1 ? "s" : ""} will be cancelled
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full text-xs gap-1.5"
                    onClick={() => {
                      const q = settlementQuote;
                      const total = settlementWaiveLateFees
                        ? (q.totalWithoutLateFees ?? 0)
                        : (q.totalSettlement ?? 0);
                      const discountDesc = q.discountType === "PERCENTAGE"
                        ? `${q.discountValue}% of future interest`
                        : `RM ${q.discountValue} flat`;
                      let msg = `*Early Settlement Offer*\nLoan: ${loan?.id.substring(0, 12)}\n\nRemaining Principal: ${formatCurrency(q.remainingPrincipal ?? 0)}\nRemaining Interest: ${formatCurrency(q.remainingInterest ?? 0)}\nDiscount (${discountDesc}): -${formatCurrency(q.discountAmount ?? 0)}`;
                      if ((q.outstandingLateFees ?? 0) > 0) {
                        msg += settlementWaiveLateFees
                          ? `\nLate Fees: Waived`
                          : `\nLate Fees: ${formatCurrency(q.outstandingLateFees ?? 0)}`;
                      }
                      msg += `\n\n*Total: ${formatCurrency(total)}*`;
                      if ((q.totalSavings ?? 0) > 0) {
                        msg += `\nYou save: ${formatCurrency(q.totalSavings ?? 0)}`;
                      }
                      navigator.clipboard.writeText(msg);
                      toast.success("Copied to clipboard");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy for WhatsApp
                  </Button>
                </div>

                {/* Admin Fields */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="settlement-date">Payment Date *</Label>
                    <Input
                      id="settlement-date"
                      type="date"
                      value={settlementPaymentDate}
                      onChange={(e) => setSettlementPaymentDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settlement-reference">Reference</Label>
                    <Input
                      id="settlement-reference"
                      value={settlementReference}
                      onChange={(e) => setSettlementReference(e.target.value)}
                      placeholder="Payment reference (optional)"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settlement-notes">Notes</Label>
                    <Textarea
                      id="settlement-notes"
                      value={settlementNotes}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSettlementNotes(e.target.value)}
                      placeholder="Settlement notes (optional)"
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <Label htmlFor="settlement-proof">Proof of Payment (Optional)</Label>
                    <div className="mt-1 overflow-hidden">
                      <Input
                        id="settlement-proof"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => setSettlementProofFile(e.target.files?.[0] || null)}
                        className="w-full"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Bank slip, transfer receipt, or screenshot</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEarlySettlementDialog(false)}>
              Cancel
            </Button>
            {settlementQuote?.eligible && (
              <Button
                onClick={handleConfirmEarlySettlement}
                disabled={actionLoading === "settlement"}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {actionLoading === "settlement" ? "Processing..." : "Confirm Settlement"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Default Dialog */}
      <Dialog open={showDefaultDialog} onOpenChange={setShowDefaultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Loan as Defaulted</DialogTitle>
            <DialogDescription>
              This action will mark the loan as defaulted. This should only be used for loans that are severely delinquent.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="font-medium text-destructive">Warning</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Defaulting a loan is a serious action. The borrower will be marked as having a defaulted loan.
              </p>
            </div>
            <div>
              <Label htmlFor="default-reason">Reason for Default</Label>
              <Textarea
                id="default-reason"
                value={defaultReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDefaultReason(e.target.value)}
                placeholder="Explain why this loan is being marked as defaulted..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDefaultDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMarkDefault} disabled={actionLoading === "default"}>
              <XCircle className="h-4 w-4 mr-2" />
              {actionLoading === "default" ? "Processing..." : "Mark as Defaulted"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Arrears Letter Confirmation Dialog */}
      <Dialog open={showGenerateArrearsLetterDialog} onOpenChange={setShowGenerateArrearsLetterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {loan.arrearsLetterPath ? "Regenerate Arrears Letter" : "Generate Arrears Letter"}
            </DialogTitle>
            <DialogDescription>
              A new arrears notice will be generated with the latest outstanding amounts and late fees.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    {loan.arrearsLetterPath
                      ? "This will generate a new arrears letter. The previous letter will be kept on record."
                      : "This will generate an arrears notice letter for this loan."}
                  </p>
                  <p className="text-muted-foreground">
                    The letter will include all currently overdue repayments and accrued late fees as of today.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <TrueSendBadge showTooltip={false} />
                  <p>
                    If your company has subscribed to the{" "}
                    <Link href="/dashboard/settings" className="inline-flex items-center gap-1 font-medium text-foreground underline hover:text-muted-foreground">
                      TrueSend
                      <ExternalLink className="h-3 w-3" />
                    </Link>{" "}
                    add-on, this letter will also be sent via email to the borrower automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateArrearsLetterDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateArrearsLetter} disabled={generatingArrearsLetter}>
              <FileText className="h-4 w-4 mr-2" />
              {generatingArrearsLetter ? "Generating..." : "Generate Letter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Default Letter Confirmation Dialog */}
      <Dialog open={showGenerateDefaultLetterDialog} onOpenChange={setShowGenerateDefaultLetterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {loan.defaultLetterPath ? "Regenerate Default Letter" : "Generate Default Letter"}
            </DialogTitle>
            <DialogDescription>
              A new default notice will be generated with the latest outstanding amounts and late fees.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-destructive">
                    {loan.defaultLetterPath
                      ? "This will generate a new default notice. The previous letter will be kept on record."
                      : "This will generate a formal default notice letter for this loan."}
                  </p>
                  <p className="text-muted-foreground">
                    The letter will include all currently outstanding repayments, accrued late fees, and consequences of default as of today.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <TrueSendBadge showTooltip={false} />
                  <p>
                    If your company has subscribed to the{" "}
                    <Link href="/dashboard/settings" className="inline-flex items-center gap-1 font-medium text-foreground underline hover:text-muted-foreground">
                      TrueSend
                      <ExternalLink className="h-3 w-3" />
                    </Link>{" "}
                    add-on, this letter will also be sent via email to the borrower automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDefaultLetterDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleGenerateDefaultLetter} disabled={generatingDefaultLetter}>
              <FileText className="h-4 w-4 mr-2" />
              {generatingDefaultLetter ? "Generating..." : "Generate Letter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Proof of Payment Dialog */}
      <Dialog open={showUploadProofDialog} onOpenChange={(open) => {
        setShowUploadProofDialog(open);
        if (!open) {
          setSelectedTransactionId(null);
          setProofFile(null);
        }
      }}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Upload Proof of Payment</DialogTitle>
            <DialogDescription>
              Upload a bank slip or other proof of payment for this transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 min-w-0 overflow-hidden">
            <div className="min-w-0 overflow-hidden">
              <Label htmlFor="proof-file">Select File *</Label>
              <div className="mt-1 overflow-hidden">
                <Input
                  id="proof-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Accepted formats: PDF, JPEG, PNG, WebP
              </p>
            </div>
            {proofFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 min-w-0 overflow-hidden w-full">
                <p className="text-sm font-medium truncate block w-full" title={proofFile.name}>{proofFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(proofFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUploadProofDialog(false);
              setSelectedTransactionId(null);
              setProofFile(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUploadProof} disabled={uploadingProof || !proofFile}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadingProof ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Disbursement Proof Dialog */}
      <Dialog open={showUploadDisbursementProofDialog} onOpenChange={(open) => {
        setShowUploadDisbursementProofDialog(open);
        if (!open) {
          setDisbursementProofUploadFile(null);
        }
      }}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Upload Proof of Disbursement</DialogTitle>
            <DialogDescription>
              Upload a bank transfer slip or other proof that the loan was disbursed.
              {loan.disbursementReference && (
                <span className="block mt-1">
                  Reference: <span className="font-mono">{loan.disbursementReference}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 min-w-0 overflow-hidden">
            <div className="min-w-0 overflow-hidden">
              <Label htmlFor="disbursement-proof-file">Select File *</Label>
              <div className="mt-1 overflow-hidden">
                <Input
                  id="disbursement-proof-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setDisbursementProofUploadFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Accepted formats: PDF, JPEG, PNG, WebP
              </p>
            </div>
            {disbursementProofUploadFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 min-w-0 overflow-hidden w-full">
                <p className="text-sm font-medium truncate block w-full" title={disbursementProofUploadFile.name}>{disbursementProofUploadFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(disbursementProofUploadFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
            {loan.disbursementProofPath && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Note: This will replace the existing proof of disbursement.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUploadDisbursementProofDialog(false);
              setDisbursementProofUploadFile(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUploadDisbursementProof} disabled={uploadingDisbursementProof || !disbursementProofUploadFile}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadingDisbursementProof ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Loan Agreement Dialog */}
      <Dialog open={showUploadAgreementDialog} onOpenChange={(open) => {
        setShowUploadAgreementDialog(open);
        if (!open) {
          setAgreementFile(null);
        }
      }}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Upload Signed Loan Agreement</DialogTitle>
            <DialogDescription>
              Upload the signed loan agreement PDF. You can upload it before or after disbursement.
              {loan.agreementPath && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Note: This will replace the existing agreement (v{loan.agreementVersion}).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 min-w-0 overflow-hidden">
            <div className="min-w-0 overflow-hidden">
              <Label htmlFor="agreement-file">Select File *</Label>
              <div className="mt-1 overflow-hidden">
                <Input
                  id="agreement-file"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setAgreementFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Only PDF files are accepted
              </p>
            </div>
            {agreementFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 min-w-0 overflow-hidden w-full">
                <p className="text-sm font-medium truncate block w-full" title={agreementFile.name}>{agreementFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(agreementFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                Ensure all parties have signed the agreement before uploading.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUploadAgreementDialog(false);
              setAgreementFile(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUploadAgreement} disabled={uploadingAgreement || !agreementFile}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadingAgreement ? "Uploading..." : "Upload Agreement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Signed Guarantor Agreement Dialog */}
      <Dialog
        open={showUploadGuarantorAgreementDialog}
        onOpenChange={(open) => {
          setShowUploadGuarantorAgreementDialog(open);
          if (!open) {
            setGuarantorAgreementFile(null);
            setSelectedGuarantorId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Signed Guarantor Agreement</DialogTitle>
            <DialogDescription>
              Upload the signed guarantor agreement PDF.
              {selectedGuarantorId && (() => {
                const guarantor = (loan.guarantors || []).find((item) => item.id === selectedGuarantorId);
                if (!guarantor) return null;
                const guarantorDisplayName =
                  guarantor.borrowerType === "CORPORATE" && guarantor.companyName
                    ? guarantor.companyName
                    : guarantor.name;
                return (
                  <span className="block mt-1">
                    Guarantor: <span className="font-medium">{guarantorDisplayName}</span>
                    {guarantor.agreementPath && (
                      <span className="block mt-1 text-amber-600 dark:text-amber-400">
                        Note: This will replace the existing signed file (v{guarantor.agreementVersion}).
                      </span>
                    )}
                  </span>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="guarantor-agreement-file">Select PDF File *</Label>
              <Input
                id="guarantor-agreement-file"
                type="file"
                accept=".pdf"
                onChange={(e) => setGuarantorAgreementFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              {guarantorAgreementFile && (
                <p className="text-xs text-muted-foreground mt-2">
                  Selected: {guarantorAgreementFile.name} ({(guarantorAgreementFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadGuarantorAgreementDialog(false);
                setGuarantorAgreementFile(null);
                setSelectedGuarantorId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUploadGuarantorAgreement} disabled={uploadingGuarantorAgreement || !guarantorAgreementFile}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadingGuarantorAgreement ? "Uploading..." : "Upload Signed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject borrower signed agreement */}
      <Dialog
        open={showRejectSignedAgreementDialog}
        onOpenChange={(open) => {
          setShowRejectSignedAgreementDialog(open);
          if (!open) setRejectSignedAgreementNotes("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject signed agreement</DialogTitle>
            <DialogDescription>
              The borrower can upload a replacement. Optional notes may be shown on their loan screen.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-signed-agreement-notes">Notes (optional)</Label>
            <Textarea
              id="reject-signed-agreement-notes"
              value={rejectSignedAgreementNotes}
              onChange={(e) => setRejectSignedAgreementNotes(e.target.value)}
              className="mt-1"
              rows={4}
              placeholder="e.g. Signature missing on page 2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectSignedAgreementDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRejectSignedAgreement()}
              disabled={approvingSignedAgreement}
            >
              {approvingSignedAgreement ? "Rejecting..." : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Agreement PDF Dialog */}
      <Dialog open={showGenerateAgreementDialog} onOpenChange={(open) => {
        setShowGenerateAgreementDialog(open);
        setAgreementDate(
          open
            ? (loan.agreementDate
              ? formatDateForInput(loan.agreementDate)
              : formatDateForInput(new Date()))
            : ""
        );
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Loan Agreement PDF</DialogTitle>
            <DialogDescription>
              Enter the agreement date to generate the pre-filled loan agreement. This fixed date will be used to calculate the repayment schedule during disbursement.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="agreement-date-input">Agreement Date *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="agreement-date-input"
                  type="date"
                  value={agreementDate}
                  onChange={(e) => setAgreementDate(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 shrink-0"
                  onClick={() => setAgreementDate(formatDateForInput(new Date()))}
                >
                  Today
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                The first repayment will be due one month after this date. This date will be saved and used for the repayment schedule upon disbursement.
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Important:</strong> The repayment schedule will be based on this agreement date, regardless of when the actual disbursement occurs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowGenerateAgreementDialog(false);
              setAgreementDate("");
            }}>
              Cancel
            </Button>
            <Button onClick={handleGenerateAgreement} disabled={generatingAgreement || !agreementDate}>
              <Download className="h-4 w-4 mr-2" />
              {generatingAgreement ? "Generating..." : "Generate PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Stamp Certificate Dialog */}
      <Dialog open={showUploadStampCertDialog} onOpenChange={(open) => {
        setShowUploadStampCertDialog(open);
        if (!open) {
          setStampCertFile(null);
        }
      }}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Upload Stamp Certificate</DialogTitle>
            <DialogDescription>
              Upload the stamp certificate PDF from LHDN. You can upload it before or after disbursement.
              {loan.stampCertPath && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Note: This will replace the existing stamp certificate (v{loan.stampCertVersion}).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 min-w-0 overflow-hidden">
            <div className="min-w-0 overflow-hidden">
              <Label htmlFor="stamp-cert-file">Select File *</Label>
              <div className="mt-1 overflow-hidden">
                <Input
                  id="stamp-cert-file"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setStampCertFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Only PDF files are accepted
              </p>
            </div>
            {stampCertFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 min-w-0 overflow-hidden w-full">
                <p className="text-sm font-medium truncate block w-full" title={stampCertFile.name}>{stampCertFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(stampCertFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                Get your stamp certificate from the{" "}
                <a
                  href="https://stamps.hasil.gov.my/stamps/?isStampsSite=true&lang=ms&refererUrl=https%3A%2F%2Fstamps.hasil.gov.my%2Fstamps%2F"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  LHDN Stamp Portal
                </a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUploadStampCertDialog(false);
              setStampCertFile(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleUploadStampCert} disabled={uploadingStampCert || !stampCertFile}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadingStampCert ? "Uploading..." : "Upload Certificate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
