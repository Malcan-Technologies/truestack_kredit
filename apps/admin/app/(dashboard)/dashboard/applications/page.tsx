"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Plus, ClipboardList, Eye, Building2, User, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableActionButton } from "@/components/ui/table-action-button";
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
import { formatCurrency, formatDate } from "@/lib/utils";

interface Application {
  id: string;
  amount: string;
  term: number;
  status: string;
  notes: string | null;
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
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleRefresh = async () => {
    await fetchApplications();
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

  const sortedApplications = sortField
    ? [...applications].sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
          case "type":
            cmp = a.borrower.borrowerType.localeCompare(b.borrower.borrowerType);
            break;
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
      })
    : applications;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loan Applications</h1>
          <p className="text-muted">Review and manage loan applications</p>
        </div>
        <Link href="/dashboard/applications/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Application
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
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
          variant={filter === "SUBMITTED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("SUBMITTED"); setCurrentPage(1); }}
        >
          Submitted
        </Button>
        <Button
          variant={filter === "APPROVED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("APPROVED"); setCurrentPage(1); }}
          className={filter === "APPROVED" ? "" : "text-emerald-600 border-emerald-500/50 hover:bg-emerald-500/10"}
        >
          Approved
        </Button>
        <Button
          variant={filter === "REJECTED" ? "default" : "outline"}
          size="sm"
          onClick={() => { setFilter("REJECTED"); setCurrentPage(1); }}
          className={filter === "REJECTED" ? "" : "text-destructive border-destructive/50 hover:bg-destructive/10"}
        >
          Rejected
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-accent" />
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
              headers={["Borrower", "Type", "Product", "Amount", "Term", "Status", "Created", "Actions"]}
              columns={[
                { width: "w-32", subLine: true },
                { badge: true, width: "w-20" },
                { width: "w-24" },
                { width: "w-20" },
                { width: "w-16" },
                { badge: true, width: "w-20" },
                { width: "w-20" },
                { width: "w-8" },
              ]}
            />
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ClipboardList className="h-12 w-12 text-muted mb-4" />
              <p className="text-muted">No applications found</p>
              <Link href="/dashboard/applications/new">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create application
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("type")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Type
                      {sortField === "type" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
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
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("created")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Created
                      {sortField === "created" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.map((app) => {
                  const isCorporate = app.borrower.borrowerType === "CORPORATE";
                  const displayName = isCorporate && app.borrower.companyName 
                    ? app.borrower.companyName 
                    : app.borrower.name;
                  
                  return (
                  <TableRow key={app.id}>
                    <TableCell>
                      <Link href={`/dashboard/applications/${app.id}`} className="block">
                        <div>
                          <p className="font-medium hover:text-primary hover:underline">{displayName}</p>
                          {isCorporate && app.borrower.companyName && (
                            <p className="text-xs text-muted-foreground">Rep: {app.borrower.name}</p>
                          )}
                          <p className="text-xs text-muted">{app.borrower.icNumber}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {isCorporate ? (
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
                    <TableCell>{app.product.name}</TableCell>
                    <TableCell>{formatCurrency(Number(app.amount))}</TableCell>
                    <TableCell>{app.term} months</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[app.status]}>
                        {app.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(app.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/applications/${app.id}`}>
                        <TableActionButton
                          icon={Eye}
                          label="View"
                          onClick={() => {}}
                        />
                      </Link>
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
            itemLabel="applications"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
