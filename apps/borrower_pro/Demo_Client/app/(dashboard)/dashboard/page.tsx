"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle,
  ClipboardList,
  FileText,
  Fingerprint,
  PenTool,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@borrower_pro/components/ui/card";
import { Badge } from "@borrower_pro/components/ui/badge";

import { Button } from "@borrower_pro/components/ui/button";
import { RefreshButton } from "@borrower_pro/components/ui/refresh-button";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import { fetchBorrower, getTruestackKycStatus } from "@borrower_pro/lib/borrower-api-client";
import { fetchBorrowerMe, BORROWER_PROFILE_SWITCHED_EVENT } from "@borrower_pro/lib/borrower-auth-client";
import { fetchLoanCenterOverview, listBorrowerLoans } from "@borrower_pro/lib/borrower-loans-client";
import { listBorrowerApplications } from "@borrower_pro/lib/borrower-applications-client";
import { borrowerApplicationDetailPath } from "@borrower_pro/lib/borrower-application-navigation";
import { isBorrowerKycComplete } from "@borrower_pro/lib/borrower-verification";
import { ONBOARDING_DRAFT_KEY } from "@borrower_pro/lib/onboarding-storage-keys";
import type { LoanCenterOverview, BorrowerLoanListItem, LoanApplicationDetail } from "@kredit/borrower";
import { toAmountNumber } from "@borrower_pro/lib/application-form-validation";
import { borrowerLoanNeedsContinueAction } from "@borrower_pro/lib/borrower-loan-continue-eligibility";
import {
  deriveLoanJourneyPhase,
  loanJourneyPhaseLabel,
  type LoanJourneyPhase,
} from "@borrower_pro/lib/loan-journey-phase";
import {
  borrowerLoanStatusBadgeVariant,
  loanStatusBadgeLabelFromDb,
} from "@borrower_pro/lib/loan-status-label";
import { cn } from "@borrower_pro/lib/utils";
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from "@kredit/shared";

function formatRm(v: unknown): string {
  const n = typeof v === "number" ? v : toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kuala_Lumpur",
    });
  } catch {
    return "—";
  }
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function getPendingLenderCounterOffer(app: LoanApplicationDetail) {
  if (app.status !== "SUBMITTED" && app.status !== "UNDER_REVIEW") return null;
  return (
    (app.offerRounds ?? []).find(
      (offer) =>
        offer.status === LoanApplicationOfferStatus.PENDING &&
        offer.fromParty === LoanApplicationOfferParty.ADMIN
    ) ?? null
  );
}

/* ------------------------------------------------------------------ */
/*  Onboarding Banner                                                 */
/* ------------------------------------------------------------------ */

function OnboardingBanner() {
  const [show, setShow] = useState(false);
  const [draftProgress, setDraftProgress] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchBorrowerMe()
      .then((res) => {
        if (res.success && res.data.profileCount === 0) {
          setShow(true);
          try {
            const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
            if (raw) {
              const draft = JSON.parse(raw);
              const step = draft.step ?? 1;
              const subStep = draft.borrowerDetailSubStep ?? 1;
              const type = draft.borrowerType ?? "INDIVIDUAL";
              const maxSub = type === "INDIVIDUAL" ? 3 : 5;
              const totalSteps = maxSub + 2;
              let currentIndex = 0;
              if (step === 1) currentIndex = 0;
              else if (step === 2) currentIndex = subStep;
              else currentIndex = totalSteps - 1;

              if (currentIndex > 0) {
                setDraftProgress(`Step ${currentIndex + 1} of ${totalSteps}`);
              }
            }
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking || !show) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">
            Complete your borrower profile
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            You need a borrower profile before you can apply for loans.
            {draftProgress && (
              <span className="ml-1 text-primary font-medium">
                ({draftProgress} saved)
              </span>
            )}
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/onboarding">
            {draftProgress ? "Continue" : "Get Started"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress Donut (reused from loans page)                           */
/* ------------------------------------------------------------------ */

function ProgressDonut({
  percent,
  size = 56,
  strokeWidth = 5,
  status,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  status?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;

  let strokeColor = "stroke-foreground";
  if (status === "COMPLETED") strokeColor = "stroke-emerald-500";
  else if (status === "DEFAULTED" || status === "WRITTEN_OFF") strokeColor = "stroke-red-500";
  else if (status === "IN_ARREARS") strokeColor = "stroke-amber-500";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted/30" />
        <circle
          cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className={cn(strokeColor, "transition-all duration-700 ease-out")}
        />
      </svg>
      <span className="absolute text-xs font-heading font-bold tabular-nums">{Math.round(percent)}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                    */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<LoanCenterOverview | null>(null);
  const [activeLoans, setActiveLoans] = useState<BorrowerLoanListItem[]>([]);
  const [pendingLoans, setPendingLoans] = useState<BorrowerLoanListItem[]>([]);
  const [counterOfferApps, setCounterOfferApps] = useState<LoanApplicationDetail[]>([]);
  const [borrowerName, setBorrowerName] = useState<string | null>(null);
  const [borrowerKycDone, setBorrowerKycDone] = useState<boolean | null>(null);
  const [actionsVisible, setActionsVisible] = useState(3);

  const resetDashboardState = useCallback(() => {
    setOverview(null);
    setActiveLoans([]);
    setPendingLoans([]);
    setCounterOfferApps([]);
    setBorrowerName(null);
    setBorrowerKycDone(null);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, aLoans, pLoans, apps, me, borrowerRes, kycRes] = await Promise.all([
        fetchLoanCenterOverview(),
        listBorrowerLoans({ tab: "active", pageSize: 200 }),
        listBorrowerLoans({ tab: "pending_disbursement", pageSize: 200 }),
        listBorrowerApplications({ pageSize: 200 }),
        fetchBorrowerMe().catch(() => null),
        fetchBorrower().catch(() => null),
        getTruestackKycStatus().catch(() => null),
      ]);
      setOverview(ov.success ? ov.data : null);
      setActiveLoans(aLoans.data);
      setPendingLoans(pLoans.data);
      const applicationRows = apps.success ? apps.data : [];
      setCounterOfferApps(applicationRows.filter((a) => getPendingLenderCounterOffer(a) != null));
      if (borrowerRes?.success) {
        setBorrowerKycDone(isBorrowerKycComplete(borrowerRes.data, kycRes?.success ? kycRes.data : null));
      } else {
        setBorrowerKycDone(null);
      }
      setBorrowerName(
        me?.success && me.data.activeBorrower
          ? (
              me.data.activeBorrower.borrowerType === "CORPORATE" &&
              me.data.activeBorrower.companyName?.trim()
            )
            ? me.data.activeBorrower.companyName.trim()
            : me.data.activeBorrower.name || null
          : null
      );
    } catch {
      resetDashboardState();
    } finally {
      setLoading(false);
    }
  }, [resetDashboardState]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const onSwitch = () => void loadAll();
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
  }, [loadAll]);

  const pendingActions = useMemo(() => {
    type ActionTier = "urgent" | "action" | "low";

    const items: Array<{
      id: string;
      label: string;
      statusLabel: string;
      sublabel: string;
      description: string;
      href: string;
      badgeVariant: "warning" | "info" | "default" | "destructive";
      icon: React.ElementType;
      iconBg: string;
      iconColor: string;
      tier: ActionTier;
      ctaLabel: string;
      phase?: LoanJourneyPhase;
    }> = [];

    const phaseIcon = (phase: LoanJourneyPhase): React.ElementType => {
      switch (phase) {
        case "attestation": return CheckCircle;
        case "ekyc": return Fingerprint;
        case "signing": return PenTool;
        default: return FileText;
      }
    };

    const phaseIconStyle = () => {
      return { bg: "bg-warning/15", color: "text-warning" };
    };

    const phaseDescription = (phase: LoanJourneyPhase): string => {
      switch (phase) {
        case "attestation": return "Please review and attest to the terms to proceed to e-KYC.";
        case "ekyc": return "Complete identity verification to continue with your loan.";
        case "signing": return "Document ready for signature at HQ or digital via portal.";
        case "disbursement": return "Awaiting final disbursement of funds to your account.";
        default: return "Action required to proceed with your loan.";
      }
    };

    for (const loan of pendingLoans) {
      if (!borrowerLoanNeedsContinueAction(loan)) continue;
      const phase = deriveLoanJourneyPhase({
        applicationStatus: loan.application?.status,
        loanStatus: loan.status,
        attestationCompletedAt: loan.attestationCompletedAt,
        kycComplete: borrowerKycDone,
        signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
        agreementPath: undefined,
        loanChannel: loan.loanChannel,
      });
      const style = phaseIconStyle();
      items.push({
        id: `loan-${loan.id}`,
        label: loanJourneyPhaseLabel(phase),
        statusLabel: phase === "attestation" ? "Due soon" : loanJourneyPhaseLabel(phase),
        sublabel: `${loan.product?.name ?? "Loan"} (${formatRm(loan.principalAmount)})`,
        description: phaseDescription(phase),
        href: `/loans/${loan.id}`,
        badgeVariant: "warning",
        icon: phaseIcon(phase),
        iconBg: style.bg,
        iconColor: style.color,
        tier: "urgent",
        ctaLabel: "Continue",
        phase,
      });
    }

    for (const app of counterOfferApps) {
      const pendingOffer = getPendingLenderCounterOffer(app);
      const amountLabel = pendingOffer?.amount != null ? formatRm(pendingOffer.amount) : formatRm(app.amount);
      const termLabel = pendingOffer?.term != null ? `${pendingOffer.term} months` : `${app.term} months`;

      items.push({
        id: `counter-offer-${app.id}`,
        label: "Counter offer",
        statusLabel: "Review",
        sublabel: `${app.product?.name ?? "Application"} (${amountLabel})`,
        description: `New offer received: ${amountLabel} over ${termLabel}. Review and respond.`,
        href: borrowerApplicationDetailPath(app),
        badgeVariant: "warning",
        icon: ClipboardList,
        iconBg: "bg-warning/15",
        iconColor: "text-warning",
        tier: "action",
        ctaLabel: "Review Offer",
      });
    }

    return items;
  }, [pendingLoans, counterOfferApps, borrowerKycDone]);

  const summary = overview?.summary;
  const counts = overview?.counts;

  if (loading && !overview) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            {borrowerName ? `Welcome, ${borrowerName}` : "Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your borrowing activity</p>
        </div>
        <RefreshButton
          onRefresh={async () => {
            await loadAll();
          }}
          showToast
          successMessage="Dashboard refreshed"
          showLabel
          variant="outline"
          className="shrink-0"
        />
      </div>

      <OnboardingBanner />

      {/* Two-column: KPI Cards + Action Needed */}
      <div className={cn(
        "grid gap-6",
        pendingActions.length > 0
          ? "grid-cols-1 lg:grid-cols-12"
          : "grid-cols-1"
      )}>
        {/* KPI Cards — left column (or full width when no actions) */}
        <div className={cn(
          pendingActions.length > 0 ? "lg:col-span-7" : ""
        )}>
          <div className={cn(
            "grid gap-4 h-full",
            pendingActions.length > 0
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          )}>
            <Card>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Active Loans</p>
                  <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
                    <Banknote className="h-4 w-4 text-foreground" />
                  </div>
                </div>
                <p className="text-2xl font-heading font-bold">{summary?.activeLoanCount ?? "—"}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(summary?.activeLoanCount ?? 0) === 0 ? "No active loans" : "Loans in repayment"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Outstanding</p>
                  <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-foreground" />
                  </div>
                </div>
                <p className="text-2xl font-heading font-bold">
                  {summary != null ? formatRm(summary.totalOutstanding) : "—"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Total balance remaining</p>
                {summary != null && summary.totalPaid > 0 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Paid</span>
                    <span className="text-sm font-heading font-bold tabular-nums text-foreground">
                      {formatRm(summary.totalPaid)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Next Payment</p>
                  <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-foreground" />
                  </div>
                </div>
                <p className="text-2xl font-heading font-bold">
                  {summary?.nextPaymentDue ? formatDateShort(summary.nextPaymentDue) : "—"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {summary?.nextPaymentAmount != null
                    ? formatRm(summary.nextPaymentAmount)
                    : "No upcoming payments"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Before Payout</p>
                  <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
                    <FileText className="h-4 w-4 text-foreground" />
                  </div>
                </div>
                <p className="text-2xl font-heading font-bold">
                  {counts?.pendingDisbursementLoans ?? "—"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(counts?.pendingDisbursementLoans ?? 0) === 0
                    ? "No loans awaiting payout"
                    : "Attestation or signing pending"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Needed — right column */}
        {pendingActions.length > 0 && (
          <div className="lg:col-span-5">
            <Card className="h-full overflow-hidden border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/10">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                  <span>Action needed</span>
                  <Badge variant="warning" className="ml-auto text-[10px]">
                    {pendingActions.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {pendingActions.slice(0, actionsVisible).map((action) => (
                  <Link
                    key={action.id}
                    href={action.href}
                    className={cn(
                      "block rounded-xl border px-4 py-3 transition-colors group",
                      action.tier === "urgent"
                        ? "border-warning/15 bg-warning/5 hover:bg-warning/10"
                        : "border-warning/10 bg-warning/5 hover:bg-warning/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        action.iconBg
                      )}>
                        <action.icon className={cn("h-5 w-5", action.iconColor)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-heading font-semibold truncate">{action.label}</p>
                          <Badge
                            variant={action.badgeVariant}
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0"
                          >
                            {action.statusLabel}
                          </Badge>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 pl-[52px]">
                      {action.sublabel}. {action.description}
                    </p>
                  </Link>
                ))}
                {pendingActions.length > actionsVisible && (
                  <div className="pt-1 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground text-xs uppercase tracking-wider"
                      onClick={() => setActionsVisible((v) => v + 3)}
                    >
                      Show more ({pendingActions.length - actionsVisible} remaining)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Active Loans */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold">Active loans</h2>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/loans?tab=active">
              View all
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {activeLoans.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Banknote className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No active loans yet</p>
              <Button variant="outline" size="sm" asChild className="mt-4">
                <Link href="/applications/apply">
                  Apply for a loan
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeLoans.slice(0, 4).map((loan) => {
              const progress = loan.progress;
              const isOverdue = loan.status === "IN_ARREARS" || loan.status === "DEFAULTED";
              return (
                <Link key={loan.id} href={`/loans/${loan.id}`} className="block">
                  <Card className={cn(
                    "hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer h-full",
                    isOverdue && "border-amber-500/20"
                  )}>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <ProgressDonut
                          percent={progress.progressPercent}
                          size={56}
                          strokeWidth={5}
                          status={loan.status}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-sm truncate">
                                {loan.product?.name ?? "Loan"}
                              </p>
                              <p className="text-lg font-heading font-bold tabular-nums mt-0.5">
                                {formatRm(loan.principalAmount)}
                              </p>
                            </div>
                            <Badge variant={borrowerLoanStatusBadgeVariant(loan)} className="shrink-0">
                              {loanStatusBadgeLabelFromDb(loan)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                            <span className="tabular-nums">
                              {progress.paidCount}/{progress.totalRepayments} paid
                            </span>
                            {(progress.overdueCount ?? 0) > 0 && (
                              <span className="text-red-600 dark:text-red-400 font-medium">
                                {progress.overdueCount} overdue
                              </span>
                            )}
                            {progress.nextPaymentDue && (
                              <span>
                                Next: {formatDateShort(progress.nextPaymentDue)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Before Payout */}
      {pendingLoans.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold">Before payout</h2>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href="/loans?tab=before_payout">
                View all
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingLoans.slice(0, 4).map((loan) => {
              const phase = deriveLoanJourneyPhase({
                applicationStatus: loan.application?.status,
                loanStatus: loan.status,
                attestationCompletedAt: loan.attestationCompletedAt,
                kycComplete: borrowerKycDone,
                signedAgreementReviewStatus: loan.signedAgreementReviewStatus,
                agreementPath: undefined,
                loanChannel: loan.loanChannel,
              });
              const needsAction = borrowerLoanNeedsContinueAction(loan);
              return (
                <Link key={loan.id} href={`/loans/${loan.id}`} className="block">
                  <Card className="hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer h-full border-amber-500/15">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="font-heading font-semibold text-sm truncate">
                            {loan.product?.name ?? "Loan"}
                          </p>
                          <p className="text-lg font-heading font-bold tabular-nums mt-0.5">
                            {formatRm(loan.principalAmount)}
                          </p>
                        </div>
                        <Badge variant="warning" className="shrink-0">
                          {loanJourneyPhaseLabel(phase)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{loan.term} months</span>
                        <span className="opacity-40">·</span>
                        <span className="font-mono">{shortId(loan.id)}</span>
                      </div>
                      {needsAction && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <ArrowRight className="h-3.5 w-3.5" />
                          Action required — continue
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                          */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </div>
        <Skeleton className="h-9 w-[106px] rounded-md" />
      </div>

      {/* Two-column: KPI + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* KPI Cards skeleton */}
        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                  <Skeleton className="h-7 w-20 mt-1" />
                  <Skeleton className="h-3 w-32 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Action Needed skeleton */}
        <div className="lg:col-span-5">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-auto h-5 w-6 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/60 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active Loans */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-14 w-14 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Before Payout */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-28" />
                  </div>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
