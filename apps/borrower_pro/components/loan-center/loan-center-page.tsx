"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { RefreshButton } from "../ui/refresh-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../../lib/borrower-auth-client";
import { listBorrowerApplications } from "../../lib/borrower-applications-client";
import {
  fetchLoanCenterOverview,
  getBorrowerApplicationTimeline,
  listBorrowerLoans,
  withdrawBorrowerApplication,
} from "../../lib/borrower-loans-client";
import type { LoanCenterOverview } from "../../lib/borrower-loan-types";
import type { BorrowerLoanListItem } from "../../lib/borrower-loan-types";
import type { LoanApplicationDetail } from "../../lib/application-form-types";
import { toAmountNumber } from "../../lib/application-form-validation";
import { deriveLoanJourneyPhase, loanJourneyPhaseLabel } from "../../lib/loan-journey-phase";
import { borrowerLoanStatusBadgeVariant, loanStatusBadgeLabelFromDb } from "../../lib/loan-status-label";
import { borrowerLoanNeedsContinueAction } from "../../lib/borrower-loan-continue-eligibility";
import { formatDate } from "../../lib/borrower-form-display";
import { BorrowerPaymentDialog } from "./borrower-payment-dialog";
import { LoanChannelPill } from "./loan-channel-pill";
import { cn } from "../../lib/utils";

export type LoanCenterTab =
  | "all"
  | "active"
  | "before_payout"
  | "discharged"
  | "incomplete"
  | "rejected";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatApplicationStatusLabel(status: string): string {
  if (status === "CANCELLED") return "Withdrawn";
  return status.replace(/_/g, " ");
}

function filterByProductName<T extends { product?: { name?: string | null } }>(
  rows: T[],
  productName: string
): T[] {
  if (!productName) return rows;
  return rows.filter((r) => (r.product?.name ?? "") === productName);
}

/** Same as `admin_pro` `dashboard/loans/page.tsx` `ProgressDonut`. */
function ProgressDonut({
  percent,
  size = 32,
  strokeWidth = 4,
  readyToComplete = false,
  status,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  readyToComplete?: boolean;
  status?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;

  let strokeColor = "stroke-foreground";
  if (status === "COMPLETED") {
    strokeColor = "stroke-emerald-500";
  } else if (status === "DEFAULTED" || status === "WRITTEN_OFF") {
    strokeColor = "stroke-red-500";
  } else if (status === "IN_ARREARS") {
    strokeColor = "stroke-amber-500";
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
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
      {readyToComplete ? (
        <CheckCircle className="absolute h-3 w-3 text-emerald-500" aria-hidden />
      ) : null}
    </div>
  );
}

export function LoanCenterPage() {
  const router = useRouter();
  const [tab, setTab] = useState<LoanCenterTab>("all");
  const [productFilter, setProductFilter] = useState<string>("");
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
        listBorrowerApplications({ pageSize: 200 }),
        listBorrowerLoans({ tab: "active", pageSize: 200 }),
        listBorrowerLoans({ tab: "pending_disbursement", pageSize: 200 }),
        listBorrowerLoans({ tab: "discharged", pageSize: 200 }),
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

  const allLoansMerged = useMemo(() => {
    const m = new Map<string, BorrowerLoanListItem>();
    for (const l of [...activeLoans, ...pendingDisbursementLoans, ...dischargedLoans]) {
      m.set(l.id, l);
    }
    return Array.from(m.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [activeLoans, pendingDisbursementLoans, dischargedLoans]);

  const productOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of applications) {
      if (a.product?.name) s.add(a.product.name);
    }
    for (const l of allLoansMerged) {
      if (l.product?.name) s.add(l.product.name);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [applications, allLoansMerged]);

  const incomplete = useMemo(
    () => applications.filter((a) => a.status === "DRAFT"),
    [applications]
  );
  const rejectedApps = useMemo(
    () => applications.filter((a) => ["REJECTED", "CANCELLED"].includes(a.status)),
    [applications]
  );

  const loanRowsRaw = useMemo(() => {
    switch (tab) {
      case "all":
        return allLoansMerged;
      case "active":
        return activeLoans;
      case "before_payout":
        return pendingDisbursementLoans;
      case "discharged":
        return dischargedLoans;
      default:
        return [];
    }
  }, [tab, allLoansMerged, activeLoans, pendingDisbursementLoans, dischargedLoans]);

  const loanRows = useMemo(
    () => filterByProductName(loanRowsRaw, productFilter),
    [loanRowsRaw, productFilter]
  );

  const applicationRows = useMemo(() => {
    const base = tab === "incomplete" ? incomplete : tab === "rejected" ? rejectedApps : [];
    return filterByProductName(base, productFilter);
  }, [tab, incomplete, rejectedApps, productFilter]);

  const counts = overview?.counts;

  const showLoanTable = ["all", "active", "before_payout", "discharged"].includes(tab);
  const showApplicationTable = tab === "incomplete" || tab === "rejected";

  const listItemCount = showLoanTable ? loanRows.length : applicationRows.length;
  const allLoansTotal =
    counts != null
      ? counts.activeLoans + counts.pendingDisbursementLoans + counts.dischargedLoans
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Your loans</h1>
        <p className="text-muted text-base mt-1">
          Filter loans and applications the same way as on{" "}
          <Link href="/applications" className="text-primary underline font-medium">
            Loan applications
          </Link>
          . Click a row to open details.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")}>
          All
          {counts != null && allLoansTotal > 0 ? (
            <span className="ml-1.5 bg-muted text-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {allLoansTotal}
            </span>
          ) : null}
        </Button>
        <Button variant={tab === "active" ? "default" : "outline"} size="sm" onClick={() => setTab("active")}>
          Active
          {counts != null && counts.activeLoans > 0 ? (
            <span className="ml-1.5 bg-muted text-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.activeLoans}
            </span>
          ) : null}
        </Button>
        <Button
          variant={tab === "before_payout" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("before_payout")}
        >
          Before payout
          {counts != null && counts.pendingDisbursementLoans > 0 ? (
            <span className="ml-1.5 bg-muted text-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.pendingDisbursementLoans}
            </span>
          ) : null}
        </Button>
        <Button
          variant={tab === "discharged" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("discharged")}
        >
          Discharged
          {counts != null && counts.dischargedLoans > 0 ? (
            <span className="ml-1.5 bg-muted text-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.dischargedLoans}
            </span>
          ) : null}
        </Button>
        <Button
          variant={tab === "incomplete" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("incomplete")}
        >
          Incomplete
          {counts != null && counts.incompleteApplications > 0 ? (
            <span className="ml-1.5 bg-muted text-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.incompleteApplications}
            </span>
          ) : null}
        </Button>
        <Button
          variant={tab === "rejected" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("rejected")}
        >
          Rejected & withdrawn
          {counts != null && counts.rejectedApplications > 0 ? (
            <span className="ml-1.5 bg-destructive/15 text-destructive rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.rejectedApplications}
            </span>
          ) : null}
        </Button>
        <span className="border-l border-border mx-1 h-6 self-center" aria-hidden />
        <div className="flex items-center gap-2 min-w-[min(100%,220px)]">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider shrink-0">
            Product
          </span>
          <Select
            value={productFilter || "__all__"}
            onValueChange={(v) => setProductFilter(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-[220px] max-w-[min(100vw-2rem,280px)]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              {productOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                {showLoanTable ? "Loans" : "Applications"}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {listItemCount} {showLoanTable ? "loan" : "application"}
                {listItemCount !== 1 ? "s" : ""}
                {productFilter ? " for the selected product" : ""}. Open a loan for schedule preview and payments when
                active; use Continue on Before payout when you still have attestation or signing steps.
              </CardDescription>
            </div>
            <RefreshButton
              onRefresh={async () => {
                await loadAll();
              }}
              showToast
              successMessage="Loans refreshed"
              showLabel
              variant="outline"
              className="shrink-0"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !overview ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="w-full">
              {showLoanTable && (
                <LoanLoansTable
                  loans={loanRows}
                  tab={tab}
                  onRefresh={() => void loadAll()}
                  onOpenLoan={(id) => router.push(`/loans/${id}`)}
                />
              )}

              {showApplicationTable && (
                <LoanApplicationsTable
                  apps={applicationRows}
                  variant={tab === "rejected" ? "rejected" : "incomplete"}
                  onChanged={() => void loadAll()}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoanLoansTable({
  loans,
  tab,
  onRefresh,
  onOpenLoan,
}: {
  loans: BorrowerLoanListItem[];
  tab: LoanCenterTab;
  onRefresh: () => void;
  onOpenLoan: (id: string) => void;
}) {
  const [payLoanId, setPayLoanId] = useState<string | null>(null);

  const showContinueColumn =
    tab === "before_payout" || tab === "all";

  if (loans.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">No loans in this category.</div>
    );
  }

  return (
    <>
      <TooltipProvider>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Term</TableHead>
              <TableHead className="min-w-[7.5rem]">Channel</TableHead>
              <TableHead className="min-w-[11rem]">Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="text-right w-[1%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((loan) => {
              const progress = loan.progress;
              const journeyPhase = deriveLoanJourneyPhase({
                applicationStatus: loan.application?.status,
                loanStatus: loan.status,
                attestationCompletedAt: loan.attestationCompletedAt,
                signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
                agreementPath: undefined,
              });
              const canPay =
                loan.status === "ACTIVE" || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED";
              const needsContinue =
                showContinueColumn &&
                (loan.status === "PENDING_ATTESTATION" || loan.status === "PENDING_DISBURSEMENT") &&
                borrowerLoanNeedsContinueAction(loan);

              const clickable =
                loan.status === "PENDING_ATTESTATION" ||
                loan.status === "PENDING_DISBURSEMENT" ||
                loan.status === "ACTIVE" ||
                loan.status === "IN_ARREARS" ||
                loan.status === "DEFAULTED" ||
                loan.status === "COMPLETED";

              return (
                <TableRow
                  key={loan.id}
                  className={cn(
                    clickable ? "cursor-pointer hover:bg-muted/20 transition-colors" : "",
                    progress?.readyToComplete
                      ? "bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]"
                      : loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION"
                        ? "bg-amber-500/[0.03] dark:bg-amber-500/[0.04]"
                        : ""
                  )}
                  onClick={() => {
                    if (clickable) onOpenLoan(loan.id);
                  }}
                >
                  <TableCell className="font-medium max-w-[200px]">
                    <div>{loan.product?.name ?? "Loan"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">ID {shortId(loan.id)}</div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatRm(loan.principalAmount)}</TableCell>
                  <TableCell>{loan.term} mo</TableCell>
                  <TableCell className="align-middle">
                    <LoanChannelPill channel={loan.loanChannel} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex flex-col gap-1.5 items-start max-w-[14rem]">
                      <Badge variant={borrowerLoanStatusBadgeVariant(loan)} className="whitespace-nowrap">
                        {loanStatusBadgeLabelFromDb(loan)}
                      </Badge>
                      <span className="text-[11px] leading-snug text-muted-foreground pl-0.5">
                        <span className="opacity-80">Step</span>{" "}
                        <span className="font-medium text-foreground/90">
                          {loanJourneyPhaseLabel(journeyPhase)}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION" ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : progress ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <ProgressDonut
                              percent={progress.progressPercent}
                              readyToComplete={progress.readyToComplete}
                              status={loan.status}
                            />
                            <span className="text-xs text-muted-foreground">
                              {progress.paidCount}/{progress.totalRepayments}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {progress.paidCount} of {progress.totalRepayments} payments complete (
                            {progress.progressPercent}%)
                          </p>
                          {progress.readyToComplete ? (
                            <p className="text-emerald-500 font-medium">Ready to complete</p>
                          ) : null}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col sm:flex-row gap-2 justify-end">
                      {needsContinue && (
                        <Button size="sm" variant="secondary" asChild>
                          <Link href={`/loans/${loan.id}`}>Continue</Link>
                        </Button>
                      )}
                      {canPay && (
                        <Button size="sm" variant="outline" onClick={() => setPayLoanId(loan.id)}>
                          Record payment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>
      {payLoanId && (
        <BorrowerPaymentDialog
          loanId={payLoanId}
          open={!!payLoanId}
          onOpenChange={(o) => !o && setPayLoanId(null)}
          onSuccess={() => {
            setPayLoanId(null);
            onRefresh();
            toast.success("Payment recorded");
          }}
        />
      )}
    </>
  );
}

function LoanApplicationsTable({
  apps,
  variant,
  onChanged,
}: {
  apps: LoanApplicationDetail[];
  variant: "incomplete" | "rejected";
  onChanged: () => void;
}) {
  const router = useRouter();

  if (apps.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold">Nothing here</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          {variant === "rejected"
            ? "No rejected or withdrawn applications."
            : "No incomplete drafts."}
        </p>
        {variant === "incomplete" && (
          <Button asChild>
            <Link href="/applications/apply">
              <Plus className="h-4 w-4 mr-2" />
              Start new application
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right w-[1%]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((app) => (
            <ApplicationTableRow
              key={app.id}
              app={app}
              onChanged={onChanged}
              onOpen={(id, isDraft) => {
                if (isDraft) router.push(`/applications/apply?applicationId=${id}`);
                else router.push(`/applications/${id}`);
              }}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ApplicationTableRow({
  app,
  onChanged,
  onOpen,
}: {
  app: LoanApplicationDetail;
  onChanged: () => void;
  onOpen: (id: string, isDraft: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [timeline, setTimeline] = useState<
    Array<{ id: string; action: string; createdAt: string; newData: unknown }>
  >([]);
  const [loadingTl, setLoadingTl] = useState(false);
  const withdrawable = app.status === "SUBMITTED" || app.status === "UNDER_REVIEW";
  const isDraft = app.status === "DRAFT";

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

  const isRejectedByLender = app.status === "REJECTED";
  const isWithdrawn = app.status === "CANCELLED";

  return (
    <>
      <TableRow
        className={
          isDraft
            ? ""
            : "cursor-pointer hover:bg-muted/20 transition-colors"
        }
        onClick={() => {
          if (!isDraft) onOpen(app.id, false);
        }}
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {isRejectedByLender ? (
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            ) : isWithdrawn ? (
              <LogOut className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-primary shrink-0" />
            )}
            {app.product?.name ?? "Application"}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">ID {shortId(app.id)}</div>
        </TableCell>
        <TableCell className="text-right">{formatRm(app.amount)}</TableCell>
        <TableCell>{app.term} mo</TableCell>
        <TableCell>
          <Badge variant={isRejectedByLender ? "destructive" : "secondary"} className="text-[10px]">
            {formatApplicationStatusLabel(app.status)}
          </Badge>
        </TableCell>
        <TableCell>{formatDate(app.createdAt)}</TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap justify-end gap-2">
            {isDraft && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/applications/apply?applicationId=${app.id}`}>Continue</Link>
              </Button>
            )}
            {withdrawable && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50"
                onClick={() => void onWithdraw()}
              >
                Withdraw
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
              History
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20">
            {loadingTl ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <ul className="space-y-2 max-h-40 overflow-y-auto text-xs">
                {timeline.map((t) => (
                  <li key={t.id} className="border-b pb-2">
                    <span className="font-medium">{t.action.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-2">
                      {new Date(t.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
