"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type EarlySettlementItem = {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  borrowerNote?: string | null;
  reference?: string | null;
  snapshotTotalSettlement: unknown;
  loan: { id: string; status: string };
  borrower: {
    id: string;
    name: string;
    icNumber: string;
    companyName?: string | null;
    borrowerType: string;
  };
  paymentTransaction?: {
    id: string;
    receiptNumber: string | null;
    totalAmount: unknown;
    paymentDate: string;
  } | null;
};

const PAGE_SIZE = 20;

function notifyEarlySettlementRequestsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("early-settlement-requests-changed"));
  }
}

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

function EarlySettlementTableSkeleton() {
  return (
    <div
      className="overflow-x-auto rounded-md border border-border"
      role="status"
      aria-label="Loading early settlement requests"
    >
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1.2fr)] gap-2 border-b border-border px-3 py-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1.2fr)] items-center gap-2 px-3 py-3"
          >
            <Skeleton className="h-4 w-28" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20 justify-self-end" />
            <Skeleton className="h-4 w-full max-w-[100px]" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-[72px]" />
              <Skeleton className="h-8 w-[68px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function emptyListMessage(filter: StatusFilter): string {
  switch (filter) {
    case "all":
      return "No early settlement requests found.";
    case "PENDING":
      return "No pending early settlement requests.";
    case "APPROVED":
      return "No approved requests.";
    case "REJECTED":
      return "No rejected requests.";
    default:
      return "No requests found.";
  }
}

export default function EarlySettlementApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EarlySettlementItem[]>([]);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [totalPages, setTotalPages] = useState(1);
  const [rejectDialog, setRejectDialog] = useState<EarlySettlementItem | null>(null);
  const [rejectReason, setRejectReason] = useState("Does not meet settlement criteria");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [detailRow, setDetailRow] = useState<EarlySettlementItem | null>(null);
  const [approveDialog, setApproveDialog] = useState<EarlySettlementItem | null>(null);
  const [waiveLateFees, setWaiveLateFees] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [approveSubmitting, setApproveSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = statusFilter === "all" ? "all" : statusFilter;
      const res = await api.get<{
        items: EarlySettlementItem[];
        pagination: { totalPages: number; page: number };
      }>(`/api/schedules/early-settlement-requests?status=${statusParam}&page=${page}&pageSize=${PAGE_SIZE}`);
      if (res.success && res.data) {
        setItems(res.data.items);
        setTotalPages(res.data.pagination?.totalPages ?? 1);
      } else {
        toast.error(res.error || "Failed to load requests");
      }
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitApprove = async () => {
    if (!approveDialog) return;
    setApproveSubmitting(true);
    try {
      const res = await api.post(`/api/schedules/early-settlement-requests/${approveDialog.id}/approve`, {
        waiveLateFees,
        adminNotes: adminNotes.trim() || undefined,
      });
      if (res.success) {
        toast.success("Early settlement completed. Loan marked as completed.");
        notifyEarlySettlementRequestsChanged();
        setApproveDialog(null);
        setWaiveLateFees(false);
        setAdminNotes("");
        await load();
      } else {
        toast.error(res.error || "Approve failed");
      }
    } catch {
      toast.error("Approve failed");
    } finally {
      setApproveSubmitting(false);
    }
  };

  const submitReject = async () => {
    if (!rejectDialog) return;
    setRejectSubmitting(true);
    try {
      const res = await api.post(`/api/schedules/early-settlement-requests/${rejectDialog.id}/reject`, {
        reason: rejectReason.trim() || "Rejected",
      });
      if (res.success) {
        toast.success("Request rejected.");
        notifyEarlySettlementRequestsChanged();
        setRejectDialog(null);
        await load();
      } else {
        toast.error(res.error || "Reject failed");
      }
    } catch {
      toast.error("Reject failed");
    } finally {
      setRejectSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Early settlement approvals</h1>
          <p className="text-muted text-sm mt-1">
            When borrowers request early settlement, review and approve here. Approving runs the same settlement logic as the
            loan workspace.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Borrower early settlement requests</CardTitle>
          <CardDescription>Pending items need your approval before the loan is completed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all" as const, label: "All" },
                { value: "PENDING" as const, label: "Pending" },
                { value: "APPROVED" as const, label: "Approved" },
                { value: "REJECTED" as const, label: "Rejected" },
              ] as const
            ).map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                variant={statusFilter === value ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setPage(1);
                  setStatusFilter(value);
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          {loading && items.length === 0 ? (
            <EarlySettlementTableSkeleton />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyListMessage(statusFilter)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Loan</TableHead>
                  <TableHead className="text-right">Snapshot</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const snap =
                    typeof row.snapshotTotalSettlement === "string"
                      ? parseFloat(row.snapshotTotalSettlement)
                      : Number(row.snapshotTotalSettlement);
                  const isPending = row.status === "PENDING";
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/25"
                      onClick={() => setDetailRow(row)}
                    >
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.borrower.name}</div>
                        <div className="text-xs text-muted-foreground">{row.borrower.icNumber}</div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/loans/${row.loan.id}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View loan
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(snap)}</TableCell>
                      <TableCell className="max-w-[160px] truncate font-mono text-sm">
                        {row.reference ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "APPROVED"
                              ? "default"
                              : row.status === "REJECTED"
                                ? "destructive"
                                : "secondary"
                          }
                          className="w-fit"
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                        {isPending ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setApproveDialog(row);
                                setWaiveLateFees(false);
                                setAdminNotes("");
                              }}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRejectDialog(row);
                                setRejectReason("Does not meet settlement criteria");
                              }}
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Early settlement request</DialogTitle>
            <DialogDescription>Snapshot from when the borrower submitted (recheck current quote on the loan if needed).</DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <div className="space-y-3 py-1 text-sm">
              <div>
                <Label>Snapshot total</Label>
                <p className="text-lg font-semibold tabular-nums">
                  {formatCurrency(
                    typeof detailRow.snapshotTotalSettlement === "string"
                      ? parseFloat(detailRow.snapshotTotalSettlement)
                      : Number(detailRow.snapshotTotalSettlement),
                  )}
                </p>
              </div>
              {detailRow.borrowerNote ? (
                <div>
                  <Label>Borrower note</Label>
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 whitespace-pre-wrap">
                    {detailRow.borrowerNote}
                  </p>
                </div>
              ) : null}
              {detailRow.reference ? (
                <div>
                  <Label>Reference</Label>
                  <p className="font-mono break-all">{detailRow.reference}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailRow(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveDialog} onOpenChange={(o) => !o && setApproveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve early settlement?</DialogTitle>
            <DialogDescription>
              This will complete the loan using the current settlement calculation (same as Early settlement on the loan
              page). Optionally waive late fees.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="waive-late"
                checked={waiveLateFees}
                onCheckedChange={(v) => setWaiveLateFees(v === true)}
              />
              <Label htmlFor="waive-late" className="text-sm font-normal cursor-pointer">
                Waive late fees
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adm-notes">Admin notes (optional)</Label>
              <Textarea
                id="adm-notes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes appended to settlement…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)} disabled={approveSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void submitApprove()} disabled={approveSubmitting}>
              {approveSubmitting ? "Processing…" : "Confirm settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject early settlement request?</DialogTitle>
            <DialogDescription>The borrower can submit again if they are still eligible.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rej-reason">Reason</Label>
            <Textarea
              id="rej-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)} disabled={rejectSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void submitReject()} disabled={rejectSubmitting}>
              {rejectSubmitting ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
