"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  RefreshCw,
  ExternalLink,
  Server,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HardDrive,
  CloudOff,
  Loader2,
} from "lucide-react";
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

const BASE = "/api/proxy/admin/agreements";

interface Agreement {
  loanId: string;
  borrowerName: string;
  borrowerIc: string;
  filename: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  version: number;
  loanStatus: string;
  loanChannel: string | null;
  hasBackup: boolean;
  onPremAvailable: boolean | null;
  hasBorrowerSigned: boolean;
}

interface AgreementsResponse {
  success: boolean;
  gatewayOnline: boolean;
  agreements: Agreement[];
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type StatusFilter = "all" | "online" | "physical" | "missing";

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [syncingLoanIds, setSyncingLoanIds] = useState<Set<string>>(new Set());
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchAgreements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(BASE, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agreements");
      const data: AgreementsResponse = await res.json();
      setAgreements(data.agreements);
      setGatewayOnline(data.gatewayOnline);
    } catch {
      toast.error("Failed to load agreements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgreements();
  }, [fetchAgreements]);

  const filteredAgreements = useMemo(() => {
    return agreements.filter((a) => {
      if (statusFilter === "online") return a.loanChannel === "ONLINE";
      if (statusFilter === "physical") return a.loanChannel !== "ONLINE";
      if (statusFilter === "missing")
        return a.loanChannel === "ONLINE" && a.onPremAvailable === false;
      return true;
    });
  }, [agreements, statusFilter]);

  const totalFiltered = filteredAgreements.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  const paginatedAgreements = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgreements.slice(start, start + pageSize);
  }, [filteredAgreements, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const missingCount = agreements.filter(
    (a) => a.loanChannel === "ONLINE" && a.onPremAvailable === false,
  ).length;

  const missingLoanIds = agreements
    .filter(
      (a) =>
        a.loanChannel === "ONLINE" &&
        a.onPremAvailable === false &&
        a.hasBackup,
    )
    .map((a) => a.loanId);

  const handleSyncSingle = async (loanId: string) => {
    setSyncingLoanIds((prev) => new Set(prev).add(loanId));
    try {
      const res = await fetch(`${BASE}/${loanId}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("File restored to on-prem server");
        await fetchAgreements();
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Failed to sync file");
    } finally {
      setSyncingLoanIds((prev) => {
        const next = new Set(prev);
        next.delete(loanId);
        return next;
      });
    }
  };

  const handleSyncBatch = async () => {
    if (missingLoanIds.length === 0) return;
    setBatchSyncing(true);
    try {
      const res = await fetch(`${BASE}/sync-batch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanIds: missingLoanIds }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `Restored ${data.succeeded} of ${data.total} file${data.total === 1 ? "" : "s"}`,
        );
        if (data.failed > 0) {
          toast.error(`${data.failed} file${data.failed === 1 ? "" : "s"} failed to restore`);
        }
        await fetchAgreements();
      } else {
        toast.error(data.error || "Batch sync failed");
      }
    } catch {
      toast.error("Failed to sync files");
    } finally {
      setBatchSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            Agreements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed loan agreements and on-prem server file status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAgreements}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Server Status */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">On-prem signing server</p>
                <p className="text-xs text-muted-foreground">
                  Signing gateway and document storage
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {loading && agreements.length === 0 ? (
                <Skeleton className="h-6 w-24 rounded-full" />
              ) : loading ? (
                <Badge variant="secondary">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Checking…
                </Badge>
              ) : gatewayOnline ? (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Online
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Offline
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agreements Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Signed agreements</CardTitle>
              <CardDescription>
                {loading && agreements.length === 0 ? (
                  <Skeleton className="h-4 w-48 mt-0.5" />
                ) : (
                  <>
                    {agreements.length} agreement{agreements.length !== 1 ? "s" : ""} total
                    {missingCount > 0 && (
                      <span className="text-amber-500 ml-2">
                        · {missingCount} missing from on-prem server
                      </span>
                    )}
                  </>
                )}
              </CardDescription>
            </div>
            {missingLoanIds.length > 0 && gatewayOnline && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSyncBatch}
                      disabled={batchSyncing}
                    >
                      {batchSyncing ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-1" />
                      )}
                      Restore all ({missingLoanIds.length})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Restore {missingLoanIds.length} missing file
                      {missingLoanIds.length !== 1 ? "s" : ""} to the on-prem server
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all" as const, label: "All" },
                { value: "online" as const, label: "Online origination" },
                { value: "physical" as const, label: "Physical" },
                { value: "missing" as const, label: "Missing from server" },
              ] as const
            ).map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                variant={statusFilter === value ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                {label}
                {value === "missing" && missingCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 h-5 min-w-5 px-1.5 text-xs"
                  >
                    {missingCount}
                  </Badge>
                )}
              </Button>
            ))}
          </div>

          {loading && agreements.length === 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-[140px] rounded-md" />
                ))}
              </div>
              <TableSkeleton
                headers={[
                  "Borrower",
                  "File",
                  "Version",
                  "Signed",
                  "Status",
                  "On-prem",
                  "Backup",
                  "Actions",
                ]}
                columns={[
                  { width: "w-36", subLine: true },
                  { width: "w-32", subLine: true },
                  { width: "w-10" },
                  { width: "w-24" },
                  { badge: true, width: "w-16" },
                  { circle: true },
                  { circle: true },
                  { width: "w-20" },
                ]}
              />
            </div>
          ) : filteredAgreements.length === 0 ? (
            <div className="text-center py-8">
              <HardDrive className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {statusFilter === "missing"
                  ? "No missing files — all on-prem copies are intact."
                  : "No agreements found."}
              </p>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>On-prem</TableHead>
                  <TableHead>Backup</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAgreements.map((a) => {
                  const isOnline = a.loanChannel === "ONLINE";
                  const isSyncing = syncingLoanIds.has(a.loanId);

                  return (
                    <TableRow key={a.loanId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{a.borrowerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.borrowerIc}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm truncate max-w-[200px]">
                            {a.filename || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(a.fileSize)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">v{a.version}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {a.uploadedAt ? formatDate(a.uploadedAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isOnline ? "default" : "secondary"}
                          className="w-fit"
                        >
                          {isOnline ? "Digital" : "Physical"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!isOnline ? (
                          <span className="text-xs text-muted-foreground">
                            N/A
                          </span>
                        ) : a.onPremAvailable === null ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <CloudOff className="h-4 w-4 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Server offline — unable to check</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : a.onPremAvailable ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Available on on-prem server</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Missing from on-prem server</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell>
                        {a.hasBackup ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Backup copy available</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Link
                          href={`/dashboard/loans/${a.loanId}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        {isOnline &&
                          a.onPremAvailable === false &&
                          a.hasBackup &&
                          gatewayOnline && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSyncSingle(a.loanId)}
                              disabled={isSyncing}
                            >
                              {isSyncing ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3 mr-1" />
                              )}
                              Restore
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalFiltered}
              pageSize={pageSize}
              itemLabel="agreements"
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
