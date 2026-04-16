"use client";

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Building2, User, CheckCircle, Search, AlertTriangle, Clock, PlayCircle, Loader2, ArrowUpDown, ArrowUp, ArrowDown, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "@/components/ui/refresh-button";
import { VerificationBadge } from "@/components/verification-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatSmartDateTime } from "@/lib/utils";
import { formatLoanStatusLabelForDisplay } from "@/lib/loan-status-label";
import { toast } from "sonner";

interface LoanProgress {
  paidCount: number;
  totalRepayments: number;
  progressPercent: number;
  readyToComplete: boolean;
}

interface Loan {
  id: string;
  principalAmount: string;
  interestRate: string;
  term: number;
  status: string;
  loanChannel?: "ONLINE" | "PHYSICAL";
  attestationCompletedAt?: string | null;
  disbursementDate: string | null;
  createdAt: string;
  totalLateFees: string;
  earlySettlementDate: string | null;
  readyForDefault: boolean;
  defaultReadyDate: string | null;
  borrower: {
    id: string;
    name: string;
    icNumber: string;
    borrowerType: string;
    companyName: string | null;
    documentVerified?: boolean;
    verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
  };
  product: {
    id: string;
    name: string;
    loanScheduleType?: string;
  };
  lateFeeBreakdown?: {
    total: number;
    paid: number;
    unpaid: number;
  };
  progress?: LoanProgress;
}

interface LateFeeStatus {
  lastRun: string | null;
  lastTrigger: string | null;
  lastStatus: string | null;
  processedToday: boolean;
  loansReadyForDefault: number;
  loansInArrears: number;
  loansReadyToComplete: number;
  loansPendingDisbursement: number;
}

// Mini donut chart component
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
  
  // Color follows status: green for completed, red for defaulted/written-off, amber for in-arrears, black otherwise
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
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted/40"
        />
        {/* Progress circle */}
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
      {readyToComplete && (
        <CheckCircle className="absolute h-3 w-3 text-emerald-500" />
      )}
    </div>
  );
}

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING_ATTESTATION: "warning",
  PENDING_DISBURSEMENT: "warning",
  ACTIVE: "default",
  IN_ARREARS: "warning",
  COMPLETED: "success",
  DEFAULTED: "destructive",
  WRITTEN_OFF: "destructive",
};

function loanStatusDisplay(loan: Loan): {
  label: string;
  variant: "default" | "success" | "warning" | "destructive" | "info";
} {
  const label = formatLoanStatusLabelForDisplay(loan);
  const variant =
    loan.status === "PENDING_ATTESTATION" ||
    (loan.status === "PENDING_DISBURSEMENT" &&
      loan.loanChannel === "ONLINE" &&
      !loan.attestationCompletedAt)
      ? "warning"
      : statusColors[loan.status] || "default";
  return { label, variant };
}

function LoansPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialFilter = searchParams.get("filter") || "";

  const [allLoans, setAllLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Late fee processing state
  const [lateFeeStatus, setLateFeeStatus] = useState<LateFeeStatus | null>(null);
  const [processingLateFees, setProcessingLateFees] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  };

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      // For READY_TO_COMPLETE and READY_FOR_DEFAULT, fetch all loans and filter client-side
      const statusParam = (filter === "READY_TO_COMPLETE" || filter === "READY_FOR_DEFAULT") ? "" : filter;
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (statusParam) params.append("status", statusParam);
      if (debouncedSearch) params.append("search", debouncedSearch);
      const res = await api.get<Loan[]>(
        `/api/loans?${params.toString()}`
      );
      if (res.success && res.data) {
        setAllLoans(Array.isArray(res.data) ? res.data : []);
        if (res.pagination) {
          setTotalItems(res.pagination.total);
          setTotalPages(res.pagination.totalPages);
        }
      } else {
        setAllLoans([]);
        setTotalItems(0);
        setTotalPages(0);
      }
    } catch (error) {
      console.error("Failed to fetch loans:", error);
      setAllLoans([]);
      setTotalItems(0);
      setTotalPages(0);
    }
    setLoading(false);
  }, [filter, debouncedSearch, currentPage, pageSize]);

  const fetchLateFeeStatus = useCallback(async () => {
    try {
      const res = await api.get<LateFeeStatus>("/api/loans/late-fee-status");
      if (res.success && res.data) {
        setLateFeeStatus(res.data);
      }
    } catch {
      // Non-critical, silently ignore
    }
  }, []);

  useEffect(() => {
    fetchLoans();
    fetchLateFeeStatus();
  }, [fetchLoans, fetchLateFeeStatus]);

  const handleRefresh = async () => {
    await Promise.all([fetchLoans(), fetchLateFeeStatus()]);
  };

  const handleProcessLateFees = async () => {
    if (processingLateFees) return;
    setProcessingLateFees(true);
    try {
      const res = await api.post<{ loansProcessed: number; feesCalculated: number; totalFeeAmount: number }>(
        "/api/loans/process-late-fees",
        {}
      );
      if (res.success && res.data) {
        toast.success(
          `Late fees processed: ${res.data.loansProcessed} loans, ${res.data.feesCalculated} fees charged`
        );
        await Promise.all([fetchLoans(), fetchLateFeeStatus()]);
      } else {
        toast.error(res.error || "Failed to process late fees");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process late fees";
      toast.error(errorMessage);
    }
    setProcessingLateFees(false);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  // Toggle sort on a column
  const toggleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); } // third click clears sort
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Apply client-side filters (memoized to avoid recalculating on every render)
  const filteredLoans = useMemo(() => {
    if (filter === "READY_TO_COMPLETE") {
      return allLoans.filter((loan) => loan.progress?.readyToComplete);
    }
    if (filter === "READY_FOR_DEFAULT") {
      return allLoans.filter((loan) => loan.readyForDefault && loan.status !== "DEFAULTED");
    }
    return allLoans;
  }, [allLoans, filter]);

  // Apply sorting (memoized)
  const loans = useMemo(() => {
    if (!sortField) return filteredLoans;
    return [...filteredLoans].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "principal":
          cmp = Number(a.principalAmount) - Number(b.principalAmount);
          break;
        case "term":
          cmp = a.term - b.term;
          break;
        case "progress":
          cmp = (a.progress?.progressPercent ?? -1) - (b.progress?.progressPercent ?? -1);
          break;
        case "lateFees":
          cmp = (a.lateFeeBreakdown?.unpaid ?? 0) - (b.lateFeeBreakdown?.unpaid ?? 0);
          break;
        case "disbursed":
          cmp = (a.disbursementDate || "").localeCompare(b.disbursementDate || "");
          break;
        case "verification": {
          const rank = (v: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | null | undefined, docVerified?: boolean) => {
            if (v === "FULLY_VERIFIED" || (!v && docVerified)) return 3;
            if (v === "PARTIALLY_VERIFIED") return 2;
            if (v === "UNVERIFIED") return 1;
            return 0;
          };
          cmp = rank(a.borrower.verificationStatus, a.borrower.documentVerified) - rank(b.borrower.verificationStatus, b.borrower.documentVerified);
          break;
        }
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filteredLoans, sortField, sortDir]);

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loans</h1>
          <p className="text-muted">View and manage active loans</p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleProcessLateFees}
                  disabled={processingLateFees}
                >
                  {processingLateFees ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" />
                  )}
                  Process Late Fees
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>Manually process late fees for overdue loans.</p>
                <p className="opacity-70 text-xs mt-1">Late fees are also automatically processed daily at 12:30 AM (GMT+8).</p>
              </TooltipContent>
            </Tooltip>
            <Link href="/dashboard/applications">
              <Button>View Applications</Button>
            </Link>
          </div>
          {lateFeeStatus?.lastRun && (
            <span className="text-muted-foreground text-xs mt-2 ml-1 block">
              Last run: {formatSmartDateTime(lateFeeStatus.lastRun)}
              {lateFeeStatus.lastTrigger && (
                <span className="opacity-70">
                  {" "}({lateFeeStatus.lastTrigger === "CRON" ? "scheduled" : "manual"})
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Status Alert Bar */}
      {lateFeeStatus && (
        lateFeeStatus.loansPendingDisbursement > 0 ||
        lateFeeStatus.loansInArrears > 0 ||
        lateFeeStatus.loansReadyToComplete > 0 ||
        lateFeeStatus.loansReadyForDefault > 0
      ) && (
        <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-secondary">
          <AlertTriangle className="h-4 w-4 text-foreground shrink-0" />
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {[
              lateFeeStatus.loansPendingDisbursement > 0 && (
                <span key="pending" className="text-foreground font-medium">
                  {lateFeeStatus.loansPendingDisbursement} loan{lateFeeStatus.loansPendingDisbursement !== 1 ? "s" : ""} pending disbursement
                </span>
              ),
              lateFeeStatus.loansInArrears > 0 && (
                <span key="arrears" className="text-foreground font-medium">
                  {lateFeeStatus.loansInArrears} loan{lateFeeStatus.loansInArrears !== 1 ? "s" : ""} in arrears
                </span>
              ),
              lateFeeStatus.loansReadyToComplete > 0 && (
                <span key="complete" className="text-foreground font-medium">
                  {lateFeeStatus.loansReadyToComplete} loan{lateFeeStatus.loansReadyToComplete !== 1 ? "s" : ""} ready to complete
                </span>
              ),
              lateFeeStatus.loansReadyForDefault > 0 && (
                <span key="default" className="text-foreground font-medium">
                  {lateFeeStatus.loansReadyForDefault} loan{lateFeeStatus.loansReadyForDefault !== 1 ? "s" : ""} ready for default
                </span>
              ),
            ].filter(Boolean).flatMap((item, i, arr) =>
              i < arr.length - 1 ? [item, <span key={`dot-${i}`} className="text-muted-foreground">•</span>] : [item]
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          variant={filter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter(""); setCurrentPage(1); }}
        >
          All
        </Button>
        <Button
          variant={filter === "ACTIVE" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("ACTIVE"); setCurrentPage(1); }}
        >
          Active
        </Button>
        <Button
          variant={filter === "IN_ARREARS" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("IN_ARREARS"); setCurrentPage(1); }}
        >
          In Arrears
        </Button>
        <Button
          variant={filter === "DEFAULTED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("DEFAULTED"); setCurrentPage(1); }}
        >
          Defaulted
        </Button>
        <Button
          variant={filter === "COMPLETED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("COMPLETED"); setCurrentPage(1); }}
        >
          Completed
        </Button>
        {/* Action Needed section */}
        <span className="border-l border-border mx-1 h-6" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Action Needed</span>
        <Button
          variant={filter === "PENDING_DISBURSEMENT" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("PENDING_DISBURSEMENT"); setCurrentPage(1); }}
        >
          Pending Disbursement
          {lateFeeStatus?.loansPendingDisbursement ? (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {lateFeeStatus.loansPendingDisbursement}
            </span>
          ) : null}
        </Button>
        <Button
          variant={filter === "READY_TO_COMPLETE" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("READY_TO_COMPLETE"); setCurrentPage(1); }}
        >
          Ready to Complete
          {lateFeeStatus?.loansReadyToComplete ? (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {lateFeeStatus.loansReadyToComplete}
            </span>
          ) : null}
        </Button>
        <Button
          variant={filter === "READY_FOR_DEFAULT" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("READY_FOR_DEFAULT"); setCurrentPage(1); }}
        >
          Ready for Default
          {lateFeeStatus?.loansReadyForDefault ? (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {lateFeeStatus.loansReadyForDefault}
            </span>
          ) : null}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                All Loans
              </CardTitle>
              <CardDescription className="mt-1.5">
                {totalItems} loan{totalItems !== 1 ? "s" : ""}. Click a row to view details.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, IC, company..."
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full sm:w-72 md:w-80 lg:w-96 pl-9"
                />
              </div>
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Loans refreshed" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton
              headers={["Borrower", "Verification", "", "Principal", "Term", "Progress", "Late Fees", "Status", "Disbursed"]}
              columns={[
                { width: "w-32", subLine: true },
                { badge: true, width: "w-20" },
                { width: "w-8" },
                { width: "w-20" },
                { width: "w-16" },
                { circle: true },
                { width: "w-16" },
                { badge: true, width: "w-20" },
                { width: "w-20" },
              ]}
            />
          ) : loans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FileText className="h-12 w-12 text-muted mb-4" />
              <p className="text-muted">No loans found</p>
              <Link href="/dashboard/applications">
                <Button className="mt-4">Create Application</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead className="w-20">
                    <button onClick={() => toggleSort("verification")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Verification
                      {sortField === "verification" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead className="w-10 px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Collateral (Jadual K)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("principal")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Principal
                      {sortField === "principal" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("term")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Term
                      {sortField === "term" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("progress")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Progress
                      {sortField === "progress" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("lateFees")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Late Fees
                      {sortField === "lateFees" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("disbursed")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Disbursed
                      {sortField === "disbursed" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((loan) => {
                  const isCorporate = loan.borrower.borrowerType === "CORPORATE";
                  const displayName = isCorporate && loan.borrower.companyName
                    ? loan.borrower.companyName
                    : loan.borrower.name;
                  const progress = loan.progress;
                  const statusUi = loanStatusDisplay(loan);

                  return (
                  <TableRow 
                    key={loan.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/20",
                      progress?.readyToComplete
                        ? "bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]"
                        : loan.readyForDefault && loan.status !== "DEFAULTED"
                        ? "bg-red-500/[0.03] dark:bg-red-500/[0.04]"
                        : loan.status === "PENDING_DISBURSEMENT"
                        ? "bg-amber-500/[0.03] dark:bg-amber-500/[0.04]"
                        : ""
                    )}
                    onClick={() => router.push(`/dashboard/loans/${loan.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0">
                          {isCorporate ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{displayName}</p>
                          {isCorporate && loan.borrower.companyName && (
                            <p className="text-xs text-muted-foreground">Rep: {loan.borrower.name}</p>
                          )}
                          <p className="text-xs text-muted">{loan.borrower.icNumber}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-20">
                      <VerificationBadge
                        verificationStatus={loan.borrower.verificationStatus}
                        documentVerified={loan.borrower.documentVerified}
                        size="minimal"
                        showTooltip
                      />
                    </TableCell>
                    <TableCell className="w-10 px-2">
                      {(loan.product?.loanScheduleType ?? "JADUAL_J") === "JADUAL_K" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Has collateral (Jadual K)</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>No collateral (Jadual J)</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(Number(loan.principalAmount))}</TableCell>
                    <TableCell>{loan.term} months</TableCell>
                    <TableCell>
                      {loan.status === "PENDING_DISBURSEMENT" ? (
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
                            <p>{progress.paidCount} of {progress.totalRepayments} payments complete ({progress.progressPercent}%)</p>
                            {progress.readyToComplete && (
                              <p className="text-emerald-500 font-medium">Ready to complete</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {loan.lateFeeBreakdown && loan.lateFeeBreakdown.total > 0 ? (
                        <div>
                          <span className={`text-sm font-medium ${loan.lateFeeBreakdown.unpaid > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {loan.lateFeeBreakdown.unpaid > 0
                              ? formatCurrency(loan.lateFeeBreakdown.unpaid)
                              : "Settled"}
                          </span>
                          {loan.lateFeeBreakdown.paid > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {formatCurrency(loan.lateFeeBreakdown.paid)} paid
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={statusUi.variant}>
                          {statusUi.label}
                        </Badge>
                        {loan.earlySettlementDate && loan.status === "COMPLETED" && (
                          <Badge variant="outline-success" className="text-xs">
                            Settled Early
                          </Badge>
                        )}
                        {progress?.readyToComplete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline-success" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Ready
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>All payments received. Ready to complete and discharge.</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {loan.readyForDefault && loan.status !== "DEFAULTED" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline-destructive" className="text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Default Ready
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Default period exceeded. Ready to be marked as defaulted.</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {loan.disbursementDate ? formatDate(loan.disbursementDate) : "-"}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            itemLabel="loans"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}

export default function LoansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          Loading...
        </div>
      }
    >
      <LoansPageContent />
    </Suspense>
  );
}
