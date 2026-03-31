"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { cn } from "../../lib/utils";
import {
  getBorrowerLoan,
  getAttestationAvailability,
  postAttestationProposeSlot,
} from "../../lib/borrower-loans-client";
import type { BorrowerLoanDetail } from "../../lib/borrower-loan-types";
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
  const weekday = d.toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TZ,
    weekday: "long",
  });
  const dateStr = d.toLocaleDateString("en-MY", {
    timeZone: MALAYSIA_TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  return `${weekday}, ${dateStr}`;
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
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

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
    return map;
  }, [slots]);

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
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Available slots</Label>
              <div className="max-h-[min(75vh,42rem)] overflow-y-auto rounded-md border border-border/60 bg-muted/20 pr-1">
                <div className="space-y-6 p-3 sm:p-4">
                  {[...slotsByDate.entries()].map(([dateKey, daySlots]) => (
                    <section key={dateKey} className="space-y-2">
                      <h3 className="sticky top-0 z-[1] -mx-3 px-3 py-2 text-sm font-semibold tracking-tight text-foreground sm:-mx-4 sm:px-4 bg-muted/20 border-b border-border">
                        {formatDateGroupHeading(dateKey)}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {daySlots.map((s) => (
                          <label
                            key={s.startAt}
                            className={cn(
                              "flex items-center gap-2 rounded-md border p-2.5 text-sm cursor-pointer min-w-0",
                              selectedSlotStart === s.startAt
                                ? "border-primary bg-primary/5"
                                : "border-border bg-background/80"
                            )}
                          >
                            <input
                              type="radio"
                              name="slot"
                              className="shrink-0"
                              checked={selectedSlotStart === s.startAt}
                              onChange={() => setSelectedSlotStart(s.startAt)}
                            />
                            <span className="tabular-nums">{formatSlotTimeRange(s.startAt, s.endAt)}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
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
