"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  LogOut,
  Plus,
} from "lucide-react";
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
import { TooltipProvider } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../../lib/borrower-auth-client";
import { fetchBorrower, getTruestackKycStatus } from "../../lib/borrower-api-client";
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
import {
  deriveLoanJourneyPhase,
  loanJourneyPhaseLabel,
  type LoanJourneyPhase,
} from "../../lib/loan-journey-phase";
import { borrowerLoanStatusBadgeVariant, loanStatusBadgeLabelFromDb } from "../../lib/loan-status-label";
import { borrowerLoanNeedsContinueAction } from "../../lib/borrower-loan-continue-eligibility";
import { formatDate } from "../../lib/borrower-form-display";
import { isBorrowerKycComplete } from "../../lib/borrower-verification";
import { LoanChannelPill } from "./loan-channel-pill";
import { cn } from "../../lib/utils";

export type LoanCenterTab =
  | "all"
  | "active"
  | "before_payout"
  | "discharged"
  | "incomplete"
  | "rejected";

const LOAN_CENTER_TABS: LoanCenterTab[] = [
  "all",
  "active",
  "before_payout",
  "discharged",
  "incomplete",
  "rejected",
];

function parseLoanCenterTab(value: string | null | undefined): LoanCenterTab {
  return LOAN_CENTER_TABS.includes(value as LoanCenterTab) ? (value as LoanCenterTab) : "all";
}

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

/* ------------------------------------------------------------------ */
/*  Progress Donut — enlarged version for card layout                 */
/* ------------------------------------------------------------------ */

function ProgressDonut({
  percent,
  size = 80,
  strokeWidth = 6,
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
          className="stroke-muted/30"
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
          className={cn(strokeColor, "transition-all duration-700 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {readyToComplete ? (
          <CheckCircle className="h-5 w-5 text-emerald-500" aria-hidden />
        ) : (
          <span className="text-sm font-heading font-bold tabular-nums">{percent}%</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Journey Stepper — visual phase indicator for pre-disbursement     */
/* ------------------------------------------------------------------ */

const PRE_DISBURSEMENT_PHASES: LoanJourneyPhase[] = [
  "approval",
  "attestation",
  "ekyc",
  "signing",
  "disbursement",
];

function JourneyStepper({
  currentPhase,
  loanChannel,
}: {
  currentPhase: LoanJourneyPhase;
  loanChannel?: "ONLINE" | "PHYSICAL";
}) {
  const phases = loanChannel === "PHYSICAL" ? (["disbursement"] as LoanJourneyPhase[]) : PRE_DISBURSEMENT_PHASES;
  const currentIdx = phases.indexOf(currentPhase);

  return (
    <ul className="space-y-1.5">
      {phases.map((phase, idx) => {
        const isCompleted = currentIdx > idx;
        const isCurrent = currentIdx === idx;
        return (
          <li key={phase} className="flex items-center gap-2">
            {isCompleted ? (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <div
                className={cn(
                  "h-4 w-4 rounded-full border-2 shrink-0",
                  isCurrent
                    ? "border-amber-500 bg-amber-500/15"
                    : "border-muted-foreground/30"
                )}
              />
            )}
            <span
              className={cn(
                "text-xs",
                isCompleted
                  ? "text-emerald-700 dark:text-emerald-400 font-medium"
                  : isCurrent
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground"
              )}
            >
              {loanJourneyPhaseLabel(phase)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export function LoanCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<LoanCenterTab>(() => parseLoanCenterTab(tabParam));
  const [productFilter, setProductFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<LoanCenterOverview | null>(null);
  const [applications, setApplications] = useState<LoanApplicationDetail[]>([]);
  const [activeLoans, setActiveLoans] = useState<BorrowerLoanListItem[]>([]);
  const [pendingDisbursementLoans, setPendingDisbursementLoans] = useState<BorrowerLoanListItem[]>([]);
  const [dischargedLoans, setDischargedLoans] = useState<BorrowerLoanListItem[]>([]);
  const [borrowerKycDone, setBorrowerKycDone] = useState<boolean | null>(null);

  useEffect(() => {
    const nextTab = parseLoanCenterTab(tabParam);
    setTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
  }, [tabParam]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, apps, aLoans, pLoans, dLoans, borrowerRes, kycRes] = await Promise.all([
        fetchLoanCenterOverview(),
        listBorrowerApplications({ pageSize: 200 }),
        listBorrowerLoans({ tab: "active", pageSize: 200 }),
        listBorrowerLoans({ tab: "pending_disbursement", pageSize: 200 }),
        listBorrowerLoans({ tab: "discharged", pageSize: 200 }),
        fetchBorrower().catch(() => null),
        getTruestackKycStatus().catch(() => null),
      ]);
      if (ov.success) setOverview(ov.data);
      if (apps.success) setApplications(apps.data);
      setActiveLoans(aLoans.data);
      setPendingDisbursementLoans(pLoans.data);
      setDischargedLoans(dLoans.data);
      if (borrowerRes?.success) {
        setBorrowerKycDone(isBorrowerKycComplete(borrowerRes.data, kycRes?.success ? kycRes.data : null));
      } else {
        setBorrowerKycDone(null);
      }
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

  const showLoanCards = ["all", "active", "before_payout", "discharged"].includes(tab);
  const showApplicationTable = tab === "incomplete" || tab === "rejected";

  const allLoansTotal =
    counts != null
      ? counts.activeLoans + counts.pendingDisbursementLoans + counts.dischargedLoans
      : 0;
  const activeLoanCount = counts?.activeLoans ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Your loans</h1>
          <p className="mt-1 text-base text-muted-foreground">
            View and manage your loans. Complete attestation, signing, and repayment here.
            New or in-review applications stay in{" "}
            <Link href="/applications" className="font-medium text-primary underline">
              Applications
            </Link>
            .
          </p>
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

      {activeLoanCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm">
          <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {activeLoanCount} active loan{activeLoanCount !== 1 ? "s" : ""} in your account
          </span>
        </div>
      )}

      {/* Tabs + product filter */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")}>
          All
          {counts != null && allLoansTotal > 0 ? (
            <span className="ml-1.5 bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {allLoansTotal}
            </span>
          ) : null}
        </Button>
        <Button variant={tab === "active" ? "default" : "outline"} size="sm" onClick={() => setTab("active")}>
          Active
          {counts != null && counts.activeLoans > 0 ? (
            <span className="ml-1.5 bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
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
            <span className="ml-1.5 bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
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
            <span className="ml-1.5 bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
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
            <span className="ml-1.5 bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
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
            <span className="ml-1.5 bg-destructive/10 text-destructive rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.rejectedApplications}
            </span>
          ) : null}
        </Button>

        {productOptions.length > 0 && (
          <>
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
          </>
        )}
      </div>

      {/* Content */}
      {loading && !overview ? (
        <LoanCardsSkeleton />
      ) : (
        <>
          {showLoanCards && (
            <LoanCardsGrid
              loans={loanRows}
              tab={tab}
              borrowerKycDone={borrowerKycDone}
              onOpenLoan={(id) => router.push(`/loans/${id}`)}
            />
          )}

          {showApplicationTable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Applications
                </CardTitle>
                <CardDescription>
                  {applicationRows.length} application{applicationRows.length !== 1 ? "s" : ""}
                  {productFilter ? " for the selected product" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <LoanApplicationsTable
                  apps={applicationRows}
                  variant={tab === "rejected" ? "rejected" : "incomplete"}
                  onChanged={() => void loadAll()}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loading cards                                            */
/* ------------------------------------------------------------------ */

function LoanCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="overflow-hidden h-full flex flex-col">
          <CardContent className="p-5 flex flex-col flex-1 space-y-4">
            {/* Badge + channel */}
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
            {/* Product + amount */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
            {/* Progress area */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-5">
                <Skeleton className="h-[72px] w-[72px] rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
            </div>
            {/* Action */}
            <Skeleton className="h-9 w-full rounded-md mt-auto" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loan Cards Grid                                                   */
/* ------------------------------------------------------------------ */

function LoanCardsGrid({
  loans,
  tab,
  borrowerKycDone,
  onOpenLoan,
}: {
  loans: BorrowerLoanListItem[];
  tab: LoanCenterTab;
  borrowerKycDone: boolean | null;
  onOpenLoan: (id: string) => void;
}) {

  const showContinueColumn = tab === "before_payout" || tab === "all";

  if (loans.length === 0) {
    return (
      <div className="text-center py-20">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">No loans in this category.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {loans.map((loan) => {
          const progress = loan.progress;
          const journeyPhase = deriveLoanJourneyPhase({
            applicationStatus: loan.application?.status,
            loanStatus: loan.status,
            attestationCompletedAt: loan.attestationCompletedAt,
            kycComplete: borrowerKycDone,
            signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
            agreementPath: undefined,
            loanChannel: loan.loanChannel,
          });
          const canPay =
            loan.status === "ACTIVE" || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED";
          const needsContinue =
            showContinueColumn &&
            (loan.status === "PENDING_ATTESTATION" || loan.status === "PENDING_DISBURSEMENT") &&
            borrowerLoanNeedsContinueAction(loan);
          const isPreDisbursement =
            loan.status === "PENDING_ATTESTATION" || loan.status === "PENDING_DISBURSEMENT";
          const isActiveLoan =
            loan.status === "ACTIVE" || loan.status === "IN_ARREARS" || loan.status === "DEFAULTED";
          const isCompleted = loan.status === "COMPLETED";
          const isDischarged =
            loan.status === "COMPLETED" || loan.status === "WRITTEN_OFF" || loan.status === "CANCELLED";
          const clickable = isPreDisbursement || isActiveLoan || isCompleted;

          return (
            <Card
              key={loan.id}
              className={cn(
                "group relative overflow-hidden transition-all duration-200 h-full flex flex-col",
                clickable && "cursor-pointer hover:border-foreground/20 hover:shadow-sm",
                progress?.readyToComplete && "border-emerald-500/30",
                isPreDisbursement && !progress?.readyToComplete && "border-amber-500/20"
              )}
              onClick={() => {
                if (clickable) onOpenLoan(loan.id);
              }}
            >
              <CardContent className="p-5 flex flex-col flex-1 min-h-0">
                {/* Top: badge + ID + channel */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex flex-col gap-1.5">
                    <Badge variant={borrowerLoanStatusBadgeVariant(loan)} className="w-fit">
                      {loanStatusBadgeLabelFromDb(loan)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {shortId(loan.id)}
                    </span>
                  </div>
                  <LoanChannelPill channel={loan.loanChannel} />
                </div>

                {/* Product name + amount */}
                <div className="mb-4">
                  <h3 className="font-heading font-semibold text-base leading-tight truncate">
                    {loan.product?.name ?? "Loan"}
                  </h3>
                  <p className="text-2xl font-heading font-bold tabular-nums mt-1">
                    {formatRm(loan.principalAmount)}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>{loan.term} months</span>
                    {loan.disbursementDate && (
                      <>
                        <span className="opacity-40">·</span>
                        <span>Disbursed {formatDate(loan.disbursementDate)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Active / completed loan: donut + payment stats + metrics */}
                {(isActiveLoan || isCompleted) && progress ? (
                  <div className="mb-4 bg-muted/5 border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-5">
                      <ProgressDonut
                        percent={progress.progressPercent}
                        readyToComplete={progress.readyToComplete}
                        size={72}
                        strokeWidth={5}
                        status={loan.status}
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-muted-foreground">Paid</span>
                          <span className="text-sm font-heading font-bold tabular-nums">
                            {progress.totalPaid != null ? formatRm(progress.totalPaid) : `${progress.paidCount}/${progress.totalRepayments}`}
                          </span>
                        </div>
                        {progress.totalDue != null && progress.totalDue > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            of {formatRm(progress.totalDue)}
                          </p>
                        )}
                        <div className="w-full bg-muted/30 rounded-full h-1.5">
                          <div
                            className={cn(
                              "h-1.5 rounded-full transition-all duration-700 ease-out",
                              loan.status === "COMPLETED"
                                ? "bg-emerald-500"
                                : loan.status === "IN_ARREARS"
                                  ? "bg-amber-500"
                                  : loan.status === "DEFAULTED" || loan.status === "WRITTEN_OFF"
                                    ? "bg-red-500"
                                    : "bg-foreground"
                            )}
                            style={{ width: `${progress.progressPercent}%` }}
                          />
                        </div>
                        {progress.readyToComplete && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Ready to complete
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Metric pills */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-md bg-secondary border border-border px-2 py-1 text-[11px] tabular-nums">
                        <span className="text-muted-foreground mr-1">Instalments</span>
                        <span className="font-semibold">{progress.paidCount}/{progress.totalRepayments}</span>
                      </span>
                      {(progress.overdueCount ?? 0) > 0 && (
                        <span className="inline-flex items-center rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1 text-[11px] tabular-nums text-red-700 dark:text-red-400">
                          <span className="mr-1">Overdue</span>
                          <span className="font-semibold">{progress.overdueCount}</span>
                        </span>
                      )}
                      {(progress.totalLateFees ?? 0) > 0 && (
                        <span className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[11px] tabular-nums text-amber-700 dark:text-amber-400">
                          <span className="mr-1">Late fees</span>
                          <span className="font-semibold">{formatRm(progress.totalLateFees)}</span>
                        </span>
                      )}
                      {progress.repaymentRate != null && progress.paidCount > 0 && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-1 text-[11px] tabular-nums",
                            (progress.repaymentRate) >= 80
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                              : (progress.repaymentRate) >= 50
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
                                : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                          )}
                        >
                          <span className="mr-1">On-time</span>
                          <span className="font-semibold">{progress.repaymentRate}%</span>
                        </span>
                      )}
                    </div>

                    {/* Next payment due */}
                    {progress.nextPaymentDue && !isCompleted && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border/50 text-xs">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Next payment</span>
                        <span className="font-medium ml-auto tabular-nums">
                          {formatDate(progress.nextPaymentDue)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Pre-disbursement: journey stepper */}
                {isPreDisbursement && (
                  <div className="mb-4 bg-muted/5 border rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                      Journey progress
                    </p>
                    <JourneyStepper currentPhase={journeyPhase} loanChannel={loan.loanChannel} />
                  </div>
                )}

                {/* Discharged (non-completed) info */}
                {isDischarged && !isCompleted && !isActiveLoan && (
                  <div className="mb-4 bg-muted/5 border rounded-lg p-3 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      Created {formatDate(loan.createdAt)}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div
                  className="flex gap-2 pt-4 mt-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {needsContinue && (
                    <Button size="sm" className="flex-1" asChild>
                      <Link href={`/loans/${loan.id}`}>
                        Continue
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Link>
                    </Button>
                  )}
                  {canPay && (
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                      <Link href={`/loans/${loan.id}/payment`}>
                        <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                        Make payment
                      </Link>
                    </Button>
                  )}
                  {clickable && !needsContinue && !canPay && (
                    <Button size="sm" variant="ghost" className="flex-1 text-muted-foreground" asChild>
                      <Link href={`/loans/${loan.id}`}>
                        View details
                        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Applications Table (original table layout)                        */
/* ------------------------------------------------------------------ */

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
                if (isDraft) {
                  const target =
                    app.loanChannel === "PHYSICAL"
                      ? `/applications/${id}`
                      : `/applications/apply?applicationId=${id}`;
                  router.push(target);
                }
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
  const isPhysicalDraft = isDraft && app.loanChannel === "PHYSICAL";

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
                <Link href={isPhysicalDraft ? `/applications/${app.id}` : `/applications/apply?applicationId=${app.id}`}>
                  {isPhysicalDraft ? "View application" : "Continue"}
                </Link>
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
