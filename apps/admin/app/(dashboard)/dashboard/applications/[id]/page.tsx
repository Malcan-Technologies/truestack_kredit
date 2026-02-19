"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
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
  Eye,
  Shield,
  ShieldCheck,
  ExternalLink,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyField } from "@/components/ui/copy-field";
import { PhoneDisplay } from "@/components/ui/phone-display";
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
} from "@/lib/utils";
import { useCurrentRole } from "@/components/tenant-context";
import { canApproveApplications } from "@/lib/permissions";

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
  notes: string | null;
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
  documents: ApplicationDocument[];
  loan?: {
    id: string;
    status: string;
  } | null;
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

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "secondary" as "default",
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

// ============================================
// Timeline Component
// ============================================

function TimelineItem({ event }: { event: TimelineEvent }) {
  const getActionInfo = (action: string) => {
    switch (action) {
      case "CREATE":
        return { icon: Plus, label: "Created" };
      case "UPDATE":
        return { icon: Pencil, label: "Updated" };
      case "SUBMIT":
        return { icon: Send, label: "Submitted" };
      case "APPROVE":
        return { icon: Check, label: "Approved" };
      case "REJECT":
        return { icon: X, label: "Rejected" };
      case "DOCUMENT_UPLOAD":
        return { icon: Upload, label: "Document Uploaded" };
      case "DOCUMENT_DELETE":
        return { icon: Trash2, label: "Document Deleted" };
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
  const currentRole = useCurrentRole();

  const [application, setApplication] = useState<Application | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialog states
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

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

  const fetchApplication = useCallback(async () => {
    try {
      const res = await api.get<Application>(`/api/loans/applications/${applicationId}`);
      if (res.success && res.data) {
        setApplication(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch application:", error);
    }
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
      await Promise.all([fetchApplication(), fetchTimeline()]);
      setLoading(false);
    };
    loadData();
  }, [fetchApplication, fetchTimeline]);

  const handleSubmitClick = () => {
    if (!canSubmit) {
      toast.error(`Please upload all required documents before submitting`);
      return;
    }
    setShowSubmitDialog(true);
  };

  const handleSubmitConfirm = async () => {
    setShowSubmitDialog(false);
    setActionLoading("submit");
    const res = await api.post(`/api/loans/applications/${applicationId}/submit`, {});
    if (res.success) {
      toast.success("Application submitted for review");
      fetchApplication();
      fetchTimeline();
    } else {
      toast.error(res.error || "Failed to submit application");
    }
    setActionLoading(null);
  };

  const handleApproveClick = () => {
    setShowApproveDialog(true);
  };

  const handleApproveConfirm = async () => {
    setShowApproveDialog(false);
    setActionLoading("approve");
    const res = await api.post(`/api/loans/applications/${applicationId}/approve`, {});
    if (res.success) {
      toast.success("Application approved! Loan created.");
      fetchApplication();
      fetchTimeline();
    } else {
      toast.error(res.error || "Failed to approve application");
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
    } else {
      toast.error(res.error || "Failed to reject application");
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
  const getPreview = () => {
    if (!application) return null;

    const loanAmount = toSafeNumber(application.amount);
    const term = application.term;
    const interestRate = toSafeNumber(application.product.interestRate);

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

    if (application.product.interestModel === "FLAT") {
      const annualRate = safeDivide(interestRate, 100);
      totalInterest = safeMultiply(safeMultiply(loanAmount, annualRate), safeDivide(term, 12));
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

  const preview = getPreview();
  const requiredDocs = application.product.requiredDocuments || [];

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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-gradient">
                Application
              </h1>
              <Badge variant={statusColors[application.status]}>
                {application.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {application.borrower.borrowerType === "CORPORATE" && application.borrower.companyName
                ? application.borrower.companyName
                : application.borrower.name} • Created {formatDate(application.createdAt)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {application.status === "DRAFT" && (
            <Button
              onClick={handleSubmitClick}
              disabled={actionLoading === "submit" || !canSubmit}
              title={!canSubmit ? "Upload all required documents first" : ""}
            >
              <Send className="h-4 w-4 mr-2" />
              {actionLoading === "submit" ? "Submitting..." : "Submit"}
            </Button>
          )}
          {(application.status === "SUBMITTED" || application.status === "UNDER_REVIEW") && canApproveApplications(currentRole) && (
            <>
              <Button
                variant="destructive"
                onClick={handleRejectClick}
                disabled={actionLoading === "reject"}
              >
                <X className="h-4 w-4 mr-2" />
                {actionLoading === "reject" ? "Rejecting..." : "Reject"}
              </Button>
              <Button onClick={handleApproveClick} disabled={actionLoading === "approve"}>
                <Check className="h-4 w-4 mr-2" />
                {actionLoading === "approve" ? "Approving..." : "Approve"}
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
                <CardTitle className="text-sm flex items-center gap-2">
                  {application.borrower.borrowerType === "CORPORATE" ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
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
                    {application.borrower.documentVerified ? (
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
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Product
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium text-lg">{application.product.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {application.product.interestModel.replace("_", " ")}
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

          {/* Loan Summary */}
          {preview && (
            <div className="relative overflow-hidden rounded-xl border border-border bg-secondary p-5 space-y-3">
              {/* Subtle accent glow */}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-foreground/5 rounded-full blur-3xl" />
              <h3 className="relative font-semibold flex items-center gap-2 text-foreground">
                <div className="p-1.5 rounded-md bg-foreground/10">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </div>
                Loan Summary
              </h3>
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
                  <span className="text-foreground">{preview.interestRate}% p.a.</span>
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
                {/* Monthly Payment Highlight */}
                <div className="flex justify-between items-center bg-foreground/5 -mx-5 px-5 py-3 mt-3 rounded-b-xl border-t border-border">
                  <span className="font-semibold text-foreground">Monthly Payment</span>
                  <span className="font-bold text-xl text-foreground">
                    {formatCurrency(preview.monthlyPayment)}
                  </span>
                </div>
              </div>
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
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDocument(uploadedDoc.id)}
                              title="Delete document"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        ) : (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            title="Delete document"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
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
              <CardTitle className="text-sm">Quick Info</CardTitle>
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
                <span>{application.product.interestModel.replace("_", " ")}</span>
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

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
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

      {/* Approve Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this loan application?
              This will create a new loan and generate the repayment schedule.
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
    </div>
  );
}
