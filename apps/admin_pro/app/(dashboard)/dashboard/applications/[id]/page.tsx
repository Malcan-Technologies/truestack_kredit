"use client";

import { useEffect, useState, useCallback, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Users,
  Package,
  Calculator,
  FileText,
  Send,
  Check,
  X,
  Upload,
  Trash2,
  Clock,
  Plus,
  Pencil,
  Calendar,
  ChevronDown,
  ChevronUp,
  Eye,
  Shield,
  ShieldCheck,
  ExternalLink,
  Building2,
  AlertTriangle,
  RotateCcw,
  ChartPie,
  Handshake,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumericInput } from "@/components/ui/numeric-input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyField } from "@/components/ui/copy-field";
import { InternalStaffNotesPanel } from "@/components/internal-staff-notes-panel";
import { AccessDeniedCard } from "@/components/role-gate";
import { VerificationBadge } from "@/components/verification-badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { api } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  formatNumber,
  toSafeNumber,
  safeMultiply,
  safeDivide,
  safeAdd,
  safeRound,
  safeSubtract,
} from "@/lib/utils";
import { useTenantPermissions } from "@/components/tenant-context";
import {
  canApproveApplicationsL1,
  canApproveApplicationsL2,
  canEditApplications,
  hasPermission,
} from "@/lib/permissions";
import { LoanApplicationOfferParty } from "@kredit/shared";

// ============================================
// Types
// ============================================

interface RequiredDocument {
  key: string;
  label: string;
  required: boolean;
}

interface ApplicationDocument {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  category: string;
  uploadedAt: string;
}

interface Application {
  id: string;
  amount: string;
  term: number;
  status: string;
  loanChannel?: "ONLINE" | "PHYSICAL";
  notes: string | null;
  actualInterestRate: string | null;
  actualTerm: number | null;
  createdAt: string;
  updatedAt: string;
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
    documentVerified: boolean;
    verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
    companyName: string | null;
  };
  product: {
    id: string;
    name: string;
    interestModel: string;
    interestRate: string;
    latePaymentRate: string;
    arrearsPeriod: number;
    defaultPeriod: number;
    legalFeeType: string;
    legalFeeValue: string;
    stampingFeeType: string;
    stampingFeeValue: string;
    requiredDocuments: RequiredDocument[];
    eligibleBorrowerTypes: string;
    loanScheduleType: string;
    earlySettlementEnabled: boolean;
    earlySettlementLockInMonths: number;
    earlySettlementDiscountType: string;
    earlySettlementDiscountValue: string;
  };
  guarantors: Array<{
    id: string;
    order: number;
    borrower: {
      id: string;
      name: string;
      borrowerType: string;
      companyName: string | null;
      icNumber: string;
      documentType: string;
      documentVerified: boolean;
      verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
      phone: string | null;
      email: string | null;
      address: string | null;
    };
  }>;
  documents: ApplicationDocument[];
  loan?: {
    id: string;
    status: string;
  } | null;
  l1ReviewedAt?: string | null;
  l1ReviewedByMemberId?: string | null;
  l1DecisionNote?: string | null;
  l2ReviewedAt?: string | null;
  l2ReviewedByMemberId?: string | null;
  l2DecisionNote?: string | null;
  offerRounds?: Array<{
    id: string;
    amount: string;
    term: number;
    fromParty: string;
    status: string;
    createdAt: string;
  }>;
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

interface LoanPreview {
  loanAmount: number;
  term: number;
  interestRate: number;
  legalFee: number;
  stampingFee: number;
  totalFees: number;
  netDisbursement: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayable: number;
}

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "secondary" as "default",
  SUBMITTED: "warning",
  UNDER_REVIEW: "warning",
  PENDING_L2_APPROVAL: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

function applicationStatusLabel(status: string): string {
  if (status === "SUBMITTED") return "REVIEW";
  if (status === "PENDING_L2_APPROVAL") return "PENDING L2";
  return status.replace(/_/g, " ");
}

function supportsInternalScheduleOptions(interestModel: string): boolean {
  return interestModel === "FLAT" || interestModel === "RULE_78";
}

function annualizeRiskLevel(monthlyRiskLevel: number): number {
  return safeRound(safeMultiply(monthlyRiskLevel, 12, 8), 2);
}

function monthlyRiskLevelFromAnnualized(annualizedRiskLevel: number): number {
  return safeRound(safeDivide(annualizedRiskLevel, 12, 8), 1);
}

function formatRiskCodeNumber(value: number, decimals = 2): string {
  return safeRound(value, decimals).toFixed(decimals);
}

function deriveCompliantStructure(params: {
  principal: number;
  compliantRateCap: number;
  internalInterestRate: number;
  internalTerm: number;
}): {
  compliantInterestRate: number;
  compliantTerm: number;
} | null {
  const { principal, compliantRateCap, internalInterestRate, internalTerm } = params;
  if (principal <= 0 || compliantRateCap <= 0) return null;

  const normalizedInternalRate = safeRound(internalInterestRate, 2);
  const normalizedRateCap = safeRound(compliantRateCap, 2);
  const targetTotalInterest = safeRound(
    safeMultiply(
      safeMultiply(principal, safeDivide(normalizedInternalRate, 100, 8), 8),
      safeDivide(internalTerm, 12, 8),
      8,
    ),
    2,
  );
  const targetTotalPayable = safeAdd(principal, targetTotalInterest);
  const minCompliantTerm = Math.max(
    1,
    Math.ceil(
      safeDivide(
        safeMultiply(targetTotalInterest, 1200, 8),
        safeMultiply(principal, normalizedRateCap, 8),
        8,
      ),
    ),
  );

  for (let compliantTerm = minCompliantTerm; compliantTerm <= 600; compliantTerm++) {
    const compliantInterestRate = safeRound(
      safeDivide(
        safeMultiply(targetTotalInterest, 1200, 8),
        safeMultiply(principal, compliantTerm, 8),
        8,
      ),
      2,
    );

    if (compliantInterestRate <= 0 || compliantInterestRate > normalizedRateCap) {
      continue;
    }

    const compliantTotalInterest = safeRound(
      safeMultiply(
        safeMultiply(principal, safeDivide(compliantInterestRate, 100, 8), 8),
        safeDivide(compliantTerm, 12, 8),
        8,
      ),
      2,
    );
    const compliantTotalPayable = safeAdd(principal, compliantTotalInterest);

    if (Math.abs(compliantTotalPayable - targetTotalPayable) <= 0.001) {
      return {
        compliantInterestRate,
        compliantTerm,
      };
    }
  }

  return null;
}

// ============================================
// Timeline Component
// ============================================

function getReturnToDraftReason(
  event: TimelineEvent,
): string | null {
  if (event.action !== "RETURN_TO_DRAFT" || !event.newData) return null;
  const raw = (event.newData as Record<string, unknown>).reason;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const returnToDraftReason = getReturnToDraftReason(event);

  const getActionInfo = (action: string) => {
    switch (action) {
      case "CREATE":
        return { icon: Plus, label: "Created" };
      case "UPDATE":
        return { icon: Pencil, label: "Updated" };
      case "SUBMIT":
        return { icon: Send, label: "Submitted" };
      case "APPLICATION_SEND_TO_L2":
        return { icon: ArrowUpRight, label: "Sent to L2" };
      case "APPROVE":
        return { icon: Check, label: "Approved" };
      case "REJECT":
        return { icon: X, label: "Rejected" };
      case "RETURN_TO_DRAFT":
        return { icon: RotateCcw, label: "Returned for Amendments" };
      case "DOCUMENT_UPLOAD":
        return { icon: Upload, label: "Document Uploaded" };
      case "DOCUMENT_DELETE":
        return { icon: Trash2, label: "Document Deleted" };
      case "BORROWER_CREATE_APPLICATION":
        return { icon: Plus, label: "Application Created" };
      case "BORROWER_UPDATE_APPLICATION":
        return { icon: Pencil, label: "Application Updated" };
      case "BORROWER_SUBMIT_APPLICATION":
        return { icon: Send, label: "Application Submitted" };
      case "BORROWER_APPLICATION_DOCUMENT_UPLOAD":
        return { icon: Upload, label: "Document Uploaded" };
      case "BORROWER_APPLICATION_DOCUMENT_DELETE":
        return { icon: Trash2, label: "Document Removed" };
      case "BORROWER_APPLICATION_STATUS_CHANGE":
        return { icon: Clock, label: "Status Updated" };
      case "BORROWER_WITHDRAW_APPLICATION":
        return { icon: X, label: "Application Withdrawn" };
      case "APPLICATION_COUNTER_OFFER":
        return { icon: Handshake, label: "Counter Offer from Lender" };
      case "APPLICATION_ACCEPT_BORROWER_OFFER":
        return { icon: Check, label: "Borrower Offer Accepted" };
      case "APPLICATION_REJECT_OFFERS":
        return { icon: X, label: "Negotiation Offers Rejected" };
      case "BORROWER_COUNTER_OFFER":
        return { icon: Handshake, label: "Counter Offer from Borrower" };
      case "BORROWER_ACCEPT_LENDER_OFFER":
        return { icon: Check, label: "Borrower Accepted Lender Offer" };
      case "BORROWER_REJECT_OFFERS":
        return { icon: X, label: "Borrower Declined Pending Offers" };
      default:
        return { icon: Clock, label: action };
    }
  };

  const actionInfo = getActionInfo(event.action);
  const Icon = actionInfo.icon;

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
        {event.user && (
          <p className="text-sm text-muted-foreground mb-2">
            by {event.user.name || event.user.email}
          </p>
        )}
        {event.newData && event.action === "DOCUMENT_UPLOAD" && (
          <div className="bg-secondary border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Uploaded: <span className="font-medium text-foreground">{(event.newData as Record<string, unknown>).originalName as string}</span>
            </p>
          </div>
        )}
        {returnToDraftReason && (
          <div className="bg-secondary border border-border rounded-lg p-3 mt-2">
            <p className="text-xs text-muted-foreground mb-1">Note</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{returnToDraftReason}</p>
          </div>
        )}
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

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;
  const permissions = useTenantPermissions();
  const canEditApplication = canEditApplications(permissions);
  const canApproveL1 = canApproveApplicationsL1(permissions);
  const canApproveL2 = canApproveApplicationsL2(permissions);
  const canRejectApplication = hasPermission(permissions, "applications.reject");

  const [application, setApplication] = useState<Application | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [useInternalSchedule, setUseInternalSchedule] = useState(false);
  const [internalInterestRate, setInternalInterestRate] = useState<number | "" | string>("");
  const [internalTerm, setInternalTerm] = useState<number | "">("");

  // Dialog states
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [finalApproveNote, setFinalApproveNote] = useState("");
  const [showSendToL2Dialog, setShowSendToL2Dialog] = useState(false);
  const [sendToL2Note, setSendToL2Note] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showReturnToDraftDialog, setShowReturnToDraftDialog] = useState(false);
  const [returnToDraftNote, setReturnToDraftNote] = useState("");
  const [showCounterDialog, setShowCounterDialog] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterTerm, setCounterTerm] = useState("");

  // Check for missing required documents (documents come from application.documents)
  const getMissingRequiredDocs = useCallback(() => {
    if (!application) return [];
    const requiredDocs = application.product.requiredDocuments || [];
    const docs = application.documents ?? [];
    return requiredDocs.filter(
      (doc) => doc.required && !docs.some((d) => d.category === doc.key)
    );
  }, [application]);

  const missingRequiredDocs = getMissingRequiredDocs();
  const canSubmit = missingRequiredDocs.length === 0;

  const fetchApplication = useCallback(async (): Promise<"ok" | "forbidden" | "missing"> => {
    try {
      const res = await api.get<Application>(`/api/loans/applications/${applicationId}`);
      if (res.success && res.data) {
        setApplication(res.data);
        setAccessDenied(false);
        return "ok";
      }

      setApplication(null);
      setAccessDenied(res.status === 403);
      return res.status === 403 ? "forbidden" : "missing";
    } catch (error) {
      console.error("Failed to fetch application:", error);
    }

    setApplication(null);
    setAccessDenied(false);
    return "missing";
  }, [applicationId]);

  const fetchTimeline = useCallback(async (cursor?: string, append = false) => {
    try {
      if (append) {
        setLoadingMoreTimeline(true);
      }
      const res = await fetch(`/api/proxy/loans/applications/${applicationId}/timeline?limit=10${cursor ? `&cursor=${cursor}` : ''}`, {
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
  }, [applicationId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const result = await fetchApplication();
      if (result === "ok") {
        await fetchTimeline();
      }
      setLoading(false);
    };
    loadData();
  }, [fetchApplication, fetchTimeline]);

  useEffect(() => {
    if (!application) return;
    const hasPersistedInternalSchedule =
      application.actualInterestRate !== null && application.actualTerm !== null;

    setUseInternalSchedule(hasPersistedInternalSchedule);
    setInternalInterestRate(
      hasPersistedInternalSchedule
        ? monthlyRiskLevelFromAnnualized(toSafeNumber(application.actualInterestRate))
        : ""
    );
    setInternalTerm(
      hasPersistedInternalSchedule
        ? (application.actualTerm ?? application.term)
        : application.term
    );
  }, [application?.id, application?.term, application?.actualInterestRate, application?.actualTerm]);

  const canAdminSubmitDraft =
    application?.status === "DRAFT" &&
    application.loanChannel === "PHYSICAL";

  const handleSubmitClick = () => {
    if (!canAdminSubmitDraft) {
      toast.error("Only physical (in-branch) draft applications can be submitted from admin.");
      return;
    }
    if (!canSubmit) {
      toast.error(`Please upload all required documents before submitting`);
      return;
    }
    setShowSubmitDialog(true);
  };

  const handleSubmitConfirm = async () => {
    setShowSubmitDialog(false);
    setActionLoading("submit");
    if (!application) {
      setActionLoading(null);
      return;
    }
    if (application.loanChannel !== "PHYSICAL") {
      toast.error("Online applications must be submitted by the borrower.");
      setActionLoading(null);
      return;
    }

    const productRateCap = toSafeNumber(application.product.interestRate);
    const annualizedInternalInterestRate = internalInterestRate === ""
      ? null
      : annualizeRiskLevel(Number(internalInterestRate));
    const compliantStructure = useInternalSchedule
      ? deriveCompliantStructure({
          principal: toSafeNumber(application.amount),
          compliantRateCap: productRateCap,
          internalInterestRate: annualizedInternalInterestRate ?? 0,
          internalTerm: Number(internalTerm),
        })
      : null;

    if (useInternalSchedule) {
      if (!supportsInternalScheduleOptions(application.product.interestModel)) {
        toast.error("Additional schedule options are only available for flat-structured products");
        setActionLoading(null);
        return;
      }
      if (internalInterestRate === "" || Number(internalInterestRate) <= 0 || Number.isNaN(Number(internalInterestRate))) {
        toast.error("Please enter a valid risk index");
        setActionLoading(null);
        return;
      }
      if (internalTerm === "" || internalTerm <= 0) {
        toast.error("Please enter a valid risk term");
        setActionLoading(null);
        return;
      }
      if (productRateCap <= 0) {
        toast.error("Product interest rate must be greater than zero");
        setActionLoading(null);
        return;
      }
      if (!compliantStructure) {
        toast.error("Unable to derive a schedule that matches the risk-adjusted total payable within the product rate cap");
        setActionLoading(null);
        return;
      }
    }

    const res = await api.post(`/api/loans/applications/${applicationId}/submit`, useInternalSchedule ? {
      enableInternalSchedule: true,
      actualInterestRate: annualizedInternalInterestRate,
      actualTerm: Number(internalTerm),
    } : {
      enableInternalSchedule: false,
    });
    if (res.success) {
      toast.success("Application submitted for review");
      fetchApplication();
      fetchTimeline();
      window.dispatchEvent(new CustomEvent("applications-count-changed"));
    } else {
      toast.error(res.error || "Failed to submit application");
    }
    setActionLoading(null);
  };

  const handleApproveClick = () => {
    setFinalApproveNote("");
    setShowApproveDialog(true);
  };

  const handleApproveConfirm = async () => {
    setShowApproveDialog(false);
    setActionLoading("approve");
    if (!application) {
      setActionLoading(null);
      return;
    }

    const res = await api.post(`/api/loans/applications/${applicationId}/approve`, {
      note: finalApproveNote.trim() || undefined,
    });
    if (res.success) {
      toast.success("Application approved! Loan created.");
      fetchApplication();
      fetchTimeline();
      window.dispatchEvent(new CustomEvent("applications-count-changed"));
      window.dispatchEvent(new CustomEvent("loans-count-changed"));
    } else {
      toast.error(res.error || "Failed to approve application");
    }
    setActionLoading(null);
  };

  const handleSendToL2Click = () => {
    setSendToL2Note("");
    setShowSendToL2Dialog(true);
  };

  const handleSendToL2Confirm = async () => {
    setShowSendToL2Dialog(false);
    setActionLoading("sendToL2");
    const res = await api.post(`/api/loans/applications/${applicationId}/send-to-l2`, {
      note: sendToL2Note.trim() || undefined,
    });
    if (res.success) {
      toast.success("Application sent to L2 for final review");
      fetchApplication();
      fetchTimeline();
      window.dispatchEvent(new CustomEvent("applications-count-changed"));
    } else {
      toast.error(res.error || "Failed to send application to L2");
    }
    setActionLoading(null);
  };

  const handleAdminAcceptBorrowerOffer = async () => {
    setActionLoading("acceptBorrowerOffer");
    const res = await api.post(`/api/loans/applications/${applicationId}/accept-offer`, {});
    if (res.success) {
      toast.success("Borrower offer accepted. Terms updated on the application.");
      await fetchApplication();
      await fetchTimeline();
    } else {
      toast.error(res.error || "Failed to accept offer");
    }
    setActionLoading(null);
  };

  const handleAdminCounterConfirm = async () => {
    const amt = parseFloat(counterAmount);
    const tm = parseInt(String(counterTerm), 10);
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(tm) || tm <= 0) {
      toast.error("Enter valid amount and term");
      return;
    }
    setShowCounterDialog(false);
    setActionLoading("counterOffer");
    const res = await api.post(`/api/loans/applications/${applicationId}/counter-offer`, {
      amount: amt,
      term: tm,
    });
    if (res.success) {
      toast.success("Counter-offer sent to borrower");
      await fetchApplication();
      await fetchTimeline();
    } else {
      toast.error(res.error || "Failed to send counter-offer");
    }
    setActionLoading(null);
  };

  const handleRejectClick = () => {
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = async () => {
    setShowRejectDialog(false);
    setActionLoading("reject");
    const res = await api.post(`/api/loans/applications/${applicationId}/reject`, {
      reason: "Rejected by admin",
    });
    if (res.success) {
      toast.success("Application rejected");
      fetchApplication();
      fetchTimeline();
      window.dispatchEvent(new CustomEvent("applications-count-changed"));
    } else {
      toast.error(res.error || "Failed to reject application");
    }
    setActionLoading(null);
  };

  const handleReturnToDraftClick = () => {
    setReturnToDraftNote("");
    setShowReturnToDraftDialog(true);
  };

  const handleReturnToDraftConfirm = async () => {
    setShowReturnToDraftDialog(false);
    setActionLoading("returnToDraft");
    const res = await api.post(`/api/loans/applications/${applicationId}/return-to-draft`, {
      reason: returnToDraftNote.trim() || undefined,
    });
    if (res.success) {
      toast.success("Application returned to draft for amendments");
      fetchApplication();
      fetchTimeline();
      window.dispatchEvent(new CustomEvent("applications-count-changed"));
    } else {
      toast.error(res.error || "Failed to return application to draft");
    }
    setActionLoading(null);
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    try {
      const res = await fetch(`/api/proxy/loans/applications/${applicationId}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Document uploaded");
        fetchApplication();
        fetchTimeline();
      } else {
        toast.error(json.error || "Failed to upload document");
      }
    } catch (error) {
      toast.error("Failed to upload document");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDeleteDocument = async (documentId: string) => {
    const res = await api.delete(`/api/loans/applications/${applicationId}/documents/${documentId}`);
    if (res.success) {
      toast.success("Document deleted");
      fetchApplication();
      fetchTimeline();
    } else {
      toast.error(res.error || "Failed to delete document");
    }
  };

  // Calculate loan preview
  const getPreview = (options?: { term?: number; interestRate?: number; amount?: number }): LoanPreview | null => {
    if (!application) return null;

    const loanAmount =
      options?.amount !== undefined ? toSafeNumber(options.amount) : toSafeNumber(application.amount);
    const term = options?.term ?? application.term;
    const interestRate = options?.interestRate ?? toSafeNumber(application.product.interestRate);

    const legalFeeValue = toSafeNumber(application.product.legalFeeValue);
    const stampingFeeValue = toSafeNumber(application.product.stampingFeeValue);

    const legalFee =
      application.product.legalFeeType === "PERCENTAGE"
        ? safeMultiply(loanAmount, safeDivide(legalFeeValue, 100))
        : legalFeeValue;

    const stampingFee =
      application.product.stampingFeeType === "PERCENTAGE"
        ? safeMultiply(loanAmount, safeDivide(stampingFeeValue, 100))
        : stampingFeeValue;

    const totalFees = safeAdd(legalFee, stampingFee);
    const netDisbursement = safeSubtract(loanAmount, totalFees);

    let monthlyPayment: number;
    let totalInterest: number;
    let totalPayable: number;

    if (application.product.interestModel === "FLAT" || application.product.interestModel === "RULE_78") {
      const annualRate = safeDivide(interestRate, 100, 8);
      totalInterest = safeRound(
        safeMultiply(
          safeMultiply(loanAmount, annualRate, 8),
          safeDivide(term, 12, 8),
          8,
        ),
        2,
      );
      totalPayable = safeAdd(loanAmount, totalInterest);
      monthlyPayment = safeDivide(totalPayable, term);
    } else {
      const monthlyRate = safeDivide(interestRate, 12 * 100);
      if (monthlyRate === 0) {
        monthlyPayment = safeDivide(loanAmount, term);
      } else {
        const factor = Math.pow(1 + monthlyRate, term);
        monthlyPayment = safeMultiply(loanAmount, safeDivide(safeMultiply(monthlyRate, factor), factor - 1));
      }
      totalPayable = safeMultiply(monthlyPayment, term);
      totalInterest = safeSubtract(totalPayable, loanAmount);
    }

    return {
      loanAmount,
      term,
      interestRate,
      legalFee,
      stampingFee,
      totalFees,
      netDisbursement,
      monthlyPayment,
      totalInterest,
      totalPayable,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (accessDenied) {
    return <AccessDeniedCard />;
  }

  if (!application) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-8 text-muted">Application not found</div>
      </div>
    );
  }

  const supportsInternalOptions = supportsInternalScheduleOptions(application.product.interestModel);
  const hasInternalInputs =
    useInternalSchedule &&
    internalInterestRate !== "" &&
    Number(internalInterestRate) > 0 &&
    internalTerm !== "" &&
    internalTerm > 0;
  const annualizedInternalInterestRate = hasInternalInputs
    ? annualizeRiskLevel(Number(internalInterestRate))
    : null;
  const compliantStructure = hasInternalInputs
    ? deriveCompliantStructure({
        principal: toSafeNumber(application.amount),
        compliantRateCap: toSafeNumber(application.product.interestRate),
        internalInterestRate: annualizedInternalInterestRate ?? 0,
        internalTerm: Number(internalTerm),
      })
    : null;
  const compliantPreview = getPreview({
    term: compliantStructure?.compliantTerm ?? application.term,
    interestRate: compliantStructure?.compliantInterestRate ?? toSafeNumber(application.product.interestRate),
  });
  const internalPreview = hasInternalInputs
    ? getPreview({
        term: Number(internalTerm),
        interestRate: annualizedInternalInterestRate ?? 0,
      })
    : null;
  const idForPrefix = application?.loan?.id ?? application?.id ?? applicationId;
  const prefix = idForPrefix.slice(-8);
  const riskAdjustedCode = hasInternalInputs && internalPreview
    ? `${prefix}00${Number(internalTerm)}00${formatRiskCodeNumber(Number(internalInterestRate), 1)}00${formatRiskCodeNumber(internalPreview.monthlyPayment)}`
    : null;
  const preview = compliantPreview;
  const requiredDocs = application.product.requiredDocuments || [];

  const pendingLenderOffer = application.offerRounds?.find(
    (o) => o.status === "PENDING" && o.fromParty === "ADMIN"
  );
  const pendingBorrowerOffer = application.offerRounds?.find(
    (o) => o.status === "PENDING" && o.fromParty === "BORROWER"
  );
  const negotiationPreview =
    pendingBorrowerOffer != null
      ? getPreview({
          amount: Number(pendingBorrowerOffer.amount),
          term: pendingBorrowerOffer.term,
        })
      : pendingLenderOffer != null
        ? getPreview({
            amount: Number(pendingLenderOffer.amount),
            term: pendingLenderOffer.term,
          })
        : null;
  const canShowNegotiationCard =
    ((application.status === "SUBMITTED" ||
      application.status === "UNDER_REVIEW" ||
      application.status === "PENDING_L2_APPROVAL") &&
      ((application.offerRounds?.length ?? 0) > 0 || !!pendingLenderOffer || !!pendingBorrowerOffer)) ||
    (application.status === "APPROVED" && (application.offerRounds?.length ?? 0) > 0);

  const isL1Queue = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const isL2Queue = application.status === "PENDING_L2_APPROVAL";
  const canRejectThisStage =
    canRejectApplication &&
    ((isL1Queue && canApproveL1) || (isL2Queue && canApproveL2));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-heading font-bold text-gradient">
                Application
              </h1>
              <Badge variant="outline" className="text-xs">
                {application.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
              </Badge>
              <Badge variant={statusColors[application.status]}>
                {applicationStatusLabel(application.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                ? application.borrower.companyName
                : application.borrower.name} • Created {formatDate(application.createdAt)}
            </p>
            {isL1Queue && (
              <p className="text-xs text-muted-foreground mt-1">
                L1 queue — first-line review. Send to L2 when ready for final approval (no loan is created until L2
                approves).
              </p>
            )}
            {isL2Queue && (
              <p className="text-xs text-muted-foreground mt-1">
                L2 queue — final credit decision. Approving will create the loan and schedule.
              </p>
            )}
            {application.l1ReviewedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                L1 reviewed {formatDate(application.l1ReviewedAt)}
                {application.l1DecisionNote ? ` — ${application.l1DecisionNote}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap justify-end">
          <RefreshButton
            onRefresh={async () => {
              await Promise.all([fetchApplication(), fetchTimeline()]);
            }}
            showLabel
            showToast
            successMessage="Application refreshed"
          />
          {application.status === "DRAFT" &&
            canEditApplication &&
            application.loanChannel === "PHYSICAL" && (
            <Button
              onClick={handleSubmitClick}
              disabled={actionLoading === "submit" || !canSubmit}
              title={!canSubmit ? "Upload all required documents first" : ""}
            >
              <Send className="h-4 w-4 mr-2" />
              {actionLoading === "submit" ? "Submitting..." : "Submit"}
            </Button>
          )}
          {isL1Queue && canApproveL1 && (
            <>
              <Button
                variant="outline"
                onClick={handleReturnToDraftClick}
                disabled={actionLoading === "returnToDraft"}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {actionLoading === "returnToDraft" ? "Returning..." : "Amendments"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!application) return;
                  setCounterAmount(String(toSafeNumber(application.amount)));
                  setCounterTerm(String(application.term));
                  setShowCounterDialog(true);
                }}
                disabled={!!actionLoading}
              >
                <Handshake className="h-4 w-4 mr-2" />
                Counter offer
              </Button>
              {canRejectThisStage && (
                <Button
                  variant="destructive"
                  onClick={handleRejectClick}
                  disabled={actionLoading === "reject"}
                >
                  <X className="h-4 w-4 mr-2" />
                  {actionLoading === "reject" ? "Rejecting..." : "Reject"}
                </Button>
              )}
              {application.offerRounds?.some(
                (o) => o.status === "PENDING" && o.fromParty === "BORROWER"
              ) && (
                <Button
                  variant="secondary"
                  onClick={() => void handleAdminAcceptBorrowerOffer()}
                  disabled={actionLoading === "acceptBorrowerOffer"}
                >
                  {actionLoading === "acceptBorrowerOffer" ? "Accepting…" : "Accept borrower offer"}
                </Button>
              )}
              <Button
                onClick={handleSendToL2Click}
                disabled={actionLoading === "sendToL2"}
                className="bg-sky-600 hover:bg-sky-700"
              >
                <ArrowUpRight className="h-4 w-4 mr-2" />
                {actionLoading === "sendToL2" ? "Sending..." : "Send to L2"}
              </Button>
            </>
          )}
          {isL2Queue && canApproveL2 && (
            <>
              <Button
                variant="outline"
                onClick={handleReturnToDraftClick}
                disabled={actionLoading === "returnToDraft"}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {actionLoading === "returnToDraft" ? "Returning..." : "Amendments"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!application) return;
                  setCounterAmount(String(toSafeNumber(application.amount)));
                  setCounterTerm(String(application.term));
                  setShowCounterDialog(true);
                }}
                disabled={!!actionLoading}
              >
                <Handshake className="h-4 w-4 mr-2" />
                Counter offer
              </Button>
              {canRejectThisStage && (
                <Button
                  variant="destructive"
                  onClick={handleRejectClick}
                  disabled={actionLoading === "reject"}
                >
                  <X className="h-4 w-4 mr-2" />
                  {actionLoading === "reject" ? "Rejecting..." : "Reject"}
                </Button>
              )}
              {application.offerRounds?.some(
                (o) => o.status === "PENDING" && o.fromParty === "BORROWER"
              ) && (
                <Button
                  variant="secondary"
                  onClick={() => void handleAdminAcceptBorrowerOffer()}
                  disabled={actionLoading === "acceptBorrowerOffer"}
                >
                  {actionLoading === "acceptBorrowerOffer" ? "Accepting…" : "Accept borrower offer"}
                </Button>
              )}
              <Button onClick={handleApproveClick} disabled={actionLoading === "approve"} className="bg-emerald-600 hover:bg-emerald-700">
                <Check className="h-4 w-4 mr-2" />
                {actionLoading === "approve" ? "Approving..." : "Final approve"}
              </Button>
            </>
          )}
          {application.loan && (
            <Button variant="outline" onClick={() => router.push(`/dashboard/loans/${application.loan?.id}`)}>
              <Eye className="h-4 w-4 mr-2" />
              View Loan
            </Button>
          )}
        </div>
      </div>

      {/* Missing Documents Warning */}
      {application.status === "DRAFT" && missingRequiredDocs.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Missing Required Documents
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Please upload the following documents before submitting:
              </p>
              <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-300 mt-2">
                {missingRequiredDocs.map((doc) => (
                  <li key={doc.key}>{doc.label}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Borrower & Product */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  {application.borrower.borrowerType === "CORPORATE" ? (
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <User className="h-5 w-5 text-muted-foreground" />
                  )}
                  Borrower
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Link 
                    href={`/dashboard/borrowers/${application.borrower.id}`}
                    className="font-medium hover:text-muted-foreground hover:underline transition-colors inline-flex items-center gap-1.5"
                  >
                    {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                      ? application.borrower.companyName
                      : application.borrower.name}
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                  {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName && (
                    <p className="text-sm text-muted-foreground">Rep: {application.borrower.name}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {application.borrower.borrowerType === "CORPORATE" ? (
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
                    <VerificationBadge
                      verificationStatus={application.borrower.verificationStatus}
                      documentVerified={application.borrower.documentVerified}
                      size="compact"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <CopyField 
                    label={application.borrower.borrowerType === "CORPORATE" 
                      ? "SSM" 
                      : application.borrower.documentType === "IC" ? "IC Number" : "Passport"}
                    value={application.borrower.icNumber}
                  />
                  {application.borrower.phone && (
                    <PhoneDisplay label="Phone" value={application.borrower.phone} />
                  )}
                  {application.borrower.email && (
                    <CopyField label="Email" value={application.borrower.email} />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  Product
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium text-lg">{application.product.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {application.product.interestModel === "RULE_78" ? "Rule 78" : application.product.interestModel.replace("_", " ")}
                    </Badge>
                    <Badge
                      variant={application.product.loanScheduleType === "JADUAL_K" ? "default" : "outline"}
                      className="text-xs flex items-center gap-1"
                    >
                      {application.product.loanScheduleType === "JADUAL_K" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <Shield className="h-3 w-3" />
                      )}
                      {application.product.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">{application.product.interestRate}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Late Payment Rate</p>
                    <p className="font-medium">{application.product.latePaymentRate}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Arrears Period</p>
                    <p className="font-medium">{application.product.arrearsPeriod} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Default Period</p>
                    <p className="font-medium">{application.product.defaultPeriod} days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {canShowNegotiationCard && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-muted-foreground" />
                  Offer negotiation
                </CardTitle>
                <CardDescription>
                  Amount and term proposals between you and the borrower. Approve only after the latest offer is accepted
                  and there are no pending rounds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(application.status === "SUBMITTED" ||
                  application.status === "UNDER_REVIEW" ||
                  application.status === "PENDING_L2_APPROVAL") && (
                  <p className="text-sm text-muted-foreground">
                    Use <span className="font-medium text-foreground">Counter offer</span> or{" "}
                    <span className="font-medium text-foreground">Accept borrower offer</span> in the page header when
                    applicable.
                    {application.status === "PENDING_L2_APPROVAL" && (
                      <span className="block mt-1">
                        At L2 stage, final approval creates the loan only after negotiation is settled.
                      </span>
                    )}
                  </p>
                )}
                {negotiationPreview && (
                  <div className="relative overflow-hidden rounded-xl border-2 border-amber-400/90 bg-amber-50 p-5 shadow-sm dark:border-amber-600 dark:bg-amber-950/45 ring-1 ring-amber-200/80 dark:ring-amber-800/50 space-y-3">
                    <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-200/40 dark:bg-amber-500/10 rounded-full blur-2xl" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                          <div className="p-1.5 rounded-md bg-amber-200/60 dark:bg-amber-900/50">
                            <Calculator className="h-5 w-5 text-amber-900 dark:text-amber-200" />
                          </div>
                          {pendingBorrowerOffer && !pendingLenderOffer
                            ? "Borrower's offer — estimated terms"
                            : "Your pending offer — estimated terms"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {pendingBorrowerOffer && !pendingLenderOffer
                            ? "Review net disbursement and monthly payment before accepting or countering from the header."
                            : "What the borrower sees for fees and monthly payment if they accept this offer."}
                        </p>
                      </div>
                    </div>
                    <div className="relative space-y-2.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Loan Amount</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(negotiationPreview.loanAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Term</span>
                        <span className="font-medium text-foreground">{negotiationPreview.term} months</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Legal Fee</span>
                        <span className="text-foreground">{formatCurrency(negotiationPreview.legalFee)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Stamping Fee</span>
                        <span className="text-foreground">{formatCurrency(negotiationPreview.stampingFee)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-amber-200/80 dark:border-amber-800/50 pt-2.5">
                        <span className="text-muted-foreground">Total Fees</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {formatCurrency(negotiationPreview.totalFees)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Net Disbursement</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(negotiationPreview.netDisbursement)}
                        </span>
                      </div>
                      <div className="border-t border-amber-200/80 dark:border-amber-800/50 pt-2.5" />
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Interest Rate</span>
                        <span className="text-foreground">{formatNumber(negotiationPreview.interestRate, 2)}% p.a.</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Interest</span>
                        <span className="text-foreground">{formatCurrency(negotiationPreview.totalInterest)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Payable</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(negotiationPreview.totalPayable)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-amber-100/80 dark:bg-amber-950/60 -mx-5 px-5 py-3 mt-3 rounded-b-xl border-t border-amber-200/80 dark:border-amber-800/50">
                        <span className="font-semibold text-foreground">Monthly Payment</span>
                        <span className="font-bold text-xl text-foreground">
                          {formatCurrency(negotiationPreview.monthlyPayment)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {pendingLenderOffer && !pendingBorrowerOffer && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Awaiting borrower</span> — your latest offer is
                    pending their response.
                  </p>
                )}
                {(application.offerRounds?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">History</p>
                    <ul className="space-y-2 text-sm border rounded-lg divide-y max-h-56 overflow-y-auto">
                      {(application.offerRounds ?? []).map((o) => (
                        <li key={o.id} className="flex flex-wrap justify-between gap-2 p-3">
                          <span>
                            {o.fromParty === LoanApplicationOfferParty.ADMIN ? "Lender" : "Borrower"} · {o.status}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCurrency(Number(o.amount))} · {o.term} mo · {formatDate(o.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Guarantors */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Guarantors
              </CardTitle>
              <CardDescription>
                Optional guarantors linked to this application
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(application.guarantors || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No guarantors selected</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {application.guarantors.map((item) => {
                    const guarantor = item.borrower;
                    const displayName =
                      guarantor.borrowerType === "CORPORATE" && guarantor.companyName
                        ? guarantor.companyName
                        : guarantor.name;
                    const identityLabel =
                      guarantor.borrowerType === "CORPORATE"
                        ? "SSM"
                        : guarantor.documentType === "IC"
                          ? "IC Number"
                          : "Passport";

                    return (
                      <div key={item.id} className="rounded-lg border p-3 space-y-2">
                        <Link
                          href={`/dashboard/borrowers/${guarantor.id}`}
                          className="font-medium hover:text-muted-foreground hover:underline inline-flex items-center gap-1.5"
                        >
                          {displayName}
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                        <div className="flex items-center gap-2">
                          <VerificationBadge
                            verificationStatus={guarantor.verificationStatus}
                            documentVerified={guarantor.documentVerified}
                            size="compact"
                          />
                        </div>
                        <div className="space-y-2">
                          <CopyField label={identityLabel} value={guarantor.icNumber} />
                          {guarantor.phone && <PhoneDisplay label="Phone" value={guarantor.phone} />}
                          {guarantor.email && <CopyField label="Email" value={guarantor.email} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {application.status === "DRAFT" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Schedule Options</CardTitle>
                <CardDescription>
                  Optional risk-adjusted schedule settings to capture before raising this application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-3 mb-2">
                  <p className="text-xs text-muted-foreground">
                    This risk-adjusted schedule is provided solely for internal reference and scenario analysis. Risk index and risk term are for internal planning purposes only; their meaning and interpretation are determined by the lender. Under applicable KPKT limits, the maximum permitted interest rate is 18% p.a. for Jadual J financing and 12% p.a. for Jadual K financing; lenders are not permitted to charge above the applicable cap. The lender remains solely responsible for ensuring that all pricing, documentation, and recoveries comply with applicable law and regulatory requirements. This risk-adjusted view does not amend, replace, validate, or supersede the approved repayment schedule, contractual terms, or compliance record.
                  </p>
                </div>
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-1">
                    <Label htmlFor="internal-schedule-toggle">Enable Risk-Adjusted Schedule</Label>
                    <p className="text-xs text-muted-foreground">
                      Add a risk-adjusted schedule while preserving the loan schedule within the product rate cap.
                    </p>
                  </div>
                  <Switch
                    id="internal-schedule-toggle"
                    checked={useInternalSchedule}
                    onCheckedChange={(checked) => {
                      setUseInternalSchedule(checked);
                      if (checked && internalTerm === "") {
                        setInternalTerm(application.term);
                      }
                    }}
                    disabled={!supportsInternalOptions}
                  />
                </div>

                {!supportsInternalOptions && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    Additional schedule options are currently available for flat-structured products only.
                  </div>
                )}

                {useInternalSchedule && supportsInternalOptions && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="internal-rate">Risk Index (1-100)</Label>
                        <NumericInput
                          id="internal-rate"
                          mode="float"
                          maxDecimals={1}
                          value={internalInterestRate}
                          onChange={setInternalInterestRate}
                          placeholder="e.g. 5.5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="internal-term">Risk Term (1-36)</Label>
                        <NumericInput
                          id="internal-term"
                          mode="int"
                          value={internalTerm}
                          onChange={(v: number | "" | string) => setInternalTerm(v === "" ? "" : typeof v === "number" ? v : Number(v))}
                          placeholder="e.g. 12"
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Derived Term</span>
                        <span className="font-medium">
                          {compliantStructure ? `${compliantStructure.compliantTerm} months` : "Enter risk index and risk term"}
                        </span>
                      </div>
                    </div>
                    {hasInternalInputs && !compliantStructure && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        Unable to derive a schedule that matches the risk-adjusted total payable within the product rate cap.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Loan Summary */}
          {preview && (
            <div className="relative overflow-hidden rounded-xl border border-border bg-secondary p-5 space-y-3">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-foreground/5 rounded-full blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                  <div className="p-1.5 rounded-md bg-foreground/10">
                    <Calculator className="h-5 w-5 text-muted-foreground" />
                  </div>
                  Loan Summary
                </h3>
              </div>
              <div className="relative space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Loan Amount</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(preview.loanAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Term</span>
                  <span className="font-medium text-foreground">{preview.term} months</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Legal Fee</span>
                  <span className="text-foreground">{formatCurrency(preview.legalFee)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stamping Fee</span>
                  <span className="text-foreground">{formatCurrency(preview.stampingFee)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/50 pt-2.5">
                  <span className="text-muted-foreground">Total Fees</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {formatCurrency(preview.totalFees)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Net Disbursement</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(preview.netDisbursement)}
                  </span>
                </div>
                <div className="border-t border-border/50 pt-2.5" />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Interest Rate</span>
                  <span className="text-foreground">{formatNumber(preview.interestRate, 2)}% p.a.</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Interest</span>
                  <span className="text-foreground">{formatCurrency(preview.totalInterest)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Payable</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(preview.totalPayable)}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-foreground/5 -mx-5 px-5 py-3 mt-3 rounded-b-xl border-t border-border">
                  <span className="font-semibold text-foreground">Monthly Payment</span>
                  <span className="font-bold text-xl text-foreground">
                    {formatCurrency(preview.monthlyPayment)}
                  </span>
                </div>
              </div>
              {useInternalSchedule && !riskAdjustedCode && supportsInternalOptions && (
                <p className="relative text-xs text-muted-foreground">
                  Enter the risk index and risk term to generate the risk-adjusted code.
                </p>
              )}
              {riskAdjustedCode && (
                <div className="relative mt-4 pt-4 border-t border-border/50">
                  <CopyField label="Loan ID" value={riskAdjustedCode} />
                </div>
              )}
              {application.notes && (
                <div className="relative mt-4 pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm whitespace-pre-wrap mt-1">{application.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Documents
              </CardTitle>
              <CardDescription>
                Upload required documents for this application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {requiredDocs.map((docType) => {
                  const uploadedDoc = (application.documents ?? []).find((d) => d.category === docType.key);

                  return (
                    <div
                      key={docType.key}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">
                            {docType.label}
                            {docType.required && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          {uploadedDoc && (
                            <p className="text-xs text-muted-foreground">
                              {uploadedDoc.originalName}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {uploadedDoc ? (
                          <>
                            <Badge variant="verified">Uploaded</Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`/api/proxy${uploadedDoc.path}`, '_blank')}
                              title="View document"
                            >
                              <ExternalLink className="h-4 w-4 text-foreground" />
                            </Button>
                            {canEditApplication ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDocument(uploadedDoc.id)}
                                title="Delete document"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          canEditApplication ? (
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(e) => handleUploadDocument(e, docType.key)}
                                disabled={uploading}
                              />
                              <Button variant="outline" size="sm" asChild>
                                <span>
                                  <Upload className="h-4 w-4 mr-1" />
                                  Upload
                                </span>
                              </Button>
                            </label>
                          ) : null
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Other documents */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Other Documents</p>
                  {(application.documents ?? [])
                    .filter((d) => !requiredDocs.some((r) => r.key === d.category))
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2 rounded border mb-2"
                      >
                        <span className="text-sm">{doc.originalName}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/api/proxy${doc.path}`, '_blank')}
                            title="View document"
                          >
                            <ExternalLink className="h-4 w-4 text-foreground" />
                          </Button>
                          {canEditApplication ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDocument(doc.id)}
                              title="Delete document"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  {canEditApplication ? (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => handleUploadDocument(e, "OTHER")}
                        disabled={uploading}
                      />
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Document
                        </span>
                      </Button>
                    </label>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Quick Info & Timeline */}
        <div className="space-y-6">
          {/* Quick Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Application ID</span>
                <span className="font-mono text-xs">{application.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(application.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{formatRelativeTime(application.updatedAt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Product</span>
                <Link
                  href={`/dashboard/products/${application.product.id}`}
                  className="text-muted-foreground hover:underline inline-flex items-center gap-1"
                >
                  {application.product.name}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest Model</span>
                <span>{application.product.interestModel === "RULE_78" ? "Rule 78" : application.product.interestModel.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Schedule Type</span>
                <span>{application.product.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}</span>
              </div>
              {/* Collateral info for Jadual K */}
              {application.product.loanScheduleType === "JADUAL_K" && application.collateralType && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collateral</span>
                    <span>{application.collateralType}</span>
                  </div>
                  {application.collateralValue && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Collateral Value</span>
                      <span>{formatCurrency(toSafeNumber(application.collateralValue))}</span>
                    </div>
                  )}
                </>
              )}
              {application.product.earlySettlementEnabled && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Early Settlement</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lock-in Period</span>
                    <span>{application.product.earlySettlementLockInMonths > 0 ? `${application.product.earlySettlementLockInMonths} months` : "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settlement Discount</span>
                    <span>
                      {application.product.earlySettlementDiscountType === "PERCENTAGE"
                        ? `${application.product.earlySettlementDiscountValue}%`
                        : `RM ${application.product.earlySettlementDiscountValue}`}
                    </span>
                  </div>
                </>
              )}
              {application.loan && (
                <div className="pt-2 border-t">
                  <Link
                    href={`/dashboard/loans/${application.loan.id}`}
                    className="text-foreground hover:text-muted-foreground hover:underline inline-flex items-center gap-1"
                  >
                    View Loan
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <InternalStaffNotesPanel
            apiPath={`loans/applications/${applicationId}/staff-notes`}
            canPost={canEditApplication}
          />

          {/* Activity Timeline */}
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setTimelineExpanded((p) => !p)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
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
                      <TimelineItem key={event.id} event={event} />
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

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this loan application for review?
              Once submitted, you will not be able to make further changes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Borrower</span>
                <span className="font-medium">
                  {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                    ? application.borrower.companyName
                    : application.borrower.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan Amount</span>
                <span className="font-medium">{formatCurrency(toSafeNumber(application.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Term</span>
                <span className="font-medium">{application.term} months</span>
              </div>
              {useInternalSchedule && hasInternalInputs && compliantStructure && (
                <>
                  <div className="pt-2 mt-2 border-t border-blue-200/70 dark:border-blue-800/70" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule View</span>
                    <span className="font-medium">Loan + Risk-Adjusted</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest Rate</span>
                    <span className="font-medium">{formatNumber(compliantStructure.compliantInterestRate, 2)}% p.a.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Term</span>
                    <span className="font-medium">{compliantStructure.compliantTerm} months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Index</span>
                    <span className="font-medium">{formatNumber(Number(internalInterestRate), 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Term</span>
                    <span className="font-medium">{internalTerm}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitConfirm}>
              <Send className="h-4 w-4 mr-2" />
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to L2 */}
      <Dialog open={showSendToL2Dialog} onOpenChange={setShowSendToL2Dialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to L2</DialogTitle>
            <DialogDescription>
              Move this application to the L2 queue for final approval. No loan is created until an L2 approver
              confirms.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="send-l2-note">Note for L2 (optional)</Label>
            <Textarea
              id="send-l2-note"
              value={sendToL2Note}
              onChange={(e) => setSendToL2Note(e.target.value)}
              placeholder="Context or checklist items for the final reviewer…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendToL2Dialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSendToL2Confirm()} className="bg-sky-600 hover:bg-sky-700">
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Send to L2
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Final approval (L2)</DialogTitle>
            <DialogDescription>
              Approve this application to create the loan and generate the repayment schedule. This action requires L2
              permission.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Borrower</span>
                <span className="font-medium">
                  {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                    ? application.borrower.companyName
                    : application.borrower.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan Amount</span>
                <span className="font-medium">{formatCurrency(toSafeNumber(application.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Term</span>
                <span className="font-medium">{application.term} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product</span>
                <span className="font-medium">{application.product.name}</span>
              </div>
              {useInternalSchedule && hasInternalInputs && compliantStructure && (
                <>
                  <div className="pt-2 mt-2 border-t border-emerald-200/70 dark:border-emerald-800/70" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule View</span>
                    <span className="font-medium">Loan + Risk-Adjusted</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest Rate</span>
                    <span className="font-medium">{formatNumber(compliantStructure.compliantInterestRate, 2)}% p.a.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Term</span>
                    <span className="font-medium">{compliantStructure.compliantTerm} months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Index</span>
                    <span className="font-medium">{formatNumber(Number(internalInterestRate), 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Term</span>
                    <span className="font-medium">{internalTerm}</span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="final-approve-note">Decision note (optional)</Label>
              <Textarea
                id="final-approve-note"
                value={finalApproveNote}
                onChange={(e) => setFinalApproveNote(e.target.value)}
                placeholder="Recorded on the application for audit…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveConfirm} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-4 w-4 mr-2" />
              Approve & Create Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this loan application?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Borrower</span>
                <span className="font-medium">
                  {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                    ? application.borrower.companyName
                    : application.borrower.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan Amount</span>
                <span className="font-medium">{formatCurrency(toSafeNumber(application.amount))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRejectConfirm}>
              <X className="h-4 w-4 mr-2" />
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return for Amendments Confirmation Dialog */}
      <Dialog open={showReturnToDraftDialog} onOpenChange={(open) => {
        if (!open) setReturnToDraftNote("");
        setShowReturnToDraftDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return for Amendments</DialogTitle>
            <DialogDescription>
              Return this application to draft so the applicant can make amendments.
              They can update the application and resubmit when ready.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Borrower</span>
                <span className="font-medium">
                  {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                    ? application.borrower.companyName
                    : application.borrower.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loan Amount</span>
                <span className="font-medium">{formatCurrency(toSafeNumber(application.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product</span>
                <span className="font-medium">{application.product.name}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="return-to-draft-note">
                Amendment notes{" "}
                <span className="text-muted-foreground font-normal">(optional — visible to borrower when provided)</span>
              </Label>
              <Textarea
                id="return-to-draft-note"
                placeholder="Optional: describe what needs to be corrected or updated…"
                rows={4}
                value={returnToDraftNote}
                onChange={(e) => setReturnToDraftNote(e.target.value)}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                If you add notes here, the borrower will see them when they open the application.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setReturnToDraftNote("");
              setShowReturnToDraftDialog(false);
            }}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleReturnToDraftConfirm}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Return to Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCounterDialog} onOpenChange={setShowCounterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Counter offer (amount & term)</DialogTitle>
            <DialogDescription>
              The borrower will be asked to accept, reject, or counter again. Approve only after negotiation is settled
              (no pending offers).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="co-amt">Amount (RM)</Label>
              <Input
                id="co-amt"
                inputMode="decimal"
                value={counterAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCounterAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="co-term">Term (months)</Label>
              <Input
                id="co-term"
                inputMode="numeric"
                value={counterTerm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCounterTerm(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCounterDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAdminCounterConfirm()}>Send counter-offer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
