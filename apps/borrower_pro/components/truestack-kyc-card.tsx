"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Fingerprint,
  Copy,
  Loader2,
  RefreshCw,
  Check,
  Circle,
  XCircle,
  ChartPie,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  fetchBorrower,
  getTruestackKycStatusWithActiveSessionSync,
  refreshTruestackKycSession,
  startTruestackKycSession,
  type BorrowerDetail,
  type BorrowerDirector,
  type TruestackKycSessionRow,
  type TruestackKycStatusData,
} from "../lib/borrower-api-client";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../lib/borrower-auth-client";
import { getCorporateDirectorsForKyc } from "../lib/borrower-verification";

function formatSmartDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type DirectorKycState = {
  id: string;
  name: string;
  icNumber: string;
  position: string | null;
  status: string | null;
  result: string | null;
  rejectMessage: string | null;
  onboardingUrl: string | null;
  expiresAt: string | null;
  lastWebhookAt: string | null;
  externalSessionId: string | null;
};

function sessionSortKey(s: TruestackKycSessionRow): string {
  return s.createdAt ?? s.updatedAt ?? "";
}

/** Follow the latest attempt so redo / retry shows the new session immediately. */
function pickBestSession(rows: TruestackKycSessionRow[]): TruestackKycSessionRow | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)))[0];
}

function latestSessionForDirector(
  sessions: TruestackKycSessionRow[],
  directorId: string
): TruestackKycSessionRow | undefined {
  return pickBestSession(sessions.filter((s) => s.directorId === directorId));
}

function mergeDirectorWithSessions(
  d: BorrowerDirector,
  sessions: TruestackKycSessionRow[]
): DirectorKycState {
  const s = latestSessionForDirector(sessions, d.id);
  return {
    id: d.id,
    name: d.name,
    icNumber: d.icNumber,
    position: d.position,
    status: s?.status ?? null,
    result: s?.result ?? null,
    rejectMessage: s?.rejectMessage ?? null,
    onboardingUrl: s?.onboardingUrl ?? null,
    expiresAt: s?.expiresAt ?? null,
    lastWebhookAt: s?.lastWebhookAt ?? null,
    externalSessionId: s?.externalSessionId ?? null,
  };
}

type IndividualKycState = {
  status: string | null;
  result: string | null;
  rejectMessage: string | null;
  onboardingUrl: string | null;
  expiresAt: string | null;
  lastWebhookAt: string | null;
  externalSessionId: string | null;
};

function individualStateFromSessions(
  sessions: TruestackKycSessionRow[]
): IndividualKycState {
  const s = pickBestSession(sessions.filter((row) => !row.directorId));
  return {
    status: s?.status ?? null,
    result: s?.result ?? null,
    rejectMessage: s?.rejectMessage ?? null,
    onboardingUrl: s?.onboardingUrl ?? null,
    expiresAt: s?.expiresAt ?? null,
    lastWebhookAt: s?.lastWebhookAt ?? null,
    externalSessionId: s?.externalSessionId ?? null,
  };
}

function DirectorKycCard({
  director,
  onSendVerification,
  onCopyLink,
  onSyncSession,
}: {
  director: DirectorKycState;
  onSendVerification: (directorId: string) => Promise<void>;
  onCopyLink: (url: string) => void;
  onSyncSession: (externalSessionId: string) => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const d = director;
  const hasUrl = Boolean(d.onboardingUrl);
  const isCompleted = d.status === "completed";
  const isExpired = d.status === "expired";
  const isProcessing = d.status === "processing";
  const isPending = d.status === "pending";
  const isRejected = isCompleted && d.result === "rejected";
  const isFailed = d.status === "failed";
  const canStart = !hasUrl || isExpired || isRejected || isFailed;
  const isVerified = isCompleted && d.result === "approved";
  const isRetry = isExpired || isRejected || isFailed;

  const handleSend = async () => {
    setSending(true);
    try {
      await onSendVerification(d.id);
    } finally {
      setSending(false);
    }
  };

  const handleSync = async () => {
    if (!d.externalSessionId) return;
    setSyncing(true);
    try {
      await onSyncSession(d.externalSessionId);
      toast.success("Status synced from TrueStack");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      className={
        isVerified
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-muted-foreground/15 bg-neutral-50 dark:bg-neutral-800/30"
      }
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3 mb-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              isVerified ? "bg-emerald-500/20" : isFailed || isRejected ? "bg-destructive/20" : "bg-muted"
            }`}
          >
            {isVerified ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : isFailed || isRejected ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{d.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{d.icNumber}</p>
            {d.position ? (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{d.position}</p>
            ) : null}
            {isFailed ? (
              <p className="text-xs text-destructive font-medium mt-1">Verification failed</p>
            ) : null}
            {isRejected ? (
              <p className="text-xs text-destructive font-medium mt-1">Verification rejected</p>
            ) : null}
          </div>
        </div>
        {hasUrl && !isCompleted && !isExpired ? (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-muted-foreground">
              Scan the QR code or use the link to complete verification.
            </p>
            <div className="flex flex-col items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
              <QRCodeSVG value={d.onboardingUrl!} size={120} level="M" />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => onCopyLink(d.onboardingUrl!)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </Button>
              {d.externalSessionId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => void handleSync()}
                  disabled={syncing}
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sync status
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {isExpired ? (
          <div className="space-y-2 mb-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground line-through opacity-60">
              Verification link has expired
            </p>
            <p className="text-xs text-muted-foreground">
              The QR code and link are no longer valid. You can sync once more with TrueStack, then retry to generate a new
              link if needed.
            </p>
            {d.externalSessionId ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => void handleSync()}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync status
              </Button>
            ) : null}
          </div>
        ) : null}
        {isFailed ? (
          <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 mb-3">
            <p className="text-sm font-medium">Verification failed</p>
            <p className="text-xs text-muted-foreground">
              The verification could not be completed. Retry to generate a new verification link.
            </p>
          </div>
        ) : null}
        {isRejected && d.rejectMessage ? (
          <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 mb-3">
            <p className="text-sm font-medium">Verification rejected</p>
            <p className="text-xs text-muted-foreground">{d.rejectMessage}</p>
          </div>
        ) : null}
        {isVerified ? (
          <div className="space-y-2">
            {d.lastWebhookAt ? (
              <p className="text-xs text-muted-foreground">
                Last verified: {formatSmartDateTime(d.lastWebhookAt)}
              </p>
            ) : null}
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-2">
              This director is verified. You can re-verify to generate a new link if needed.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {sending ? "Creating…" : "Redo verification"}
            </Button>
          </div>
        ) : canStart ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isRetry ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Fingerprint className="h-3.5 w-3.5" />
            )}
            {sending ? "Creating…" : isRetry ? "Retry KYC" : "Send verification"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isProcessing || isPending
                ? "Verification in progress. Use the QR code or link above."
                : "Verification link created. Use the QR code or link above."}
            </p>
            {(isPending || isProcessing) ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {sending ? "Creating…" : "Retry KYC"}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IndividualKycBottomActions({
  borrowerName,
  borrowerIcNumber,
  status,
  onSendVerification,
}: {
  borrowerName: string;
  borrowerIcNumber: string;
  status: IndividualKycState;
  onSendVerification: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const hasUrl = Boolean(status.onboardingUrl);
  const isCompleted = status.status === "completed";
  const isExpired = status.status === "expired";
  const isProcessing = status.status === "processing";
  const isPending = status.status === "pending";
  const isRejected = isCompleted && status.result === "rejected";
  const isFailed = status.status === "failed";
  const canStart = !hasUrl || isExpired || isRejected || isFailed;
  const isVerified = isCompleted && status.result === "approved";
  const isRetry = isExpired || isRejected || isFailed;

  return (
    <Card
      className={
        isVerified
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-muted-foreground/15 bg-neutral-50 dark:bg-neutral-800/30"
      }
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3 mb-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              isVerified ? "bg-emerald-500/20" : isFailed || isRejected ? "bg-destructive/20" : "bg-muted"
            }`}
          >
            {isVerified ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : isFailed || isRejected ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{borrowerName}</p>
            <p className="text-xs text-muted-foreground font-mono">{borrowerIcNumber}</p>
            {isFailed ? (
              <p className="text-xs text-destructive font-medium mt-1">Verification failed</p>
            ) : null}
            {isRejected ? (
              <p className="text-xs text-destructive font-medium mt-1">Verification rejected</p>
            ) : null}
          </div>
        </div>
        {isVerified ? (
          <div className="space-y-2">
            {status.lastWebhookAt ? (
              <p className="text-xs text-muted-foreground">
                Last verified: {formatSmartDateTime(status.lastWebhookAt)}
              </p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={async () => {
                setSending(true);
                try {
                  await onSendVerification();
                } finally {
                  setSending(false);
                }
              }}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {sending ? "Creating…" : "Redo verification"}
            </Button>
          </div>
        ) : canStart ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={async () => {
              setSending(true);
              try {
                await onSendVerification();
              } finally {
                setSending(false);
              }
            }}
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isRetry ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Fingerprint className="h-3.5 w-3.5" />
            )}
            {sending ? "Creating…" : isRetry ? "Retry KYC" : "Send verification"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isProcessing || isPending
                ? "Verification in progress. Use the QR code or link above."
                : "Verification link created. Use the QR code or link above."}
            </p>
            {(isPending || isProcessing) ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={async () => {
                  setSending(true);
                  try {
                    await onSendVerification();
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {sending ? "Creating…" : "Retry KYC"}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TruestackKycCard({
  onStatusLoaded,
  refreshKey,
}: {
  /** Called when KYC status may have new borrower documents (e.g. completed approved). */
  onStatusLoaded?: () => void;
  /** Increment to reload KYC + borrower snapshot (e.g. page toolbar refresh). */
  refreshKey?: number;
} = {}) {
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [kyc, setKyc] = useState<TruestackKycStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hadApprovedSessionRef = useRef<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let bumpDocs = false;
    try {
      const bRes = await fetchBorrower();
      if (bRes.success) setBorrower(bRes.data);
      else setBorrower(null);
      try {
        const kRes = await getTruestackKycStatusWithActiveSessionSync();
        if (kRes.success) {
          setKyc(kRes.data);
          bumpDocs = kRes.data.sessions.some((s) => s.status === "completed" && s.result === "approved");
        }
      } catch (ke) {
        setKyc(null);
        setError(ke instanceof Error ? ke.message : "Failed to load KYC status");
      }
    } catch (e) {
      setBorrower(null);
      setKyc(null);
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
      // Only notify parent when KYC transitions into an approved state.
      // Otherwise the parent refresh key can cause a fetch loop.
      if (hadApprovedSessionRef.current === null) {
        hadApprovedSessionRef.current = bumpDocs;
      } else {
        if (!hadApprovedSessionRef.current && bumpDocs) {
          onStatusLoaded?.();
        }
        hadApprovedSessionRef.current = bumpDocs;
      }
    }
  }, [onStatusLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    void load();
  }, [refreshKey, load]);

  useEffect(() => {
    const onSwitch = () => {
      void load();
    };
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
  }, [load]);

  useEffect(() => {
    const sessions = kyc?.sessions ?? [];
    const hasActiveFlow = sessions.some((s) => s.status === "pending" || s.status === "processing");
    if (!hasActiveFlow) return;
    const timer = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [kyc, load]);

  const handleCopyLink = (url: string) => {
    void navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const handleSendIndividual = async () => {
    try {
      const res = await startTruestackKycSession();
      if (res.success && res.data.onboardingUrl) {
        toast.success("Verification link created. Scan the QR code or copy the link.");
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start verification");
    }
  };

  const handleSendDirector = async (directorId: string) => {
    try {
      const res = await startTruestackKycSession({ directorId });
      if (res.success && res.data.onboardingUrl) {
        toast.success("Verification link created. Share the QR code or link with this director.");
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start verification");
    }
  };

  const handleSyncSession = async (externalSessionId: string) => {
    await refreshTruestackKycSession(externalSessionId);
    await load();
  };

  const sessions = kyc?.sessions ?? [];
  const isCorporate = borrower !== null && borrower.borrowerType === "CORPORATE";
  const ind = borrower ? individualStateFromSessions(sessions) : null;

  // For corporate: only the authorized representative(s) need KYC.
  const corporateKycDirectors =
    borrower !== null && isCorporate ? getCorporateDirectorsForKyc(borrower.directors) : [];

  const isKycVerified =
    borrower !== null &&
    (isCorporate
      ? corporateKycDirectors.length > 0 &&
        corporateKycDirectors
          .map((d) => mergeDirectorWithSessions(d, sessions))
          .every((d) => d.status === "completed" && d.result === "approved")
      : ind?.status === "completed" && ind.result === "approved");

  const statusBadge = () => {
    if (!kyc) return null;
    if (isCorporate) {
      const directors = corporateKycDirectors.map((d) => mergeDirectorWithSessions(d, sessions));
      const allVerified =
        directors.length > 0 &&
        directors.every((d) => d.status === "completed" && d.result === "approved");
      const anyVerified = directors.some((d) => d.status === "completed" && d.result === "approved");
      const anyFailed = directors.some((d) => d.status === "failed");
      const anyRejected = directors.some(
        (d) => d.status === "completed" && d.result === "rejected"
      );
      if (allVerified) {
        return (
          <Badge variant="verified" className="text-xs">
            <Fingerprint className="h-3 w-3 mr-1" />
            e-KYC verified
          </Badge>
        );
      }
      if (anyFailed) {
        return (
          <Badge variant="destructive" className="text-[10px]">
            Failed
          </Badge>
        );
      }
      if (anyRejected) {
        return (
          <Badge variant="destructive" className="text-[10px]">
            Rejected
          </Badge>
        );
      }
      if (anyVerified) {
        return (
          <Badge
            variant="outline"
            className="text-[10px] bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-700"
          >
            <ChartPie className="h-3 w-3 mr-1" />
            Partially verified
          </Badge>
        );
      }
      return (
        <Badge
          variant="secondary"
          className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
        >
          Unverified
        </Badge>
      );
    }
    if (!ind) return null;
    const isVerified = ind.status === "completed" && ind.result === "approved";
    const isRejected = ind.status === "completed" && ind.result === "rejected";
    const isFailed = ind.status === "failed";
    if (isVerified) {
      return (
        <Badge variant="verified" className="text-xs">
          <Fingerprint className="h-3 w-3 mr-1" />
          e-KYC verified
        </Badge>
      );
    }
    if (isRejected) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          Rejected
        </Badge>
      );
    }
    if (isFailed) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          Failed
        </Badge>
      );
    }
    return (
      <Badge
        variant="secondary"
        className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
      >
        Unverified
      </Badge>
    );
  };

  return (
    <Card
      className={
        isKycVerified
          ? "border-success/20 bg-success/5"
          : "border-warning/25 bg-warning/10"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Fingerprint
              className={isKycVerified ? "h-5 w-5 text-success" : "h-5 w-5 text-warning"}
            />
            e-KYC
          </CardTitle>
          {!loading && borrower ? statusBadge() : null}
        </div>
        <CardDescription className="mt-0.5">
          {isCorporate
            ? "Verify the authorized representative's identity via IC capture and facial recognition"
            : "Verify your identity to enable digital signing"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading…
          </div>
        ) : !borrower ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Unable to load borrower profile. Try refreshing the page.
          </p>
        ) : (
          <>
            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
                {error}
              </div>
            ) : null}

            {isCorporate ? (
              <div className="space-y-3">
                {corporateKycDirectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No authorized representative set. Add directors and designate an authorized representative.
                  </p>
                ) : (
                  corporateKycDirectors.map((d) => (
                    <DirectorKycCard
                      key={d.id}
                      director={mergeDirectorWithSessions(d, sessions)}
                      onSendVerification={handleSendDirector}
                      onCopyLink={handleCopyLink}
                      onSyncSession={handleSyncSession}
                    />
                  ))
                )}
              </div>
            ) : ind ? (
              <div className="space-y-3">
                {ind.result === "rejected" && ind.rejectMessage ? (
                  <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                    <p className="text-sm font-medium">Verification rejected</p>
                    <p className="text-xs text-muted-foreground">{ind.rejectMessage}</p>
                  </div>
                ) : null}
                {ind.status === "failed" ? (
                  <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                    <p className="text-sm font-medium">Verification failed</p>
                    <p className="text-xs text-muted-foreground">
                      The verification could not be completed. Please retry to generate a new verification link.
                    </p>
                  </div>
                ) : null}
                {ind.onboardingUrl &&
                ind.status !== "completed" &&
                ind.status !== "expired" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Scan the QR code or use the link to complete verification.
                    </p>
                    <div className="flex flex-col items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <QRCodeSVG value={ind.onboardingUrl} size={140} level="M" />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => handleCopyLink(ind.onboardingUrl!)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy link
                      </Button>
                      {ind.externalSessionId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() =>
                            void (async () => {
                              try {
                                await handleSyncSession(ind.externalSessionId!);
                                toast.success("Status synced from TrueStack");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Sync failed");
                              }
                            })()
                          }
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sync status
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {ind.status === "expired" ? (
                  <div className="space-y-2 mb-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground line-through opacity-60">
                      Verification link has expired
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The QR code and link are no longer valid. Sync with TrueStack or retry to generate a new verification
                      link.
                    </p>
                    {ind.externalSessionId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() =>
                          void (async () => {
                            try {
                              await handleSyncSession(ind.externalSessionId!);
                              toast.success("Status synced from TrueStack");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Sync failed");
                            }
                          })()
                        }
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync status
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <IndividualKycBottomActions
                  borrowerName={borrower.name}
                  borrowerIcNumber={borrower.icNumber}
                  status={ind}
                  onSendVerification={handleSendIndividual}
                />
                {ind.status === "processing" || ind.status === "pending" ? (
                  <p className="text-xs text-muted-foreground">
                    Complete verification in the opened window. Status will update when done.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
