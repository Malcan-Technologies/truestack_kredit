"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { listBorrowerMeetings } from "@borrower_pro/lib/borrower-loans-client";
import type { BorrowerMeetingSummary } from "@kredit/borrower";
import { MeetingSummaryCard, formatRelativeMeetingLabel } from "./meeting-summary-card";
import { cn } from "@borrower_pro/lib/utils";

type TabId = "action" | "upcoming" | "past";

export function UpcomingMeetingsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BorrowerMeetingSummary[]>([]);
  const [tab, setTab] = useState<TabId>("action");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const r = await listBorrowerMeetings({ includePast: true });
      if (r.success) {
        setRows(r.data);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load meetings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load();
        setNow(new Date());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setNow(new Date());
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const { action, upcoming, past } = useMemo(() => {
    const actionList: BorrowerMeetingSummary[] = [];
    const upcomingList: BorrowerMeetingSummary[] = [];
    const pastList: BorrowerMeetingSummary[] = [];
    for (const r of rows) {
      if (r.actionNeeded || r.uiTab === "action") {
        actionList.push(r);
        continue;
      }
      if (r.uiTab === "past" || (r.attestationStatus === "COMPLETED" && r.meetingStartAt)) {
        pastList.push(r);
        continue;
      }
      if (r.attestationStatus === "COMPLETED" && !r.meetingStartAt) {
        continue;
      }
      upcomingList.push(r);
    }
    return { action: actionList, upcoming: upcomingList, past: pastList };
  }, [rows]);

  const display =
    tab === "action" ? action : tab === "upcoming" ? upcoming : past;

  return (
    <div className="w-full min-w-0 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-7 w-7 text-primary" />
          Meetings
        </h1>
        <p className="text-muted-foreground mt-1">
          Attestation meetings and scheduling across your loans — no need to refresh the loan page. Times are shown in
          Malaysia time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        {(
          [
            { id: "action" as const, label: "Action needed", count: action.length },
            { id: "upcoming" as const, label: "Upcoming", count: upcoming.length },
            { id: "past" as const, label: "Past", count: past.length },
          ] as const
        ).map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? "default" : "ghost"}
            className={cn(tab === t.id && "shadow-sm")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 ? (
              <span className="ml-1.5 rounded-full bg-background/20 px-1.5 text-xs">{t.count > 99 ? "99+" : t.count}</span>
            ) : null}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : display.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {tab === "action"
            ? "Nothing needs your attention right now."
            : tab === "upcoming"
            ? "No upcoming meeting slots. When you request or schedule a meeting, it will appear here."
            : "No past meetings in this list yet."}
          <div className="mt-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/loans">Back to loans</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {display.map((row) => {
            const primary = row.meetingStartAt ?? row.proposalStartAt;
            const rel = primary ? formatRelativeMeetingLabel(primary, now) : "";
            return (
              <li key={row.loanId}>
                <MeetingSummaryCard row={row} onChanged={() => void load()} relativeLabel={rel} />
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground text-center">
        This list refreshes every 30 seconds while you are on this page. For full attestation steps, open the loan.
      </p>
    </div>
  );
}
