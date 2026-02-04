"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, User, ShieldCheck, AlertTriangle, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
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

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
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
// Pagination Component
// ============================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push("ellipsis");
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("ellipsis");
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
      {/* Items info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Showing {startItem}-{endItem} of {totalItems} borrowers
        </span>
        <div className="flex items-center gap-2">
          <span>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Previous</span>
        </Button>

        <div className="flex items-center gap-1 mx-2">
          {getPageNumbers().map((page, index) =>
            page === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                className="min-w-[36px]"
                onClick={() => onPageChange(page)}
              >
                {page}
              </Button>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <span className="hidden sm:inline mr-1">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function BorrowersPage() {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchBorrowers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (search) {
        params.append("search", search);
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
  }, [currentPage, pageSize, search, typeFilter]);

  useEffect(() => {
    fetchBorrowers();
  }, [fetchBorrowers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setCurrentPage(1); // Reset to first page on new search
  };

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
              <CardDescription>
                {totalItems} borrowers registered. Click a name to view details.
              </CardDescription>
            </div>
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <Input
                placeholder="Search by name, IC, phone, email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-64"
              />
              <Button type="submit" variant="secondary" size="icon">
                <Search className="h-4 w-4" />
              </Button>
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Borrower list refreshed" />
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted">Loading...</div>
            </div>
          ) : borrowers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="h-12 w-12 text-muted-foreground mb-4" />
              {search ? (
                <>
                  <p className="text-muted-foreground mb-2">
                    No borrowers found matching &quot;{search}&quot;
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setSearchInput("");
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
              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
