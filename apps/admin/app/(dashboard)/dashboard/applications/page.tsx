"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, ClipboardList, Eye, Building2, User, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchApplications = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.append("status", filter);
      if (search) params.append("search", search);
      const queryString = params.toString();

      const res = await api.get<Application[]>(
        `/api/loans/applications${queryString ? `?${queryString}` : ""}`
      );
      if (res.success && res.data) {
        setApplications(Array.isArray(res.data) ? res.data : []);
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error("Failed to fetch applications:", error);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleRefresh = async () => {
    await fetchApplications();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

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
          onClick={() => setFilter("")}
        >
          All
        </Button>
        <Button
          variant={filter === "DRAFT" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("DRAFT")}
        >
          Draft
        </Button>
        <Button
          variant={filter === "SUBMITTED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("SUBMITTED")}
        >
          Submitted
        </Button>
        <Button
          variant={filter === "APPROVED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("APPROVED")}
        >
          Approved
        </Button>
        <Button
          variant={filter === "REJECTED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("REJECTED")}
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
              <CardDescription>
                {applications.length} applications. Click a row to view details.
              </CardDescription>
            </div>
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <Input
                placeholder="Search by name, IC, company..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-64"
              />
              <Button type="submit" variant="secondary" size="icon">
                <Search className="h-4 w-4" />
              </Button>
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Applications refreshed" />
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {applications.length === 0 ? (
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
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => {
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
        </CardContent>
      </Card>
    </div>
  );
}
