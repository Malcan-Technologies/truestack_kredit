"use client";

import { useState } from "react";
import {
  Shield,
  Download,
  Users,
  Building2,
  FileSpreadsheet,
  Calendar,
  FileText,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Loader2,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";

// ============================================
// Types
// ============================================

type BorrowerTypeFilter = "all" | "INDIVIDUAL" | "CORPORATE";
type LoanStatusFilter = "all" | "ACTIVE" | "IN_ARREARS" | "COMPLETED" | "DEFAULTED" | "PENDING_DISBURSEMENT";

// ============================================
// Helpers
// ============================================

/** Generate year options from 2020 to current year */
function getYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let y = currentYear; y >= 2020; y--) {
    years.push(y.toString());
  }
  return years;
}

async function downloadFile(url: string, defaultFilename: string) {
  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Export failed");
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;

  // Try to get filename from Content-Disposition header
  const disposition = response.headers.get("Content-Disposition");
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) {
      a.download = match[1];
    } else {
      a.download = defaultFilename;
    }
  } else {
    a.download = defaultFilename;
  }

  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
  document.body.removeChild(a);
}

const YEAR_OPTIONS = getYearOptions();

// ============================================
// Main Component
// ============================================

export default function CompliancePage() {
  const currentYear = new Date().getFullYear().toString();
  const [exporting, setExporting] = useState<string | null>(null);

  // KPKT filters
  const [kpktStatus, setKpktStatus] = useState<LoanStatusFilter>("all");
  const [kpktYear, setKpktYear] = useState(currentYear);

  // Lampiran A filters
  const [lampiranYear, setLampiranYear] = useState(currentYear);

  // Borrower filters
  const [borrowerType, setBorrowerType] = useState<BorrowerTypeFilter>("all");
  const [borrowerStartDate, setBorrowerStartDate] = useState("");
  const [borrowerEndDate, setBorrowerEndDate] = useState("");

  // Loan filters
  const [loanStatus, setLoanStatus] = useState<LoanStatusFilter>("all");
  const [loanStartDate, setLoanStartDate] = useState("");
  const [loanEndDate, setLoanEndDate] = useState("");

  // Collection summary
  const [collectionMonths, setCollectionMonths] = useState("12");

  // ---- Export handlers ----

  const handleExportKPKT = async () => {
    setExporting("kpkt");
    try {
      const params = new URLSearchParams();
      if (kpktStatus !== "all") params.append("status", kpktStatus);
      if (kpktYear) params.append("year", kpktYear);
      const qs = params.toString();

      await downloadFile(
        `/api/proxy/compliance/exports/kpkt${qs ? `?${qs}` : ""}`,
        `KPKT_Export_${kpktYear}.csv`,
      );
      toast.success("KPKT export downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export KPKT data");
    } finally {
      setExporting(null);
    }
  };

  const handleExportLampiranABulk = async () => {
    setExporting("lampiran-bulk");
    try {
      const params = new URLSearchParams();
      if (lampiranYear) params.append("year", lampiranYear);
      const qs = params.toString();

      await downloadFile(
        `/api/proxy/compliance/exports/lampiran-a-bulk${qs ? `?${qs}` : ""}`,
        `Lampiran-A-${lampiranYear}.zip`,
      );
      toast.success("Lampiran A bulk export downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate bulk Lampiran A");
    } finally {
      setExporting(null);
    }
  };

  const handleExportBorrowers = async () => {
    setExporting("borrowers");
    try {
      const params = new URLSearchParams();
      if (borrowerType !== "all") params.append("borrowerType", borrowerType);
      if (borrowerStartDate) params.append("startDate", borrowerStartDate);
      if (borrowerEndDate) params.append("endDate", borrowerEndDate);
      const qs = params.toString();

      await downloadFile(
        `/api/proxy/compliance/exports/borrowers${qs ? `?${qs}` : ""}`,
        `borrowers-${new Date().toISOString().split("T")[0]}.csv`,
      );
      toast.success("Borrowers export downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export borrowers");
    } finally {
      setExporting(null);
    }
  };

  const handleExportLoans = async () => {
    setExporting("loans");
    try {
      const params = new URLSearchParams();
      if (loanStatus !== "all") params.append("status", loanStatus);
      if (loanStartDate) params.append("startDate", loanStartDate);
      if (loanEndDate) params.append("endDate", loanEndDate);
      const qs = params.toString();

      await downloadFile(
        `/api/proxy/compliance/exports/loans${qs ? `?${qs}` : ""}`,
        `loans-${new Date().toISOString().split("T")[0]}.csv`,
      );
      toast.success("Loans export downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export loans");
    } finally {
      setExporting(null);
    }
  };

  const handleExportOverdue = async () => {
    setExporting("overdue");
    try {
      await downloadFile(
        "/api/proxy/compliance/exports/overdue",
        `Overdue_Report_${new Date().toISOString().split("T")[0]}.csv`,
      );
      toast.success("Overdue report downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export overdue report");
    } finally {
      setExporting(null);
    }
  };

  const handleExportCollectionSummary = async () => {
    setExporting("collection");
    try {
      await downloadFile(
        `/api/proxy/compliance/exports/collection-summary?months=${collectionMonths}`,
        `Collection_Summary_${new Date().toISOString().split("T")[0]}.csv`,
      );
      toast.success("Collection summary downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export collection summary");
    } finally {
      setExporting(null);
    }
  };

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Compliance & Exports</h1>
        <p className="text-muted">Export data for KPKT regulatory compliance and internal reporting</p>
      </div>

      {/* Tabs for categories */}
      <Tabs defaultValue="regulatory" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="regulatory" className="gap-2">
            <Shield className="h-4 w-4" />
            KPKT Regulatory
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Data Exports
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* ===== Tab: KPKT Regulatory ===== */}
        <TabsContent value="regulatory">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* KPKT Portal Export Card */}
          <Card className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">KPKT Portal Export (iDeal CSV)</CardTitle>
                  <CardDescription>
                    Export all loans in KPKT format for uploading to the Bahagian Pemberi Pinjam Wang portal
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              {/* Filters */}
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Year (Loan Agreement Date)</Label>
                    <Select value={kpktYear} onValueChange={setKpktYear}>
                      <SelectTrigger>
                        <Calendar className="h-4 w-4 mr-2 text-muted" />
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Loan Status</Label>
                    <Select value={kpktStatus} onValueChange={(v: LoanStatusFilter) => setKpktStatus(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="IN_ARREARS">In Arrears</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="DEFAULTED">Defaulted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* KPKT field info */}
              <div className="p-4 bg-surface rounded-lg border border-border">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" />
                  KPKT Format Fields
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted">
                  <div>
                    <p className="font-medium text-foreground mb-1">Peminjam</p>
                    <ul className="space-y-0.5">
                      <li>JenisPemohon</li>
                      <li>NamaPemohon</li>
                      <li>NoKp</li>
                      <li>NomborTelefon</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Demografi</p>
                    <ul className="space-y-0.5">
                      <li>Bangsa</li>
                      <li>Jantina</li>
                      <li>Pekerjaan</li>
                      <li>Pendapatan / Majikan</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Pinjaman</p>
                    <ul className="space-y-0.5">
                      <li>PinjamanPokok</li>
                      <li>JumlahFaedah</li>
                      <li>KadarFaedah</li>
                      <li>TempohBayaran</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Status</p>
                    <ul className="space-y-0.5">
                      <li>BakiPinjaman</li>
                      <li>JumlahNpl</li>
                      <li>StatusCagaran</li>
                      <li>Nota</li>
                    </ul>
                  </div>
                </div>
              </div>

            </CardContent>
            <CardFooter className="flex items-center justify-between gap-4 border-t border-border pt-6 mt-auto">
              <p className="text-sm text-muted">
                Export loans for <span className="font-medium text-foreground">{kpktYear}</span>
                {kpktStatus !== "all" && (
                  <> with status <Badge variant="secondary" className="mx-1">{kpktStatus.replace("_", " ")}</Badge></>
                )}
                {" "}in KPKT format
              </p>
              <Button onClick={handleExportKPKT} disabled={exporting === "kpkt"} className="gap-2">
                {exporting === "kpkt" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Exporting...</>
                ) : (
                  <><Download className="h-4 w-4" />Export KPKT CSV</>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Lampiran A Card */}
          <Card className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">Lampiran A (Lejar Akaun Peminjam)</CardTitle>
                  <CardDescription>
                    Bulk export all Borrower Account Ledger PDFs as a ZIP archive, filtered by year.
                    
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              {/* Year filter */}
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Year (Loan Agreement Date)</Label>
                    <Select value={lampiranYear} onValueChange={setLampiranYear}>
                      <SelectTrigger>
                        <Calendar className="h-4 w-4 mr-2 text-muted" />
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* <div className="space-y-2">
                    <Label className="text-sm font-medium invisible">Spacer</Label>
                    <p className="text-sm text-muted pt-2">
                      All disbursed loans for the selected year will be included in the ZIP file
                    </p>
                  </div> */}
                </div>
              </div>

              {/* Info */}
              <div className="p-4 bg-surface rounded-lg border border-border">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" />
                  Lampiran A Contents
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted">
                  <div>
                    <p className="font-medium text-foreground mb-1">1. Butiran Peminjam</p>
                    <ul className="space-y-0.5">
                      <li>Nama, No. K/P, Bangsa</li>
                      <li>Pekerjaan, Pendapatan</li>
                      <li>Majikan, Alamat</li>
                      <li>Jenis & Nilai Cagaran</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">2. Butiran Pinjaman</p>
                    <ul className="space-y-0.5">
                      <li>Tarikh, Pinjaman Pokok</li>
                      <li>Jumlah Faedah & Besar</li>
                      <li>Kadar Faedah (Sebulan)</li>
                      <li>Tempoh & Bayaran Sebulan</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">3. Butiran Bayaran Balik</p>
                    <ul className="space-y-0.5">
                      <li>Tarikh, Jumlah Besar</li>
                      <li>Bayaran Balik, Baki Pinjaman</li>
                      <li>No. Resit</li>
                      <li>Catatan (1-4 status codes)</li>
                    </ul>
                  </div>
                </div>
              </div>

            </CardContent>
            <CardFooter className="flex items-center justify-between gap-4 border-t border-border pt-6 mt-auto">
              <p className="text-sm text-muted">
                Bulk export all Lampiran A PDFs for <span className="font-medium text-foreground">{lampiranYear}</span> as ZIP
              </p>
              <Button onClick={handleExportLampiranABulk} disabled={exporting === "lampiran-bulk"} className="gap-2">
                {exporting === "lampiran-bulk" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generating ZIP...</>
                ) : (
                  <><Archive className="h-4 w-4" />Download All (ZIP)</>
                )}
              </Button>
            </CardFooter>
          </Card>
          </div>
        </TabsContent>

        {/* ===== Tab: Data Exports ===== */}
        <TabsContent value="data">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Borrowers Export */}
          <Card className="flex flex-col">
            <CardHeader>
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
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Borrower Type</Label>
                    <Select value={borrowerType} onValueChange={(v: BorrowerTypeFilter) => setBorrowerType(v)}>
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
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Created From</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        type="date"
                        value={borrowerStartDate}
                        onChange={(e) => setBorrowerStartDate(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Created Until</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        type="date"
                        value={borrowerEndDate}
                        onChange={(e) => setBorrowerEndDate(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-surface rounded-lg border border-border">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-accent" />
                  Included Fields
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted">
                  <div>
                    <p className="font-medium text-foreground mb-1">Core Information</p>
                    <ul className="space-y-0.5">
                      <li>Name & IC/Passport</li>
                      <li>Document verification</li>
                      <li>Contact details</li>
                      <li>Address</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Individual Fields</p>
                    <ul className="space-y-0.5">
                      <li>Date of birth & gender</li>
                      <li>Race & education</li>
                      <li>Employment & income</li>
                      <li>Emergency contact</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Corporate Fields</p>
                    <ul className="space-y-0.5">
                      <li>Company name & SSM</li>
                      <li>Authorized representative</li>
                      <li>Business details</li>
                      <li>Incorporation info</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Statistics</p>
                    <ul className="space-y-0.5">
                      <li>Total loans count</li>
                      <li>Total applications</li>
                      <li>Created timestamp</li>
                      <li>Last updated</li>
                    </ul>
                  </div>
                </div>
              </div>

            </CardContent>
            <CardFooter className="flex items-center justify-between gap-4 border-t border-border pt-6 mt-auto">
              <p className="text-sm text-muted">
                {borrowerType !== "all" && (
                  <Badge variant="secondary" className="mr-2">
                    {borrowerType === "INDIVIDUAL" ? "Individual" : "Corporate"}
                  </Badge>
                )}
                {borrowerStartDate && <span>from {formatDate(borrowerStartDate)} </span>}
                {borrowerEndDate && <span>to {formatDate(borrowerEndDate)}</span>}
                {borrowerType === "all" && !borrowerStartDate && !borrowerEndDate && "Export all borrowers"}
              </p>
              <Button onClick={handleExportBorrowers} disabled={exporting === "borrowers"} className="gap-2">
                {exporting === "borrowers" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Exporting...</>
                ) : (
                  <><Download className="h-4 w-4" />Export to CSV</>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Loans Export */}
          <Card className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">Loans Export</CardTitle>
                  <CardDescription>
                    Export all loans with borrower details, product info, and current status
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Loan Status</Label>
                    <Select value={loanStatus} onValueChange={(v: LoanStatusFilter) => setLoanStatus(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="IN_ARREARS">In Arrears</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="DEFAULTED">Defaulted</SelectItem>
                        <SelectItem value="PENDING_DISBURSEMENT">Pending Disbursement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Created From</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        type="date"
                        value={loanStartDate}
                        onChange={(e) => setLoanStartDate(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Created Until</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        type="date"
                        value={loanEndDate}
                        onChange={(e) => setLoanEndDate(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </CardContent>
            <CardFooter className="flex items-center justify-between gap-4 border-t border-border pt-6 mt-auto">
              <p className="text-sm text-muted">
                {loanStatus !== "all" && <Badge variant="secondary" className="mr-2">{loanStatus}</Badge>}
                {loanStartDate && <span>from {formatDate(loanStartDate)} </span>}
                {loanEndDate && <span>to {formatDate(loanEndDate)}</span>}
                {loanStatus === "all" && !loanStartDate && !loanEndDate && "Export all loans"}
              </p>
              <Button onClick={handleExportLoans} disabled={exporting === "loans"} className="gap-2">
                {exporting === "loans" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Exporting...</>
                ) : (
                  <><Download className="h-4 w-4" />Export to CSV</>
                )}
              </Button>
            </CardFooter>
          </Card>
          </div>
        </TabsContent>

        {/* ===== Tab: Reports ===== */}
        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Overdue / NPL Report */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Overdue / NPL Report</CardTitle>
                    <CardDescription>
                      Export all loans with overdue repayments including days overdue, late fees, and outstanding amounts
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <div className="p-4 bg-surface rounded-lg border border-border">
                  <h4 className="font-medium mb-2 text-sm">Report Columns</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                    <ul className="space-y-0.5">
                      <li>Loan ID & Borrower</li>
                      <li>IC Number & Phone</li>
                      <li>Product & Principal</li>
                      <li>Outstanding Amount</li>
                    </ul>
                    <ul className="space-y-0.5">
                      <li>Overdue Amount</li>
                      <li>Days Overdue</li>
                      <li>Late Fees Accrued</li>
                      <li>Arrears / Default Status</li>
                    </ul>
                  </div>
                </div>

              </CardContent>
              <CardFooter className="flex justify-end gap-4 border-t border-border pt-6 mt-auto">
                <Button onClick={handleExportOverdue} disabled={exporting === "overdue"} className="gap-2">
                  {exporting === "overdue" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Exporting...</>
                  ) : (
                    <><Download className="h-4 w-4" />Export Overdue Report</>
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Collection Summary */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Collection Summary</CardTitle>
                    <CardDescription>
                      Monthly aggregated collection performance with due amounts, collected, and collection rates
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <div className="p-4 bg-surface rounded-lg border border-border">
                  <h4 className="font-medium mb-2 text-sm">Report Columns</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                    <ul className="space-y-0.5">
                      <li>Month</li>
                      <li>Due Amount</li>
                      <li>Collected Amount</li>
                      <li>Collection Rate (%)</li>
                    </ul>
                    <ul className="space-y-0.5">
                      <li>Overdue Amount</li>
                      <li>NPL Amount</li>
                      <li>Total Installments</li>
                      <li>Paid Installments</li>
                    </ul>
                  </div>
                </div>

              </CardContent>
              <CardFooter className="flex items-center justify-between gap-4 border-t border-border pt-6 mt-auto">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Period:</Label>
                  <Select value={collectionMonths} onValueChange={setCollectionMonths}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">Last 6 months</SelectItem>
                      <SelectItem value="12">Last 12 months</SelectItem>
                      <SelectItem value="24">Last 24 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleExportCollectionSummary} disabled={exporting === "collection"} className="gap-2">
                  {exporting === "collection" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Exporting...</>
                  ) : (
                    <><Download className="h-4 w-4" />Export Summary</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
