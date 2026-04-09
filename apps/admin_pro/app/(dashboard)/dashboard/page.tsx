"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Wallet,
  AlertTriangle,
  CircleDollarSign,
  BarChart3,
  ArrowUpRight,
  Check,
  CheckCircle,
  Package,
  Bell,
  ClipboardList,
  Banknote,
  Info,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, safePercentage, safeSubtract } from "@/lib/utils";
import { useTenantContext } from "@/components/tenant-context";

// ============================================
// Types
// ============================================

interface TenantStats {
  id: string;
  name: string;
  slug: string;
  status: string;
  lenderBankCode?: string | null;
  lenderAccountHolderName?: string | null;
  lenderAccountNumber?: string | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    gracePeriodEnd?: string;
    tenantSubscriptionStatus?: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
  } | null;
  counts: {
    users: number;
    borrowers: number;
    loans: number;
  };
}

interface DashboardStats {
  kpiCards: {
    totalBorrowers: number;
    activeBorrowers: number;
    totalLoans: number;
    activeLoans: number;
    totalDisbursed: number;
    totalNetDisbursed: number;
    totalOutstanding: number;
    totalDisbursedAllTime: number;
    totalCollected: number;
    totalEarned: number;
    totalEarnedInterest: number;
    totalEarnedFees: number;
    overdueAmount: number;
    collectionRate: number;
    totalLateFees: number;
    totalLateFeesPaid: number;
    activeLoansInRange: number;
    loansInArrearsInRange: number;
    loansInArrears: number;
    pendingApplications: number;
  };
  loansByStatus: { status: string; count: number }[];
  disbursementTrend: { month: string; amount: number; count: number }[];
  collectionTrend: { month: string; collected: number; due: number }[];
  applicationsByStatus: { status: string; count: number }[];
  loansByProduct: {
    productName: string;
    totalLoans: number;
    activeLoans: number;
    completedLoans: number;
    defaultedLoans: number;
    totalDisbursed: number;
  }[];
  recentLoans: {
    id: string;
    borrowerName: string;
    amount: number;
    status: string;
    date: string;
  }[];
  recentApplications: {
    id: string;
    borrowerName: string;
    amount: number;
    status: string;
    date: string;
  }[];
  portfolioAtRisk: {
    par30: number;
    par60: number;
    par90: number;
    defaultRate: number;
  };
  actionNeeded: {
    submittedApplications: number;
    loansPendingDisbursement: number;
    loansPendingAttestation: number;
    loansReadyToComplete: number;
    loansReadyForDefault: number;
  };
  dateRange: {
    from: string;
    to: string;
  };
}

// ============================================
// Date Range Presets
// ============================================

type DatePreset = "1m" | "3m" | "6m" | "1y" | "all";

/** Format date as YYYY-MM-DD using local timezone (avoids UTC shift from toISOString) */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = toLocalDateString(now);
  let fromDate: Date;

  switch (preset) {
    case "1m":
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "3m":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "6m":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case "1y":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    case "all":
      fromDate = new Date(2020, 0, 1);
      break;
  }

  return { from: toLocalDateString(fromDate), to };
}

const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: "This Month", value: "1m" },
  { label: "3 Months", value: "3m" },
  { label: "6 Months", value: "6m" },
  { label: "1 Year", value: "1y" },
  { label: "All Time", value: "all" },
];

// ============================================
// Chart Configs
// ============================================

const disbursementChartConfig: ChartConfig = {
  amount: {
    label: "Disbursed",
    theme: { light: "hsl(0, 0%, 15%)", dark: "hsl(0, 0%, 85%)" },
  },
  count: {
    label: "Loans",
    theme: { light: "hsl(0, 0%, 15%)", dark: "hsl(0, 0%, 85%)" },
  },
};

const collectionChartConfig: ChartConfig = {
  due: {
    label: "Due",
    color: "hsl(0, 0%, 65%)",
  },
  collected: {
    label: "Collected",
    color: "hsl(142, 71%, 45%)",
  },
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "hsl(0, 0%, 20%)",
  IN_ARREARS: "hsl(38, 92%, 50%)",
  COMPLETED: "hsl(142, 71%, 45%)",
  DEFAULTED: "hsl(0, 84%, 60%)",
  WRITTEN_OFF: "hsl(0, 0%, 65%)",
  PENDING_ATTESTATION: "hsl(38, 92%, 55%)",
  PENDING_DISBURSEMENT: "hsl(142, 71%, 65%)",
  // Application statuses
  DRAFT: "hsl(0, 0%, 65%)",
  SUBMITTED: "hsl(217, 91%, 60%)",
  UNDER_REVIEW: "hsl(38, 92%, 50%)",
  APPROVED: "hsl(142, 71%, 45%)",
  REJECTED: "hsl(0, 84%, 60%)",
  CANCELLED: "hsl(0, 0%, 50%)",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  IN_ARREARS: "In Arrears",
  COMPLETED: "Completed",
  DEFAULTED: "Defaulted",
  WRITTEN_OFF: "Written Off",
  PENDING_ATTESTATION: "Pending Attestation",
  PENDING_DISBURSEMENT: "Pending Disbursement",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

// ============================================
// Utility: format month label
// ============================================

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("en-MY", { month: "short", year: "2-digit" });
}

// ============================================
// Main Dashboard Component
// ============================================

export default function DashboardPage() {
  const { hasTenants } = useTenantContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tenant, setTenant] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>("3m");
  const hasInitialFetched = useRef(false);

  // Fetch dashboard stats (depends on date range)
  const fetchDashboardStats = useCallback(async (preset: DatePreset) => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(preset);
      const params = new URLSearchParams({ from, to });
      if (preset === "all") params.set("preset", "all");
      const dashRes = await api.get<DashboardStats>(`/api/dashboard/stats?${params}`);
      if (dashRes.success && dashRes.data) setStats(dashRes.data);
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh: fetch all data in parallel
  const handleRefresh = useCallback(() => {
    setLoading(true);
    const { from, to } = getDateRange(datePreset);
    const params = new URLSearchParams({ from, to });
    if (datePreset === "all") params.set("preset", "all");
    Promise.all([
      api.get<TenantStats>("/api/tenants/current"),
      api.get<DashboardStats>(`/api/dashboard/stats?${params}`),
    ])
      .then(([tenantRes, dashRes]) => {
        if (tenantRes.success && tenantRes.data) setTenant(tenantRes.data);
        if (dashRes.success && dashRes.data) setStats(dashRes.data);
      })
      .catch((err) => console.error("Failed to refresh:", err))
      .finally(() => setLoading(false));
  }, [datePreset]);

  useEffect(() => {
    if (!hasTenants) {
      setLoading(false);
      return;
    }
    // Initial load: fetch all 3 in parallel for fast first paint
    if (!hasInitialFetched.current) {
      hasInitialFetched.current = true;
      handleRefresh();
    } else {
      // Date change: only re-fetch stats (tenant/add-ons unchanged)
      fetchDashboardStats(datePreset);
    }
  }, [hasTenants, datePreset, fetchDashboardStats, handleRefresh]);

  // Transform chart data
  const disbursementData = useMemo(() => {
    if (!stats) return [];
    return stats.disbursementTrend.map((d) => ({
      month: formatMonthLabel(d.month),
      amount: d.amount,
      count: d.count,
    }));
  }, [stats]);

  const collectionData = useMemo(() => {
    if (!stats) return [];
    return stats.collectionTrend.map((d) => ({
      month: formatMonthLabel(d.month),
      due: d.due,
      collected: d.collected,
    }));
  }, [stats]);

  const loanStatusData = useMemo(() => {
    if (!stats) return [];
    return stats.loansByStatus
      .filter((s) => s.count > 0)
      .map((s) => ({
        name: STATUS_LABELS[s.status] || s.status,
        value: s.count,
        fill: STATUS_COLORS[s.status] || "hsl(215, 20%, 65%)",
      }));
  }, [stats]);

  const applicationData = useMemo(() => {
    if (!stats) return [];
    return stats.applicationsByStatus
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  // Loan pie chart config
  const loanPieConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    loanStatusData.forEach((item) => {
      config[item.name] = {
        label: item.name,
        color: item.fill,
      };
    });
    return config;
  }, [loanStatusData]);

  // ============================================
  // No tenant: Pro uses deployment bootstrap — no self-serve tenant creation
  if (!hasTenants) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>No organization access</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Your account is not linked to an organization. Contact your administrator or complete deployment setup
          (seed/bootstrap) for this environment.
        </CardContent>
      </Card>
    );
  }

  // Loading State
  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  const dateRangeLabel = DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? "Period";

  const borrowerBankIncomplete =
    !!tenant &&
    (!tenant.lenderBankCode ||
      !tenant.lenderAccountHolderName?.trim() ||
      !tenant.lenderAccountNumber?.trim());

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {borrowerBankIncomplete && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-50"
            role="status"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Add your <strong>borrower payment bank details</strong> in Settings so borrowers can see where to transfer
              funds for manual payments.
            </span>
            <Link
              href="/dashboard/settings"
              className="font-medium underline underline-offset-2 hover:no-underline text-amber-950 dark:text-amber-50"
            >
              Open Settings
            </Link>
          </div>
        )}
        {/* ============================================ */}
        {/* Row 1: Header + Date Range Filter */}
        {/* ============================================ */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gradient">
              Welcome, {tenant?.name ?? "there"}
            </h1>
            <p className="text-muted text-base mt-1">
              Financial overview and portfolio performance
            </p>
          </div>
          <div className="flex items-center justify-end">
              <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg py-1.5 px-1.5">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    variant={datePreset === preset.value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setDatePreset(preset.value)}
                    className={
                      datePreset === preset.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted hover:text-foreground"
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
        </div>

        {/* ============================================ */}
        {/* Row 2: Action Needed Bar */}
        {/* ============================================ */}
        {stats?.actionNeeded && (
          stats.actionNeeded.submittedApplications > 0 ||
          stats.actionNeeded.loansPendingDisbursement > 0 ||
          (stats.actionNeeded.loansPendingAttestation ?? 0) > 0 ||
          stats.actionNeeded.loansReadyToComplete > 0 ||
          stats.actionNeeded.loansReadyForDefault > 0
        ) && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
              <Bell className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-base font-medium text-amber-600 dark:text-amber-400 mr-1">Action Needed</span>
            <div className="flex items-center gap-2 flex-wrap text-base">
              {[
                stats.actionNeeded.submittedApplications > 0 && (
                  <Link
                    key="submitted"
                    href="/dashboard/applications?filter=SUBMITTED"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-amber-500/10 transition-colors"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-foreground">{stats.actionNeeded.submittedApplications} pending review</span>
                  </Link>
                ),
                (stats.actionNeeded.loansPendingAttestation ?? 0) > 0 && (
                  <Link
                    key="attestation"
                    href="/dashboard/loans?filter=PENDING_ATTESTATION"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-amber-500/10 transition-colors"
                  >
                    <Banknote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-foreground">
                      {stats.actionNeeded.loansPendingAttestation ?? 0} pending attestation
                    </span>
                  </Link>
                ),
                stats.actionNeeded.loansPendingDisbursement > 0 && (
                  <Link
                    key="disbursement"
                    href="/dashboard/loans?filter=PENDING_DISBURSEMENT"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-amber-500/10 transition-colors"
                  >
                    <Banknote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-foreground">{stats.actionNeeded.loansPendingDisbursement} pending disbursement</span>
                  </Link>
                ),
                stats.actionNeeded.loansReadyToComplete > 0 && (
                  <Link
                    key="complete"
                    href="/dashboard/loans?filter=READY_TO_COMPLETE"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-emerald-500/10 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-foreground">{stats.actionNeeded.loansReadyToComplete} ready to complete</span>
                  </Link>
                ),
                stats.actionNeeded.loansReadyForDefault > 0 && (
                  <Link
                    key="default"
                    href="/dashboard/loans?filter=READY_FOR_DEFAULT"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-red-500/10 transition-colors"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-foreground">{stats.actionNeeded.loansReadyForDefault} ready for default</span>
                  </Link>
                ),
              ].filter(Boolean).flatMap((item, i, arr) =>
                i < arr.length - 1 ? [item, <span key={`dot-${i}`} className="text-muted-foreground">•</span>] : [item]
              )}
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* Row 3: KPI Cards */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard
            title="Total Disbursed"
            titleSuffix={`(${dateRangeLabel})`}
            value={formatCurrency(stats?.kpiCards.totalDisbursed || 0)}
            icon={CircleDollarSign}
            subtitle={`Net: ${formatCurrency(stats?.kpiCards.totalNetDisbursed || 0)}`}
            accentColor="text-foreground"
            secondaryLabel="Collected Fees"
            secondaryValue={`${safePercentage(
              (stats?.kpiCards.totalDisbursed || 0) - (stats?.kpiCards.totalNetDisbursed || 0),
              stats?.kpiCards.totalDisbursed || 0
            )}%`}
            secondaryColor="text-foreground"
            tooltipText="Total principal disbursed to borrowers in the selected period. Net excludes legal and stamping fees deducted at disbursement."
          />
          <KPICard
            title="Outstanding"
            value={formatCurrency(stats?.kpiCards.totalOutstanding || 0)}
            icon={Wallet}
            subtitle={`Collected: ${formatCurrency(stats?.kpiCards.totalCollected || 0)}`}
            titleSuffix="(All-Time)"
            accentColor="text-foreground"
            secondaryLabel="As % of Total Disbursed"
            secondaryValue={`${safePercentage(
              stats?.kpiCards.totalOutstanding || 0,
              (stats?.kpiCards.totalDisbursedAllTime ?? stats?.kpiCards.totalDisbursed) || 0
            )}%`}
            secondaryColor="text-foreground"
            tooltipText="Total remaining balance owed across all loans (all-time). Collected: total payments received in the selected period. As % of total disbursed since inception."
          />
          <KPICard
            title="Total Earned"
            titleSuffix={`(${dateRangeLabel})`}
            value={formatCurrency(stats?.kpiCards.totalEarned || 0)}
            icon={TrendingUp}
            subtitle={`Interest: ${formatCurrency(stats?.kpiCards.totalEarnedInterest ?? 0)} · Fees: ${formatCurrency(stats?.kpiCards.totalEarnedFees ?? 0)}`}
            accentColor="text-foreground"
            iconColor="text-foreground"
            secondaryLabel="Return on Investment"
            secondaryValue={`${safePercentage(stats?.kpiCards.totalEarned ?? 0, stats?.kpiCards.totalDisbursed ?? 0)}%`}
            secondaryColor="text-foreground"
            tooltipText="Interest and fees collected in the selected period. Int: interest from repayments. Fees: late fees + disbursement fees (legal, stamping). ROI: Total Earned as % of Total Disbursed in the period."
          />
          <KPICard
            title="Overdue"
            titleSuffix={`(${dateRangeLabel})`}
            value={formatCurrency(stats?.kpiCards.overdueAmount || 0)}
            icon={AlertTriangle}
            subtitle={`${stats?.kpiCards.loansInArrearsInRange ?? stats?.kpiCards.loansInArrears ?? 0} loans in arrears`}
            accentColor="text-foreground"
            iconColor="text-destructive"
            secondaryLabel="PAR 30"
            secondaryValue={`${stats?.portfolioAtRisk.par30 || 0}%`}
            secondaryColor={
              (stats?.portfolioAtRisk.par30 || 0) <= 5
                ? "text-success"
                : (stats?.portfolioAtRisk.par30 || 0) <= 15
                  ? "text-warning"
                  : "text-destructive"
            }
            tooltipText="Amount overdue on loans disbursed in the selected period. PAR 30: % of outstanding balance with repayments overdue by 30+ days. Industry benchmark: below 5% is excellent."
          />
        </div>

        {/* ============================================ */}
        {/* Row 4: Primary Charts */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Disbursement Trend */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-xl">
                Disbursement Trend
              </CardTitle>
              <p className="text-sm text-muted">
                Monthly principal disbursed to borrowers
              </p>
            </CardHeader>
            <CardContent>
              {disbursementData.length > 0 ? (
                <ChartContainer
                  config={disbursementChartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    accessibilityLayer
                    data={disbursementData}
                    margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      className="stroke-border/50"
                    />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val
                      }
                      fontSize={11}
                      width={45}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name, item) => {
                            const cfg = disbursementChartConfig[name as keyof typeof disbursementChartConfig];
                            const indicatorColor = cfg?.color || item?.color || "hsl(217, 91%, 60%)";
                            return (
                              <>
                                <div
                                  className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                                  style={{ backgroundColor: indicatorColor }}
                                />
                                <div className="flex items-center justify-between gap-4 flex-1">
                                  <span className="text-muted-foreground">
                                    {cfg?.label || name}
                                  </span>
                                  <span className="font-medium font-heading tabular-nums">
                                    {name === "count"
                                      ? `${value} loan${Number(value) !== 1 ? "s" : ""}`
                                      : formatCurrency(Number(value))}
                                  </span>
                                </div>
                              </>
                            );
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="amount"
                      fill="var(--color-amount)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <EmptyChart message="No disbursement data for this period" />
              )}
            </CardContent>
          </Card>

          {/* Loan Portfolio Distribution (Pie) */}
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-xl">
                Loan Portfolio
              </CardTitle>
              <p className="text-sm text-muted">Distribution by status</p>
            </CardHeader>
            <CardContent className="min-w-0">
              {loanStatusData.length > 0 ? (
                <ChartContainer
                  config={loanPieConfig}
                  className="h-[280px] w-full min-w-0"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name, item) => {
                            const indicatorColor = item?.payload?.fill || item?.color || "hsl(215, 20%, 65%)";
                            return (
                              <>
                                <div
                                  className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                                  style={{ backgroundColor: indicatorColor }}
                                />
                                <div className="flex items-center justify-between gap-4 flex-1">
                                  <span className="text-muted-foreground">
                                    {name}
                                  </span>
                                  <span className="font-medium font-heading tabular-nums">
                                    {value} loan{Number(value) !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              </>
                            );
                          }}
                        />
                      }
                    />
                    <Pie
                      data={loanStatusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {loanStatusData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartLegend
                      content={<ChartLegendContent nameKey="name" payload={[]} />}
                    />
                  </PieChart>
                </ChartContainer>
              ) : (
                <EmptyChart message="No loan data available" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============================================ */}
        {/* Row 5: Secondary Charts */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Collection Performance (Area) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-xl">
                Collection Performance
              </CardTitle>
              <p className="text-sm text-muted">
                Scheduled repayments due vs actual payments received
              </p>
            </CardHeader>
            <CardContent>
              {collectionData.length > 0 ? (
                <ChartContainer
                  config={collectionChartConfig}
                  className="h-[260px] w-full"
                >
                  <AreaChart
                    accessibilityLayer
                    data={collectionData}
                    margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      className="stroke-border/50"
                    />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val
                      }
                      fontSize={11}
                      width={45}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name, item) => {
                            const cfg = collectionChartConfig[name as keyof typeof collectionChartConfig];
                            const indicatorColor = cfg?.color || item?.color || "hsl(215, 20%, 65%)";
                            return (
                              <>
                                <div
                                  className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                                  style={{ backgroundColor: indicatorColor }}
                                />
                                <div className="flex items-center justify-between gap-4 flex-1">
                                  <span className="text-muted-foreground">
                                    {cfg?.label || name}
                                  </span>
                                  <span className="font-medium font-heading tabular-nums">
                                    {formatCurrency(Number(value))}
                                  </span>
                                </div>
                              </>
                            );
                          }}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent payload={[]} />} />
                    <defs>
                      <linearGradient
                        id="fillDue"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="hsl(215, 20%, 65%)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(215, 20%, 65%)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                      <linearGradient
                        id="fillCollected"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="hsl(142, 71%, 45%)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(142, 71%, 45%)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="due"
                      stroke="var(--color-due)"
                      fill="url(#fillDue)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      stroke="var(--color-collected)"
                      fill="url(#fillCollected)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <EmptyChart message="No collection data for this period" />
              )}
            </CardContent>
          </Card>

          {/* Portfolio at Risk */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-xl">
                Portfolio at Risk
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Outstanding balance with overdue payments
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <PARBar
                label="PAR 30"
                value={stats?.portfolioAtRisk.par30 || 0}
                description="30+ days overdue"
              />
              <PARBar
                label="PAR 60"
                value={stats?.portfolioAtRisk.par60 || 0}
                description="60+ days overdue"
              />
              <PARBar
                label="PAR 90"
                value={stats?.portfolioAtRisk.par90 || 0}
                description="90+ days overdue"
              />
              <PARBar
                label="Default Rate"
                value={stats?.portfolioAtRisk.defaultRate ?? 0}
                description="Defaulted / written-off loans"
              />
              <div className="pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">Total Late Fees</span>
                  <span className="font-heading font-semibold text-foreground">
                    {formatCurrency(stats?.kpiCards.totalLateFees || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-heading font-semibold text-foreground tabular-nums">
                    {formatCurrency(stats?.kpiCards.totalLateFeesPaid ?? 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between text-base">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span className="font-heading font-semibold text-foreground tabular-nums">
                    {formatCurrency(Math.max(0, safeSubtract(stats?.kpiCards.totalLateFees ?? 0, stats?.kpiCards.totalLateFeesPaid ?? 0)))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============================================ */}
        {/* Row 6: Loans by Product */}
        {/* ============================================ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading text-xl flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Loans by Product
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Breakdown of loan portfolio across products
                </p>
              </div>
              <Link
                href="/dashboard/products"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1"
              >
                View products <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.loansByProduct && stats.loansByProduct.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Product</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Total Loans</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Active</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Completed</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Default / W.Off</th>
                      <th className="text-right py-2.5 pl-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Total Disbursed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.loansByProduct.map((product, idx) => {
                      const totalAll = stats.loansByProduct.reduce((s, p) => s + p.totalLoans, 0);
                      const pct = totalAll > 0 ? ((product.totalLoans / totalAll) * 100).toFixed(1) : "0";
                      return (
                        <tr key={idx} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{product.productName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="h-1.5 flex-1 max-w-[120px] bg-secondary rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-foreground transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums">
                            {product.totalLoans}
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge variant="default" className="text-base font-heading font-semibold tabular-nums">
                              {product.activeLoans}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge variant="success" className="text-base font-heading font-semibold tabular-nums">
                              {product.completedLoans}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge variant={product.defaultedLoans > 0 ? "destructive" : "secondary"} className="text-base font-heading font-semibold tabular-nums">
                              {product.defaultedLoans}
                            </Badge>
                          </td>
                          <td className="text-right py-3 pl-4 font-heading font-medium tabular-nums">
                            {formatCurrency(product.totalDisbursed)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {stats.loansByProduct.length > 1 && (
                    <tfoot>
                      <tr className="border-t border-border">
                        <td className="py-3 pr-4 font-medium text-muted-foreground">Total</td>
                        <td className="text-right py-3 px-4 font-heading font-bold tabular-nums">
                          {stats.loansByProduct.reduce((s, p) => s + p.totalLoans, 0)}
                        </td>
                        <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums text-foreground">
                          {stats.loansByProduct.reduce((s, p) => s + p.activeLoans, 0)}
                        </td>
                        <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums text-success">
                          {stats.loansByProduct.reduce((s, p) => s + p.completedLoans, 0)}
                        </td>
                        <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums text-destructive">
                          {stats.loansByProduct.reduce((s, p) => s + p.defaultedLoans, 0)}
                        </td>
                        <td className="text-right py-3 pl-4 font-heading font-bold tabular-nums">
                          {formatCurrency(stats.loansByProduct.reduce((s, p) => s + p.totalDisbursed, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted">
                <Package className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">No products with loans yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================ */}
        {/* Row 7: PAR Metrics + Quick Stats */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Application Pipeline */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading text-xl">
                    Application Pipeline
                  </CardTitle>
                  <p className="text-sm text-muted">
                    Applications by current status
                  </p>
                </div>
                {stats && (
                  <Badge variant="outline" className="text-xs">
                    {stats.kpiCards.pendingApplications} pending
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {applicationData.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {applicationData.map((item) => {
                    const maxCount = Math.max(
                      ...applicationData.map((d) => d.count)
                    );
                    const percentage =
                      maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                    return (
                      <div key={item.status} className="space-y-1.5">
                        <div className="flex items-center justify-between text-base">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-sm shrink-0"
                              style={{
                                backgroundColor:
                                  STATUS_COLORS[item.status] ||
                                  "hsl(215, 20%, 65%)",
                              }}
                            />
                            <span className="text-muted-foreground">
                              {STATUS_LABELS[item.status] || item.status}
                            </span>
                          </div>
                          <span className="font-medium font-heading tabular-nums">
                            {item.count}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor:
                                STATUS_COLORS[item.status] ||
                                "hsl(215, 20%, 65%)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyChart message="No applications yet" />
              )}
            </CardContent>
          </Card>

          {/* Recent Loans */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-xl">
                  Recent Loans
                </CardTitle>
                <Link
                  href="/dashboard/loans"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1"
                >
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {stats?.recentLoans && stats.recentLoans.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentLoans.map((loan) => (
                    <Link
                      key={loan.id}
                      href={`/dashboard/loans/${loan.id}`}
                      className="flex items-center justify-between py-1.5 hover:bg-secondary/50 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-base font-medium truncate">
                          {loan.borrowerName}
                        </p>
                        <p className="text-sm text-muted">
                          {formatDate(loan.date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-base font-heading font-medium tabular-nums">
                          {formatCurrency(loan.amount)}
                        </p>
                        <LoanStatusBadge status={loan.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted text-center py-8">
                  No loans yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Applications */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-xl">
                  Recent Applications
                </CardTitle>
                <Link
                  href="/dashboard/applications"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1"
                >
                  View all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {stats?.recentApplications &&
              stats.recentApplications.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentApplications.map((app) => (
                    <Link
                      key={app.id}
                      href={`/dashboard/applications/${app.id}`}
                      className="flex items-center justify-between py-1.5 hover:bg-secondary/50 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-base font-medium truncate">
                          {app.borrowerName}
                        </p>
                        <p className="text-sm text-muted">
                          {formatDate(app.date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-base font-heading font-medium tabular-nums">
                          {formatCurrency(app.amount)}
                        </p>
                        <ApplicationStatusBadge status={app.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted text-center py-8">
                  No applications yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================
// Sub-Components
// ============================================

function KPICard({
  title,
  value,
  icon: Icon,
  subtitle,
  accentColor = "text-foreground",
  iconColor,
  tooltipText,
  secondaryLabel,
  secondaryValue,
  secondaryColor,
  titleSuffix,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle: string;
  accentColor?: string;
  iconColor?: string;
  tooltipText?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  secondaryColor?: string;
  titleSuffix?: string;
}) {
  const iconClass = iconColor ?? accentColor;
  return (
    <Card className="hover:border-border transition-colors">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">
              {title}
              {titleSuffix && (
                <span className="font-normal normal-case tracking-normal ml-0.5"> {titleSuffix}</span>
              )}
            </p>
            {tooltipText && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    aria-label="More info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{tooltipText}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
            <Icon className={`h-4 w-4 ${iconClass}`} />
          </div>
        </div>
        <p className={`text-2xl font-heading font-bold ${accentColor} truncate`}>
          {value}
        </p>
        <p className="text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>
        {secondaryLabel && secondaryValue && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{secondaryLabel}</span>
            <span className={`text-base font-heading font-bold tabular-nums ${secondaryColor || "text-foreground"}`}>{secondaryValue}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PARBar({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  const getColor = (val: number) => {
    if (val <= 5) return "bg-success";
    if (val <= 15) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        <span
          className={`text-base font-heading font-semibold tabular-nums ${
            value <= 5
              ? "text-success"
              : value <= 15
                ? "text-warning"
                : "text-destructive"
          }`}
        >
          {value}%
        </span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getColor(value)}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function LoanStatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "warning" | "destructive" | "default" | "info" | "secondary"> = {
    ACTIVE: "default",
    IN_ARREARS: "warning",
    COMPLETED: "success",
    DEFAULTED: "destructive",
    WRITTEN_OFF: "secondary",
    PENDING_ATTESTATION: "warning",
    PENDING_DISBURSEMENT: "default",
  };

  return (
    <Badge
      variant={variantMap[status] || "secondary"}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "warning" | "destructive" | "default" | "info" | "secondary"> = {
    DRAFT: "secondary",
    SUBMITTED: "default",
    UNDER_REVIEW: "warning",
    APPROVED: "success",
    REJECTED: "destructive",
    CANCELLED: "secondary",
  };

  return (
    <Badge
      variant={variantMap[status] || "secondary"}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[260px] text-muted">
      <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ============================================
// Loading Skeleton
// ============================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header + Date Range Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-heading font-bold text-gradient">
              Welcome,
            </span>
            <Skeleton className="h-7 w-32 shrink-0" />
          </div>
          <Skeleton className="h-4 w-60 mt-2" />
        </div>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg py-1.5 px-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-md shrink-0" />
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="hover:border-border transition-colors">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-8 rounded-md shrink-0" />
              </div>
              <Skeleton className="h-8 w-28 mt-1" />
              <Skeleton className="h-3 w-20 mt-2" />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 4: Primary Charts - Disbursement + Loan Portfolio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3 w-56 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-36 mt-2" />
          </CardHeader>
          <CardContent className="min-w-0">
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      {/* Secondary Charts: Collection + PAR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[260px] w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-3 w-48 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-16" /></div>
              <div className="flex justify-between"><Skeleton className="h-4 w-12" /><Skeleton className="h-4 w-16" /></div>
              <div className="pt-2 border-t border-border flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-16" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loans by Product */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-3 w-52 mt-2" />
            </div>
            <Skeleton className="h-4 w-24 shrink-0" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 pr-4"><Skeleton className="h-3 w-16" /></th>
                  <th className="text-right py-2.5 px-4"><Skeleton className="h-3 w-14 ml-auto" /></th>
                  <th className="text-right py-2.5 px-4"><Skeleton className="h-3 w-10 ml-auto" /></th>
                  <th className="text-right py-2.5 px-4"><Skeleton className="h-3 w-14 ml-auto" /></th>
                  <th className="text-right py-2.5 px-4"><Skeleton className="h-3 w-16 ml-auto" /></th>
                  <th className="text-right py-2.5 pl-4"><Skeleton className="h-3 w-20 ml-auto" /></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-1.5 flex-1 max-w-[120px] rounded-full" />
                            <Skeleton className="h-3 w-8" />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4"><Skeleton className="h-4 w-8 ml-auto" /></td>
                    <td className="text-right py-3 px-4"><Skeleton className="h-6 w-10 rounded-md ml-auto" /></td>
                    <td className="text-right py-3 px-4"><Skeleton className="h-6 w-10 rounded-md ml-auto" /></td>
                    <td className="text-right py-3 px-4"><Skeleton className="h-6 w-10 rounded-md ml-auto" /></td>
                    <td className="text-right py-3 pl-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-3 pr-4"><Skeleton className="h-4 w-12" /></td>
                  <td className="text-right py-3 px-4"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="text-right py-3 px-4"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="text-right py-3 px-4"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="text-right py-3 px-4"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="text-right py-3 pl-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Application Pipeline + Recent Loans + Recent Applications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-3 w-48 mt-2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-md shrink-0" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
