"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  CreditCard,
  Wallet,
  AlertTriangle,
  CircleDollarSign,
  BarChart3,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle,
  Percent,
  Package,
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { PromotionsCarousel } from "@/components/promotions-carousel";

// ============================================
// Types
// ============================================

interface TenantStats {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    gracePeriodEnd?: string;
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
    totalCollected: number;
    overdueAmount: number;
    collectionRate: number;
    totalLateFees: number;
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

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let fromDate: Date;

  switch (preset) {
    case "1m":
      fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
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

  return { from: fromDate.toISOString().split("T")[0], to };
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
    color: "hsl(217, 91%, 60%)",
  },
  count: {
    label: "Loans",
    color: "hsl(217, 91%, 60%)",
  },
};

const collectionChartConfig: ChartConfig = {
  due: {
    label: "Due",
    color: "hsl(215, 20%, 65%)",
  },
  collected: {
    label: "Collected",
    color: "hsl(142, 71%, 45%)",
  },
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "hsl(217, 91%, 60%)",
  IN_ARREARS: "hsl(38, 92%, 50%)",
  COMPLETED: "hsl(142, 71%, 45%)",
  DEFAULTED: "hsl(0, 84%, 60%)",
  WRITTEN_OFF: "hsl(215, 20%, 65%)",
  PENDING_DISBURSEMENT: "hsl(142, 71%, 65%)",
  // Application statuses
  DRAFT: "hsl(215, 20%, 65%)",
  SUBMITTED: "hsl(217, 91%, 60%)",
  UNDER_REVIEW: "hsl(38, 92%, 50%)",
  APPROVED: "hsl(142, 71%, 45%)",
  REJECTED: "hsl(0, 84%, 60%)",
  CANCELLED: "hsl(215, 20%, 50%)",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  IN_ARREARS: "In Arrears",
  COMPLETED: "Completed",
  DEFAULTED: "Defaulted",
  WRITTEN_OFF: "Written Off",
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tenant, setTenant] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>("6m");

  const fetchData = useCallback(async (preset: DatePreset) => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(preset);
      const [tenantRes, dashRes] = await Promise.all([
        api.get<TenantStats>("/api/tenants/current"),
        api.get<DashboardStats>(`/api/dashboard/stats?from=${from}&to=${to}`),
      ]);

      if (tenantRes.success && tenantRes.data) {
        setTenant(tenantRes.data);
      }
      if (dashRes.success && dashRes.data) {
        setStats(dashRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(datePreset);
  }, [datePreset, fetchData]);

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
  // Loading State
  // ============================================

  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ============================================ */}
        {/* Row 1: Header + Date Range Filter */}
        {/* ============================================ */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gradient">
              Dashboard
            </h1>
            <p className="text-muted text-sm mt-1">
              Financial overview and portfolio performance
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
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

        {/* ============================================ */}
        {/* Row 2: Billing Status + Promotions */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Billing Status */}
          <Card className="lg:col-span-3">
            <CardContent className="py-4">
              {tenant?.subscription ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                      <CreditCard className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-heading font-semibold">
                          {tenant.subscription.plan.charAt(0).toUpperCase() +
                            tenant.subscription.plan.slice(1)}{" "}
                          Plan
                        </p>
                        <Badge
                          variant={
                            tenant.subscription.status === "ACTIVE"
                              ? "success"
                              : tenant.subscription.status === "GRACE_PERIOD"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {tenant.subscription.status === "ACTIVE"
                            ? "Active"
                            : tenant.subscription.status === "GRACE_PERIOD"
                              ? "Grace Period"
                              : tenant.subscription.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted mt-0.5">
                        {tenant.subscription.status === "GRACE_PERIOD"
                          ? `Grace period ends ${formatDate(tenant.subscription.gracePeriodEnd!)}`
                          : `Renews ${formatDate(tenant.subscription.currentPeriodEnd)}`}
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-6">
                    {/* Loan usage */}
                    <LoanUsage
                      used={stats?.kpiCards.totalLoans || 0}
                      limit={500}
                    />
                    <div className="h-8 w-px bg-border" />
                    <BillingCountdown
                      date={
                        tenant.subscription.status === "GRACE_PERIOD"
                          ? tenant.subscription.gracePeriodEnd!
                          : tenant.subscription.currentPeriodEnd
                      }
                      isGrace={tenant.subscription.status === "GRACE_PERIOD"}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted">
                  <CreditCard className="h-5 w-5" />
                  <p className="text-sm">No subscription configured</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Promotions Carousel */}
          <PromotionsCarousel />
        </div>

        {/* ============================================ */}
        {/* Row 3: KPI Cards */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPICard
            title="Total Disbursed"
            value={formatCurrency(stats?.kpiCards.totalDisbursed || 0)}
            icon={CircleDollarSign}
            subtitle={`Net: ${formatCurrency(stats?.kpiCards.totalNetDisbursed || 0)}`}
            accentColor="text-accent"
          />
          <KPICard
            title="Outstanding"
            value={formatCurrency(stats?.kpiCards.totalOutstanding || 0)}
            icon={Wallet}
            subtitle={`${stats?.kpiCards.activeLoans || 0} active loans`}
            accentColor="text-accent"
          />
          <KPICard
            title="Collected"
            value={formatCurrency(stats?.kpiCards.totalCollected || 0)}
            icon={CheckCircle}
            subtitle="Total repayments received"
            accentColor="text-success"
          />
          <KPICard
            title="Overdue"
            value={formatCurrency(stats?.kpiCards.overdueAmount || 0)}
            icon={AlertTriangle}
            subtitle={`${stats?.kpiCards.loansInArrears || 0} loans in arrears`}
            accentColor="text-destructive"
          />
          <KPICard
            title="Collection Rate"
            value={`${stats?.kpiCards.collectionRate || 0}%`}
            icon={Percent}
            subtitle="Collected / total due"
            accentColor={
              (stats?.kpiCards.collectionRate || 0) >= 80
                ? "text-success"
                : (stats?.kpiCards.collectionRate || 0) >= 50
                  ? "text-warning"
                  : "text-destructive"
            }
          />
          <KPICard
            title="PAR 30"
            value={`${stats?.portfolioAtRisk.par30 || 0}%`}
            icon={ShieldAlert}
            subtitle="Portfolio at risk (30+ days)"
            accentColor={
              (stats?.portfolioAtRisk.par30 || 0) <= 5
                ? "text-success"
                : (stats?.portfolioAtRisk.par30 || 0) <= 15
                  ? "text-warning"
                  : "text-destructive"
            }
            tooltipText="Percentage of outstanding loan balance with repayments overdue by 30+ days. Industry benchmark: below 5% is excellent."
          />
        </div>

        {/* ============================================ */}
        {/* Row 4: Primary Charts */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Disbursement Trend */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading">
                Disbursement Trend
              </CardTitle>
              <p className="text-xs text-muted">
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading">
                Loan Portfolio
              </CardTitle>
              <p className="text-xs text-muted">Distribution by status</p>
            </CardHeader>
            <CardContent>
              {loanStatusData.length > 0 ? (
                <ChartContainer
                  config={loanPieConfig}
                  className="h-[280px] w-full"
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
              <CardTitle className="text-base font-heading">
                Collection Performance
              </CardTitle>
              <p className="text-xs text-muted">
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

          {/* Application Pipeline */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-heading">
                    Application Pipeline
                  </CardTitle>
                  <p className="text-xs text-muted">
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
                        <div className="flex items-center justify-between text-sm">
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
        </div>

        {/* ============================================ */}
        {/* Row 6: Loans by Product */}
        {/* ============================================ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Package className="h-4 w-4 text-accent" />
                  Loans by Product
                </CardTitle>
                <p className="text-xs text-muted">
                  Breakdown of loan portfolio across products
                </p>
              </div>
              <Link
                href="/dashboard/products"
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                View products <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.loansByProduct && stats.loansByProduct.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Product</th>
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Total Loans</th>
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Active</th>
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Completed</th>
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Default / W.Off</th>
                      <th className="text-right py-2 pl-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">Total Disbursed</th>
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
                                      className="h-full rounded-full bg-accent transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-muted tabular-nums">{pct}%</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums">
                            {product.totalLoans}
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge variant="info" className="text-[10px] px-1.5 py-0">
                              {product.activeLoans}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">
                              {product.completedLoans}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">
                            <Badge variant={product.defaultedLoans > 0 ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
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
                        <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                          {stats.loansByProduct.reduce((s, p) => s + p.activeLoans, 0)}
                        </td>
                        <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {stats.loansByProduct.reduce((s, p) => s + p.completedLoans, 0)}
                        </td>
                        <td className="text-right py-3 px-4 font-heading font-semibold tabular-nums text-red-600 dark:text-red-400">
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
          {/* Portfolio at Risk */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading">
                Portfolio at Risk
              </CardTitle>
              <p className="text-xs text-muted">
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
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Total Late Fees</span>
                  <span className="font-heading font-semibold text-warning">
                    {formatCurrency(stats?.kpiCards.totalLateFees || 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Loans */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-heading">
                  Recent Loans
                </CardTitle>
                <Link
                  href="/dashboard/loans"
                  className="text-xs text-accent hover:underline flex items-center gap-1"
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
                        <p className="text-sm font-medium truncate">
                          {loan.borrowerName}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(loan.date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-heading font-medium tabular-nums">
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
                <CardTitle className="text-base font-heading">
                  Recent Applications
                </CardTitle>
                <Link
                  href="/dashboard/applications"
                  className="text-xs text-accent hover:underline flex items-center gap-1"
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
                        <p className="text-sm font-medium truncate">
                          {app.borrowerName}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(app.date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-heading font-medium tabular-nums">
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
  accentColor = "text-accent",
  tooltipText,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle: string;
  accentColor?: string;
  tooltipText?: string;
}) {
  const cardContent = (
    <Card className="hover:border-accent/30 transition-colors">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-muted font-medium uppercase tracking-wide">
            {title}
          </p>
          <div className="h-7 w-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
            <Icon className={`h-3.5 w-3.5 ${accentColor}`} />
          </div>
        </div>
        <p className={`text-xl font-heading font-bold ${accentColor} truncate`}>
          {value}
        </p>
        <p className="text-[11px] text-muted mt-1 truncate">{subtitle}</p>
      </CardContent>
    </Card>
  );

  if (tooltipText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return cardContent;
}

function LoanUsage({ used, limit }: { used: number; limit: number }) {
  const percentage = Math.min((used / limit) * 100, 100);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="text-right min-w-[100px]">
      <div className="flex items-baseline justify-end gap-1">
        <span
          className={`text-lg font-heading font-bold tabular-nums ${
            isAtLimit
              ? "text-destructive"
              : isNearLimit
                ? "text-warning"
                : "text-foreground"
          }`}
        >
          {used}
        </span>
        <span className="text-xs text-muted">/ {limit}</span>
      </div>
      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mt-1">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isAtLimit
              ? "bg-destructive"
              : isNearLimit
                ? "bg-warning"
                : "bg-accent"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-[10px] text-muted mt-0.5">loans used</p>
    </div>
  );
}

function BillingCountdown({
  date,
  isGrace,
}: {
  date: string;
  isGrace: boolean;
}) {
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  );

  return (
    <div className="text-right">
      <p
        className={`text-lg font-heading font-bold tabular-nums ${isGrace ? "text-warning" : "text-foreground"}`}
      >
        {daysRemaining}
      </p>
      <p className="text-[11px] text-muted">days remaining</p>
    </div>
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
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">{label}</span>
          <span className="text-muted text-xs ml-2">{description}</span>
        </div>
        <span
          className={`font-heading font-semibold tabular-nums ${
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
    ACTIVE: "info",
    IN_ARREARS: "warning",
    COMPLETED: "success",
    DEFAULTED: "destructive",
    WRITTEN_OFF: "secondary",
    PENDING_DISBURSEMENT: "default",
  };

  return (
    <Badge
      variant={variantMap[status] || "secondary"}
      className="text-[10px] px-1.5 py-0"
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "warning" | "destructive" | "default" | "info" | "secondary"> = {
    DRAFT: "secondary",
    SUBMITTED: "info",
    UNDER_REVIEW: "warning",
    APPROVED: "success",
    REJECTED: "destructive",
    CANCELLED: "secondary",
  };

  return (
    <Badge
      variant={variantMap[status] || "secondary"}
      className="text-[10px] px-1.5 py-0"
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </div>
        <Skeleton className="h-9 w-[340px]" />
      </div>

      {/* Billing + Promo */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Skeleton className="h-[72px] lg:col-span-3 rounded-xl" />
        <Skeleton className="h-[72px] lg:col-span-2 rounded-xl" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[360px] lg:col-span-2 rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>

      {/* Secondary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    </div>
  );
}
