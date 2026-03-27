"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pause, Play, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import {
  getBorrowerLoan,
  postAttestationCancelLoan,
  postAttestationProceedToSigning,
  postAttestationRequestMeeting,
  postAttestationVideoComplete,
} from "../../lib/borrower-loans-client";
import type { BorrowerLoanDetail } from "../../lib/borrower-loan-types";
import { toAmountNumber } from "../../lib/application-form-validation";

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
    maxWatchedSecRef.current = 0;
    v.currentTime = 0;
    setVideoProgressPct(0);
  };

  const toggleVideoPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
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
    setVideoProgressPct(100);
  };

  const onVideoComplete = () => {
    const v = videoRef.current;
    if (!v || !v.duration) {
      toast.error("Video not ready.");
      return;
    }
    const p = (v.currentTime / v.duration) * 100;
    if (p < 99.5 && !v.ended) {
      toast.error("Watch the full video (100%) before continuing.");
      return;
    }
    void runAction(
      () => postAttestationVideoComplete(loanId, { watchedPercent: 100 }),
      "Video attestation complete."
    );
  };

  const onProceedSigning = () =>
    runAction(() => postAttestationProceedToSigning(loanId), "You can now download and sign the agreement.");

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
      await postAttestationCancelLoan(loanId, { reason: "WITHDRAWN" });
      router.push("/loans");
    }, "Loan cancelled.");

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

      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-muted/30 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gradient">Attestation video</h1>
            <p className="text-muted text-base mt-1">
              {loan.product?.name ?? "Loan"} · {formatRm(loan.principalAmount)} · {loan.term} months
            </p>
          </div>
          <Badge variant="outline">
            {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
          </Badge>
        </div>
      </div>

      <Card className="border-primary/20 shadow-md">
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
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <Label className="text-xs text-muted-foreground">Attestation video</Label>
            {!videoError ? (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  className="w-full max-h-[280px] rounded-md bg-black/80 cursor-pointer"
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
                    setVideoProgressPct(100);
                    const v = videoRef.current;
                    if (v?.duration) maxWatchedSecRef.current = v.duration;
                  }}
                >
                  <track kind="captions" />
                </video>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => toggleVideoPlay()}
                    aria-label={videoPlaying ? "Pause video" : "Play video"}
                  >
                    {videoPlaying ? (
                      <>
                        <Pause className="h-4 w-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Play
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Use play/pause only — you cannot skip ahead until the video has played through.
                  </span>
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
            <p className="text-xs text-muted-foreground">
              Progress: {videoProgressPct.toFixed(1)}% (100% required)
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || (loan.attestationStatus ?? "NOT_STARTED") !== "NOT_STARTED"}
                onClick={() => void onVideoComplete()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm video complete
              </Button>
            </div>
          </div>

          {loan.attestationStatus === "VIDEO_COMPLETED" && (
            <div className="flex flex-col gap-3 border-t pt-4">
              <p className="text-sm font-medium">What would you like to do next?</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" onClick={() => void onProceedSigning()} disabled={busy}>
                  Agree terms and continue
                </Button>
                <Button type="button" variant="outline" onClick={() => void onRequestMeeting()} disabled={busy}>
                  <Users className="h-4 w-4 mr-2" />
                  Request online meeting
                </Button>
                <Button type="button" variant="ghost" className="text-destructive" onClick={() => void onCancelLoan()} disabled={busy}>
                  Withdraw
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
