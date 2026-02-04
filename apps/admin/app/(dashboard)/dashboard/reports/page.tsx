"use client";

import { useEffect, useState } from "react";
import { BarChart3, Download, FileText, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

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
  generatedAt: string;
}

export default function ReportsPage() {
  const [portfolio, setPortfolio] = useState<PortfolioReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchPortfolio = async () => {
    setLoading(true);
    const res = await api.get<PortfolioReport>("/api/compliance/reports/portfolio");
    if (res.success && res.data) {
      setPortfolio(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const handleExport = async (type: "loans") => {
    setExporting(true);
    try {
      // Use proxy route for backend calls (ensures cookies work correctly)
      const response = await fetch(
        `/api/proxy/compliance/exports/${type}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export downloaded successfully");
    } catch (error) {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Reports</h1>
          <p className="text-muted">Portfolio summary and data exports</p>
        </div>
        <Button onClick={() => handleExport("loans")} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? "Exporting..." : "Export Loans"}
        </Button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Loans"
          value={portfolio?.summary.totalLoans.toString() || "0"}
          icon={FileText}
          color="text-accent"
        />
        <MetricCard
          title="Active Loans"
          value={portfolio?.summary.activeLoans.toString() || "0"}
          icon={TrendingUp}
          color="text-info"
        />
        <MetricCard
          title="Completed"
          value={portfolio?.summary.completedLoans.toString() || "0"}
          icon={BarChart3}
          color="text-success"
        />
        <MetricCard
          title="Defaulted"
          value={portfolio?.summary.defaultedLoans.toString() || "0"}
          icon={AlertCircle}
          color="text-destructive"
        />
      </div>

      {/* Financial Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Financial Summary</CardTitle>
          <CardDescription>
            Portfolio performance metrics
            {portfolio?.generatedAt && (
              <span className="text-muted ml-2">
                (Generated: {new Date(portfolio.generatedAt).toLocaleString()})
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <FinancialMetric
              label="Total Principal"
              value={formatCurrency(Number(portfolio?.financials.totalPrincipal || 0))}
            />
            <FinancialMetric
              label="Total Collected"
              value={formatCurrency(Number(portfolio?.financials.totalCollected || 0))}
              color="text-success"
            />
            <FinancialMetric
              label="Total Outstanding"
              value={formatCurrency(Number(portfolio?.financials.totalOutstanding || 0))}
              color="text-warning"
            />
            <FinancialMetric
              label="Overdue Amount"
              value={formatCurrency(Number(portfolio?.financials.overdueAmount || 0))}
              color="text-destructive"
            />
            <FinancialMetric
              label="Collection Rate"
              value={portfolio?.financials.collectionRate || "0%"}
              highlight
            />
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle>Data Exports</CardTitle>
          <CardDescription>Download reports and data in CSV format</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ExportCard
              title="Loans Export"
              description="All loans with borrower and product details"
              onClick={() => handleExport("loans")}
              disabled={exporting}
            />
            <ExportCard
              title="Portfolio Report"
              description="Summary statistics and metrics (Coming soon)"
              disabled
            />
            <ExportCard
              title="Schedule A Report"
              description="KPKT compliance report (Coming soon)"
              disabled
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{title}</p>
            <p className="text-2xl font-heading font-bold mt-1">{value}</p>
          </div>
          <div className={`h-12 w-12 rounded-lg bg-surface flex items-center justify-center ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialMetric({
  label,
  value,
  color = "text-foreground",
  highlight = false,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "p-4 bg-accent/10 rounded-lg" : ""}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-xl font-heading font-bold mt-1 ${color} ${highlight ? "text-accent" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ExportCard({
  title,
  description,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`p-4 border border-border rounded-lg ${
        disabled ? "opacity-50" : "hover:border-accent cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-accent" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}
