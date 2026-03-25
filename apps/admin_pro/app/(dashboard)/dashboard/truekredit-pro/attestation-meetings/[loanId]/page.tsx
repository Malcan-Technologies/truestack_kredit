"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoanDetail = {
  id: string;
  attestationStatus: string;
  attestationMeetingRequestedAt: string | null;
  attestationProposalStartAt: string | null;
  attestationProposalEndAt: string | null;
  attestationProposalDeadlineAt: string | null;
  attestationProposalSource: string | null;
  attestationMeetingStartAt: string | null;
  attestationMeetingEndAt: string | null;
  attestationMeetingLink: string | null;
  attestationBorrowerProposalCount: number;
  borrower: { name: string; email: string | null; phone: string | null };
  product: { name: string };
};

export default function AttestationMeetingDetailPage() {
  const params = useParams();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [counterStart, setCounterStart] = useState("");
  const [counterEnd, setCounterEnd] = useState("");

  const load = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    const res = await api.get<LoanDetail>(`/api/loans/${loanId}`);
    if (res.success && res.data) {
      setLoan(res.data as LoanDetail);
    } else {
      toast.error(res.error ?? "Failed to load loan");
    }
    setLoading(false);
  }, [loanId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dispatchLoansChanged = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("loans-count-changed"));
    }
  };

  const onAccept = async () => {
    if (!loanId) return;
    setBusy(true);
    try {
      const res = await api.post<{ loan: unknown; meetLink: string }>(
        `/api/loans/${loanId}/attestation/accept-proposal`,
        {}
      );
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Meeting confirmed. Meet link created.");
      dispatchLoansChanged();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!loanId) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/loans/${loanId}/attestation/reject-proposal`, {});
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Proposal released. Borrower can pick another slot.");
      dispatchLoansChanged();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onCounter = async () => {
    if (!loanId || !counterStart || !counterEnd) {
      toast.error("Enter start and end for the counter-proposal.");
      return;
    }
    const startAt = new Date(counterStart);
    const endAt = new Date(counterEnd);
    if (endAt <= startAt) {
      toast.error("End must be after start.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/api/loans/${loanId}/attestation/counter-proposal`, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Counter-proposal sent to borrower.");
      dispatchLoansChanged();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !loanId) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loan) {
    return <p className="p-6 text-sm text-muted-foreground">Loan not found.</p>;
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/truekredit-pro/attestation-meetings">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to queue
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attestation — {loan.product.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loan.borrower.name} · {loan.borrower.email ?? "—"}
        </p>
        <Badge className="mt-2">{loan.attestationStatus}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current proposal</CardTitle>
          <CardDescription>Borrower proposals: {loan.attestationBorrowerProposalCount} / 5</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loan.attestationProposalStartAt && (
            <p>
              <span className="text-muted-foreground">Slot: </span>
              {new Date(loan.attestationProposalStartAt).toLocaleString()} —{" "}
              {loan.attestationProposalEndAt
                ? new Date(loan.attestationProposalEndAt).toLocaleString()
                : ""}{" "}
              ({loan.attestationProposalSource ?? "—"})
            </p>
          )}
          {loan.attestationProposalDeadlineAt && (
            <p className="text-amber-800 dark:text-amber-200">
              Respond by: {new Date(loan.attestationProposalDeadlineAt).toLocaleString()}
            </p>
          )}
          {loan.attestationMeetingLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={loan.attestationMeetingLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Meet
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {loan.attestationStatus === "SLOT_PROPOSED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
            <CardDescription>Accept creates the Google Calendar event and Meet link.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => void onAccept()} disabled={busy}>
              Accept proposal
            </Button>
            <Button variant="outline" onClick={() => void onReject()} disabled={busy}>
              Reject / release slot
            </Button>
          </CardContent>
        </Card>
      )}

      {loan.attestationStatus === "SLOT_PROPOSED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Counter-propose</CardTitle>
            <CardDescription>Releases the borrower hold and proposes a new 60-minute window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-1">
              <Label htmlFor="c-start">Start</Label>
              <Input
                id="c-start"
                type="datetime-local"
                value={counterStart}
                onChange={(e) => setCounterStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-end">End</Label>
              <Input
                id="c-end"
                type="datetime-local"
                value={counterEnd}
                onChange={(e) => setCounterEnd(e.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={() => void onCounter()} disabled={busy}>
              Send counter-proposal
            </Button>
          </CardContent>
        </Card>
      )}

      <Button variant="link" className="px-0" asChild>
        <Link href={`/dashboard/loans/${loan.id}`}>View full loan</Link>
      </Button>
    </div>
  );
}
