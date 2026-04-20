"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Loader2, RotateCcw, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import {
  getBorrowerLoan,
  getAttestationAvailability,
  postAttestationProposeSlot,
  postAttestationRestart,
} from "../../lib/borrower-loans-client";
import type { BorrowerLoanDetail } from "@kredit/borrower";
import { toAmountNumber } from "../../lib/application-form-validation";

const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** YYYY-MM-DD in Malaysia for grouping slots */
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

/**
 * Dedicated page for choosing an attestation slot (reused by Demo_Client route).
 */
export function AttestationScheduleMeetingPanel() {
  const params = useParams();
  const router = useRouter();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [slots, setSlots] = useState<Array<{ startAt: string; endAt: string }>>([]);
  const [slotsSource, setSlotsSource] = useState<string>("");
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const refreshLoan = useCallback(async () => {
    if (!loanId) return;
    const r = await getBorrowerLoan(loanId);
    if (r.success) setLoan(r.data);
  }, [loanId]);

  const loadSlots = useCallback(async () => {
    if (!loanId) return;
    setSlotsLoading(true);
    try {
      const r = await getAttestationAvailability(loanId);
      if (r.success) {
        setSlots(r.data.slots);
        setSlotsSource(r.data.source);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load availability");
    } finally {
      setSlotsLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    if (!loanId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await getBorrowerLoan(loanId);
        if (!cancelled && r.success) {
          setLoan(r.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    if (!loanId || !loan) return;
    if (loan.attestationStatus === "MEETING_REQUESTED") {
      void loadSlots();
    }
  }, [loanId, loan?.attestationStatus, loan, loadSlots]);

  const slotsByDate = useMemo(() => {
    const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const map = new Map<string, Array<{ startAt: string; endAt: string }>>();
    for (const s of sorted) {
      const key = malaysiaDateKey(s.startAt);
      const existing = map.get(key);
      if (existing) existing.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()];
  }, [slots]);

  useEffect(() => {
    if (slotsByDate.length === 0) {
      if (selectedDateKey !== null) setSelectedDateKey(null);
      return;
    }
    const availableKeys = slotsByDate.map(([key]) => key);
    if (!selectedDateKey || !availableKeys.includes(selectedDateKey)) {
      const preferred = selectedSlotStart ? malaysiaDateKey(selectedSlotStart) : availableKeys[0];
      setSelectedDateKey(availableKeys.includes(preferred) ? preferred : availableKeys[0]);
    }
  }, [slotsByDate, selectedDateKey, selectedSlotStart]);

  const visibleSlots = useMemo(() => {
    if (!selectedDateKey) return [];
    const entry = slotsByDate.find(([key]) => key === selectedDateKey);
    return entry ? entry[1] : [];
  }, [slotsByDate, selectedDateKey]);

  const onPropose = async () => {
    if (!loanId || !selectedSlotStart) {
      toast.error("Choose an available time slot.");
      return;
    }
    setBusy(true);
    try {
      const res = await postAttestationProposeSlot(loanId, { startAt: selectedSlotStart });
      if (!res.success) {
        toast.error("Could not propose slot");
        return;
      }
      toast.success("Slot proposed. Your lender will confirm or suggest another time.");
      await refreshLoan();
      router.push(`/loans/${loanId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onRestartAttestation = async () => {
    if (!loanId) return;
    setResetBusy(true);
    try {
      await postAttestationRestart(loanId);
      toast.success("Attestation restarted — choose video or meeting again.");
      router.push(`/loans/${loanId}?focus=attestation`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restart attestation");
    } finally {
      setResetBusy(false);
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
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/loans">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Loan not found.</p>
      </div>
    );
  }

  if (loan.status === "CANCELLED") {
    return (
      <div className="space-y-4 max-w-2xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">
          This loan was cancelled
          {loan.attestationCancellationReason ? ` (${loan.attestationCancellationReason})` : ""}.
        </p>
      </div>
    );
  }

  if (loan.attestationStatus !== "MEETING_REQUESTED") {
    return (
      <div className="space-y-4 max-w-2xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loan
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Scheduling is not available at this step (current: {loan.attestationStatus ?? "—"}). Return to
          your loan page to continue attestation.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 pb-12">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/loans/${loanId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to loan
        </Link>
      </Button>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-heading font-bold text-foreground">Schedule attestation meeting</h1>
        <p className="text-muted text-base mt-1">
          {loan.product?.name ?? "Loan"} · {formatRm(loan.principalAmount)} · {loan.term} months
        </p>
      </div>

      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-5 w-5" />
            Prefer instant attestation?
          </CardTitle>
          <CardDescription className="text-pretty">
            <span className="font-medium text-foreground">Video attestation</span> is immediate — watch the
            required video when you are ready. <span className="font-medium text-foreground">Scheduling a meeting</span>{" "}
            usually takes <span className="font-medium text-foreground">2–3 business days</span> while your lender
            confirms a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto gap-2"
            onClick={() => void onRestartAttestation()}
            disabled={resetBusy || busy}
          >
            {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Switch to video attestation
          </Button>
          {/* <p className="text-xs text-muted-foreground mt-3 max-w-xl">
            This resets your attestation to the beginning (including any video progress) and returns you to the
            loan page to choose again.
          </p> */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Choose a time
          </CardTitle>
          <CardDescription>
            Availability: {slotsSource === "google_free_busy" ? "Google Calendar" : "office hours"}. Each
            booking is 60 minutes (Malaysia time). You can propose one slot at a time; if your lender does
            not confirm before that time, you will be asked to choose again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {slotsLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : slots.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-200">No open slots right now. Try again later.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {slotsByDate.map(([dateKey, daySlots]) => {
                  const active = selectedDateKey === dateKey;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={busy}
                      onClick={() => setSelectedDateKey(dateKey)}
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
                      <span className={cn("text-sm font-semibold tabular-nums", active ? "text-primary" : "text-foreground")}>
                        {formatDateShort(dateKey)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {daySlots.length} slot{daySlots.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedDateKey ? (
                <>
                  <p className="text-sm text-muted-foreground">{formatDateGroupHeading(selectedDateKey)}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {visibleSlots.map((s) => {
                      const selected = selectedSlotStart === s.startAt;
                      return (
                        <button
                          key={s.startAt}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={busy}
                          onClick={() => setSelectedSlotStart(s.startAt)}
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
          <Button type="button" onClick={() => void onPropose()} disabled={busy || !selectedSlotStart}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Propose this slot
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
