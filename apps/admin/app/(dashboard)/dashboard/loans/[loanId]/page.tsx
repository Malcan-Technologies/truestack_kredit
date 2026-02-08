"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  Check,
  X,
  User,
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
  XCircle,
  RefreshCw,
  Download,
  Receipt,
  MoreHorizontal,
  FileCheck,
  Copy,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { CopyField } from "@/components/ui/copy-field";
import { api } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  toSafeNumber,
  safeMultiply,
  safeDivide,
  safeAdd,
  safeSubtract,
  safePercentage,
} from "@/lib/utils";

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
  disbursementDate: string | null;
  disbursementReference: string | null;
  disbursementProofPath: string | null;
  disbursementProofName: string | null;
  completedAt: string | null;
  dischargeNotes: string | null;
  dischargeLetterPath: string | null;
  totalLateFees: string;
  repaymentRate: string | null;
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
  };
  application: {
    id: string;
    status: string;
  };
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
// Status Colors
// ============================================

const loanStatusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING_DISBURSEMENT: "warning",
  ACTIVE: "info",
  IN_ARREARS: "warning",
  COMPLETED: "success",
  DEFAULTED: "destructive",
  WRITTEN_OFF: "destructive",
};

const repaymentStatusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "secondary" as "default",
  PARTIAL: "warning",
  PAID: "success",
  OVERDUE: "destructive",
};

// ============================================
// Progress Donut (for Progress card)
// ============================================

function ProgressDonut({
  percent,
  size = 80,
  strokeWidth = 8,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;

  let strokeColor = "stroke-primary";
  if (percent === 100) {
    strokeColor = "stroke-emerald-500";
  } else if (percent >= 75) {
    strokeColor = "stroke-blue-500";
  } else if (percent >= 50) {
    strokeColor = "stroke-amber-500";
  } else if (percent > 0) {
    strokeColor = "stroke-orange-500";
  }

  return (
    <div className="relative inline-flex items-center justify-center mt-2">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
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

function TimelineItem({ event }: { event: TimelineEvent }) {
  const getActionInfo = (action: string) => {
    switch (action) {
      case "DISBURSE":
        return { icon: Banknote, label: "Disbursed", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
      case "RECORD_PAYMENT":
        return { icon: CreditCard, label: "Payment Recorded", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" };
      case "UPLOAD_PROOF_OF_PAYMENT":
        return { icon: Upload, label: "Proof of Payment Uploaded", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" };
      case "DELETE_PROOF_OF_PAYMENT":
        return { icon: Trash2, label: "Proof of Payment Deleted", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" };
      // Legacy action names for backwards compatibility
      case "UPLOAD_RECEIPT":
        return { icon: Upload, label: "Proof of Payment Uploaded", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" };
      case "DELETE_RECEIPT":
        return { icon: Trash2, label: "Proof of Payment Deleted", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" };
      case "STATUS_UPDATE":
        return { icon: RefreshCw, label: "Status Updated", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" };
      case "COMPLETE":
        return { icon: CheckCircle, label: "Completed", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
      case "MARK_DEFAULT":
        return { icon: XCircle, label: "Marked Default", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" };
      case "UPLOAD_DISBURSEMENT_PROOF":
        return { icon: Upload, label: "Disbursement Proof Uploaded", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
      case "UPLOAD_AGREEMENT":
        return { icon: FileText, label: "Agreement Uploaded", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" };
      case "UPLOAD_STAMP_CERTIFICATE":
        return { icon: Shield, label: "Stamp Certificate Uploaded", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" };
      case "CREATE":
        return { icon: Plus, label: "Loan Created", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
      case "LATE_FEE_ACCRUAL":
        return { icon: AlertTriangle, label: "Late Fees Charged", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" };
      case "DEFAULT_READY":
        return { icon: AlertTriangle, label: "Default Ready", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" };
      case "LATE_FEE_PROCESSING":
        return { icon: RefreshCw, label: "Late Fee Processing", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" };
      default:
        return { icon: Clock, label: action, color: "text-muted-foreground", bg: "bg-muted" };
    }
  };

  const actionInfo = getActionInfo(event.action);
  const Icon = actionInfo.icon;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full ${actionInfo.bg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${actionInfo.color}`} />
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-medium ${actionInfo.color}`}>{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        {event.user && (
          <p className="text-sm text-muted-foreground mb-2">
            by {event.user.name || event.user.email}
          </p>
        )}
        {event.newData && event.action === "RECORD_PAYMENT" && (() => {
          const data = event.newData as Record<string, unknown>;
          // Support both legacy (amount) and new (totalAmount) field names
          const amount = data.totalAmount ?? data.amount;
          const lateFee = data.totalLateFeesPaid ?? data.totalLateFees ?? data.lateFee;
          return (
            <div className="bg-slate-50 dark:bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Amount: <span className="font-medium text-foreground">
                  {formatCurrency(toSafeNumber(amount as number))}
                </span>
                {lateFee && toSafeNumber(lateFee as number) > 0 ? (
                  <span className="ml-2 text-amber-600">
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
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Fee charged: <span className="font-medium text-amber-600">
                  {formatCurrency(toSafeNumber(data.totalFeeCharged as number))}
                </span>
                <span className="ml-2">({data.repaymentsAffected as number} repayment{(data.repaymentsAffected as number) !== 1 ? "s" : ""})</span>
              </p>
            </div>
          );
        })()}
        {event.newData && event.action === "DEFAULT_READY" && (() => {
          const data = event.newData as Record<string, unknown>;
          return (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Days overdue: <span className="font-medium text-red-600">{data.daysOverdue as number}</span>
                <span className="ml-2">(default period: {data.defaultPeriod as number} days)</span>
              </p>
            </div>
          );
        })()}
        <p className="text-[10px] text-muted-foreground mt-2">
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

  // State
  const [loan, setLoan] = useState<Loan | null>(null);
  const [metrics, setMetrics] = useState<LoanMetrics | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialog states
  const [showDisburseDialog, setShowDisburseDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDefaultDialog, setShowDefaultDialog] = useState(false);

  // Payment dialog state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [applyLateFee, setApplyLateFee] = useState(true);

  // Complete dialog state
  const [dischargeNotes, setDischargeNotes] = useState("");

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
  
  // Generate agreement dialog state
  const [showGenerateAgreementDialog, setShowGenerateAgreementDialog] = useState(false);
  const [agreementDate, setAgreementDate] = useState<string>("");
  const [generatingAgreement, setGeneratingAgreement] = useState(false);

  // ============================================
  // Data Fetching
  // ============================================

  const fetchLoan = useCallback(async () => {
    const res = await api.get<Loan>(`/api/loans/${loanId}`);
    if (res.success && res.data) {
      setLoan(res.data);
    }
  }, [loanId]);

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
      await Promise.all([fetchLoan(), fetchTimeline()]);
      setLoading(false);
    };
    loadData();
  }, [fetchLoan, fetchTimeline]);

  // Fetch metrics when loan is loaded and has a schedule
  useEffect(() => {
    if (loan && loan.status !== "PENDING_DISBURSEMENT") {
      fetchMetrics();
    }
  }, [loan, fetchMetrics]);

  // Fetch schedule preview when loan is pending disbursement
  useEffect(() => {
    if (loan && loan.status === "PENDING_DISBURSEMENT") {
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
        setShowDisburseDialog(false);
        setDisbursementReference("");
        setDisbursementProofFile(null);
        await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]);
      } else {
        toast.error(res.error || "Failed to disburse loan");
      }
    } catch {
      toast.error("Failed to disburse loan");
    }
    
    setActionLoading(null);
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setActionLoading("payment");

    // Record payment at the loan level - backend handles allocation and spillover
    const paymentRes = await api.post(`/api/schedules/loan/${loanId}/payments`, {
      amount,
      reference: paymentReference || undefined,
      notes: paymentNotes || undefined,
      applyLateFee,
      paymentDate: new Date(paymentDate).toISOString(),
    });

    if (!paymentRes.success) {
      toast.error(paymentRes.error || "Failed to record payment");
      setActionLoading(null);
      return;
    }

    // If there's a file, upload it for the transaction
    if (paymentFile && paymentRes.data) {
      const transaction = (paymentRes.data as { transaction: { id: string } }).transaction;
      if (transaction?.id) {
        const formData = new FormData();
        formData.append("file", paymentFile);

        try {
          const uploadRes = await fetch(`/api/proxy/schedules/transactions/${transaction.id}/proof`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          const uploadJson = await uploadRes.json();
          if (!uploadJson.success) {
            toast.warning("Payment recorded but failed to upload proof of payment");
          }
        } catch {
          toast.warning("Payment recorded but failed to upload proof of payment");
        }
      }
    }

    // Show allocation breakdown in success message
    const data = paymentRes.data as { allocationBreakdown?: { repaymentId: string; amount: number }[] };
    if (data.allocationBreakdown && data.allocationBreakdown.length > 1) {
      toast.success(`Payment recorded and allocated across ${data.allocationBreakdown.length} installments`);
    } else {
      toast.success("Payment recorded successfully");
    }

    setShowPaymentDialog(false);
    resetPaymentDialog();
    await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]);
    setActionLoading(null);
  };

  const handleComplete = async () => {
    setActionLoading("complete");
    const res = await api.post(`/api/loans/${loanId}/complete`, {
      notes: dischargeNotes || undefined,
    });
    if (res.success) {
      toast.success("Loan completed and discharged successfully");
      setShowCompleteDialog(false);
      setDischargeNotes("");
      await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]);
    } else {
      toast.error(res.error || "Failed to complete loan");
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
      setShowDefaultDialog(false);
      setDefaultReason("");
      await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]);
    } else {
      toast.error(res.error || "Failed to mark loan as defaulted");
    }
    setActionLoading(null);
  };

  const handleUpdateStatus = async () => {
    setActionLoading("status");
    const res = await api.post(`/api/loans/${loanId}/update-status`, {});
    if (res.success) {
      const data = res.data as { statusChanged: boolean; newStatus: string };
      if (data.statusChanged) {
        toast.success(`Loan status updated to ${data.newStatus.replace(/_/g, " ")}`);
      } else {
        toast.info("Loan status unchanged");
      }
      await Promise.all([fetchLoan(), fetchMetrics(), fetchTimeline()]);
    } else {
      toast.error(res.error || "Failed to update status");
    }
    setActionLoading(null);
  };

  const openPaymentDialog = () => {
    // Calculate next payment due amount (for the first unpaid/partial repayment)
    if (currentSchedule) {
      const unpaidRepayments = currentSchedule.repayments.filter(r => r.status !== "PAID");
      if (unpaidRepayments.length > 0) {
        const nextRepayment = unpaidRepayments[0];
        const paid = nextRepayment.allocations.reduce((sum, a) => sum + toSafeNumber(a.amount), 0);
        const remaining = safeSubtract(toSafeNumber(nextRepayment.totalDue), paid);
        setPaymentAmount(remaining.toFixed(2));
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
        await Promise.all([fetchLoan(), fetchTimeline()]);
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
        await Promise.all([fetchLoan(), fetchTimeline()]);
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
      setShowGenerateAgreementDialog(false);
    } catch {
      toast.error("Failed to generate agreement PDF");
    } finally {
      setGeneratingAgreement(false);
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
        toast.success("Signed agreement uploaded successfully");
        setShowUploadAgreementDialog(false);
        setAgreementFile(null);
        await Promise.all([fetchLoan(), fetchTimeline()]);
      } else {
        toast.error(result.error || "Failed to upload signed agreement");
      }
    } catch {
      toast.error("Failed to upload signed agreement");
    }
    setUploadingAgreement(false);
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
        await Promise.all([fetchLoan(), fetchTimeline()]);
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
  const isCorporate = loan.borrower.borrowerType === "CORPORATE";
  const borrowerDisplayName = isCorporate && loan.borrower.companyName
    ? loan.borrower.companyName
    : loan.borrower.name;

  // Check if all repayments are paid
  const allRepaymentsPaid = currentSchedule?.repayments.every(r => r.status === "PAID") ?? false;
  const canComplete = (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && allRepaymentsPaid;

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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-gradient">Loan</h1>
              <Badge variant={loanStatusColors[loan.status]} className="flex items-center gap-1">
                {getStatusIcon(loan.status)}
                {loan.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {borrowerDisplayName} • {loan.product.name}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {loan.status === "PENDING_DISBURSEMENT" && (
            <Button 
              onClick={() => {
                // Initialize reference when opening dialog
                setDisbursementReference(generateDisbursementReference());
                setShowDisburseDialog(true);
              }}
              disabled={!loan.agreementPath || !loan.stampCertPath}
              title={
                !loan.agreementPath 
                  ? "Upload a signed loan agreement before disbursement" 
                  : !loan.stampCertPath 
                    ? "Upload a stamp certificate before disbursement"
                    : undefined
              }
            >
              <Banknote className="h-4 w-4 mr-2" />
              Disburse Loan
            </Button>
          )}
          {(loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && (
            <>
              <Button
                variant="outline"
                onClick={handleUpdateStatus}
                disabled={actionLoading === "status"}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${actionLoading === "status" ? "animate-spin" : ""}`} />
                Check Status
              </Button>
              {canComplete && (
                <Button onClick={() => setShowCompleteDialog(true)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete Loan
                </Button>
              )}
              <Button variant="destructive" onClick={() => setShowDefaultDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                Mark Default
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Borrower Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {isCorporate ? (
                      <Building2 className="h-4 w-4 text-accent" />
                    ) : (
                      <User className="h-4 w-4 text-accent" />
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
                    className="font-medium hover:text-primary hover:underline transition-colors inline-flex items-center gap-1.5"
                  >
                    {borrowerDisplayName}
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                  {isCorporate && loan.borrower.companyName && (
                    <p className="text-sm text-muted-foreground">Rep: {loan.borrower.name}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {loan.borrower.documentVerified ? (
                      <Badge variant="verified" className="text-xs">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        e-KYC
                      </Badge>
                    ) : (
                      <Badge variant="unverified" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Manual Verification
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <CopyField 
                    label={isCorporate ? "SSM" : (loan.borrower.documentType === "IC" ? "IC Number" : "Passport")}
                    value={loan.borrower.icNumber}
                  />
                  {loan.borrower.phone && (
                    <CopyField label="Phone" value={loan.borrower.phone} />
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
                </div>
              </CardContent>
            </Card>

            {/* Loan Details Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-accent" />
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
                        <div>
                          <p className="text-xs text-muted-foreground">Agreement Date</p>
                          <p className="text-sm font-medium">{formatDate(loan.agreementDate)}</p>
                        </div>
                      )}
                      {loan.disbursementReference && (
                        <CopyField
                          label="Reference"
                          value={loan.disbursementReference}
                        />
                      )}
                      <div className="flex items-center gap-2">
                        {loan.disbursementProofPath ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => window.open(`/api/proxy/loans/${loan.id}/disbursement-proof`, "_blank")}
                            >
                              <FileCheck className="h-3 w-3 mr-1" />
                              View Proof
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => setShowUploadDisbursementProofDialog(true)}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Replace
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-500 dark:hover:bg-amber-900/20"
                            onClick={() => setShowUploadDisbursementProofDialog(true)}
                          >
                            <Upload className="h-3 w-3 mr-1" />
                            Upload Proof
                          </Button>
                        )}
                      </div>
                      
                      {/* Loan Documents */}
                      <div className="border-t pt-3 mt-3">
                        <p className="text-xs text-muted-foreground mb-2">Loan Documents</p>
                        <div className="flex flex-wrap gap-2">
                          {loan.agreementPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => window.open(`/api/proxy/loans/${loan.id}/agreement`, "_blank")}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Agreement
                            </Button>
                          )}
                          {loan.stampCertPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => window.open(`/api/proxy/loans/${loan.id}/stamp-certificate`, "_blank")}
                            >
                              <Shield className="h-3 w-3 mr-1" />
                              Stamp Cert
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Progress Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-accent" />
                  {loan.status === "PENDING_DISBURSEMENT" ? "Status" : "Progress"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loan.status === "PENDING_DISBURSEMENT" ? (
                  <>
                    <p className="text-lg font-medium text-amber-600">Pending</p>
                    <p className="text-sm text-muted-foreground">
                      Awaiting disbursement
                    </p>
                  </>
                ) : metrics ? (
                  <>
                    <div className="flex items-center gap-4">
                      <ProgressDonut percent={metrics.progressPercent} />
                      <div>
                        <p className="text-2xl font-heading font-bold text-success">
                          {formatCurrency(metrics.totalPaid)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          of {formatCurrency(metrics.totalDue)}
                        </p>
                        {metrics.totalDue - metrics.totalPaid > 0 && (
                          <p className="text-sm mt-1">
                            <span className="text-muted-foreground">Outstanding: </span>
                            <span className="font-semibold">{formatCurrency(metrics.totalDue - metrics.totalPaid)}</span>
                          </p>
                        )}
                        {metrics.progressPercent >= 100 && (loan.status === "ACTIVE" || loan.status === "IN_ARREARS") && (
                          <Badge variant="success" className="mt-2 inline-flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Ready to complete
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4">
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-border px-4 py-3">
                        <p className="text-sm font-medium text-foreground">Paid</p>
                        <p className="text-xl font-heading font-bold text-success tabular-nums">{metrics.paidCount}</p>
                        <p className="text-xs text-muted-foreground">of {metrics.totalRepayments}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-border px-4 py-3">
                        <p className="text-sm font-medium text-foreground">Overdue</p>
                        <p className={`text-xl font-heading font-bold tabular-nums ${metrics.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {metrics.overdueCount}
                        </p>
                        {metrics.oldestOverdueDays > 0 ? (
                          <p className="text-xs text-destructive">{metrics.oldestOverdueDays} days</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">&nbsp;</p>
                        )}
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-border px-4 py-3">
                        <p className="text-sm font-medium text-foreground">Late Fees</p>
                        <p className={`text-xl font-heading font-bold tabular-nums ${metrics.totalLateFees > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {formatCurrency(metrics.totalLateFees)}
                        </p>
                        <p className="text-xs text-muted-foreground">&nbsp;</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-border px-4 py-3">
                        <p className="text-sm font-medium text-foreground">On-Time Rate</p>
                        <p className={`text-xl font-heading font-bold tabular-nums ${metrics.repaymentRate >= 80 ? "text-success" : metrics.repaymentRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                          {metrics.repaymentRate}%
                        </p>
                        <p className="text-xs text-muted-foreground">&nbsp;</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Loading...</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Loan Agreement Required (before disbursement) */}
          {loan.status === "PENDING_DISBURSEMENT" && (
            <Card className={loan.agreementPath ? "border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <FileText className={`h-8 w-8 ${loan.agreementPath ? "text-emerald-600" : "text-amber-600"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Loan Agreement</h3>
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
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loan.agreementPath
                        ? `Signed agreement uploaded on ${formatDate(loan.agreementUploadedAt || "")}${loan.agreementDate ? `. Agreement date: ${formatDate(loan.agreementDate)}` : ""}`
                        : "Generate and upload a signed loan agreement before disbursement."
                      }
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => setShowGenerateAgreementDialog(true)}>
                        <Download className="h-4 w-4 mr-2" />
                        Generate Agreement PDF
                      </Button>
                      {loan.agreementPath ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/proxy/loans/${loan.id}/agreement`, "_blank")}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Agreement
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowUploadAgreementDialog(true)}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Replace
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setShowUploadAgreementDialog(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Signed Agreement
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stamp Certificate Required (before disbursement) */}
          {loan.status === "PENDING_DISBURSEMENT" && (
            <Card className={loan.stampCertPath ? "border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Shield className={`h-8 w-8 ${loan.stampCertPath ? "text-emerald-600" : "text-amber-600"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Stamp Certificate</h3>
                      {loan.stampCertPath ? (
                        <Badge variant="verified" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Uploaded (v{loan.stampCertVersion})
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loan.stampCertPath
                        ? `Stamp certificate uploaded on ${formatDate(loan.stampCertUploadedAt || "")}`
                        : "Upload the stamp certificate from LHDN before disbursement."
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/proxy/loans/${loan.id}/stamp-certificate`, "_blank")}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Certificate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowUploadStampCertDialog(true)}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Replace
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setShowUploadStampCertDialog(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Stamp Certificate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schedule Preview (before disbursement) */}
          {loan.status === "PENDING_DISBURSEMENT" && schedulePreview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-accent" />
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
                        <h3 className="font-semibold text-success">Loan Completed</h3>
                        <p className="text-sm text-muted-foreground">
                          Completed on {loan.completedAt ? formatDate(loan.completedAt) : "N/A"}
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
                    {loan.repaymentRate && (
                      <p className="text-sm mt-2">
                        Repayment Rate: <span className="font-medium">{toSafeNumber(loan.repaymentRate)}%</span>
                      </p>
                    )}
                    {loan.dischargeNotes && (
                      <div className="mt-3 p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium">Discharge Notes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{loan.dischargeNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Defaulted Loan Info */}
          {loan.status === "DEFAULTED" && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <XCircle className="h-8 w-8 text-destructive" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-destructive">Loan Defaulted</h3>
                    <p className="text-sm text-muted-foreground">
                      This loan has been marked as defaulted
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Repayment Schedule (after disbursement) */}
          {currentSchedule && loan.status !== "PENDING_DISBURSEMENT" && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-accent" />
                      Repayment Schedule
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Version {currentSchedule.version} • {currentSchedule.interestModel.replace(/_/g, " ")}
                      {loan.disbursementDate && ` • Disbursed ${formatDate(loan.disbursementDate)}`}
                    </CardDescription>
                  </div>
                  {loan.status !== "COMPLETED" && loan.status !== "DEFAULTED" && loan.status !== "WRITTEN_OFF" && (() => {
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
                        <Button onClick={() => openPaymentDialog()} size="sm">
                          <CreditCard className="h-4 w-4 mr-2" />
                          Record Payment
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Legend */}
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
                      <TableHead className="text-right">Total Due</TableHead>
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
                      const remaining = safeSubtract(totalDue, paid);
                      const isOverdue = new Date(repayment.dueDate) < new Date() && repayment.status !== "PAID";
                      const lateFeeAccrued = toSafeNumber(repayment.lateFeeAccrued);
                      const lateFeesPaid = toSafeNumber(repayment.lateFeesPaid);
                      const hasLateFees = lateFeeAccrued > 0;

                      return (
                        <TableRow key={repayment.id} className={isOverdue ? "bg-destructive/5" : ""}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(repayment.dueDate)}
                              {isOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(toSafeNumber(repayment.principal))}</TableCell>
                          <TableCell className="text-right">{formatCurrency(toSafeNumber(repayment.interest))}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(totalDue)}</TableCell>
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
                            <div className="flex items-center justify-end gap-1">
                              <span className={paid > 0 ? "text-success" : ""}>
                                {formatCurrency(paid)}
                              </span>
                              {repayment.allocations.length > 0 && (
                                <>
                                  <span title="Has payment receipt">
                                    <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                                  </span>
                                  {repayment.allocations.some((a) => (a as { transaction?: { proofPath?: string } }).transaction?.proofPath) && (
                                    <span title="Has proof of payment">
                                      <FileCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isOverdue ? "destructive" : repaymentStatusColors[repayment.status]}>
                              {isOverdue && repayment.status !== "PAID" ? "OVERDUE" : repayment.status}
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
                                          {tx && (
                                            <DropdownMenuItem onClick={() => openUploadProofDialog(tx.id)}>
                                              <Upload className="h-4 w-4 mr-2" />
                                              {hasProof ? "Replace" : "Upload"} Proof of Payment
                                            </DropdownMenuItem>
                                          )}
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Quick Info & Timeline */}
        <div className="space-y-6">
          {/* Quick Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan ID</span>
                <span className="font-mono text-xs">{loan.id.slice(0, 12)}...</span>
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
              {(loan.arrearsLetterPath || loan.defaultLetterPath) && (
                <div className="pt-2 border-t space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Letters</span>
                  {loan.arrearsLetterPath && (
                    <button
                      onClick={() => window.open(`/api/proxy/loans/${loan.id}/arrears-letter`, "_blank")}
                      className="flex items-center gap-2 text-primary hover:underline text-xs"
                    >
                      <Download className="h-3 w-3" />
                      Arrears Notice
                    </button>
                  )}
                  {loan.defaultLetterPath && (
                    <button
                      onClick={() => window.open(`/api/proxy/loans/${loan.id}/default-letter`, "_blank")}
                      className="flex items-center gap-2 text-primary hover:underline text-xs"
                    >
                      <Download className="h-3 w-3" />
                      Default Notice
                    </button>
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
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  View Application
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent" />
                Activity Timeline
              </CardTitle>
              <CardDescription>History of changes and events</CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No activity recorded yet
                </p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                  {hasMoreTimeline && (
                    <div className="pt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchTimeline(timelineCursor || undefined, true)}
                        disabled={loadingMoreTimeline}
                      >
                        {loadingMoreTimeline ? "Loading..." : "Load More"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============================================ */}
      {/* Dialogs */}
      {/* ============================================ */}

      {/* Disburse Dialog */}
      <Dialog open={showDisburseDialog} onOpenChange={setShowDisburseDialog}>
        <DialogContent className="max-w-2xl">
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
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="font-medium mb-3 text-sm">Disbursement Bank Details</p>
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
            
            {/* Loan Details - Secondary */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Borrower</p>
                <p className="font-medium">{borrowerDisplayName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Product</p>
                <p className="font-medium">{loan.product.name}</p>
              </div>
            </div>
            
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
            
            <div>
              <Label htmlFor="disburse-proof">Proof of Disbursement (Optional)</Label>
              <Input
                id="disburse-proof"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setDisbursementProofFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Upload bank transfer slip or other proof. You can also upload this later.
              </p>
            </div>
            
            {/* Schedule Summary - Secondary */}
            {schedulePreview && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <p className="font-medium mb-2 text-sm">Repayment Schedule Summary</p>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Principal</p>
                    <p className="font-medium">{formatCurrency(toSafeNumber(loan.principalAmount))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Interest</p>
                    <p className="font-medium">{formatCurrency(schedulePreview.totalInterest)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Payable</p>
                    <p className="font-medium">{formatCurrency(schedulePreview.totalPayable)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly Payment</p>
                    <p className="font-medium">
                      ~{formatCurrency(safeDivide(schedulePreview.totalPayable, loan.term))}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {loan.term} months @ {loan.interestRate}% ({loan.product.interestModel.replace(/_/g, " ").toLowerCase()})
                </p>
              </div>
            )}
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
        <DialogContent>
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
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
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
            <div>
              <Label htmlFor="payment-receipt">Bank Slip (Optional)</Label>
              <Input
                id="payment-receipt"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
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

      {/* Upload Proof of Payment Dialog */}
      <Dialog open={showUploadProofDialog} onOpenChange={(open) => {
        setShowUploadProofDialog(open);
        if (!open) {
          setSelectedTransactionId(null);
          setProofFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Proof of Payment</DialogTitle>
            <DialogDescription>
              Upload a bank slip or other proof of payment for this transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="proof-file">Select File *</Label>
              <Input
                id="proof-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Accepted formats: PDF, JPEG, PNG, WebP
              </p>
            </div>
            {proofFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <p className="text-sm font-medium">{proofFile.name}</p>
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
        <DialogContent>
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
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="disbursement-proof-file">Select File *</Label>
              <Input
                id="disbursement-proof-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setDisbursementProofUploadFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Accepted formats: PDF, JPEG, PNG, WebP
              </p>
            </div>
            {disbursementProofUploadFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <p className="text-sm font-medium">{disbursementProofUploadFile.name}</p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Signed Loan Agreement</DialogTitle>
            <DialogDescription>
              Upload the signed loan agreement PDF. This is required before disbursement.
              {loan.agreementPath && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Note: This will replace the existing agreement (v{loan.agreementVersion}).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="agreement-file">Select File *</Label>
              <Input
                id="agreement-file"
                type="file"
                accept=".pdf"
                onChange={(e) => setAgreementFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only PDF files are accepted
              </p>
            </div>
            {agreementFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <p className="text-sm font-medium">{agreementFile.name}</p>
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

      {/* Generate Agreement PDF Dialog */}
      <Dialog open={showGenerateAgreementDialog} onOpenChange={(open) => {
        setShowGenerateAgreementDialog(open);
        if (!open) {
          setAgreementDate("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Loan Agreement PDF</DialogTitle>
            <DialogDescription>
              Enter the agreement date to generate the pre-filled loan agreement. This date will be used to calculate the repayment schedule.
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
                  onClick={() => setAgreementDate(new Date().toISOString().split("T")[0])}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Stamp Certificate</DialogTitle>
            <DialogDescription>
              Upload the stamp certificate PDF from LHDN. This is required before disbursement.
              {loan.stampCertPath && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Note: This will replace the existing stamp certificate (v{loan.stampCertVersion}).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="stamp-cert-file">Select File *</Label>
              <Input
                id="stamp-cert-file"
                type="file"
                accept=".pdf"
                onChange={(e) => setStampCertFile(e.target.files?.[0] || null)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only PDF files are accepted
              </p>
            </div>
            {stampCertFile && (
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <p className="text-sm font-medium">{stampCertFile.name}</p>
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
