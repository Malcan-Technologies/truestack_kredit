"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Handshake,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CopyField } from "../ui/copy-field";
import { PhoneDisplay } from "../ui/phone-display";
import { RefreshButton } from "../ui/refresh-button";
import { BorrowerApplicationDocumentsAdminStyle } from "./borrower-application-documents-admin-style";
import type { LoanApplicationDetail, LoanPreviewData } from "../../lib/application-form-types";
import { allDocumentsOptional } from "../../lib/application-form-validation";
import { toAmountNumber } from "../../lib/application-form-validation";
import { formatCurrency, formatDate, formatICForDisplay } from "../../lib/borrower-form-display";
import {
  previewBorrowerApplication,
  postBorrowerAcceptOffer,
  postBorrowerCounterOffer,
  postBorrowerRejectOffers,
} from "../../lib/borrower-applications-client";
import { getBorrowerApplicationTimeline } from "../../lib/borrower-loans-client";
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from "@kredit/shared";

function formatNumber(n: number, decimals: number): string {
  return n.toLocaleString("en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return formatDate(iso);
}

const statusColors: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "secondary",
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

type BorrowerSnapshot = {
  id?: string;
  name?: string | null;
  borrowerType?: string | null;
  icNumber?: string | null;
  documentType?: string | null;
  phone?: string | null;
  email?: string | null;
  companyName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
};

function borrowerFromApp(app: LoanApplicationDetail): BorrowerSnapshot | null {
  const b = app.borrower;
  if (!b || typeof b !== "object") return null;
  return b as BorrowerSnapshot;
}

type TimelineEvent = {
  id: string;
  action: string;
  createdAt: string;
  previousData?: unknown;
  newData?: unknown;
  user?: { id: string; email: string; name: string | null } | null;
};

function applicationTimelineLabel(action: string): string {
  const map: Record<string, string> = {
    CREATE: "Application created",
    UPDATE: "Application updated",
    SUBMIT: "Application submitted",
    APPROVE: "Application approved",
    REJECT: "Application rejected",
    RETURN_TO_DRAFT: "Returned for amendments",
    DOCUMENT_UPLOAD: "Document uploaded",
    DOCUMENT_DELETE: "Document deleted",
    BORROWER_CREATE_APPLICATION: "Application created",
    BORROWER_UPDATE_APPLICATION: "Application updated",
    BORROWER_SUBMIT_APPLICATION: "Application submitted",
    BORROWER_APPLICATION_DOCUMENT_UPLOAD: "Document uploaded",
    BORROWER_APPLICATION_DOCUMENT_DELETE: "Document removed",
    BORROWER_APPLICATION_STATUS_CHANGE: "Status updated",
    BORROWER_WITHDRAW_APPLICATION: "Application withdrawn",
    APPLICATION_COUNTER_OFFER: "Counter offer from lender",
    APPLICATION_ACCEPT_BORROWER_OFFER: "Borrower offer accepted",
    APPLICATION_REJECT_OFFERS: "Negotiation offers rejected",
  };
  if (map[action]) return map[action];
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function applicationActorLabel(event: TimelineEvent): string | null {
  if (event.user?.name || event.user?.email) return event.user.name || event.user.email;
  if (event.action.startsWith("BORROWER_")) return "You";
  if (
    event.action.startsWith("APPLICATION_") ||
    event.action === "APPROVE" ||
    event.action === "REJECT" ||
    event.action === "RETURN_TO_DRAFT"
  ) {
    return "Lender";
  }
  return null;
}

function formatTimelineValue(value: unknown, key: string): string {
  if (value == null) return "(empty)";
  if (typeof value === "number") {
    if (/(amount|fee|value|income|capital)/i.test(key)) return formatCurrency(value);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (key === "status" || key === "fromParty" || key === "category") {
      return value.replace(/_/g, " ");
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && (/date|at/i.test(key) || /^\d{4}-\d{2}-\d{2}/.test(value))) {
      return formatDate(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(none)";
    return value
      .map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)))
      .join("; ");
  }
  return JSON.stringify(value);
}

function applicationFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    amount: "Amount",
    term: "Term",
    status: "Status",
    reason: "Reason",
    notes: "Notes",
    originalName: "File",
    filename: "File",
    category: "Category",
    collateralType: "Collateral type",
    collateralValue: "Collateral value",
  };
  return labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
}

function applicationChanges(event: TimelineEvent): Array<{ field: string; from: string; to: string }> {
  const prev =
    event.previousData && typeof event.previousData === "object"
      ? (event.previousData as Record<string, unknown>)
      : null;
  const next =
    event.newData && typeof event.newData === "object" ? (event.newData as Record<string, unknown>) : null;
  if (!prev || !next) return [];
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
  return keys
    .filter((key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key]))
    .map((key) => ({
      field: applicationFieldLabel(key),
      from: formatTimelineValue(prev[key], key),
      to: formatTimelineValue(next[key], key),
    }));
}

function LoanSummaryBreakdown({ preview }: { preview: LoanPreviewData }) {
  return (
    <div className="relative space-y-2.5 text-sm">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Loan Amount</span>
        <span className="font-medium text-foreground">{formatCurrency(preview.loanAmount)}</span>
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
        <span className="font-medium text-warning">{formatCurrency(preview.totalFees)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">Net Disbursement</span>
        <span className="font-medium text-success">{formatCurrency(preview.netDisbursement)}</span>
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
        <span className="font-medium text-foreground">{formatCurrency(preview.totalPayable)}</span>
      </div>
      <div className="flex justify-between items-center bg-foreground/5 -mx-5 px-5 py-3 mt-3 rounded-b-xl border-t border-border">
        <span className="font-semibold text-foreground">Monthly Payment</span>
        <span className="font-bold text-xl text-foreground">{formatCurrency(preview.monthlyPayment)}</span>
      </div>
    </div>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const getActionInfo = (action: string) => {
    switch (action) {
      case "CREATE":
      case "BORROWER_CREATE_APPLICATION":
        return { icon: Plus, label: applicationTimelineLabel(action) };
      case "UPDATE":
      case "BORROWER_UPDATE_APPLICATION":
        return { icon: Pencil, label: applicationTimelineLabel(action) };
      case "SUBMIT":
      case "BORROWER_SUBMIT_APPLICATION":
        return { icon: Send, label: applicationTimelineLabel(action) };
      case "APPROVE":
        return { icon: Check, label: applicationTimelineLabel(action) };
      case "REJECT":
        return { icon: X, label: applicationTimelineLabel(action) };
      case "RETURN_TO_DRAFT":
        return { icon: RotateCcw, label: applicationTimelineLabel(action) };
      case "DOCUMENT_UPLOAD":
      case "BORROWER_APPLICATION_DOCUMENT_UPLOAD":
        return { icon: Upload, label: applicationTimelineLabel(action) };
      case "DOCUMENT_DELETE":
      case "BORROWER_APPLICATION_DOCUMENT_DELETE":
        return { icon: Trash2, label: applicationTimelineLabel(action) };
      case "BORROWER_APPLICATION_STATUS_CHANGE":
        return { icon: Clock, label: applicationTimelineLabel(action) };
      case "BORROWER_WITHDRAW_APPLICATION":
        return { icon: X, label: applicationTimelineLabel(action) };
      case "APPLICATION_COUNTER_OFFER":
        return { icon: Handshake, label: applicationTimelineLabel(action) };
      case "APPLICATION_ACCEPT_BORROWER_OFFER":
      case "APPLICATION_REJECT_OFFERS":
        return { icon: Handshake, label: applicationTimelineLabel(action) };
      default:
        return { icon: Clock, label: applicationTimelineLabel(action) };
    }
  };

  const actionInfo = getActionInfo(event.action);
  const Icon = actionInfo.icon;
  const actorLabel = applicationActorLabel(event);
  const data =
    event.newData && typeof event.newData === "object" ? (event.newData as Record<string, unknown>) : null;
  const previous =
    event.previousData && typeof event.previousData === "object"
      ? (event.previousData as Record<string, unknown>)
      : null;
  const changes = applicationChanges(event);

  const renderDetails = () => {
    if ((event.action === "DOCUMENT_UPLOAD" || event.action === "BORROWER_APPLICATION_DOCUMENT_UPLOAD") && data) {
      return (
        <div className="bg-secondary border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            Uploaded:{" "}
            <span className="font-medium text-foreground">
              {String(data.originalName ?? data.filename ?? "—")}
            </span>
            {data.category ? <span className="ml-2">({formatTimelineValue(data.category, "category")})</span> : null}
          </p>
        </div>
      );
    }

    if ((event.action === "DOCUMENT_DELETE" || event.action === "BORROWER_APPLICATION_DOCUMENT_DELETE") && (previous || data)) {
      const source = previous ?? data;
      return (
        <div className="bg-secondary border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            Removed:{" "}
            <span className="font-medium text-foreground">
              {String(source?.originalName ?? source?.filename ?? "—")}
            </span>
            {source?.category ? (
              <span className="ml-2">({formatTimelineValue(source.category, "category")})</span>
            ) : null}
          </p>
        </div>
      );
    }

    if (
      (event.action === "BORROWER_APPLICATION_STATUS_CHANGE" ||
        event.action === "APPROVE" ||
        event.action === "REJECT" ||
        event.action === "RETURN_TO_DRAFT") &&
      data
    ) {
      return (
        <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
          <p className="text-xs text-muted-foreground">
            {previous?.status ? (
              <>
                <span className="font-medium text-foreground">{formatTimelineValue(previous.status, "status")}</span>
                {" -> "}
                <span className="font-medium text-foreground">{formatTimelineValue(data.status, "status")}</span>
              </>
            ) : (
              <span className="font-medium text-foreground">{formatTimelineValue(data.status, "status")}</span>
            )}
          </p>
          {data.reason ? (
            <p className="text-xs text-muted-foreground">
              Reason: <span className="text-foreground">{formatTimelineValue(data.reason, "reason")}</span>
            </p>
          ) : null}
        </div>
      );
    }

    if (
      (event.action === "APPLICATION_COUNTER_OFFER" || event.action === "APPLICATION_ACCEPT_BORROWER_OFFER") &&
      data
    ) {
      return (
        <div className="bg-secondary border border-border rounded-lg p-3 space-y-1">
          {data.amount != null ? (
            <p className="text-xs text-muted-foreground">
              Amount: <span className="font-medium text-foreground">{formatTimelineValue(data.amount, "amount")}</span>
            </p>
          ) : null}
          {data.term != null ? (
            <p className="text-xs text-muted-foreground">
              Term: <span className="font-medium text-foreground">{formatTimelineValue(data.term, "term")} months</span>
            </p>
          ) : null}
        </div>
      );
    }

    if ((event.action === "APPLICATION_REJECT_OFFERS" || event.action === "BORROWER_WITHDRAW_APPLICATION") && data) {
      return (
        <div className="bg-secondary border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            {data.reason || data.notes ? (
              <>
                Reason:{" "}
                <span className="font-medium text-foreground">
                  {formatTimelineValue(data.reason ?? data.notes, "reason")}
                </span>
              </>
            ) : (
              <span className="font-medium text-foreground">No additional details provided.</span>
            )}
          </p>
        </div>
      );
    }

    if (changes.length > 0) {
      return (
        <div className="bg-secondary border border-border rounded-lg p-3 space-y-2">
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
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="w-px flex-1 bg-border mt-2 min-h-[8px]" />
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-foreground leading-snug">{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatRelativeTime(event.createdAt)}</span>
        </div>
        {actorLabel && (
          <p className="text-sm text-muted-foreground mb-2">
            by {actorLabel}
          </p>
        )}
        {renderDetails()}
        <p className="text-xs text-muted-foreground mt-2">{formatDate(event.createdAt)}</p>
      </div>
    </div>
  );
}

type Props = {
  app: LoanApplicationDetail;
  onDocumentsChange: () => Promise<void>;
  onRefresh?: () => Promise<void>;
};

export function BorrowerApplicationDetail({ app, onDocumentsChange, onRefresh }: Props) {
  const router = useRouter();
  const refresh = onRefresh ?? onDocumentsChange;

  const requiredDocs = app.product?.requiredDocuments ?? [];
  const isPhysicalDraft = app.loanChannel === "PHYSICAL" && app.status === "DRAFT";
  const canShowDocuments =
    app.status === "DRAFT" ||
    app.status === "SUBMITTED" ||
    app.status === "UNDER_REVIEW";
  const docMode = isPhysicalDraft ? "post_submit" : app.status === "DRAFT" ? "draft" : "post_submit";
  const loanLink = app.loan?.id ? `/loans/${app.loan.id}` : null;
  const borrower = borrowerFromApp(app);

  const [preview, setPreview] = useState<LoanPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [showNegDialog, setShowNegDialog] = useState(false);
  const [negAmount, setNegAmount] = useState("");
  const [negTerm, setNegTerm] = useState("");
  const [negBusy, setNegBusy] = useState(false);
  const [lenderOfferPreview, setLenderOfferPreview] = useState<LoanPreviewData | null>(null);
  const [lenderOfferPreviewLoading, setLenderOfferPreviewLoading] = useState(false);

  const pendingLenderOffer = (app.offerRounds ?? []).find(
    (o) => o.status === LoanApplicationOfferStatus.PENDING && o.fromParty === LoanApplicationOfferParty.ADMIN
  );
  const pendingBorrowerOffer = (app.offerRounds ?? []).find(
    (o) => o.status === LoanApplicationOfferStatus.PENDING && o.fromParty === LoanApplicationOfferParty.BORROWER
  );

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const r = await previewBorrowerApplication({
        productId: app.productId,
        amount: toAmountNumber(app.amount),
        term: app.term,
      });
      if (r.success) setPreview(r.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [app.productId, app.amount, app.term]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (!pendingLenderOffer) {
      setLenderOfferPreview(null);
      setLenderOfferPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setLenderOfferPreviewLoading(true);
    void previewBorrowerApplication({
      productId: app.productId,
      amount: Number(pendingLenderOffer.amount),
      term: Number(pendingLenderOffer.term ?? app.term),
    })
      .then((r) => {
        if (!cancelled && r.success) setLenderOfferPreview(r.data);
        else if (!cancelled) setLenderOfferPreview(null);
      })
      .catch(() => {
        if (!cancelled) setLenderOfferPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLenderOfferPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [app.productId, pendingLenderOffer?.id, pendingLenderOffer?.amount, pendingLenderOffer?.term]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setTimelineLoading(true);
      try {
        const res = await getBorrowerApplicationTimeline(app.id, { limit: 30 });
        if (!cancelled && res.success) setTimeline(res.data as TimelineEvent[]);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not load activity");
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.id]);

  const openCounterDialog = () => {
    if (pendingLenderOffer) {
      setNegAmount(String(Number(pendingLenderOffer.amount)));
      setNegTerm(String(pendingLenderOffer.term));
    } else if (preview) {
      setNegAmount(String(preview.loanAmount));
      setNegTerm(String(preview.term));
    } else {
      setNegAmount(String(toAmountNumber(app.amount)));
      setNegTerm(String(app.term));
    }
    setShowNegDialog(true);
  };

  const handleAcceptOffer = async () => {
    setNegBusy(true);
    try {
      await postBorrowerAcceptOffer(app.id);
      toast.success("Offer accepted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept offer");
    } finally {
      setNegBusy(false);
    }
  };

  const handleRejectOffers = async () => {
    if (!window.confirm("Reject the lender’s offer? Negotiation will end.")) return;
    setNegBusy(true);
    try {
      await postBorrowerRejectOffers(app.id);
      toast.success("Offer rejected");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject");
    } finally {
      setNegBusy(false);
    }
  };

  const handleSubmitCounter = async () => {
    const amt = parseFloat(String(negAmount).replace(/,/g, ""));
    const term = parseInt(String(negTerm).replace(/\s/g, ""), 10);
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isInteger(term) || term < 1) {
      toast.error("Enter a valid amount and term (months)");
      return;
    }
    setNegBusy(true);
    try {
      await postBorrowerCounterOffer(app.id, { amount: amt, term });
      toast.success("Counter-offer sent");
      setShowNegDialog(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Counter-offer failed");
    } finally {
      setNegBusy(false);
    }
  };

  const isCorporate = borrower?.borrowerType === "CORPORATE";
  const product = app.product;

  const getMissingRequiredDocs = () => {
    const docs = app.documents ?? [];
    return requiredDocs.filter((doc) => doc.required && !docs.some((d) => d.category === doc.key));
  };
  const missingRequiredDocs = app.status === "DRAFT" && !isPhysicalDraft ? getMissingRequiredDocs() : [];

  const subtitleName =
    borrower &&
    (isCorporate && borrower.companyName ? borrower.companyName : borrower.name || "Borrower");

  return (
    <div className="space-y-6">
      {/* Header — matches admin applications/[id] */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/applications")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-heading font-bold text-gradient">Application</h1>
              <Badge variant="outline" className="text-xs">
                {app.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
              </Badge>
              <Badge variant={statusColors[app.status] ?? "secondary"}>
                {app.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {subtitleName} • Created {formatDate(app.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <RefreshButton
            onRefresh={async () => {
              await refresh();
            }}
            showLabel
            showToast
            successMessage="Application refreshed"
          />
          {loanLink && (
            <Button variant="outline" asChild>
              <Link href={loanLink}>
                <Eye className="h-4 w-4 mr-2" />
                View Loan
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isPhysicalDraft && (
        <div className="bg-muted/30 border rounded-lg p-4">
          <p className="font-medium text-foreground">Read-only physical loan application</p>
          <p className="text-sm text-muted-foreground mt-1">
            This draft physical loan application cannot be edited from the borrower portal. Any changes, including
            document uploads, must be handled by your lender.
          </p>
        </div>
      )}

      {missingRequiredDocs.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Missing required documents</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please upload the following before submitting:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                {missingRequiredDocs.map((doc) => (
                  <li key={doc.key}>{doc.label}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Borrower */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  {isCorporate ? (
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <User className="h-5 w-5 text-muted-foreground" />
                  )}
                  Borrower
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {borrower ? (
                  <>
                    <div>
                      <p className="font-medium text-lg">
                        {isCorporate && borrower.companyName ? borrower.companyName : borrower.name ?? "—"}
                      </p>
                      {isCorporate && borrower.companyName && (
                        <p className="text-sm text-muted-foreground">Rep: {borrower.name}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
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
                  <p className="text-sm text-muted-foreground">Borrower details are loading or unavailable.</p>
                )}
              </CardContent>
            </Card>

            {/* Product */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  Product
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium text-lg">{product?.name ?? "—"}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {product?.interestModel === "RULE_78" ? "Rule 78" : product?.interestModel?.replace(/_/g, " ") ?? "—"}
                    </Badge>
                    <Badge
                      variant={product?.loanScheduleType === "JADUAL_K" ? "default" : "outline"}
                      className="text-xs flex items-center gap-1"
                    >
                      {product?.loanScheduleType === "JADUAL_K" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <Shield className="h-3 w-3" />
                      )}
                      {product?.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">{toAmountNumber(product?.interestRate)}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Late Payment Rate</p>
                    <p className="font-medium">{toAmountNumber(product?.latePaymentRate)}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Arrears Period</p>
                    <p className="font-medium">{product?.arrearsPeriod ?? "—"} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Default Period</p>
                    <p className="font-medium">{product?.defaultPeriod ?? "—"} days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(app.status === "SUBMITTED" || app.status === "UNDER_REVIEW") &&
            ((app.offerRounds?.length ?? 0) > 0 || pendingLenderOffer || pendingBorrowerOffer) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Handshake className="h-5 w-5 text-muted-foreground" />
                    Offer negotiation
                  </CardTitle>
                  <CardDescription>
                    The lender may propose revised amount and term. You can accept, counter, or reject.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pendingBorrowerOffer && !pendingLenderOffer && (
                    <p className="text-sm text-muted-foreground">
                      Your counter-offer is pending lender review.
                    </p>
                  )}
                  {pendingLenderOffer && (
                    <div className="relative overflow-hidden rounded-xl border-2 border-amber-400/90 bg-amber-50 p-5 shadow-sm dark:border-amber-600 dark:bg-amber-950/45 ring-1 ring-amber-200/80 dark:ring-amber-800/50 space-y-4">
                      <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-200/40 dark:bg-amber-500/10 rounded-full blur-2xl" />
                      <div className="relative">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                          <div className="p-1.5 rounded-md bg-amber-200/60 dark:bg-amber-900/50">
                            <Calculator className="h-5 w-5 text-amber-900 dark:text-amber-200" />
                          </div>
                          Pending offer from lender
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Estimated fees, net disbursement, and monthly payment if you accept this offer.
                        </p>
                      </div>
                      {lenderOfferPreviewLoading ? (
                        <p className="text-sm text-muted-foreground relative">Calculating estimate…</p>
                      ) : lenderOfferPreview ? (
                        <LoanSummaryBreakdown preview={lenderOfferPreview} />
                      ) : (
                        <div className="relative space-y-2 text-sm">
                          <p className="text-muted-foreground">
                            Amount:{" "}
                            <span className="font-medium text-foreground">
                              {formatCurrency(Number(pendingLenderOffer.amount))}
                            </span>
                          </p>
                          <p className="text-muted-foreground">
                            Term:{" "}
                            <span className="font-medium text-foreground">{pendingLenderOffer.term} months</span>
                          </p>
                          <p className="text-xs text-destructive">Full loan estimate could not be loaded.</p>
                        </div>
                      )}
                      <div className="relative flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleAcceptOffer()}
                          disabled={negBusy}
                        >
                          Accept offer
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={openCounterDialog}
                          disabled={negBusy}
                        >
                          Counter
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void handleRejectOffers()}
                          disabled={negBusy}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                  {(app.offerRounds?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">History</p>
                      <ul className="space-y-2 text-sm border rounded-lg divide-y max-h-48 overflow-y-auto">
                        {(app.offerRounds ?? []).map((o) => (
                          <li key={o.id} className="flex flex-wrap justify-between gap-2 p-3">
                            <span>
                              {o.fromParty === LoanApplicationOfferParty.ADMIN ? "Lender" : "You"} · {o.status}
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

          {/* Loan Summary — admin-style panel */}
          {previewLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading loan summary…</div>
          ) : preview ? (
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
              <LoanSummaryBreakdown preview={preview} />
              {app.notes && (
                <div className="relative mt-4 pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm whitespace-pre-wrap mt-1">{app.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loan summary could not be calculated.</p>
          )}

          {/* Documents — admin-style list */}
          {canShowDocuments ? (
            <BorrowerApplicationDocumentsAdminStyle
              app={app}
              requiredDocs={requiredDocs}
              documents={app.documents ?? []}
              mode={docMode}
              onDocumentsChange={onDocumentsChange}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Documents
                </CardTitle>
                <CardDescription>Read-only for this status</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Documents cannot be changed while this application is {app.status.toLowerCase().replace(/_/g, " ")}.
                </p>
                {(app.documents ?? []).length > 0 ? (
                  <ul className="space-y-2 text-sm border rounded-lg divide-y">
                    {(app.documents ?? []).map((d) => (
                      <li key={d.id} className="flex justify-between gap-2 p-3">
                        <span className="truncate">{d.originalName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDate(d.uploadedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          )}

          {allDocumentsOptional(requiredDocs) && requiredDocs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              All configured document types for this product are optional. You may still add files to support your
              application.
            </p>
          )}
        </div>

        {/* Right column — Quick Info + Timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <CopyField
                label="Application ID"
                value={app.id}
                valueClassName="font-mono text-xs"
              />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(app.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{formatRelativeTime(app.updatedAt)}</span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-muted-foreground shrink-0">Product</span>
                <span className="text-right font-medium">{product?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest Model</span>
                <span>{product?.interestModel === "RULE_78" ? "Rule 78" : product?.interestModel?.replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Schedule Type</span>
                <span>{product?.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}</span>
              </div>
              {product?.loanScheduleType === "JADUAL_K" && app.collateralType && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collateral</span>
                    <span>{app.collateralType}</span>
                  </div>
                  {app.collateralValue != null && app.collateralValue !== "" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Collateral Value</span>
                      <span>{formatCurrency(toAmountNumber(app.collateralValue))}</span>
                    </div>
                  )}
                </>
              )}
              {product?.earlySettlementEnabled && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Early Settlement</span>
                    <span className="text-success font-medium">Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lock-in Period</span>
                    <span>
                      {product.earlySettlementLockInMonths != null && product.earlySettlementLockInMonths > 0
                        ? `${product.earlySettlementLockInMonths} months`
                        : "None"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settlement Discount</span>
                    <span>
                      {product.earlySettlementDiscountType === "PERCENTAGE"
                        ? `${toAmountNumber(product.earlySettlementDiscountValue)}%`
                        : formatCurrency(toAmountNumber(product.earlySettlementDiscountValue))}
                    </span>
                  </div>
                </>
              )}
              {loanLink && (
                <div className="pt-2 border-t">
                  <Link
                    href={loanLink}
                    className="text-foreground hover:text-muted-foreground hover:underline inline-flex items-center gap-1"
                  >
                    View Loan
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setTimelineExpanded((p) => !p)}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    Activity Timeline
                  </CardTitle>
                  <CardDescription>History of changes and events</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimelineExpanded((p) => !p);
                  }}
                >
                  {timelineExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {timelineExpanded && (
              <CardContent>
                {timelineLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
                ) : timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet</p>
                ) : (
                  <div className="space-y-0">
                    {timeline.map((event) => (
                      <TimelineItem key={event.id} event={event} />
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {app.status === "APPROVED" && !app.loan?.id && (
        <p className="text-sm text-muted-foreground">
          Approved — your loan record will appear in{" "}
          <Link href="/loans" className="text-primary underline font-medium">
            Loans
          </Link>{" "}
          when ready.
        </p>
      )}

      <Dialog open={showNegDialog} onOpenChange={setShowNegDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Counter-offer</DialogTitle>
            <DialogDescription>
              Propose the loan amount and term you want. The lender will review your counter-offer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="neg-amount">Amount (MYR)</Label>
              <Input
                id="neg-amount"
                inputMode="decimal"
                value={negAmount}
                onChange={(e) => setNegAmount(e.target.value)}
                placeholder="e.g. 50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="neg-term">Term (months)</Label>
              <Input
                id="neg-term"
                inputMode="numeric"
                value={negTerm}
                onChange={(e) => setNegTerm(e.target.value)}
                placeholder="e.g. 36"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNegDialog(false)} disabled={negBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmitCounter()} disabled={negBusy}>
              Send counter-offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
