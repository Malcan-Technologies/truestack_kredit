"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../../lib/borrower-auth-client";
import { listBorrowerApplications } from "../../lib/borrower-applications-client";
import {
  fetchLoanCenterOverview,
  getBorrowerApplicationTimeline,
  listBorrowerLoans,
  recordBorrowerLoanPayment,
  withdrawBorrowerApplication,
} from "../../lib/borrower-loans-client";
import type { LoanCenterOverview } from "../../lib/borrower-loan-types";
import type { BorrowerLoanListItem } from "../../lib/borrower-loan-types";
import type { LoanApplicationDetail } from "../../lib/application-form-types";
import { toAmountNumber } from "../../lib/application-form-validation";

export type LoanCenterTab =
  | "active"
  | "pending_disbursement"
  | "discharged"
  | "applications"
  | "incomplete"
  | "rejected";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function LoanCenterPage() {
  const [tab, setTab] = useState<LoanCenterTab>("active");
  const tabList: { id: LoanCenterTab; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "pending_disbursement", label: "Before payout" },
    { id: "discharged", label: "Discharged" },
    { id: "applications", label: "Applications" },
    { id: "incomplete", label: "Incomplete" },
    { id: "rejected", label: "Rejected" },
  ];
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<LoanCenterOverview | null>(null);
  const [applications, setApplications] = useState<LoanApplicationDetail[]>([]);
  const [activeLoans, setActiveLoans] = useState<BorrowerLoanListItem[]>([]);
  const [pendingDisbursementLoans, setPendingDisbursementLoans] = useState<BorrowerLoanListItem[]>([]);
  const [dischargedLoans, setDischargedLoans] = useState<BorrowerLoanListItem[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, apps, aLoans, pLoans, dLoans] = await Promise.all([
        fetchLoanCenterOverview(),
        listBorrowerApplications({ pageSize: 100 }),
        listBorrowerLoans({ tab: "active", pageSize: 100 }),
        listBorrowerLoans({ tab: "pending_disbursement", pageSize: 100 }),
        listBorrowerLoans({ tab: "discharged", pageSize: 100 }),
      ]);
      if (ov.success) setOverview(ov.data);
      if (apps.success) setApplications(apps.data);
      setActiveLoans(aLoans.data);
      setPendingDisbursementLoans(pLoans.data);
      setDischargedLoans(dLoans.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onSwitch = () => void loadAll();
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
  }, [loadAll]);

  const incomplete = useMemo(
    () => applications.filter((a) => a.status === "DRAFT"),
    [applications]
  );
  const pipelineApps = useMemo(
    () => applications.filter((a) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(a.status)),
    [applications]
  );
  const rejectedApps = useMemo(
    () => applications.filter((a) => ["REJECTED", "CANCELLED"].includes(a.status)),
    [applications]
  );

  const counts = overview?.counts;

  const tabContent = () => {
    switch (tab) {
      case "active":
        return (
          <LoanListPane
            emptyIcon={<CreditCard className="h-12 w-12 text-muted-foreground/40" />}
            emptyTitle="No Active Loans"
            emptyDesc="You don't have any active loans at the moment."
            cta={
              <Button asChild>
                <Link href="/applications/apply">
                  <Plus className="h-4 w-4 mr-2" />
                  Apply for your first loan
                </Link>
              </Button>
            }
            items={activeLoans}
            render={(loan) => (
              <LoanCard key={loan.id} loan={loan} onPaid={() => void loadAll()} />
            )}
          />
        );
      case "pending_disbursement":
        return (
          <LoanListPane
            emptyIcon={<Clock className="h-12 w-12 text-muted-foreground/40" />}
            emptyTitle="Nothing pending payout"
            emptyDesc="When a loan is approved and waiting for disbursement, it will appear here."
            items={pendingDisbursementLoans}
            render={(loan) => <PendingDisbursementLoanCard key={loan.id} loan={loan} />}
          />
        );
      case "discharged":
        return (
          <LoanListPane
            emptyIcon={<CheckCircle2 className="h-12 w-12 text-muted-foreground/40" />}
            emptyTitle="No Discharged Loans"
            emptyDesc="Loans that have been fully repaid will appear here."
            items={dischargedLoans}
            render={(loan) => <LoanCard key={loan.id} loan={loan} onPaid={() => void loadAll()} />}
          />
        );
      case "applications":
        return <ApplicationListPane apps={pipelineApps} onChanged={() => void loadAll()} />;
      case "incomplete":
        return (
          <ApplicationListPane
            apps={incomplete}
            onChanged={() => void loadAll()}
            emptyCta={
              <Button asChild>
                <Link href="/applications/apply">
                  <Plus className="h-4 w-4 mr-2" />
                  Start new application
                </Link>
              </Button>
            }
          />
        );
      case "rejected":
        return (
          <ApplicationListPane apps={rejectedApps} onChanged={() => void loadAll()} variant="rejected" />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your Loans</h1>
            <p className="text-sm text-primary font-medium mt-0.5">
              Active and completed loans
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Loans & applications</CardTitle>
          <CardDescription>
          Filter by status. Summary totals (paid, outstanding, etc.) are on the dashboard.
        </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !overview ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="w-full">
              <div className="flex flex-wrap gap-1 border-b border-border pb-2">
                {tabList.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md transition-colors ${
                      tab === t.id
                        ? "text-primary border-b-2 border-primary -mb-px font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                    {counts && t.id === "active" ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {counts.activeLoans}
                      </Badge>
                    ) : null}
                    {counts && t.id === "pending_disbursement" ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {counts.pendingDisbursementLoans}
                      </Badge>
                    ) : null}
                    {counts && t.id === "discharged" ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {counts.dischargedLoans}
                      </Badge>
                    ) : null}
                    {counts && t.id === "applications" ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {counts.applicationsTab}
                      </Badge>
                    ) : null}
                    {counts && t.id === "incomplete" ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {counts.incompleteApplications}
                      </Badge>
                    ) : null}
                    {counts && t.id === "rejected" ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5">
                        {counts.rejectedApplications}
                      </Badge>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="mt-6">{tabContent()}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoanListPane({
  items,
  render,
  emptyIcon,
  emptyTitle,
  emptyDesc,
  cta,
}: {
  items: BorrowerLoanListItem[];
  render: (loan: BorrowerLoanListItem) => React.ReactNode;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDesc: string;
  cta?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="flex justify-center mb-4">{emptyIcon}</div>
        <h3 className="text-lg font-semibold">{emptyTitle}</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6">{emptyDesc}</p>
        {cta}
      </div>
    );
  }
  return <div className="space-y-4">{items.map((loan) => render(loan))}</div>;
}

function PendingDisbursementLoanCard({ loan }: { loan: BorrowerLoanListItem }) {
  const review = loan.signedAgreementReviewStatus ?? "NONE";
  const attestationDone = !!loan.attestationCompletedAt;
  const reviewLabel =
    review === "APPROVED"
      ? "Signed agreement approved"
      : review === "PENDING"
        ? "Awaiting approval"
        : review === "REJECTED"
          ? "Rejected — upload again"
          : "Agreement not complete";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{loan.product?.name ?? "Loan"}</CardTitle>
          <p className="text-xs text-muted-foreground font-mono mt-1">ID: {shortId(loan.id)}</p>
        </div>
        <Badge variant="outline">Pending disbursement</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="font-semibold">{formatRm(loan.principalAmount)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Term</p>
            <p className="font-semibold">{loan.term} months</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {!attestationDone && (
            <span className="block text-amber-800 dark:text-amber-200 mb-1">
              Complete attestation (video or lawyer meeting) before signing the agreement.
            </span>
          )}
          {reviewLabel}
        </p>
        <Button asChild size="sm">
          <Link href={`/loans/${loan.id}`}>
            <FileText className="h-4 w-4 mr-2" />
            {attestationDone ? "Agreement & signing" : "Attestation & agreement"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoanCard({
  loan,
  onPaid,
}: {
  loan: BorrowerLoanListItem;
  onPaid: () => void;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const canPay = loan.status === "ACTIVE" || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-primary">{loan.product?.name ?? "Loan"}</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground font-mono mt-1">ID: {shortId(loan.id)}</p>
        </div>
        <Badge variant="outline">{loan.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="font-semibold">{formatRm(loan.principalAmount)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Term</p>
            <p className="font-semibold">{loan.term} months</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="font-semibold">{loan.progress.progressPercent}%</p>
          </div>
        </div>
        {canPay && (
          <Button size="sm" onClick={() => setPayOpen(true)}>
            Record payment
          </Button>
        )}
        <BorrowerPaymentDialog
          loanId={loan.id}
          open={payOpen}
          onOpenChange={setPayOpen}
          onSuccess={() => {
            setPayOpen(false);
            onPaid();
            toast.success("Payment recorded");
          }}
        />
      </CardContent>
    </Card>
  );
}

function ApplicationListPane({
  apps,
  onChanged,
  emptyCta,
  variant,
}: {
  apps: LoanApplicationDetail[];
  onChanged: () => void;
  emptyCta?: React.ReactNode;
  variant?: "rejected";
}) {
  if (apps.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold">Nothing here</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          {variant === "rejected"
            ? "No rejected or withdrawn applications."
            : "No applications in this category."}
        </p>
        {emptyCta}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {apps.map((app) => (
        <ApplicationCard key={app.id} app={app} onChanged={onChanged} variant={variant} />
      ))}
    </div>
  );
}

function ApplicationCard({
  app,
  onChanged,
  variant,
}: {
  app: LoanApplicationDetail;
  onChanged: () => void;
  variant?: "rejected";
}) {
  const [open, setOpen] = useState(false);
  const [timeline, setTimeline] = useState<
    Array<{ id: string; action: string; createdAt: string; newData: unknown }>
  >([]);
  const [loadingTl, setLoadingTl] = useState(false);
  const withdrawable = app.status === "SUBMITTED" || app.status === "UNDER_REVIEW";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingTl(true);
      try {
        const res = await getBorrowerApplicationTimeline(app.id, { limit: 20 });
        if (!cancelled && res.success) setTimeline(res.data);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load history");
      } finally {
        if (!cancelled) setLoadingTl(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, app.id]);

  const onWithdraw = async () => {
    try {
      await withdrawBorrowerApplication(app.id);
      toast.success("Application withdrawn");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdraw failed");
    }
  };

  const isRejected = variant === "rejected" || app.status === "REJECTED" || app.status === "CANCELLED";

  return (
    <Card className={isRejected ? "border-destructive/30 bg-destructive/[0.03]" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {isRejected ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <FileText className="h-4 w-4 text-primary" />
            )}
            {app.product?.name ?? "Application"}
          </CardTitle>
          <p className={`text-xs font-mono mt-1 ${isRejected ? "text-destructive" : "text-muted-foreground"}`}>
            ID: {shortId(app.id)}
          </p>
        </div>
        <div className="flex gap-2">
          {withdrawable && (
            <Button variant="outline" size="sm" className="text-destructive border-destructive/50" onClick={onWithdraw}>
              Withdraw
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Amount requested</p>
            <p className="font-semibold">{formatRm(app.amount)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Term</p>
            <p className="font-semibold">{app.term} months</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-semibold uppercase">{app.status.replace(/_/g, " ")}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen(!open)}>
          {open ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" /> Hide details
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" /> View details
            </>
          )}
        </Button>
        {open && (
          <div className="rounded-lg border p-3 text-sm space-y-2">
            <p className="font-medium">Application history</p>
            {loadingTl ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {timeline.map((t) => (
                  <li key={t.id} className="text-xs border-b pb-2">
                    <span className="font-medium">{t.action.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-2">
                      {new Date(t.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BorrowerPaymentDialog({
  loanId,
  open,
  onOpenChange,
  onSuccess,
}: {
  loanId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await recordBorrowerLoanPayment(loanId, { amount: n, reference: reference || undefined });
      onSuccess();
      setAmount("");
      setReference("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-background rounded-lg border shadow-lg max-w-md w-full p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Record payment</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Payments are allocated to installments automatically (same rules as the lender portal). Amount cannot exceed
            outstanding balance.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pay-amt">Amount (RM)</Label>
            <Input
              id="pay-amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank transfer ref"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
