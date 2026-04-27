"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { LoanChannelPill } from "@borrower_pro/components/loan-center";
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
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "@borrower_pro/lib/borrower-auth-client";
import { listBorrowerApplications } from "@borrower_pro/lib/borrower-applications-client";
import { borrowerApplicationDetailPath } from "@borrower_pro/lib/borrower-application-navigation";
import type { LoanApplicationDetail } from "@kredit/borrower";
import { toAmountNumber } from "@borrower_pro/lib/application-form-validation";
import { formatDate } from "@borrower_pro/lib/borrower-form-display";
import { LoanApplicationOfferParty, LoanApplicationOfferStatus } from "@kredit/shared";
import { isReturnedForAmendment } from "@borrower_pro/lib/borrower-application-amendment";
import { cn } from "@borrower_pro/lib/utils";

/** All, Draft, Submitted (with lender), Approved, Rejected, then Action needed → Counter offer, Amendment */
type AppFilter =
  | ""
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "COUNTER_OFFER"
  | "AMENDMENT";

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
  /** Submitted tab = with lender for review (submitted or under review). */
  if (filter === "SUBMITTED") {
    return rows.filter((a) => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW");
  }
  if (filter === "COUNTER_OFFER") {
    return rows.filter(hasPendingLenderCounterOffer);
  }
  if (filter === "AMENDMENT") {
    return rows.filter(isReturnedForAmendment);
  }
  return rows.filter((a) => a.status === filter);
}

function formatCurrencyMaybe(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function navigateForApplication(router: ReturnType<typeof useRouter>, app: LoanApplicationDetail) {
  router.push(borrowerApplicationDetailPath(app));
}

const APPLICATIONS_TABLE_SKELETON_ROWS = 8;

function ApplicationsTableSkeleton() {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="flex items-center gap-1">
                Product
                <ArrowUpDown className="h-3 w-3 opacity-40" />
              </span>
            </TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                Amount
                <ArrowUpDown className="h-3 w-3 opacity-40" />
              </span>
            </TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                Term
                <ArrowUpDown className="h-3 w-3 opacity-40" />
              </span>
            </TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="flex items-center gap-1">
                Created
                <ArrowUpDown className="h-3 w-3 opacity-40" />
              </span>
            </TableHead>
            <TableHead className="text-right w-[1%]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: APPLICATIONS_TABLE_SKELETON_ROWS }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-[min(100%,10rem)]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-8 w-24" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </>
  );
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

  const submittedWithLenderCount = useMemo(
    () => rows.filter((a) => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW").length,
    [rows]
  );

  const counterOfferCount = useMemo(() => rows.filter(hasPendingLenderCounterOffer).length, [rows]);

  const amendmentCount = useMemo(() => rows.filter(isReturnedForAmendment).length, [rows]);

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

  const scrollToApplicationsList = () => {
    requestAnimationFrame(() => {
      document.getElementById("borrower-applications-list")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const applyFilterFromBanner = (f: AppFilter) => {
    setFilterAndPage(f);
    scrollToApplicationsList();
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

      {amendmentCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Amendment requested by your lender</span>
              <Badge
                variant="outline"
                className="border-amber-300 bg-white/80 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
              >
                {amendmentCount} application{amendmentCount !== 1 ? "s" : ""}
              </Badge>
            </div>
            <p className="text-sm text-amber-900/90 dark:text-amber-100/90">
              Open the application to read your lender&apos;s message, then edit and resubmit when ready.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 self-start border-amber-300 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/60"
            onClick={() => applyFilterFromBanner("AMENDMENT")}
          >
            Review now
          </Button>
        </div>
      )}

      {counterOfferCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1 space-y-1">
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
              Review the proposed amount and term on the application page, then accept, reject, or respond with your own
              counter-offer.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 self-start border-amber-300 bg-white/80 text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/60"
            onClick={() => applyFilterFromBanner("COUNTER_OFFER")}
          >
            Review now
          </Button>
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
          {submittedWithLenderCount > 0 && (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {submittedWithLenderCount}
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
          variant={filter === "COUNTER_OFFER" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("COUNTER_OFFER")}
        >
          Counter offer
          {counterOfferCount > 0 && (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {counterOfferCount}
            </span>
          )}
        </Button>
        <Button
          variant={filter === "AMENDMENT" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterAndPage("AMENDMENT")}
        >
          Amendment
          {amendmentCount > 0 && (
            <span className="ml-1.5 bg-foreground text-background rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {amendmentCount}
            </span>
          )}
        </Button>
      </div>

      <Card id="borrower-applications-list">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
                All applications
              </CardTitle>
              {loading ? (
                <div className="mt-1.5 space-y-2">
                  <Skeleton className="h-4 w-full max-w-md" />
                  <Skeleton className="h-4 w-56" />
                </div>
              ) : (
                <CardDescription className="mt-1.5">
                  {totalItems} application{totalItems !== 1 ? "s" : ""}
                  {filter ? " matching this filter" : ""}. Click a row to view details. Total submitted: {submittedToLenderTotal}.
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-72 md:w-80">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product or status..."
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                  disabled={loading}
                />
              </div>
              <RefreshButton onRefresh={handleRefresh} showToast successMessage="Applications refreshed" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <ApplicationsTableSkeleton />
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
                    const badgeVariant = statusBadgeVariant[app.status] ?? "outline";
                    const showCounterOfferPill = hasPendingLenderCounterOffer(app);
                    const showAmendmentPill = isReturnedForAmendment(app);
                    const attentionRowHighlight = showAmendmentPill || showCounterOfferPill;

                    return (
                      <TableRow
                        key={app.id}
                        className={cn(
                          "cursor-pointer transition-colors",
                          attentionRowHighlight
                            ? "bg-amber-500/[0.06] dark:bg-amber-500/[0.07] hover:bg-amber-500/[0.1] dark:hover:bg-amber-500/[0.12]"
                            : "hover:bg-muted/20"
                        )}
                        onClick={() => navigateForApplication(router, app)}
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
                            {showAmendmentPill && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                              >
                                Amendment
                              </Badge>
                            )}
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
                              <div className="flex flex-col items-end gap-1.5">
                                <Button variant="secondary" size="sm" asChild>
                                  <Link href={borrowerApplicationDetailPath(app)}>View details</Link>
                                </Button>
                                {app.loanChannel !== "PHYSICAL" && (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/applications/apply?applicationId=${app.id}`}>
                                      Edit application
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            )}
                            {(app.status === "SUBMITTED" || app.status === "UNDER_REVIEW") && (
                              <Button variant="outline" size="sm" asChild>
                                <Link href={borrowerApplicationDetailPath(app)}>View</Link>
                              </Button>
                            )}
                            {app.status === "APPROVED" && (
                              <Button variant="outline" size="sm" asChild>
                                <Link href={borrowerApplicationDetailPath(app)}>View</Link>
                              </Button>
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
