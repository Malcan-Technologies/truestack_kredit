"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  ClipboardList,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { Button } from "@borrower_pro/components/ui/button";
import { Input } from "@borrower_pro/components/ui/input";
import { Badge } from "@borrower_pro/components/ui/badge";
import { LoanChannelPill } from "@borrower_pro/components/loan-center/loan-channel-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@borrower_pro/components/ui/table";
import { TablePagination } from "@borrower_pro/components/ui/table-pagination";
import { RefreshButton } from "@borrower_pro/components/ui/refresh-button";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "@borrower_pro/lib/borrower-auth-client";
import { listBorrowerApplications } from "@borrower_pro/lib/borrower-applications-client";
import { borrowerApplicationDetailPath } from "@borrower_pro/lib/borrower-application-navigation";
import type { LoanApplicationDetail } from "@borrower_pro/lib/application-form-types";
import { toAmountNumber } from "@borrower_pro/lib/application-form-validation";
import { formatDate } from "@borrower_pro/lib/borrower-form-display";
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from "@kredit/shared";

/** All, Draft, Submitted (status only), Approved, Rejected, then Action needed → Pending review, Counter-offer */
type AppFilter =
  | ""
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PENDING_REVIEW";

/** Admin has proposed terms; borrower must respond (accept / reject / counter). */
function hasPendingLenderCounterOffer(a: LoanApplicationDetail): boolean {
  if (a.status !== "SUBMITTED" && a.status !== "UNDER_REVIEW") return false;
  return (a.offerRounds ?? []).some(
    (o) => o.status === LoanApplicationOfferStatus.PENDING && o.fromParty === LoanApplicationOfferParty.ADMIN
  );
}

const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SUBMITTED: "default",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

function applyStatusFilter(rows: LoanApplicationDetail[], filter: AppFilter): LoanApplicationDetail[] {
  if (filter === "") return rows;
  if (filter === "PENDING_REVIEW") {
    return rows.filter((a) => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW");
  }
  return rows.filter((a) => a.status === filter);
}

function formatCurrencyMaybe(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function navigateForApplication(router: ReturnType<typeof useRouter>, app: LoanApplicationDetail) {
  if (app.status === "DRAFT") {
    return;
  }
  router.push(borrowerApplicationDetailPath(app));
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LoanApplicationDetail[]>([]);
  const [filter, setFilter] = useState<AppFilter>("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBorrowerApplications({ pageSize: 200 });
      if (res.success) setRows(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  useEffect(() => {
    const onSwitch = () => {
      void loadApplications();
    };
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
  }, [loadApplications]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim().toLowerCase());
      setCurrentPage(1);
    }, 300);
  };

  const submittedOnlyCount = useMemo(
    () => rows.filter((a) => a.status === "SUBMITTED").length,
    [rows]
  );

  const pendingReviewCount = useMemo(
    () => rows.filter((a) => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW").length,
    [rows]
  );

  const counterOfferCount = useMemo(() => rows.filter(hasPendingLenderCounterOffer).length, [rows]);

  /** Applications sent to the lender (any status except draft). */
  const submittedToLenderTotal = useMemo(
    () => rows.filter((a) => a.status !== "DRAFT").length,
    [rows]
  );

  const filteredByStatus = useMemo(() => applyStatusFilter(rows, filter), [rows, filter]);

  const searchFiltered = useMemo(() => {
    if (!debouncedSearch) return filteredByStatus;
    return filteredByStatus.filter((a) => {
      const product = a.product?.name?.toLowerCase() ?? "";
      const status = a.status.toLowerCase().replace(/_/g, " ");
      return product.includes(debouncedSearch) || status.includes(debouncedSearch);
    });
  }, [filteredByStatus, debouncedSearch]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortField(null);
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedApplications = useMemo(() => {
    if (!sortField) return searchFiltered;
    return [...searchFiltered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "product":
          cmp = (a.product?.name ?? "").localeCompare(b.product?.name ?? "");
          break;
        case "amount":
          cmp = toAmountNumber(a.amount) - toAmountNumber(b.amount);
          break;
        case "term":
          cmp = a.term - b.term;
          break;
        case "created":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        default:
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [searchFiltered, sortField, sortDir]);

  const totalItems = sortedApplications.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedApplications = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedApplications.slice(start, start + pageSize);
  }, [sortedApplications, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleRefresh = async () => {
    await loadApplications();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const setFilterAndPage = (f: AppFilter) => {
    setFilter(f);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loan Applications</h1>
          <p className="text-muted text-base mt-1">
            View and manage your applications. After approval, continue in{" "}
            <Link href="/loans" className="text-primary underline font-medium">
              Loans
            </Link>{" "}
            for attestation and signing.
          </p>
        </div>
        <Button asChild>
          <Link href="/applications/apply">
            <Plus className="h-4 w-4 mr-2" />
            Apply for a loan
          </Link>
        </Button>
      </div>

      {submittedToLenderTotal > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm">
          <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-foreground font-medium">
            {submittedToLenderTotal} application{submittedToLenderTotal !== 1 ? "s" : ""} submitted to
            your lender
          </span>
          <span className="text-muted-foreground">(excluding drafts)</span>
        </div>
      )}

      {pendingReviewCount > 0 && (
        <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-secondary">
          <AlertTriangle className="h-4 w-4 text-foreground shrink-0" />
          <div className="flex items-center gap-2 text-sm flex-wrap text-foreground font-medium">
            {pendingReviewCount} application{pendingReviewCount !== 1 ? "s" : ""} awaiting lender
            review
          </div>
        </div>
      )}

      {counterOfferCount > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Counter-offer waiting for your response</span>
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-white/80 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
                >
                  {counterOfferCount} application{counterOfferCount !== 1 ? "s" : ""}
                </Badge>
              </div>
              <p className="text-sm text-amber-900/90 dark:text-amber-100/90">
                Review the proposed amount and term on the application page, then accept, reject, or respond with your
                own counter-offer.
              </p>
            </div>
          </div>

          <div className="flex justify-start sm:justify-end">
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/applications" className="border-amber-300 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/60">
                Review now
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <Button variant={filter === "" ? "default" : "outline"} size="sm" onClick={() => setFilterAndPage("")}>
          All
        </Button>
        <Button
          variant={filter === "DRAFT" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("DRAFT")}
        >
          Draft
        </Button>
        <Button
          variant={filter === "SUBMITTED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("SUBMITTED")}
        >
          Submitted
          {submittedOnlyCount > 0 && (
            <span className="ml-1.5 bg-muted text-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {submittedOnlyCount}
            </span>
          )}
        </Button>
        <Button
          variant={filter === "APPROVED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("APPROVED")}
        >
          Approved
        </Button>
        <Button
          variant={filter === "REJECTED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("REJECTED")}
        >
          Rejected
        </Button>
        <span className="border-l border-border mx-1 h-6 self-center" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Action needed
        </span>
        <Button
          variant={filter === "PENDING_REVIEW" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("PENDING_REVIEW")}
        >
          Pending review
          {pendingReviewCount > 0 && (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {pendingReviewCount}
            </span>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                All applications
              </CardTitle>
              <CardDescription className="mt-1.5">
                {totalItems} application{totalItems !== 1 ? "s" : ""}
                {filter ? " matching this filter" : ""}. Click a submitted row to view details (drafts use
                Continue only). Total submitted: {submittedToLenderTotal}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-72 md:w-80">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product or status..."
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Applications refreshed" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </div>
          ) : sortedApplications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No applications found</p>
              <Button className="mt-4" asChild>
                <Link href="/applications/apply">
                  <Plus className="h-4 w-4 mr-2" />
                  Create application
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("product")}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Product
                        {sortField === "product" ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("amount")}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Amount
                        {sortField === "amount" ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("term")}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Term
                        {sortField === "term" ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("created")}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Created
                        {sortField === "created" ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-right w-[1%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedApplications.map((app) => {
                    const isDraft = app.status === "DRAFT";
                    const loanId = app.loan?.id;
                    const badgeVariant = statusBadgeVariant[app.status] ?? "outline";
                    const showCounterOfferPill = hasPendingLenderCounterOffer(app);

                    return (
                      <TableRow
                        key={app.id}
                        className={
                          isDraft
                            ? ""
                            : "cursor-pointer transition-colors hover:bg-muted/20"
                        }
                        onClick={() => {
                          if (!isDraft) navigateForApplication(router, app);
                        }}
                        data-state={isDraft ? "static" : undefined}
                      >
                        <TableCell className="font-medium">{app.product?.name ?? "—"}</TableCell>
                        <TableCell>{formatCurrencyMaybe(app.amount)}</TableCell>
                        <TableCell>{app.term} months</TableCell>
                        <TableCell>
                          <LoanChannelPill channel={app.loanChannel} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={badgeVariant}>{app.status.replace(/_/g, " ")}</Badge>
                            {showCounterOfferPill && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                              >
                                Counter offer
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(app.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex flex-col items-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isDraft && (
                              <Button variant="secondary" size="sm" asChild>
                                <Link
                                  href={
                                    app.loanChannel === "PHYSICAL"
                                      ? borrowerApplicationDetailPath(app)
                                      : `/applications/apply?applicationId=${app.id}`
                                  }
                                >
                                  {app.loanChannel === "PHYSICAL" ? "View application" : "Continue"}
                                </Link>
                              </Button>
                            )}
                            {(app.status === "SUBMITTED" || app.status === "UNDER_REVIEW") && (
                              <>
                                {loanId && (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/loans/${loanId}`}>Open loan</Link>
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="bg-foreground text-background hover:bg-foreground/90"
                                  asChild
                                >
                                  <Link href={borrowerApplicationDetailPath(app)}>View application</Link>
                                </Button>
                              </>
                            )}
                            {app.status === "APPROVED" && (
                              <>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={loanId ? `/loans/${loanId}` : "/loans"}>Open loan</Link>
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-foreground text-background hover:bg-foreground/90"
                                  asChild
                                >
                                  <Link href={borrowerApplicationDetailPath(app)}>View application</Link>
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                itemLabel="applications"
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
