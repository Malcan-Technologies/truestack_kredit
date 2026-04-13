"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getYear,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatSnakeEnumTitle } from "@/lib/loan-status-label";

type QueueLoan = {
  id: string;
  attestationStatus: string;
  attestationMeetingRequestedAt: string | null;
  attestationProposalDeadlineAt: string | null;
  attestationProposalStartAt: string | null;
  attestationProposalEndAt: string | null;
  attestationMeetingStartAt: string | null;
  attestationMeetingEndAt: string | null;
  borrower: { id: string; name: string; email: string | null; phone: string | null };
  product: { name: string };
};

type ViewMode = "month" | "week" | "day" | "year";

type CalendarItem = {
  loanId: string;
  title: string;
  subtitle: string;
  start: Date;
  end: Date;
  status: string;
};

function loanToItems(loan: QueueLoan): CalendarItem[] {
  const out: CalendarItem[] = [];
  const base = `${loan.borrower.name} · ${loan.product.name}`;
  if (loan.attestationMeetingStartAt) {
    const start = new Date(loan.attestationMeetingStartAt);
    const end = loan.attestationMeetingEndAt ? new Date(loan.attestationMeetingEndAt) : addDays(start, 1);
    out.push({
      loanId: loan.id,
      title: base,
      subtitle: "Meeting scheduled",
      start,
      end,
      status: loan.attestationStatus,
    });
  } else if (loan.attestationProposalStartAt) {
    const start = new Date(loan.attestationProposalStartAt);
    const end = loan.attestationProposalEndAt ? new Date(loan.attestationProposalEndAt) : addDays(start, 1);
    out.push({
      loanId: loan.id,
      title: base,
      subtitle: "Borrower slot proposed",
      start,
      end,
      status: loan.attestationStatus,
    });
  } else if (loan.attestationMeetingRequestedAt) {
    const start = new Date(loan.attestationMeetingRequestedAt);
    out.push({
      loanId: loan.id,
      title: base,
      subtitle: "Meeting requested",
      start,
      end: addDays(start, 1),
      status: loan.attestationStatus,
    });
  }
  return out;
}

function itemsForDay(items: CalendarItem[], day: Date): CalendarItem[] {
  const d0 = startOfDay(day);
  return items.filter((ev) => ev.start < addDays(d0, 1) && ev.end > d0);
}

function AttestationStatusBadge({
  status,
  className,
  variant,
}: {
  status: string;
  className?: string;
  variant?: "secondary" | "outline";
}) {
  const slotProposed = status === "SLOT_PROPOSED";
  return (
    <Badge
      variant={slotProposed ? "outline" : variant ?? "secondary"}
      className={cn(
        slotProposed &&
          "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
        className
      )}
    >
      {formatSnakeEnumTitle(status)}
    </Badge>
  );
}

export default function AttestationMeetingsQueuePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueLoan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>("month");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.get<QueueLoan[]>("/api/loans/attestation-queue");
    if (res.success && res.data) {
      setRows(res.data);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("attestation-queue-changed"));
      }
    } else {
      setError(res.error ?? "Failed to load queue");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => rows.flatMap(loanToItems), [rows]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const year = getYear(cursor);
  const monthsInYear = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)), [year]);

  const yearCounts = useMemo(() => {
    return monthsInYear.map((m) => {
      const ms = startOfMonth(m);
      const me = endOfMonth(m);
      let n = 0;
      for (const ev of items) {
        if (ev.start <= me && ev.end >= ms) n += 1;
      }
      return n;
    });
  }, [items, monthsInYear]);

  const selectedDayItems = itemsForDay(items, cursor);

  return (
    <div className="mx-auto w-full min-w-0 space-y-6 p-4 sm:p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Attestation meetings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calendar of attestation activity. Open a row for accept / counter / manual link actions.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-md border bg-background p-0.5">
          {(
            [
              ["month", "Month"],
              ["week", "Week"],
              ["day", "Day"],
              ["year", "Year"],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              type="button"
              variant={view === k ? "secondary" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setView(k)}
            >
              {label}
            </Button>
          ))}
        </div>
        {view !== "year" ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setCursor((d) =>
                  view === "month" ? subMonths(d, 1) : view === "week" ? addDays(d, -7) : addDays(d, -1)
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">
              {view === "month" && format(cursor, "MMMM yyyy")}
              {view === "week" && `Week of ${format(weekStart, "d MMM yyyy")}`}
              {view === "day" && format(cursor, "EEE d MMM yyyy")}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setCursor((d) =>
                  view === "month" ? addMonths(d, 1) : view === "week" ? addDays(d, 7) : addDays(d, 1)
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setCursor((d) => addDays(d, -365))}>
              {year - 1}
            </Button>
            <span className="text-sm font-medium px-2">{year}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setCursor((d) => addDays(d, 365))}>
              {year + 1}
            </Button>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-7 gap-px bg-border text-xs">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="bg-muted/50 px-2 py-2 font-medium text-center">
                  {d}
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-background min-h-[100px] p-1.5 text-left align-top"
                >
                  <Skeleton className="mb-2 h-3 w-4" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-full rounded-sm" />
                    <Skeleton className="h-4 w-3/4 rounded-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="h-4 w-36 mb-3" />
            <div className="rounded-md border divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-3">
                  <div className="space-y-2 flex-1 min-w-0">
                    <Skeleton className="h-4 w-40 max-w-[60%]" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : view === "month" ? (
        <div className="rounded-md border overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-border text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-muted/50 px-2 py-2 font-medium text-center">
                {d}
              </div>
            ))}
            {monthDays.map((day) => {
              const dayItems = itemsForDay(items, day);
              const inMonth = isSameMonth(day, cursor);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setCursor(day);
                    setView("day");
                  }}
                  className={cn(
                    "bg-background min-h-[100px] p-1.5 text-left align-top transition-colors hover:bg-muted/40",
                    !inMonth && "opacity-40"
                  )}
                >
                  <div className="text-[11px] font-medium mb-1">{format(day, "d")}</div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((ev) => (
                      <div
                        key={`${ev.loanId}-${ev.start.toISOString()}`}
                        className="truncate rounded px-1 py-0.5 text-[10px] bg-primary/10 text-primary border border-primary/20"
                        title={ev.title}
                      >
                        {ev.subtitle}
                      </div>
                    ))}
                    {dayItems.length > 3 ? (
                      <div className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : view === "week" ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayItems = itemsForDay(items, day);
            return (
              <div key={day.toISOString()} className="rounded-md border p-2 min-h-[200px]">
                <p className="text-xs font-semibold mb-2">{format(day, "EEE d")}</p>
                <div className="space-y-2">
                  {dayItems.map((ev) => (
                    <Link
                      key={`${ev.loanId}-${ev.start.toISOString()}`}
                      href={`/dashboard/truekredit-pro/attestation-meetings/${ev.loanId}`}
                      className="block rounded border bg-card p-2 text-[11px] hover:bg-muted/50"
                    >
                      <div className="font-medium line-clamp-2">{ev.title}</div>
                      <AttestationStatusBadge status={ev.status} variant="secondary" className="mt-1 text-[9px]" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "day" ? (
        <div className="rounded-md border divide-y">
          {selectedDayItems.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No attestation events on this day.</p>
          ) : (
            selectedDayItems.map((ev) => (
              <Link
                key={`${ev.loanId}-${ev.start.toISOString()}`}
                href={`/dashboard/truekredit-pro/attestation-meetings/${ev.loanId}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40"
              >
                <div>
                  <p className="font-medium text-sm">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(ev.start, "HH:mm")} — {format(ev.end, "HH:mm")} · {ev.subtitle}
                  </p>
                </div>
                <AttestationStatusBadge status={ev.status} variant="outline" />
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {monthsInYear.map((m, idx) => (
            <button
              key={m.toISOString()}
              type="button"
              onClick={() => {
                setCursor(m);
                setView("month");
              }}
              className="rounded-lg border p-4 text-left hover:bg-muted/40 transition-colors"
            >
              <p className="text-sm font-semibold">{format(m, "MMMM")}</p>
              <p className="text-2xl font-bold mt-1">{yearCounts[idx]}</p>
              <p className="text-xs text-muted-foreground">events</p>
            </button>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">All queue items</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attestation meeting activity in the queue.</p>
        ) : (
          <div className="rounded-md border divide-y max-h-[360px] overflow-y-auto">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/truekredit-pro/attestation-meetings/${r.id}`}
                className="flex items-center justify-between gap-4 p-3 text-sm hover:bg-muted/40"
              >
                <div>
                  <div className="font-medium">{r.borrower.name}</div>
                  <div className="text-xs text-muted-foreground">{r.product.name}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AttestationStatusBadge status={r.attestationStatus} variant="secondary" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
