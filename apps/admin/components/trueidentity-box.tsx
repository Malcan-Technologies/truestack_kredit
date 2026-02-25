"use client";

import { useEffect, useState, useCallback } from "react";
import { Fingerprint, Sparkles, Copy, Loader2, RefreshCw, Check, Circle, XCircle, ChartPie } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatSmartDateTime } from "@/lib/utils";

// ============================================
// Types
// ============================================

interface DirectorVerifyStatus {
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
}

type VerifyStatusResponse =
  | {
      borrowerType: "INDIVIDUAL";
      status: string | null;
      result: string | null;
      rejectMessage: string | null;
      onboardingUrl: string | null;
      expiresAt: string | null;
      lastWebhookAt: string | null;
    }
  | {
      borrowerType: "CORPORATE";
      directors: DirectorVerifyStatus[];
    };

interface Director {
  id: string;
  name: string;
  icNumber: string;
  position: string | null;
  order: number;
}

interface TrueIdentityBoxProps {
  borrowerId: string;
  borrowerType: string;
  borrowerName: string;
  borrowerIcNumber: string;
  directors?: Director[];
}

// ============================================
// Director subcard (for corporate)
// ============================================

function DirectorVerificationCard({
  director,
  onSendVerification,
  onCopyLink,
  onStatusRefetch,
}: {
  director: DirectorVerifyStatus;
  onSendVerification: (directorId: string) => Promise<void>;
  onCopyLink: (url: string) => void;
  onStatusRefetch: () => void;
}) {
  const [sending, setSending] = useState(false);
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
      await onSendVerification(director.id);
      onStatusRefetch();
    } finally {
      setSending(false);
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
            {d.position && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{d.position}</p>
            )}
            {isFailed && (
              <p className="text-xs text-destructive font-medium mt-1">Verification failed</p>
            )}
            {isRejected && (
              <p className="text-xs text-destructive font-medium mt-1">Verification rejected</p>
            )}
          </div>
        </div>
        {hasUrl && !isCompleted && !isExpired && (
          <div className="space-y-2 mb-3">
            <p className="text-xs text-muted-foreground">
              Share the QR code or link with this director to complete verification.
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
            </div>
          </div>
        )}
        {isExpired && (
          <div className="space-y-2 mb-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 opacity-60">
            <p className="text-xs text-muted-foreground line-through">
              Verification link has expired
            </p>
            <p className="text-xs text-muted-foreground">
              The QR code and link are no longer valid. Please retry to generate a new verification link.
            </p>
          </div>
        )}
        {isFailed && (
          <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 mb-3">
            <p className="text-sm font-medium">Verification failed</p>
            <p className="text-xs text-muted-foreground">
              The verification could not be completed. Please retry to generate a new verification link.
            </p>
          </div>
        )}
        {isRejected && d.rejectMessage && (
          <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 mb-3">
            <p className="text-sm font-medium">Verification rejected</p>
            <p className="text-xs text-muted-foreground">{d.rejectMessage}</p>
          </div>
        )}
        {isVerified ? (
          <div className="space-y-2">
            {d.lastWebhookAt && (
              <p className="text-xs text-muted-foreground">
                Last verified: {formatSmartDateTime(d.lastWebhookAt)}
              </p>
            )}
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              This director is already verified. No re-verification needed.
            </p>
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
            {sending ? "Creating..." : isRetry ? "Retry KYC" : "Send Verification"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isProcessing || isPending
                ? "Verification in progress. Share the QR code above with this director."
                : "Verification link created. Share the QR code above with this director."}
            </p>
            {(isPending || isProcessing) && (
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
                {sending ? "Creating..." : "Retry KYC"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Individual subcard
// ============================================

function IndividualVerificationCard({
  borrowerName,
  borrowerIcNumber,
  status,
  onSendVerification,
  onCopyLink,
}: {
  borrowerName: string;
  borrowerIcNumber: string;
  status: NonNullable<VerifyStatusResponse & { borrowerType: "INDIVIDUAL" }>;
  onSendVerification: () => Promise<void>;
  onCopyLink: (url: string) => void;
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
            {isFailed && (
              <p className="text-xs text-destructive font-medium mt-1">Verification failed</p>
            )}
            {isRejected && (
              <p className="text-xs text-destructive font-medium mt-1">Verification rejected</p>
            )}
          </div>
        </div>
        {isVerified ? (
          <div className="space-y-2">
            {status.lastWebhookAt && (
              <p className="text-xs text-muted-foreground">
                Last verified: {formatSmartDateTime(status.lastWebhookAt)}
              </p>
            )}
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
              {sending ? "Creating..." : "Redo verification"}
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
            {sending ? "Creating..." : isRetry ? "Retry KYC" : "Send Verification"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isProcessing || isPending
                ? "Verification in progress. Share the QR code above with the borrower."
                : "Verification link created. Share the QR code above with the borrower."}
            </p>
            {(isPending || isProcessing) && (
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
                {sending ? "Creating..." : "Retry KYC"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Main component
// ============================================

export function TrueIdentityBox({
  borrowerId,
  borrowerType,
  borrowerName,
  borrowerIcNumber,
  directors = [],
}: TrueIdentityBoxProps) {
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [status, setStatus] = useState<VerifyStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<VerifyStatusResponse>(
        `/api/borrowers/${borrowerId}/verify/status`
      );
      if (res.success && res.data) {
        setStatus(res.data);
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [borrowerId]);

  useEffect(() => {
    const checkAddOn = async () => {
      try {
        const res = await api.get<{
          addOns: Array<{ addOnType: string; status: string }>;
        }>("/api/billing/add-ons");
        if (res.success && res.data) {
          const active = res.data.addOns.some(
            (a) => a.addOnType === "TRUEIDENTITY" && a.status === "ACTIVE"
          );
          setIsActive(active);
        } else {
          setIsActive(false);
        }
      } catch {
        setIsActive(false);
      }
    };
    checkAddOn();
  }, []);

  useEffect(() => {
    if (isActive) {
      fetchStatus();
    }
  }, [isActive, fetchStatus]);

  const handleSendVerificationIndividual = async () => {
    const res = await api.post<{
      sessionId: string;
      onboardingUrl: string;
      status: string;
      expiresAt: string;
    }>(`/api/borrowers/${borrowerId}/verify/start`, {});
    if (res.success && res.data) {
      setStatus({
        borrowerType: "INDIVIDUAL",
        status: res.data.status,
        result: null,
        rejectMessage: null,
        onboardingUrl: res.data.onboardingUrl,
        expiresAt: res.data.expiresAt,
        lastWebhookAt: null,
      });
      toast.success("Verification link created. Share the QR code or link with the borrower.");
    } else {
      toast.error(res.error ?? "Failed to start verification");
    }
  };

  const handleSendVerificationDirector = async (directorId: string) => {
    const res = await api.post<{
      sessionId: string;
      onboardingUrl: string;
      status: string;
      expiresAt: string;
    }>(`/api/borrowers/${borrowerId}/verify/start`, { directorId });
    if (res.success && res.data) {
      await fetchStatus();
      toast.success("Verification link created. Share the QR code or link with this director.");
    } else {
      toast.error(res.error ?? "Failed to start verification");
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const inactive = isActive === false;
  const isCorporate = borrowerType === "CORPORATE";

  // Header status badge: for individual show single status; for corporate show aggregate
  const statusBadge = () => {
    if (isCorporate && status?.borrowerType === "CORPORATE") {
      const directors = status.directors;
      const allVerified = directors.length > 0 && directors.every(
        (d) => d?.status === "completed" && d?.result === "approved"
      );
      const anyVerified = directors.some(
        (d) => d?.status === "completed" && d?.result === "approved"
      );
      const anyFailed = directors.some((d) => d?.status === "failed");
      const anyRejected = directors.some(
        (d) => d?.status === "completed" && d?.result === "rejected"
      );
      if (allVerified) {
        return (
          <Badge variant="verified" className="text-xs">
            <Fingerprint className="h-3 w-3 mr-1" />
            e-KYC Verified
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
        <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">
          Unverified
        </Badge>
      );
    }
    if (status?.borrowerType === "INDIVIDUAL") {
      const s = status;
      const isVerified = s.status === "completed" && s.result === "approved";
      const isRejected = s.status === "completed" && s.result === "rejected";
      const isFailed = s.status === "failed";
      if (isVerified) {
        return (
          <Badge variant="verified" className="text-xs">
            <Fingerprint className="h-3 w-3 mr-1" />
            e-KYC Verified
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
        <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">
          Unverified
        </Badge>
      );
    }
    return null;
  };

  return (
    <Card
      className={
        inactive
          ? "opacity-50 border-dashed border-muted-foreground/30"
          : "bg-emerald-500/[0.04] border-emerald-500/15"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Fingerprint
              className={`h-5 w-5 ${inactive ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-500"}`}
            />
            TrueIdentity™
          </CardTitle>
          {statusBadge()}
        </div>
        <CardDescription className="mt-0.5">
          {isCorporate
            ? "Verify each director's identity via IC capture and facial recognition"
            : "Verify borrower identity via IC capture and facial recognition"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {inactive ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Fingerprint className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              e-KYC verification is not enabled
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[260px] mb-4">
              Subscribe to TrueIdentity to verify borrower identity via QR-based IC capture and face
              liveness check.
            </p>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/dashboard/plan">
                <Sparkles className="h-3.5 w-3.5" />
                Learn More
              </Link>
            </Button>
          </div>
        ) : isActive === null || loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading...
          </div>
        ) : isCorporate ? (
          <div className="space-y-3">
            {directors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No directors added. Add directors to this corporate borrower to verify their identity.
              </p>
            ) : (
              <>
                {(status?.borrowerType === "CORPORATE"
                  ? status.directors
                  : directors.map((d) => ({
                      id: d.id,
                      name: d.name,
                      icNumber: d.icNumber,
                      position: d.position,
                      status: null,
                      result: null,
                      rejectMessage: null,
                      onboardingUrl: null,
                      expiresAt: null,
                      lastWebhookAt: null,
                    }))
                ).map((director) => (
                  <DirectorVerificationCard
                    key={director.id}
                    director={director}
                    onSendVerification={handleSendVerificationDirector}
                    onCopyLink={handleCopyLink}
                    onStatusRefetch={fetchStatus}
                  />
                ))}
              </>
            )}
          </div>
        ) : status?.borrowerType === "INDIVIDUAL" ? (
          <div className="space-y-3">
            {status.result === "rejected" && status.rejectMessage && (
              <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                <p className="text-sm font-medium">Verification rejected</p>
                <p className="text-xs text-muted-foreground">{status.rejectMessage}</p>
              </div>
            )}
            {status.status === "failed" && (
              <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                <p className="text-sm font-medium">Verification failed</p>
                <p className="text-xs text-muted-foreground">
                  The verification could not be completed. Please retry to generate a new verification link.
                </p>
              </div>
            )}
            {status.onboardingUrl && status.status !== "completed" && status.status !== "expired" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Share the QR code or link with the borrower to complete verification.
                </p>
                <div className="flex flex-col items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <QRCodeSVG value={status.onboardingUrl} size={140} level="M" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => handleCopyLink(status.onboardingUrl!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </Button>
                </div>
              </div>
            )}
            {status.status === "expired" && (
              <div className="space-y-2 mb-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 opacity-60">
                <p className="text-xs text-muted-foreground line-through">
                  Verification link has expired
                </p>
                <p className="text-xs text-muted-foreground">
                  The QR code and link are no longer valid. Please retry to generate a new verification link.
                </p>
              </div>
            )}
            <IndividualVerificationCard
              borrowerName={borrowerName}
              borrowerIcNumber={borrowerIcNumber}
              status={status}
              onSendVerification={handleSendVerificationIndividual}
              onCopyLink={handleCopyLink}
            />
            {(status.status === "processing" || status.status === "pending") && (
              <p className="text-xs text-muted-foreground">
                Borrower is completing verification. Status will update when done.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
