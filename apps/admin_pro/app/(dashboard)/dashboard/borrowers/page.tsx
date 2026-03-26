"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, User, Building2, ArrowUpDown, ArrowUp, ArrowDown, Fingerprint, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { VerificationBadge } from "@/components/verification-badge";
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

// ============================================
// Types & Constants
// ============================================

interface Borrower {
  id: string;
  name: string;
  borrowerType: string;
  icNumber: string;
  documentType: string;
  documentVerified: boolean;
  phone: string | null;
  email: string | null;
  address: string | null;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
  performanceProjection: {
    riskLevel: BorrowerPerformanceRiskLevel;
    onTimeRate: string | null;
    tags: string[];
    defaultedLoans: number;
    inArrearsLoans: number;
    readyForDefaultLoans: number;
    totalLoans: number;
  } | null;
  directors?: Array<{
    trueIdentityStatus: string | null;
    trueIdentityResult: string | null;
  }>;
  verificationStatus?: "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
  _count: {
    loans: number;
  };
}

type BorrowerPerformanceRiskLevel = "NO_HISTORY" | "GOOD" | "WATCH" | "HIGH_RISK" | "DEFAULTED";

interface PaginatedResponse {
  data: Borrower[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface AddOnStatusResponse {
  addOns: Array<{ addOnType: string; status: string }>;
}

const DEFAULT_PAGE_SIZE = 20;

// ============================================
// Helper Functions
// ============================================

function formatICForDisplay(icNumber: string): string {
  const cleanIC = icNumber.replace(/[-\s]/g, "");
  if (cleanIC.length === 12 && /^\d{12}$/.test(cleanIC)) {
    return `${cleanIC.substring(0, 6)}-${cleanIC.substring(6, 8)}-${cleanIC.substring(8, 12)}`;
  }
  return icNumber;
}

function getPerformanceBadgeMeta(riskLevel: BorrowerPerformanceRiskLevel | undefined) {
  switch (riskLevel) {
    case "DEFAULTED":
      return { label: "Defaulted", variant: "destructive" as const };
    case "HIGH_RISK":
      return { label: "High Risk", variant: "warning" as const };
    case "WATCH":
      return { label: "Watch", variant: "info" as const };
    case "GOOD":
      return { label: "Good", variant: "success" as const };
    default:
      return { label: "No History", variant: "outline" as const };
  }
}

// ============================================
// Main Component
// ============================================

export default function BorrowersPage() {
  const router = useRouter();
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [trueIdentityActive, setTrueIdentityActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

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

  const fetchBorrowers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }
      if (typeFilter) {
        params.append("borrowerType", typeFilter);
      }

      const res = await api.get<PaginatedResponse>(`/api/borrowers?${params.toString()}`);
      if (res.success && res.data) {
        // Handle both old format (array) and new format (paginated)
        if (Array.isArray(res.data)) {
          setBorrowers(res.data);
          setTotalItems(res.data.length);
          setTotalPages(1);
        } else {
          setBorrowers(res.data.data || []);
          setTotalItems(res.data.pagination?.total || 0);
          setTotalPages(res.data.pagination?.totalPages || 1);
        }
      }
    } catch (error) {
      console.error("Failed to fetch borrowers:", error);
      toast.error("Failed to load borrowers");
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, typeFilter]);

  useEffect(() => {
    fetchBorrowers();
  }, [fetchBorrowers]);

  useEffect(() => {
    const fetchAddOnStatus = async () => {
      if (process.env.NEXT_PUBLIC_PRODUCT_MODE === "pro") {
        setTrueIdentityActive(true);
        return;
      }
      try {
        const res = await api.get<AddOnStatusResponse>("/billing/add-ons");
        if (!res.success || !res.data?.addOns) {
          setTrueIdentityActive(false);
          return;
        }
        const active = res.data.addOns.some(
          (item) => item.addOnType === "TRUEIDENTITY" && item.status === "ACTIVE"
        );
        setTrueIdentityActive(active);
      } catch {
        setTrueIdentityActive(false);
      }
    };
    fetchAddOnStatus();
  }, []);

  const handleRefresh = async () => {
    await fetchBorrowers();
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

  const sortedBorrowers = useMemo(() => {
    if (!sortField) return borrowers;
    return [...borrowers].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "verification":
          const rankA =
            a.verificationStatus === "FULLY_VERIFIED"
              ? 2
              : a.verificationStatus === "PARTIALLY_VERIFIED"
                ? 1
                : a.documentVerified
                  ? 2
                  : 0;
          const rankB =
            b.verificationStatus === "FULLY_VERIFIED"
              ? 2
              : b.verificationStatus === "PARTIALLY_VERIFIED"
                ? 1
                : b.documentVerified
                  ? 2
                  : 0;
          cmp = rankA - rankB;
          break;
        case "created":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [borrowers, sortField, sortDir]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Borrowers</h1>
          <p className="text-muted">Manage your loan customers</p>
        </div>
        <Link href="/dashboard/borrowers/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Borrower
          </Button>
        </Link>
      </div>

      {trueIdentityActive === false && (
        <Card className="border-dashed border-muted-foreground/30">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <Fingerprint className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">TrueIdentity is not enabled</p>
                  <p className="text-xs text-muted">
                    Enable the TrueIdentity add-on on your plan page to verify borrower identities via e-KYC.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/dashboard/settings">
                  <Sparkles className="h-3.5 w-3.5" />
                  Settings
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={typeFilter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => { setTypeFilter(""); setCurrentPage(1); }}
        >
          All
        </Button>
        <Button
          variant={typeFilter === "INDIVIDUAL" ? "default" : "outline"}
          size="sm"
          onClick={() => { setTypeFilter("INDIVIDUAL"); setCurrentPage(1); }}
        >
          <User className="h-4 w-4 mr-1" />
          Individual
        </Button>
        <Button
          variant={typeFilter === "CORPORATE" ? "default" : "outline"}
          size="sm"
          onClick={() => { setTypeFilter("CORPORATE"); setCurrentPage(1); }}
        >
          <Building2 className="h-4 w-4 mr-1" />
          Corporate
        </Button>
      </div>

      {/* Borrower List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                All Borrowers
              </CardTitle>
              <CardDescription className="mt-1.5">
                {totalItems} borrower{totalItems !== 1 ? "s" : ""} registered. Click a name to view details.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, IC, phone, email..."
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full sm:w-72 md:w-80 lg:w-96 pl-9"
                />
              </div>
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Borrower list refreshed" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton
              headers={["Name", "Identity", "Verification", "Contact", "Performance", "Created", "Loans"]}
              columns={[
                { width: "w-32", subLine: true },
                { width: "w-28", subLine: true },
                { badge: true, width: "w-16" },
                { width: "w-24", subLine: true },
                { badge: true, width: "w-24", subLine: true },
                { width: "w-28" },
                { badge: true, width: "w-8" },
              ]}
            />
          ) : borrowers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="h-12 w-12 text-muted-foreground mb-4" />
              {debouncedSearch ? (
                <>
                  <p className="text-muted-foreground mb-2">
                    No borrowers found matching &quot;{debouncedSearch}&quot;
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchInput("");
                        setDebouncedSearch("");
                        setCurrentPage(1);
                      }}
                    >
                      Clear search
                    </Button>
                    <Link href="/dashboard/borrowers/new">
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        New Borrower
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground mb-4">
                    No borrowers registered yet. Create your first borrower to get started.
                  </p>
                  <Link href="/dashboard/borrowers/new">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Borrower
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Identity</TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("verification")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        Verification
                        {sortField === "verification" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("created")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        Created
                        {sortField === "created" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </TableHead>
                    <TableHead>Loans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBorrowers.map((borrower) => (
                    <TableRow
                      key={borrower.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => router.push(`/dashboard/borrowers/${borrower.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0">
                            {borrower.borrowerType === "CORPORATE" ? (
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span>
                              {borrower.borrowerType === "CORPORATE" && borrower.companyName
                                ? borrower.companyName
                                : borrower.name}
                            </span>
                            {borrower.borrowerType === "CORPORATE" && borrower.companyName && (
                              <div className="text-xs text-muted-foreground">
                                Rep: {borrower.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="text-xs text-muted-foreground">
                            {borrower.borrowerType === "CORPORATE" 
                              ? "SSM" 
                              : borrower.documentType === "IC" ? "IC" : "Passport"}
                          </span>
                          <div className="font-mono">
                            {borrower.borrowerType === "INDIVIDUAL" && borrower.documentType === "IC"
                              ? formatICForDisplay(borrower.icNumber)
                              : borrower.icNumber}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <VerificationBadge
                          verificationStatus={borrower.verificationStatus}
                          documentVerified={borrower.documentVerified}
                          size="compact"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div>{borrower.phone || "-"}</div>
                          {borrower.email && (
                            <div
                              className="text-xs text-muted-foreground truncate max-w-[180px]"
                              title={borrower.email}
                            >
                              {borrower.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const projection = borrower.performanceProjection;
                          const meta = getPerformanceBadgeMeta(projection?.riskLevel);
                          const onTimeRate = projection?.onTimeRate ? Number(projection.onTimeRate) : null;
                          const riskNotes = [
                            projection?.defaultedLoans ? `${projection.defaultedLoans} defaulted` : null,
                            projection?.inArrearsLoans ? `${projection.inArrearsLoans} in arrears` : null,
                            projection?.readyForDefaultLoans ? `${projection.readyForDefaultLoans} default ready` : null,
                          ].filter(Boolean) as string[];

                          return (
                            <div className="space-y-1">
                              <Badge variant={meta.variant}>{meta.label}</Badge>
                              <p className="text-xs text-muted-foreground">
                                {onTimeRate !== null ? `On-time ${onTimeRate.toFixed(1)}%` : "No repayment track record"}
                              </p>
                              {riskNotes.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {riskNotes.join(" • ")}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <span>{formatDate(borrower.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{borrower._count.loans}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                itemLabel="borrowers"
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
