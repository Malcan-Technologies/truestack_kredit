"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Plus, Search, User, ShieldCheck, AlertTriangle, Building2 } from "lucide-react";
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
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

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
  _count: {
    loans: number;
  };
}

interface PaginatedResponse {
  data: Borrower[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
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

// ============================================
// Main Component
// ============================================

export default function BorrowersPage() {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
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

  const handleRefresh = async () => {
    await fetchBorrowers();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when changing page size
  };

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
                <User className="h-5 w-5 text-accent" />
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
              headers={["Name", "Type", "Identity", "Contact", "Created", "Updated", "Loans"]}
              columns={[
                { width: "w-32", subLine: true },
                { badge: true, width: "w-20" },
                { width: "w-28", subLine: true },
                { width: "w-24", subLine: true },
                { width: "w-28" },
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
                    <TableHead>Type</TableHead>
                    <TableHead>Identity</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Loans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {borrowers.map((borrower) => (
                    <TableRow key={borrower.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/borrowers/${borrower.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {borrower.borrowerType === "CORPORATE" && borrower.companyName
                            ? borrower.companyName
                            : borrower.name}
                        </Link>
                        {borrower.borrowerType === "CORPORATE" && borrower.companyName && (
                          <div className="text-xs text-muted-foreground">
                            Rep: {borrower.name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {borrower.borrowerType === "CORPORATE" ? (
                          <Badge variant="secondary" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />
                            Corporate
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            Individual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {borrower.borrowerType === "CORPORATE" 
                                ? "SSM" 
                                : borrower.documentType === "IC" ? "IC" : "Passport"}
                            </span>
                            {borrower.documentVerified ? (
                              <Badge
                                variant="verified"
                                className="text-[10px] px-1.5 py-0 h-4 font-medium"
                                title="Verified via e-KYC"
                              >
                                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                e-KYC
                              </Badge>
                            ) : (
                              <Badge
                                variant="unverified"
                                className="text-[10px] px-1.5 py-0 h-4 font-medium"
                                title="Manually verified by admin - exercise caution"
                              >
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                Manual
                              </Badge>
                            )}
                          </div>
                          <div className="font-mono text-sm">
                            {borrower.borrowerType === "INDIVIDUAL" && borrower.documentType === "IC"
                              ? formatICForDisplay(borrower.icNumber)
                              : borrower.icNumber}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="text-sm">{borrower.phone || "-"}</div>
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
                        <span className="text-sm">{formatDateTime(borrower.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDateTime(borrower.updatedAt)}</span>
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
