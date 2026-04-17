"use client";

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ClipboardList, Building2, User, Search, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoanChannelPill } from "@/components/loan-channel-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useTenantPermissions } from "@/components/tenant-context";
import { api } from "@/lib/api";
import { canCreateApplications } from "@/lib/permissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface ApplicationCounts {
  submitted: number;
  underReview: number;
  pendingL2Approval: number;
  l1QueueCount: number;
}

interface Application {
  id: string;
  amount: string;
  term: number;
  status: string;
  loanChannel?: "ONLINE" | "PHYSICAL";
  notes: string | null;
  returnedForAmendment?: boolean;
  pendingLenderCounterOffer?: boolean;
  createdAt: string;
  borrower: {
    id: string;
    name: string;
    borrowerType: string;
    icNumber: string;
    companyName: string | null;
  };
  product: {
    id: string;
    name: string;
    interestModel: string;
    interestRate: string;
  };
}

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "secondary" as "default",
  SUBMITTED: "warning",
  UNDER_REVIEW: "warning",
  PENDING_L2_APPROVAL: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

function applicationStatusLabel(status: string): string {
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "L1 Review";
  if (status === "PENDING_L2_APPROVAL") return "L2 Review";
  return status.replace(/_/g, " ");
}

function ApplicationsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const permissions = useTenantPermissions();
  const initialFilter = searchParams.get("filter") || "";

  const [applications, setApplications] = useState<Application[]>([]);
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

  // Action needed counts
  const [counts, setCounts] = useState<ApplicationCounts>({
    submitted: 0,
    underReview: 0,
    pendingL2Approval: 0,
    l1QueueCount: 0,
  });

  // Sort state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const canCreateApplication = canCreateApplications(permissions);

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  };

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (filter) params.append("status", filter);
      if (debouncedSearch) params.append("search", debouncedSearch);

      const res = await api.get<Application[]>(
        `/api/loans/applications?${params.toString()}`
      );
      if (res.success && res.data) {
        setApplications(Array.isArray(res.data) ? res.data : []);
        if (res.pagination) {
          setTotalItems(res.pagination.total);
          setTotalPages(res.pagination.totalPages);
        }
      } else {
        setApplications([]);
        setTotalItems(0);
        setTotalPages(0);
      }
    } catch (error) {
      console.error("Failed to fetch applications:", error);
      setApplications([]);
      setTotalItems(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, currentPage, pageSize]);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await api.get<{
        submitted: number;
        underReview: number;
        pendingL2Approval: number;
        l1QueueCount: number;
      }>("/api/loans/applications/counts");
      if (res.success && res.data) {
        setCounts({
          submitted: res.data.submitted,
          underReview: res.data.underReview,
          pendingL2Approval: res.data.pendingL2Approval ?? 0,
          l1QueueCount: res.data.l1QueueCount ?? res.data.submitted + res.data.underReview,
        });
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchApplications();
    fetchCounts();
  }, [fetchApplications, fetchCounts]);

  useEffect(() => {
    const q = filter ? `?filter=${encodeURIComponent(filter)}` : "";
    router.replace(`/dashboard/applications${q}`, { scroll: false });
  }, [filter, router]);

  const handleRefresh = async () => {
    await Promise.all([fetchApplications(), fetchCounts()]);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortField(null); setSortDir("asc"); }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedApplications = useMemo(() => {
    if (!sortField) return applications;
    return [...applications].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "product":
          cmp = a.product.name.localeCompare(b.product.name);
          break;
        case "amount":
          cmp = Number(a.amount) - Number(b.amount);
          break;
        case "term":
          cmp = a.term - b.term;
          break;
        case "created":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [applications, sortField, sortDir]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loan Applications</h1>
          <p className="text-muted">Review and manage loan applications</p>
        </div>
        {canCreateApplication ? (
          <Link href="/dashboard/applications/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Application
            </Button>
          </Link>
        ) : null}
      </div>

      {/* Status Alert Bar */}
      {(counts.l1QueueCount > 0 || counts.pendingL2Approval > 0) && (
        <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-secondary">
          <AlertTriangle className="h-4 w-4 text-foreground shrink-0" />
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {[
              counts.l1QueueCount > 0 && (
                <span key="l1" className="text-foreground font-medium">
                  {counts.l1QueueCount} in L1 Review
                </span>
              ),
              counts.pendingL2Approval > 0 && (
                <span key="l2" className="text-foreground font-medium">
                  {counts.pendingL2Approval} in L2 Review
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
          variant={filter === "DRAFT" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("DRAFT"); setCurrentPage(1); }}
        >
          Draft
        </Button>
        <Button
          variant={filter === "APPROVED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("APPROVED"); setCurrentPage(1); }}
        >
          Approved
        </Button>
        <Button
          variant={filter === "REJECTED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("REJECTED"); setCurrentPage(1); }}
        >
          Rejected
        </Button>
        {/* Action Needed section */}
        <span className="border-l border-border mx-1 h-6" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Action Needed</span>
        <Button
          variant={filter === "L1_QUEUE" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("L1_QUEUE"); setCurrentPage(1); }}
        >
          L1 Review
          {counts.l1QueueCount > 0 && (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.l1QueueCount}
            </span>
          )}
        </Button>
        <Button
          variant={filter === "PENDING_L2_APPROVAL" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("PENDING_L2_APPROVAL"); setCurrentPage(1); }}
        >
          L2 Review
          {counts.pendingL2Approval > 0 && (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counts.pendingL2Approval}
            </span>
          )}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                All Applications
              </CardTitle>
              <CardDescription className="mt-1.5">
                {totalItems} application{totalItems !== 1 ? "s" : ""}. Click a row to view details.
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
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Applications refreshed" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton
              headers={["Borrower", "Product", "Amount", "Term", "Channel", "Status", "Created"]}
              columns={[
                { width: "w-32", subLine: true },
                { width: "w-24" },
                { width: "w-20" },
                { width: "w-16" },
                { badge: true, width: "w-28" },
                { badge: true, width: "w-20" },
                { width: "w-20" },
              ]}
            />
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ClipboardList className="h-12 w-12 text-muted mb-4" />
              <p className="text-muted">No applications found</p>
              {canCreateApplication ? (
                <Link href="/dashboard/applications/new">
                  <Button className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Create application
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("product")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Product
                      {sortField === "product" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("amount")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Amount
                      {sortField === "amount" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("term")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Term
                      {sortField === "term" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("created")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Created
                      {sortField === "created" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.map((app) => {
                  const isCorporate = app.borrower.borrowerType === "CORPORATE";
                  const displayName = isCorporate && app.borrower.companyName 
                    ? app.borrower.companyName 
                    : app.borrower.name;
                  
                  return (
                  <TableRow
                    key={app.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/20",
                      app.status === "SUBMITTED" || app.status === "UNDER_REVIEW"
                        ? "bg-amber-500/[0.03] dark:bg-amber-500/[0.04]"
                        : "",
                      app.status === "PENDING_L2_APPROVAL"
                        ? "bg-sky-500/[0.04] dark:bg-sky-500/[0.06]"
                        : ""
                    )}
                    onClick={() => router.push(`/dashboard/applications/${app.id}`)}
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
                          {isCorporate && app.borrower.companyName && (
                            <p className="text-xs text-muted-foreground">Rep: {app.borrower.name}</p>
                          )}
                          <p className="text-xs text-muted">{app.borrower.icNumber}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{app.product.name}</TableCell>
                    <TableCell>{formatCurrency(Number(app.amount))}</TableCell>
                    <TableCell>{app.term} months</TableCell>
                    <TableCell className="align-middle">
                      <LoanChannelPill channel={app.loanChannel} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={statusColors[app.status]}>
                          {applicationStatusLabel(app.status)}
                        </Badge>
                        {app.returnedForAmendment ? (
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-foreground">
                            Amendment
                          </Badge>
                        ) : null}
                        {app.pendingLenderCounterOffer ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                          >
                            Counter offer
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(app.createdAt)}</TableCell>
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
            itemLabel="applications"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          Loading...
        </div>
      }
    >
      <ApplicationsPageContent />
    </Suspense>
  );
}
