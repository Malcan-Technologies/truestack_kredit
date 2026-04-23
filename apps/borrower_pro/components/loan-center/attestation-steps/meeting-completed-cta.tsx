"use client";

import Link from "next/link";
import { Button } from "../../ui/button";

type MeetingCompletedAttestationCtaProps = {
  adminCompletedAtIso?: string | null;
  busy: boolean;
  onAccept: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
};

export function MeetingCompletedAttestationCta({
  adminCompletedAtIso,
  busy,
  onAccept,
  onReject,
}: MeetingCompletedAttestationCtaProps) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <p className="text-sm font-medium">Meeting complete — confirm next step</p>
      <p className="text-xs text-muted-foreground">
        Your lender marked the attestation meeting as finished. Accept the loan to continue to identity verification
        and agreement signing, or reject if you do not wish to proceed.
      </p>
      {adminCompletedAtIso ? (
        <p className="text-xs text-muted-foreground">
          Confirmed by lender:{" "}
          {new Date(adminCompletedAtIso).toLocaleString("en-MY", {
            timeZone: "Asia/Kuala_Lumpur",
          })}
        </p>
      ) : null}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Button type="button" onClick={() => void onAccept()} disabled={busy}>
          Accept loan — continue to e-KYC
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive border-destructive/30"
          onClick={() => void onReject()}
          disabled={busy}
        >
          Reject loan
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href="/meetings">View Meetings hub</Link>
        </Button>
      </div>
    </div>
  );
}
