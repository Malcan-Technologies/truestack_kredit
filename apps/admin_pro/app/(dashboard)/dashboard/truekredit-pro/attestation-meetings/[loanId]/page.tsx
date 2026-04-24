"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

type AttestationSlot = { startAt: string; endAt: string };

function malaysiaDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateGroupHeading(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  return d.toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatWeekdayShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  return d.toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TZ,
    weekday: "short",
  });
}

function formatDateShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  return d.toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TZ,
    day: "numeric",
    month: "short",
  });
}

function formatSlotTimeRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: MALAYSIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  };
  return `${new Date(startIso).toLocaleTimeString("en-MY", opts)} — ${new Date(endIso).toLocaleTimeString("en-MY", opts)}`;
}

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

  const [counterSlots, setCounterSlots] = useState<AttestationSlot[]>([]);
  const [slotsSource, setSlotsSource] = useState<string>("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedCounterSlot, setSelectedCounterSlot] = useState<AttestationSlot | null>(null);
  const [selectedCounterDateKey, setSelectedCounterDateKey] = useState<string | null>(null);
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

  const loadCounterSlots = useCallback(async () => {
    if (!loanId) return;
    setSlotsLoading(true);
    try {
      const res = await api.get<{ slots: AttestationSlot[]; source: string }>(
        `/api/loans/${loanId}/attestation/availability`
      );
      if (res.success && res.data) {
        setCounterSlots(res.data.slots);
        setSlotsSource(res.data.source);
        setSelectedCounterSlot((prev) => {
          if (!prev) return null;
          const still = res.data!.slots.some((s) => s.startAt === prev.startAt && s.endAt === prev.endAt);
          return still ? prev : null;
        });
      } else {
        setCounterSlots([]);
        setSlotsSource("");
        toast.error(res.error ?? "Failed to load availability");
      }
    } finally {
      setSlotsLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    if (loan?.attestationStatus === "SLOT_PROPOSED") {
      void loadCounterSlots();
    } else {
      setCounterSlots([]);
      setSlotsSource("");
      setSelectedCounterSlot(null);
      setSelectedCounterDateKey(null);
    }
  }, [loan?.attestationStatus, loanId, loadCounterSlots]);

  const slotsByDate = useMemo(() => {
    const sorted = [...counterSlots].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const map = new Map<string, AttestationSlot[]>();
    for (const s of sorted) {
      const key = malaysiaDateKey(s.startAt);
      const existing = map.get(key);
      if (existing) existing.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()];
  }, [counterSlots]);

  useEffect(() => {
    if (slotsByDate.length === 0) {
      if (selectedCounterDateKey !== null) setSelectedCounterDateKey(null);
      return;
    }
    const availableKeys = slotsByDate.map(([key]) => key);
    if (!selectedCounterDateKey || !availableKeys.includes(selectedCounterDateKey)) {
      const preferred = selectedCounterSlot ? malaysiaDateKey(selectedCounterSlot.startAt) : availableKeys[0];
      setSelectedCounterDateKey(availableKeys.includes(preferred) ? preferred : availableKeys[0]);
    }
  }, [slotsByDate, selectedCounterDateKey, selectedCounterSlot]);

  const visibleCounterSlots = useMemo(() => {
    if (!selectedCounterDateKey) return [];
    const entry = slotsByDate.find(([key]) => key === selectedCounterDateKey);
    return entry ? entry[1] : [];
  }, [slotsByDate, selectedCounterDateKey]);

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
      dispatchAttestationQueueChanged();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onCounter = async () => {
    if (!loanId || !selectedCounterSlot) {
      toast.error("Choose an available time slot.");
      return;
    }
    const startAt = new Date(selectedCounterSlot.startAt);
    const endAt = new Date(selectedCounterSlot.endAt);
    if (endAt <= startAt) {
      toast.error("Invalid slot range.");
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

  const onCompleteMeeting = async () => {
    if (!loanId) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/loans/${loanId}/attestation/complete-meeting`, {});
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Meeting marked complete. Borrower can continue to signing.");
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

      {loan.attestationStatus === "MEETING_SCHEDULED" && !loan.attestationCompletedAt && (
        <Card className="text-left">
          <CardHeader>
            <CardTitle className="text-base">Complete attestation</CardTitle>
            <CardDescription>
              After the meeting has actually finished, mark it complete so the borrower can proceed to e-KYC and
              signing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void onCompleteMeeting()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Mark meeting complete
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action area */}
      {isSlotProposed && (
        <>
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
                  <div className="space-y-3">
                    {slotsLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : counterSlots.length === 0 ? (
                      <p className="text-sm text-amber-700 dark:text-amber-200">
                        No open slots right now. Try again later.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Availability:{" "}
                          {slotsSource === "google_free_busy" ? "Google Calendar" : "office hours"}. Each booking is
                          60 minutes (Malaysia time).
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {slotsByDate.map(([dateKey, daySlots]) => {
                            const active = selectedCounterDateKey === dateKey;
                            return (
                              <button
                                key={dateKey}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                disabled={busy}
                                onClick={() => {
                                  setSelectedCounterDateKey(dateKey);
                                  setSelectedCounterSlot(null);
                                }}
                                className={cn(
                                  "min-w-[80px] min-h-[80px] shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-3 py-2 text-center transition-colors",
                                  active
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border bg-background hover:bg-muted/40",
                                  busy && "opacity-60 pointer-events-none"
                                )}
                              >
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold uppercase tracking-wider",
                                    active ? "text-primary" : "text-muted-foreground"
                                  )}
                                >
                                  {formatWeekdayShort(dateKey)}
                                </span>
                                <span
                                  className={cn(
                                    "text-sm font-semibold tabular-nums",
                                    active ? "text-primary" : "text-foreground"
                                  )}
                                >
                                  {formatDateShort(dateKey)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {daySlots.length} slot{daySlots.length === 1 ? "" : "s"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {selectedCounterDateKey ? (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {formatDateGroupHeading(selectedCounterDateKey)}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {visibleCounterSlots.map((s) => {
                                const selected =
                                  selectedCounterSlot?.startAt === s.startAt &&
                                  selectedCounterSlot?.endAt === s.endAt;
                                return (
                                  <button
                                    key={s.startAt}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={busy}
                                    onClick={() => setSelectedCounterSlot(s)}
                                    className={cn(
                                      "min-h-11 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold tabular-nums text-center transition-colors",
                                      selected
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-border bg-background/80 hover:bg-muted/40",
                                      busy && "opacity-55"
                                    )}
                                  >
                                    {formatSlotTimeRange(s.startAt, s.endAt)}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
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
                    disabled={busy || !selectedCounterSlot}
                    className="w-full sm:w-auto"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Schedule & notify borrower
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="text-left border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base">Reject proposal</CardTitle>
              <CardDescription>
                Rejecting the proposed slot cancels the loan and notifies the borrower immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => void onReject()} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Reject proposal & cancel loan
              </Button>
            </CardContent>
          </Card>
        </>
      )}

    </div>
  );
}
