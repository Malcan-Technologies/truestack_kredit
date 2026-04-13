"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, Play, RotateCcw, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  getBorrowerLoan,
  postAttestationCancelLoan,
  postAttestationProceedToSigning,
  postAttestationRequestMeeting,
  postAttestationVideoComplete,
} from "../../lib/borrower-loans-client";
import type { BorrowerLoanDetail } from "@kredit/borrower";
import { toAmountNumber } from "../../lib/application-form-validation";
import { cn } from "../../lib/utils";

const ATTESTATION_VIDEO_SRC = "/attestation/attestation-video.mp4";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AttestationWatchVideoPanel() {
  const params = useParams();
  const router = useRouter();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxWatchedSecRef = useRef(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgressPct, setVideoProgressPct] = useState(0);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("16 / 9");
  const [videoReadyToConfirm, setVideoReadyToConfirm] = useState(false);
  const [confirmationChoice, setConfirmationChoice] = useState<"accept" | "disagree" | "withdraw" | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  const refresh = useCallback(async () => {
    if (!loanId) return;
    const r = await getBorrowerLoan(loanId);
    if (r.success) setLoan(r.data);
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
        if (!cancelled && r.success) setLoan(r.data);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load loan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    maxWatchedSecRef.current = 0;
    setVideoProgressPct(0);
    setVideoAspectRatio("16 / 9");
    setVideoReadyToConfirm(false);
    setConfirmationChoice(null);
  }, [loanId]);

  /** Do not persist playhead: leaving the page or closing the tab always requires watching from the start again. */
  useEffect(() => {
    if (!loanId) return;
    const legacyKey = `attestation-video-position-${loanId}`;
    try {
      localStorage.removeItem(legacyKey);
      sessionStorage.removeItem(legacyKey);
      sessionStorage.removeItem(`attestation-video-${loanId}`);
    } catch {
      /* ignore */
    }
  }, [loanId]);

  const runAction = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    if (v.currentTime > maxWatchedSecRef.current) {
      maxWatchedSecRef.current = v.currentTime;
    }
    const remaining = Math.max(0, v.duration - v.currentTime);
    if (remaining <= 0.25) {
      setVideoReadyToConfirm(true);
      setVideoProgressPct(100);
      return;
    }
    const p = (v.currentTime / v.duration) * 100;
    setVideoProgressPct(Math.min(100, Math.round(p * 10) / 10));
  };

  const onVideoSeeked = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > maxWatchedSecRef.current + 0.05) {
      v.currentTime = maxWatchedSecRef.current;
    }
  };

  const onVideoLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoAspectRatio(`${v.videoWidth} / ${v.videoHeight}`);
    }
    maxWatchedSecRef.current = 0;
    v.currentTime = 0;
    setVideoReadyToConfirm(false);
    setVideoProgressPct(0);
  };

  const toggleVideoPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const restartVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    maxWatchedSecRef.current = 0;
    setVideoPlaying(false);
    setVideoReadyToConfirm(false);
    setVideoProgressPct(0);
    setConfirmationChoice(null);
  };

  const devSkipVideoToEnd = () => {
    if (process.env.NODE_ENV !== "development") return;
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) {
      toast.error("Video not ready.");
      return;
    }
    maxWatchedSecRef.current = v.duration;
    v.currentTime = v.duration;
    setVideoReadyToConfirm(true);
    setVideoProgressPct(100);
  };

  const onVideoComplete = async () => {
    const attestationAlreadyCompleted =
      loan?.attestationStatus === "COMPLETED" ||
      !!loan?.attestationCompletedAt;
    const videoAlreadyRecorded =
      attestationAlreadyCompleted ||
      loan?.attestationStatus === "VIDEO_COMPLETED" ||
      !!loan?.attestationVideoCompletedAt;

    if (!videoAlreadyRecorded) {
      const v = videoRef.current;
      if (!v || !v.duration) {
        toast.error("Video not ready.");
        return;
      }
      if (!isVideoFullyWatched) {
        toast.error("Watch the full video (100%) before continuing.");
        return;
      }
      if (confirmationChoice !== "accept") {
        toast.error("Confirm that you accept the terms before continuing.");
        return;
      }
    }

    setBusy(true);
    let videoRecorded = false;
    try {
      if (attestationAlreadyCompleted) {
        toast.success("Attestation is already complete. Continue from the loan page.");
        await refresh();
        router.replace(`/loans/${loanId}`);
        return;
      }

      if (!videoAlreadyRecorded) {
        await postAttestationVideoComplete(loanId, { watchedPercent: 100 });
        videoRecorded = true;
      }

      await postAttestationProceedToSigning(loanId);
      toast.success("Attestation complete. Continue with e-KYC.");
      await refresh();
      router.replace(`/loans/${loanId}`);
    } catch (e) {
      if (videoRecorded) {
        toast.error("Video attestation was saved, but we could not continue automatically. Continue from the loan page.");
        await refresh();
        router.replace(`/loans/${loanId}`);
        return;
      }
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onRequestMeeting = async () => {
    setBusy(true);
    try {
      await postAttestationRequestMeeting(loanId);
      toast.success("Meeting requested — choose a time.");
      await refresh();
      router.push(`/loans/${loanId}/schedule-meeting`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onCancelLoan = () =>
    runAction(async () => {
      setShowWithdrawConfirm(false);
      await postAttestationCancelLoan(loanId, { reason: "WITHDRAWN" });
      router.push("/loans");
    }, "Loan cancelled.");

  const isVideoFullyWatched = videoReadyToConfirm || (() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) {
      return videoProgressPct >= 99.5;
    }
    return v.ended || maxWatchedSecRef.current >= v.duration - 0.25 || videoProgressPct >= 99.5;
  })();
  const attestationAlreadyCompleted =
    loan?.attestationStatus === "COMPLETED" ||
    !!loan?.attestationCompletedAt;
  const videoAlreadyRecorded =
    attestationAlreadyCompleted ||
    loan?.attestationStatus === "VIDEO_COMPLETED" ||
    !!loan?.attestationVideoCompletedAt;
  const videoChoiceUnlocked = isVideoFullyWatched || videoAlreadyRecorded;
  const canContinueAfterVideo =
    !busy &&
    (attestationAlreadyCompleted || videoAlreadyRecorded || (confirmationChoice !== null && isVideoFullyWatched));
  const primaryActionLabel = attestationAlreadyCompleted
    ? "Back to loan page"
    : confirmationChoice === "disagree"
      ? "Continue to lawyer meeting"
      : confirmationChoice === "withdraw"
        ? "Continue to withdraw"
        : videoAlreadyRecorded && confirmationChoice === null
          ? "Continue to e-KYC"
          : "Accept terms and continue";

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

  if (loan.status !== "PENDING_DISBURSEMENT" && loan.status !== "PENDING_ATTESTATION") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loan
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          This page is only available while the loan is pending attestation or disbursement.
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Attestation video</h1>
            <p className="text-muted text-base mt-1">
              {loan.product?.name ?? "Loan"} · {formatRm(loan.principalAmount)} · {loan.term} months
            </p>
          </div>
          <Badge variant="outline">
            {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
          </Badge>
        </div>
      </div>

      <Card className="border-primary/20 bg-muted/10 shadow-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Step 1 — Attestation video
          </CardTitle>
          <CardDescription>
            Watch the full video before continuing. If you leave this page or close the tab, you will need to
            watch from the beginning when you return. After completion, your next options will appear below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg p-4 space-y-3">
            <Label className="text-xs text-muted-foreground">Attestation video</Label>
            {!videoError ? (
              <div className="space-y-2">
                <div
                  className="relative w-full overflow-hidden rounded-md bg-black/80"
                  style={{ aspectRatio: videoAspectRatio }}
                >
                  <video
                    ref={videoRef}
                    className="h-full w-full cursor-pointer object-contain"
                    controls={false}
                    disablePictureInPicture
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    src={ATTESTATION_VIDEO_SRC}
                    onClick={() => toggleVideoPlay()}
                    onError={() => setVideoError(true)}
                    onLoadedMetadata={onVideoLoaded}
                    onTimeUpdate={onVideoTimeUpdate}
                    onSeeked={onVideoSeeked}
                    onPlay={() => setVideoPlaying(true)}
                    onPause={() => setVideoPlaying(false)}
                    onEnded={() => {
                      setVideoReadyToConfirm(true);
                      setVideoProgressPct(100);
                      const v = videoRef.current;
                      if (v?.duration) maxWatchedSecRef.current = v.duration;
                    }}
                  >
                    <track kind="captions" />
                  </video>
                  {!videoPlaying && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-3 top-3 z-10 h-10 w-10 rounded-full border border-background/30 bg-background/85 shadow-lg backdrop-blur-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          restartVideo();
                        }}
                        aria-label="Restart video"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute left-1/2 top-1/2 z-10 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background/30 bg-background/85 shadow-lg backdrop-blur-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVideoPlay();
                        }}
                        aria-label="Play video"
                      >
                        <Play className="h-5 w-5" />
                      </Button>
                    </>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3">
                    <span className="text-xs text-white/85">
                      Use play/pause only - you cannot skip ahead until the video has played through.
                    </span>
                  </div>
                </div>
                {process.env.NODE_ENV === "development" && (
                  <div className="pt-2 border-t border-dashed border-border/60">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs border-amber-500/40 text-amber-900 dark:text-amber-100"
                      onClick={devSkipVideoToEnd}
                    >
                      Dev: skip to 100%
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
                Video file not found. Add <code className="text-xs">public/attestation/attestation-video.mp4</code>{" "}
                to the borrower app, then refresh.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Progress: {videoProgressPct.toFixed(1)}% (100% required)</p>
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium text-foreground">After watching, choose one option</Label>
              {attestationAlreadyCompleted ? (
                <p className="text-xs text-muted-foreground">
                  This attestation is already complete. Return to the loan page to continue with the next step.
                </p>
              ) : videoAlreadyRecorded ? (
                <p className="text-xs text-muted-foreground">
                  Your video attestation is already saved. You can continue without submitting it again, or choose
                  another option below.
                </p>
              ) : !isVideoFullyWatched && (
                <p className="text-xs text-muted-foreground">
                  Finish the video first to unlock these options.
                </p>
              )}
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmationChoice("accept")}
                  disabled={attestationAlreadyCompleted || !videoChoiceUnlocked || busy}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    confirmationChoice === "accept"
                      ? "border-success/40 bg-success/5"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <Video className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">I confirm and accept the terms</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Once the video reaches 100%, you can complete video attestation and continue.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmationChoice("disagree")}
                  disabled={attestationAlreadyCompleted || !videoChoiceUnlocked || busy}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    confirmationChoice === "disagree"
                      ? "border-warning/40 bg-warning/5"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                      <Users className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        I disagree or want a lawyer to explain the terms
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        You can schedule an online meeting with a lawyer instead of continuing with the video option.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmationChoice("withdraw")}
                  disabled={attestationAlreadyCompleted || !videoChoiceUnlocked || busy}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    confirmationChoice === "withdraw"
                      ? "border-warning/40 bg-warning/5"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                      <AlertTriangle className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Withdraw my loan application</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cancel this approved loan and lose your current progress instead of continuing to signing.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!canContinueAfterVideo}
                onClick={() => {
                  if (confirmationChoice === "withdraw") {
                    setShowWithdrawConfirm(true);
                    return;
                  }
                  if (confirmationChoice === "disagree") {
                    void onRequestMeeting();
                    return;
                  }
                  void onVideoComplete();
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {primaryActionLabel}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      <Dialog open={showWithdrawConfirm} onOpenChange={setShowWithdrawConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this loan application?</DialogTitle>
            <DialogDescription>
              This will cancel your approved loan application and you will lose all current progress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <p className="text-sm font-medium text-foreground">Before you withdraw</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your application is already approved. You only need to complete signing next if you want to continue.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              If you still want to stop here, confirm below to withdraw the loan application.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowWithdrawConfirm(false)}>
              Keep my application
            </Button>
            <Button type="button" variant="destructive" onClick={() => void onCancelLoan()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Withdraw loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
