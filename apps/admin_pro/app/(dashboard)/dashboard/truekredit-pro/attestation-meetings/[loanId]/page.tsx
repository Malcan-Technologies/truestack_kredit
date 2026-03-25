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
import { Textarea } from "@/components/ui/textarea";

type LoanDetail = {
  id: string;
  loanChannel?: "ONLINE" | "PHYSICAL";
  attestationStatus: string;
  attestationMeetingRequestedAt: string | null;
  attestationProposalStartAt: string | null;
  attestationProposalEndAt: string | null;
  attestationProposalDeadlineAt: string | null;
  attestationProposalSource: string | null;
  attestationMeetingStartAt: string | null;
  attestationMeetingEndAt: string | null;
  attestationMeetingLink: string | null;
  attestationMeetingNotes: string | null;
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
  const [counterMode, setCounterMode] = useState<"google" | "manual">("google");
  const [counterManualUrl, setCounterManualUrl] = useState("");
  const [counterManualNotes, setCounterManualNotes] = useState("");
  const [acceptManualUrl, setAcceptManualUrl] = useState("");
  const [acceptManualNotes, setAcceptManualNotes] = useState("");

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

  const onAcceptGoogle = async () => {
    if (!loanId) return;
    setBusy(true);
    try {
      const res = await api.post<{ loan: unknown; meetLink: string }>(
        `/api/loans/${loanId}/attestation/accept-proposal`,
        { mode: "google" }
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

  const onAcceptManual = async () => {
    if (!loanId) return;
    const url = acceptManualUrl.trim();
    if (!url) {
      toast.error("Enter a meeting URL.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/api/loans/${loanId}/attestation/accept-proposal`, {
        mode: "manual",
        manualMeetingUrl: url,
        manualMeetingNotes: acceptManualNotes.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Meeting confirmed. Borrower notified.");
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
      toast.success("Proposal rejected. Loan has been cancelled.");
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
    if (counterMode === "manual") {
      const u = counterManualUrl.trim();
      if (!u) {
        toast.error("Enter a meeting URL for manual scheduling.");
        return;
      }
    }
    setBusy(true);
    try {
      const body: Record<string, string> = {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        mode: counterMode,
      };
      if (counterMode === "manual") {
        body.manualMeetingUrl = counterManualUrl.trim();
        if (counterManualNotes.trim()) body.manualMeetingNotes = counterManualNotes.trim();
      }
      const res = await api.post(`/api/loans/${loanId}/attestation/counter-proposal`, body);
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Meeting scheduled and sent to borrower.");
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

  const maxProposals = 1;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/truekredit-pro/attestation-meetings">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to calendar
        </Link>
      </Button>

      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Attestation — {loan.product.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loan.borrower.name} · {loan.borrower.email ?? "—"}
        </p>
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          <Badge>{loan.attestationStatus}</Badge>
          <Badge variant="outline">{loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}</Badge>
        </div>
      </div>

      <Card className="text-left">
        <CardHeader>
          <CardTitle className="text-base">Current proposal</CardTitle>
          <CardDescription>
            Borrower proposals used: {loan.attestationBorrowerProposalCount} / {maxProposals}
          </CardDescription>
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
                Open meeting link
              </a>
            </Button>
          )}
          {loan.attestationMeetingNotes ? (
            <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">{loan.attestationMeetingNotes}</p>
          ) : null}
        </CardContent>
      </Card>

      {loan.attestationStatus === "SLOT_PROPOSED" && (
        <>
          <Card className="text-left">
            <CardHeader>
              <CardTitle className="text-base">Accept — Google Meet</CardTitle>
              <CardDescription>Creates a Google Calendar event and Meet link for the borrower.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void onAcceptGoogle()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Accept &amp; create Google Meet
              </Button>
            </CardContent>
          </Card>

          <Card className="text-left">
            <CardHeader>
              <CardTitle className="text-base">Accept — manual link</CardTitle>
              <CardDescription>Paste a URL (Zoom, Teams, etc.) and optional notes. The borrower is notified immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <div className="space-y-1">
                <Label htmlFor="manual-url">Meeting URL</Label>
                <Input
                  id="manual-url"
                  value={acceptManualUrl}
                  onChange={(e) => setAcceptManualUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-notes">Notes (optional)</Label>
                <Textarea
                  id="manual-notes"
                  value={acceptManualNotes}
                  onChange={(e) => setAcceptManualNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <Button variant="secondary" onClick={() => void onAcceptManual()} disabled={busy}>
                Send manual link to borrower
              </Button>
            </CardContent>
          </Card>

          <Card className="text-left">
            <CardHeader>
              <CardTitle className="text-base">Reject proposal</CardTitle>
              <CardDescription>
                Rejecting cancels this loan. The borrower is notified that the proposal was not accepted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => void onReject()} disabled={busy}>
                Reject proposal &amp; cancel loan
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {loan.attestationStatus === "SLOT_PROPOSED" && (
        <Card className="text-left">
          <CardHeader>
            <CardTitle className="text-base">Counter-propose</CardTitle>
            <CardDescription>
              Suggest a different time. A meeting link is created immediately (Google or manual).
            </CardDescription>
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
            <div className="space-y-2">
              <Label>Link mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={counterMode === "google" ? "default" : "outline"}
                  onClick={() => setCounterMode("google")}
                >
                  Google Meet
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={counterMode === "manual" ? "default" : "outline"}
                  onClick={() => setCounterMode("manual")}
                >
                  Manual URL
                </Button>
              </div>
            </div>
            {counterMode === "manual" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="co-url">Meeting URL</Label>
                  <Input
                    id="co-url"
                    value={counterManualUrl}
                    onChange={(e) => setCounterManualUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="co-notes">Notes (optional)</Label>
                  <Textarea
                    id="co-notes"
                    value={counterManualNotes}
                    onChange={(e) => setCounterManualNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </>
            ) : null}
            <Button variant="secondary" onClick={() => void onCounter()} disabled={busy}>
              Schedule counter &amp; notify borrower
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
