"use client";

import { useState } from "react";
import { 
  Shield, 
  Download, 
  Users, 
  Building2, 
  FileSpreadsheet,
  ChevronRight,
  Filter,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";

type BorrowerTypeFilter = "all" | "INDIVIDUAL" | "CORPORATE";

interface ExportFilters {
  borrowerType: BorrowerTypeFilter;
  startDate: string;
  endDate: string;
}

export default function CompliancePage() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExportFilters>({
    borrowerType: "all",
    startDate: "",
    endDate: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const handleExportBorrowers = async () => {
    setExporting("borrowers");
    try {
      // Build query params
      const params = new URLSearchParams();
      if (filters.borrowerType !== "all") {
        params.append("borrowerType", filters.borrowerType);
      }
      if (filters.startDate) {
        params.append("startDate", filters.startDate);
      }
      if (filters.endDate) {
        params.append("endDate", filters.endDate);
      }

      const queryString = params.toString();
      const url = `/api/proxy/compliance/exports/borrowers${queryString ? `?${queryString}` : ""}`;

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Export failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      
      // Generate filename with date
      const dateStr = new Date().toISOString().split("T")[0];
      const typeStr = filters.borrowerType !== "all" ? `-${filters.borrowerType.toLowerCase()}` : "";
      a.download = `borrowers${typeStr}-${dateStr}.csv`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      
      toast.success("Borrowers export downloaded successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export borrowers";
      toast.error(message);
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setFilters({
      borrowerType: "all",
      startDate: "",
      endDate: "",
    });
  };

  const hasActiveFilters = filters.borrowerType !== "all" || filters.startDate || filters.endDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Compliance</h1>
          <p className="text-muted">Export data for regulatory compliance and reporting</p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Shield className="h-3.5 w-3.5 mr-1.5" />
          Admin Only
        </Badge>
      </div>

      {/* Export Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Borrowers Export Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">Borrowers Export</CardTitle>
                  <CardDescription>
                    Export all borrower information including personal details, compliance fields, and contact information
                  </CardDescription>
                </div>
              </div>
              <Button
                onClick={() => setShowFilters(!showFilters)}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                    {[
                      filters.borrowerType !== "all" ? 1 : 0,
                      filters.startDate ? 1 : 0,
                      filters.endDate ? 1 : 0,
                    ].reduce((a, b) => a + b, 0)}
                  </Badge>
                )}
              </Button>
            </div>
          </CardHeader>
          
          {showFilters && (
            <CardContent className="border-t border-border pt-4">
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Borrower Type Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Borrower Type</Label>
                    <Select
                      value={filters.borrowerType}
                      onValueChange={(value: BorrowerTypeFilter) =>
                        setFilters((prev) => ({ ...prev, borrowerType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="INDIVIDUAL">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Individual
                          </div>
                        </SelectItem>
                        <SelectItem value="CORPORATE">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Corporate
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Start Date Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Created From</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* End Date Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Created Until</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="mt-4 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          )}

          <CardContent className={showFilters ? "pt-4" : ""}>
            {/* Export Info */}
            <div className="mb-4 p-4 bg-surface rounded-lg border border-border">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-accent" />
                Included Fields
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted">
                <div>
                  <p className="font-medium text-foreground mb-1">Core Information</p>
                  <ul className="space-y-0.5">
                    <li>• Name & IC/Passport</li>
                    <li>• Document verification status</li>
                    <li>• Contact details</li>
                    <li>• Address</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Individual Fields</p>
                  <ul className="space-y-0.5">
                    <li>• Date of birth & gender</li>
                    <li>• Race & education level</li>
                    <li>• Employment & income</li>
                    <li>• Emergency contact</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Corporate Fields</p>
                  <ul className="space-y-0.5">
                    <li>• Company name & SSM</li>
                    <li>• Authorized representative</li>
                    <li>• Business details</li>
                    <li>• Incorporation info</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Statistics</p>
                  <ul className="space-y-0.5">
                    <li>• Total loans count</li>
                    <li>• Total applications</li>
                    <li>• Created timestamp</li>
                    <li>• Last updated</li>
                  </ul>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted italic">
                Note: Audit trail data is not included in this export
              </p>
            </div>

            {/* Export Button */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted">
                {hasActiveFilters ? (
                  <span>
                    Exporting filtered borrowers
                    {filters.borrowerType !== "all" && (
                      <Badge variant="secondary" className="ml-2">
                        {filters.borrowerType === "INDIVIDUAL" ? "Individual" : "Corporate"}
                      </Badge>
                    )}
                    {filters.startDate && (
                      <span className="ml-2">from {formatDate(filters.startDate)}</span>
                    )}
                    {filters.endDate && (
                      <span className="ml-1">to {formatDate(filters.endDate)}</span>
                    )}
                  </span>
                ) : (
                  "Export all borrowers"
                )}
              </div>
              <Button
                onClick={handleExportBorrowers}
                disabled={exporting === "borrowers"}
                className="gap-2"
              >
                {exporting === "borrowers" ? (
                  <>
                    <Download className="h-4 w-4 animate-pulse" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export to CSV
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Placeholder for future exports */}
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-muted" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  More Exports
                  <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Additional compliance exports including loan schedules, payment history, and regulatory reports
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PlaceholderExport
                title="Schedule A Report"
                description="KPKT regulatory compliance report"
              />
              <PlaceholderExport
                title="Payment History"
                description="Complete payment transaction records"
              />
              <PlaceholderExport
                title="Overdue Report"
                description="Outstanding and overdue payments"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlaceholderExport({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 border border-border rounded-lg bg-surface/50">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted">{description}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted" />
      </div>
    </div>
  );
}
