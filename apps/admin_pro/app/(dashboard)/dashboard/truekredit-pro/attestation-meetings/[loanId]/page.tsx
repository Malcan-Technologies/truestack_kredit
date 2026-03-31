"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCcw,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatLoanStatusLabelForDisplay, formatSnakeEnumTitle } from "@/lib/loan-status-label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type LoanDetail = {
  id: string;
  status: string;
  attestationCompletedAt: string | null;
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

  const [acceptMode, setAcceptMode] = useState<"google" | "manual">("google");
  const [acceptManualUrl, setAcceptManualUrl] = useState("");
  const [acceptManualNotes, setAcceptManualNotes] = useState("");

  const [counterStart, setCounterStart] = useState("");
  const [counterEnd, setCounterEnd] = useState("");
  const [counterMode, setCounterMode] = useState<"google" | "manual">("google");
  const [counterManualUrl, setCounterManualUrl] = useState("");
  const [counterManualNotes, setCounterManualNotes] = useState("");

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

  const dispatchAttestationQueueChanged = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("attestation-queue-changed"));
    }
  };

  const onAccept = async () => {
    if (!loanId) return;
    if (acceptMode === "manual") {
      const url = acceptManualUrl.trim();
      if (!url) {
        toast.error("Enter a meeting URL.");
        return;
      }
    }
    setBusy(true);
    try {
      const body: Record<string, string | undefined> = { mode: acceptMode };
      if (acceptMode === "manual") {
        body.manualMeetingUrl = acceptManualUrl.trim();
        body.manualMeetingNotes = acceptManualNotes.trim() || undefined;
      }
      const res = await api.post<{ loan: unknown; meetLink: string }>(
        `/api/loans/${loanId}/attestation/accept-proposal`,
        body
      );
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success(
        acceptMode === "google"
          ? "Meeting confirmed. Meet link created."
          : "Meeting confirmed. Borrower notified."
      );
      dispatchLoansChanged();
      dispatchAttestationQueueChanged();
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
      dispatchAttestationQueueChanged();
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
  const isSlotProposed = loan.attestationStatus === "SLOT_PROPOSED";
  const hasMeetingLink = !!loan.attestationMeetingLink;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/truekredit-pro/attestation-meetings">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to calendar
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{loan.borrower.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loan.product.name} · {loan.borrower.email ?? "No email"}{" "}
              {loan.borrower.phone ? `· ${loan.borrower.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">{formatLoanStatusLabelForDisplay(loan)}</Badge>
            <Badge
              variant="outline"
              className={cn(
                loan.attestationStatus === "SLOT_PROPOSED" &&
                  "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
              )}
            >
              {formatSnakeEnumTitle(loan.attestationStatus)}
            </Badge>
            <Badge variant="outline">
              {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/loans/${loan.id}`}>
            View full loan
            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>

      {/* Proposal summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Proposed slot
          </CardTitle>
          <CardDescription>
            Borrower proposals used: {loan.attestationBorrowerProposalCount} / {maxProposals}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loan.attestationProposalStartAt && (
            <div className="flex flex-col gap-1 rounded-md border bg-muted/5 p-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">
                  {new Date(loan.attestationProposalStartAt).toLocaleString()}
                  {loan.attestationProposalEndAt &&
                    ` — ${new Date(loan.attestationProposalEndAt).toLocaleString()}`}
                </span>
                {loan.attestationProposalSource && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {loan.attestationProposalSource}
                  </span>
                )}
              </div>
              {loan.attestationProposalDeadlineAt && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Confirm before slot starts:{" "}
                  {new Date(loan.attestationProposalDeadlineAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {hasMeetingLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={loan.attestationMeetingLink!} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open meeting link
              </a>
            </Button>
          )}

          {loan.attestationMeetingNotes && (
            <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
              {loan.attestationMeetingNotes}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action area */}
      {isSlotProposed && (
        <Tabs defaultValue="accept" className="w-full">
          <TabsList className="w-full h-11 p-1.5">
            <TabsTrigger value="accept" className="flex-1 gap-1.5 py-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Accept
            </TabsTrigger>
            <TabsTrigger value="counter" className="flex-1 gap-1.5 py-1.5">
              <RefreshCcw className="h-4 w-4" />
              Counter Propose
            </TabsTrigger>
          </TabsList>

          {/* Accept tab */}
          <TabsContent value="accept">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Accept borrower&apos;s slot</CardTitle>
                <CardDescription>
                  Confirm the proposed time and choose how to generate the meeting link.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Link mode selector */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAcceptMode("google")}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                      acceptMode === "google"
                        ? "border-foreground bg-foreground/5 font-medium"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <Video className="h-5 w-5" />
                    Google Meet
                    <span className="text-xs text-muted-foreground font-normal">
                      Auto-create event &amp; link
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcceptMode("manual")}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                      acceptMode === "manual"
                        ? "border-foreground bg-foreground/5 font-medium"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <Link2 className="h-5 w-5" />
                    Manual link
                    <span className="text-xs text-muted-foreground font-normal">
                      Zoom, Teams, or custom URL
                    </span>
                  </button>
                </div>

                {acceptMode === "manual" && (
                  <div className="space-y-3 max-w-lg">
                    <div className="space-y-1">
                      <Label htmlFor="accept-url">Meeting URL</Label>
                      <Input
                        id="accept-url"
                        value={acceptManualUrl}
                        onChange={(e) => setAcceptManualUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="accept-notes">Notes (optional)</Label>
                      <Textarea
                        id="accept-notes"
                        value={acceptManualNotes}
                        onChange={(e) => setAcceptManualNotes(e.target.value)}
                        rows={2}
                        placeholder="Any instructions for the borrower..."
                      />
                    </div>
                  </div>
                )}

                <Button onClick={() => void onAccept()} disabled={busy} className="w-full sm:w-auto">
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {acceptMode === "google"
                    ? "Accept & create Google Meet"
                    : "Accept & send link to borrower"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Counter propose tab */}
          <TabsContent value="counter">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Suggest a different time</CardTitle>
                <CardDescription>
                  The meeting link is created immediately and the borrower is notified.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
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
                </div>

                {/* Link mode selector */}
                <div className="grid grid-cols-2 gap-3 max-w-lg">
                  <button
                    type="button"
                    onClick={() => setCounterMode("google")}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                      counterMode === "google"
                        ? "border-foreground bg-foreground/5 font-medium"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <Video className="h-5 w-5" />
                    Google Meet
                  </button>
                  <button
                    type="button"
                    onClick={() => setCounterMode("manual")}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                      counterMode === "manual"
                        ? "border-foreground bg-foreground/5 font-medium"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <Link2 className="h-5 w-5" />
                    Manual link
                  </button>
                </div>

                {counterMode === "manual" && (
                  <div className="space-y-3 max-w-lg">
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
                  </div>
                )}

                <Button
                  variant="secondary"
                  onClick={() => void onCounter()}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Schedule & notify borrower
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

    </div>
  );
}
