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
import { RefreshCw, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

type ManualPaymentItem = {
  id: string;
  amount: unknown;
  reference: string;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  receiptPath?: string | null;
  loan: { id: string; status: string };
  borrower: {
    id: string;
    name: string;
    icNumber: string;
    companyName?: string | null;
    borrowerType: string;
  };
};

const PAGE_SIZE = 20;

function notifyManualPaymentRequestsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("manual-payment-requests-changed"));
  }
}

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

function emptyListMessage(filter: StatusFilter): string {
  switch (filter) {
    case "all":
      return "No payment requests found.";
    case "PENDING":
      return "No pending payment requests.";
    case "APPROVED":
      return "No approved payment requests.";
    case "REJECTED":
      return "No rejected payment requests.";
    default:
      return "No payment requests found.";
  }
}

export default function PaymentApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ManualPaymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [totalPages, setTotalPages] = useState(1);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<ManualPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState("Could not verify payment");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [detailRow, setDetailRow] = useState<ManualPaymentItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = statusFilter === "all" ? "all" : statusFilter;
      const res = await api.get<{
        items: ManualPaymentItem[];
        pagination: { totalPages: number; page: number };
      }>(
        `/api/schedules/manual-payment-requests?status=${statusParam}&page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (res.success && res.data) {
        setItems(res.data.items);
        setTotalPages(res.data.pagination?.totalPages ?? 1);
      } else {
        toast.error(res.error || "Failed to load payment requests");
      }
    } catch {
      toast.error("Failed to load payment requests");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await api.post(`/api/schedules/manual-payment-requests/${id}/approve`, {});
      if (res.success) {
        toast.success("Payment approved and recorded on the loan schedule.");
        notifyManualPaymentRequestsChanged();
        await load();
      } else {
        toast.error(res.error || "Approve failed");
      }
    } catch {
      toast.error("Approve failed");
    } finally {
      setProcessingId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectDialog) return;
    setRejectSubmitting(true);
    try {
      const res = await api.post(`/api/schedules/manual-payment-requests/${rejectDialog.id}/reject`, {
        reason: rejectReason.trim() || "Could not verify payment",
      });
      if (res.success) {
        toast.success("Payment request rejected.");
        setRejectDialog(null);
        notifyManualPaymentRequestsChanged();
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
          <h1 className="text-2xl font-heading font-bold text-gradient">Borrower payment approvals</h1>
          <p className="text-muted text-sm mt-1">
            When borrowers submit manual bank transfers, approve them here to allocate payments to the loan schedule.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manual payment requests</CardTitle>
          <CardDescription>
            Borrower-submitted bank transfers appear here. Pending items need your approval; approving runs the same
            allocation rules as Record payment in the loan workspace.
          </CardDescription>
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
            <TableSkeleton
              headers={[
                "Date",
                "Borrower",
                "Loan",
                "Amount",
                "Reference",
                "Status",
                "Slip",
                "Actions",
              ]}
              columns={[
                { width: "w-28" },
                { width: "w-32", subLine: true },
                { width: "w-20" },
                { width: "w-20" },
                { width: "w-24" },
                { badge: true, width: "w-16" },
                { width: "w-16" },
                { width: "w-24" },
              ]}
            />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyListMessage(statusFilter)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Loan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Slip</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const amt =
                    typeof row.amount === "string" ? parseFloat(row.amount) : Number(row.amount);
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
                      <TableCell className="text-right font-medium">
                        {formatCurrency(amt)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate font-mono text-sm">
                        {row.reference}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
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
                            {row.status === "PENDING"
                              ? "Pending"
                              : row.status === "APPROVED"
                                ? "Approved"
                                : "Rejected"}
                          </Badge>
                          {row.status === "REJECTED" && row.rejectionReason ? (
                            <span className="text-xs text-muted-foreground max-w-[200px] line-clamp-2">
                              {row.rejectionReason}
                            </span>
                          ) : null}
                          {row.reviewedAt && row.status !== "PENDING" ? (
                            <span className="text-xs text-muted-foreground">
                              Reviewed {formatDateTime(row.reviewedAt)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.receiptPath ? (
                          <a
                            href={`/api/proxy/schedules/manual-payment-requests/${row.id}/borrower-receipt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View slip
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                        {isPending ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => void approve(row.id)}
                              disabled={processingId === row.id}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRejectDialog(row);
                                setRejectReason("Could not verify payment");
                              }}
                              disabled={processingId === row.id}
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
            <DialogTitle>Payment details</DialogTitle>
            <DialogDescription>
              Amount and bank reference for this request. Compare with your bank statement before approving.
            </DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <p className="text-lg font-semibold tabular-nums">
                  {formatCurrency(
                    typeof detailRow.amount === "string"
                      ? parseFloat(detailRow.amount)
                      : Number(detailRow.amount),
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Bank reference</Label>
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm leading-relaxed break-all">
                  {detailRow.reference}
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailRow(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment request?</DialogTitle>
            <DialogDescription>
              The borrower will need to re-submit if they still intend to pay. No amount will be posted to the loan.
            </DialogDescription>
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
