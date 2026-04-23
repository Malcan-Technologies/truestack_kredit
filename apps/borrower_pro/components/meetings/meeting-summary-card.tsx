"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Calendar,
  Copy,
  ExternalLink,
  RefreshCw,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import type { BorrowerMeetingSummary } from "@kredit/borrower";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "@borrower_pro/lib/utils";
import { toAmountNumber } from "@borrower_pro/lib/application-form-validation";
import {
  postAttestationAcceptAfterMeeting,
  postAttestationRejectAfterMeeting,
  postAttestationRestart,
} from "@borrower_pro/lib/borrower-loans-client";
import { Badge } from "../ui/badge";
import { MeetingCompletedAttestationCta } from "../loan-center/attestation-steps/meeting-completed-cta";

const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—";
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: MALAYSIA_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const a = new Date(startIso).toLocaleString("en-MY", opts);
  if (!endIso) return a;
  const b = new Date(endIso).toLocaleTimeString("en-MY", {
    timeZone: MALAYSIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${a} — ${b}`;
}

function icsLines(lines: string[]): string {
  return lines.join("\r\n");
}

function buildIcsEvent(params: {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  url?: string;
}): string {
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lender//Attestation//EN",
    "BEGIN:VEVENT",
    `UID:${params.start.getTime()}-${params.title.slice(0, 8)}@truekredit`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(params.start)}`,
    `DTEND:${fmt(params.end)}`,
    `SUMMARY:${esc(params.title)}`,
    ...(params.description ? [`DESCRIPTION:${esc(params.description)}`] : []),
    ...(params.url ? [`URL:${params.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
}

type MeetingSummaryCardProps = {
  row: BorrowerMeetingSummary;
  onChanged?: () => void;
  relativeLabel?: string;
};

export function MeetingSummaryCard({ row, onChanged, relativeLabel }: MeetingSummaryCardProps) {
  const [restartBusy, setRestartBusy] = useState(false);
  const [meetingCompleteBusy, setMeetingCompleteBusy] = useState(false);

  const onDownloadIcs = () => {
    const startIso = row.meetingStartAt ?? row.proposalStartAt;
    if (!startIso) {
      toast.error("No date available for calendar export.");
      return;
    }
    const start = new Date(startIso);
    const end = new Date(
      row.meetingEndAt ?? row.proposalEndAt ?? new Date(start.getTime() + 60 * 60 * 1000)
    );
    const ics = buildIcsEvent({
      title: `${row.tenantName} — ${row.productName} attestation`,
      start,
      end,
      description: row.meetingNotes ?? undefined,
      url: row.meetingLink ?? undefined,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `attestation-${row.loanId.slice(0, 8)}.ics`;
    a.click();
    URL.revokeObjectURL(u);
    toast.success("Calendar file downloaded");
  };

  const onCopyLink = () => {
    if (!row.meetingLink) return;
    void navigator.clipboard.writeText(row.meetingLink);
    toast.success("Link copied");
  };

  const onSwitchToVideo = async () => {
    if (row.attestationStatus !== "MEETING_REQUESTED") {
      return;
    }
    setRestartBusy(true);
    try {
      await postAttestationRestart(row.loanId);
      toast.success("Switched to video attestation — open your loan to continue.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch");
    } finally {
      setRestartBusy(false);
    }
  };

  const onAcceptAfterMeeting = async () => {
    setMeetingCompleteBusy(true);
    try {
      await postAttestationAcceptAfterMeeting(row.loanId);
      toast.success("Terms accepted. Continue on the loan page for e-KYC.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm");
    } finally {
      setMeetingCompleteBusy(false);
    }
  };

  const onRejectAfterMeeting = async () => {
    setMeetingCompleteBusy(true);
    try {
      await postAttestationRejectAfterMeeting(row.loanId);
      toast.success("Loan cancelled.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject");
    } finally {
      setMeetingCompleteBusy(false);
    }
  };

  return (
    <Card className="border-border/80 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold leading-snug break-words">
              {row.tenantName}
            </CardTitle>
            <CardDescription className="text-pretty">
              {row.productName} · {formatRm(row.principalAmount)} · {row.term} months
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant="outline"
              className={cn(
                row.actionNeeded && "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
              )}
            >
              {row.attestationStatus.replace(/_/g, " ")}
            </Badge>
            {relativeLabel ? (
              <span className="text-xs text-muted-foreground tabular-nums">{relativeLabel}</span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {row.meetingStartAt ? "Scheduled time" : row.proposalStartAt ? "Proposed / pending" : "Timing"}
          </p>
          <p className="font-medium text-foreground">{formatRange(row.meetingStartAt, row.meetingEndAt)}</p>
          {!row.meetingStartAt && row.proposalStartAt ? (
            <p className="text-xs text-muted-foreground">
              {formatRange(row.proposalStartAt, row.proposalEndAt)}
            </p>
          ) : null}
          {row.proposalDeadlineAt ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Respond by: {new Date(row.proposalDeadlineAt).toLocaleString("en-MY", { timeZone: MALAYSIA_TZ })}
            </p>
          ) : null}
          {row.meetingLink ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" size="sm" asChild>
                <a href={row.meetingLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Join meeting
                </a>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onCopyLink}>
                <Copy className="h-4 w-4 mr-1" />
                Copy link
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground pt-1">
              Meet link may appear after your lender confirms, or use email instructions.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onDownloadIcs}
            disabled={!row.meetingStartAt && !row.proposalStartAt}
          >
            <Calendar className="h-4 w-4 mr-1" />
            Add to calendar
          </Button>
          {row.attestationStatus === "MEETING_REQUESTED" ? (
            <Button type="button" size="sm" asChild>
              <Link href={`/loans/${row.loanId}/schedule-meeting`}>Choose a time</Link>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href={`/loans/${row.loanId}?focus=attestation`}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Open attestation
            </Link>
          </Button>
        </div>

        {row.attestationStatus === "MEETING_REQUESTED" ? (
          <div className="border-t pt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={restartBusy}
              onClick={() => void onSwitchToVideo()}
            >
              <Video className="h-4 w-4 mr-2" />
              {restartBusy ? "Switching…" : "Switch to video attestation"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Prefer instant attestation? This resets the meeting path so you can watch the short video instead.
            </p>
          </div>
        ) : null}

        {row.attestationStatus === "MEETING_COMPLETED" ? (
          <div className="border-t pt-3">
            <MeetingCompletedAttestationCta
              adminCompletedAtIso={row.attestationMeetingAdminCompletedAt}
              busy={meetingCompleteBusy}
              onAccept={onAcceptAfterMeeting}
              onReject={onRejectAfterMeeting}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function formatRelativeMeetingLabel(iso: string | null, now: Date): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}
