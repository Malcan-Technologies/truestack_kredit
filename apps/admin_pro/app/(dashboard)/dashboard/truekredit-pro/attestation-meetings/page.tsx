"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
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

type QueueLoan = {
  id: string;
  attestationStatus: string;
  attestationMeetingRequestedAt: string | null;
  attestationProposalDeadlineAt: string | null;
  borrower: { id: string; name: string; email: string | null; phone: string | null };
  product: { name: string };
};

export default function AttestationMeetingsQueuePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueLoan[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.get<QueueLoan[]>("/api/loans/attestation-queue");
    if (res.success && res.data) {
      setRows(res.data);
    } else {
      setError(res.error ?? "Failed to load queue");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attestation meetings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review borrower-proposed slots, accept to create Meet, or counter-propose. Sorted by meeting
          requested time.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attestation meeting activity in the queue.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Borrower</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.borrower.name}</div>
                    <div className="text-xs text-muted-foreground">{r.borrower.email ?? "—"}</div>
                  </TableCell>
                  <TableCell>{r.product.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.attestationStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.attestationMeetingRequestedAt
                      ? new Date(r.attestationMeetingRequestedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.attestationProposalDeadlineAt
                      ? new Date(r.attestationProposalDeadlineAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/truekredit-pro/attestation-meetings/${r.id}`}>
                        Open
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
