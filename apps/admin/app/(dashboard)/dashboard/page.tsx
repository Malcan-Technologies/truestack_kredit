"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  FileText, 
  CreditCard, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";

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

interface PortfolioReport {
  summary: {
    totalLoans: number;
    activeLoans: number;
    completedLoans: number;
    defaultedLoans: number;
  };
  financials: {
    totalPrincipal: string;
    totalCollected: string;
    totalOutstanding: string;
    overdueAmount: string;
    collectionRate: string;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tenantRes, portfolioRes] = await Promise.all([
          api.get<TenantStats>("/api/tenants/current"),
          api.get<PortfolioReport>("/api/compliance/reports/portfolio"),
        ]);

        if (tenantRes.success && tenantRes.data) {
          setStats(tenantRes.data);
        }
        if (portfolioRes.success && portfolioRes.data) {
          setPortfolio(portfolioRes.data);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Dashboard</h1>
        <p className="text-muted">
          Welcome back! Here&apos;s an overview of your loan portfolio.
        </p>
      </div>

      {/* Subscription status */}
      {stats?.subscription && (
        <Card className={stats.subscription.status === "GRACE_PERIOD" ? "border-warning" : ""}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <CreditCard className="h-5 w-5 text-accent" />
              <div>
                <p className="font-medium">
                  {stats.subscription.plan.charAt(0).toUpperCase() + stats.subscription.plan.slice(1)} Plan
                </p>
                <p className="text-sm text-muted">
                  {stats.subscription.status === "GRACE_PERIOD" 
                    ? `Grace period ends ${formatDate(stats.subscription.gracePeriodEnd!)}`
                    : `Renews ${formatDate(stats.subscription.currentPeriodEnd)}`
                  }
                </p>
              </div>
            </div>
            <Badge 
              variant={
                stats.subscription.status === "ACTIVE" ? "success" :
                stats.subscription.status === "GRACE_PERIOD" ? "warning" : "destructive"
              }
            >
              {stats.subscription.status}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Borrowers"
          value={stats?.counts.borrowers.toString() || "0"}
          icon={Users}
          trend={null}
        />
        <StatCard
          title="Active Loans"
          value={portfolio?.summary.activeLoans.toString() || "0"}
          icon={FileText}
          trend={{ value: "+12%", positive: true }}
        />
        <StatCard
          title="Total Outstanding"
          value={formatCurrency(Number(portfolio?.financials.totalOutstanding || 0))}
          icon={TrendingUp}
          trend={null}
        />
        <StatCard
          title="Collection Rate"
          value={portfolio?.financials.collectionRate || "0%"}
          icon={CreditCard}
          trend={{ value: "+5%", positive: true }}
        />
      </div>

      {/* Portfolio summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Loan Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <PortfolioItem
                label="Total Loans"
                value={portfolio?.summary.totalLoans || 0}
                color="text-foreground"
              />
              <PortfolioItem
                label="Active Loans"
                value={portfolio?.summary.activeLoans || 0}
                color="text-info"
              />
              <PortfolioItem
                label="Completed Loans"
                value={portfolio?.summary.completedLoans || 0}
                color="text-success"
              />
              <PortfolioItem
                label="Defaulted Loans"
                value={portfolio?.summary.defaultedLoans || 0}
                color="text-destructive"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <FinancialItem
                label="Total Principal"
                value={formatCurrency(Number(portfolio?.financials.totalPrincipal || 0))}
              />
              <FinancialItem
                label="Total Collected"
                value={formatCurrency(Number(portfolio?.financials.totalCollected || 0))}
                color="text-success"
              />
              <FinancialItem
                label="Total Outstanding"
                value={formatCurrency(Number(portfolio?.financials.totalOutstanding || 0))}
                color="text-warning"
              />
              <FinancialItem
                label="Overdue Amount"
                value={formatCurrency(Number(portfolio?.financials.overdueAmount || 0))}
                color="text-destructive"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  trend: { value: string; positive: boolean } | null;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{title}</p>
            <p className="text-2xl font-heading font-bold mt-1">{value}</p>
            {trend && (
              <p className={`text-xs flex items-center mt-1 ${trend.positive ? "text-success" : "text-destructive"}`}>
                {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend.value} from last month
              </p>
            )}
          </div>
          <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-accent" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PortfolioItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

function FinancialItem({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}
