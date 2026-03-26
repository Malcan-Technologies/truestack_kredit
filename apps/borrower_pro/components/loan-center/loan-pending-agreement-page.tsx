"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Upload,
  Video,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import {
  getBorrowerLoan,
  borrowerLoanGenerateAgreementUrl,
  borrowerLoanViewSignedAgreementUrl,
  uploadBorrowerSignedAgreement,
  postAttestationProceedToSigning,
  postAttestationRequestMeeting,
  postAttestationAcceptCounter,
  postAttestationDeclineCounter,
  postAttestationCompleteMeeting,
  postAttestationCancelLoan,
} from "../../lib/borrower-loans-client";
import type {
  BorrowerLoanDetail,
  SignedAgreementReviewStatus,
  AttestationStatus,
} from "../../lib/borrower-loan-types";
import { toAmountNumber } from "../../lib/application-form-validation";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-MY");
  } catch {
    return iso;
  }
}

function agreementIsoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function reviewBadge(status: SignedAgreementReviewStatus | undefined) {
  const s = status ?? "NONE";
  switch (s) {
    case "APPROVED":
      return <Badge className="bg-emerald-600">Approved</Badge>;
    case "PENDING":
      return <Badge variant="secondary">Awaiting admin approval</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected — upload again</Badge>;
    default:
      return <Badge variant="outline">Not uploaded</Badge>;
  }
}

type StepId = "attestation" | "sign" | "upload" | "review" | "payout";

export function LoanPendingAgreementPage() {
  const params = useParams();
  const router = useRouter();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [agreementDate, setAgreementDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attestBusy, setAttestBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!loanId) return;
    const r = await getBorrowerLoan(loanId);
    if (r.success) {
      setLoan(r.data);
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
    if (loan?.agreementDate) {
      setAgreementDate(agreementIsoToDateInput(loan.agreementDate));
    }
  }, [loan?.agreementDate]);

  const attestationDone = !!loan?.attestationCompletedAt;
  const attestationStatus = (loan?.attestationStatus ?? "NOT_STARTED") as AttestationStatus;

  const { steps } = useMemo(() => {
    const s: { id: StepId; label: string; done: boolean; active: boolean }[] = [
      { id: "attestation", label: "Attestation", done: false, active: false },
      { id: "sign", label: "Download & sign", done: false, active: false },
      { id: "upload", label: "Upload signed PDF", done: false, active: false },
      { id: "review", label: "Admin review", done: false, active: false },
      { id: "payout", label: "Disbursement", done: false, active: false },
    ];
    if (!loan) {
      return { steps: s };
    }
    const review = loan.signedAgreementReviewStatus ?? "NONE";
    const hasUpload = !!loan.agreementPath;

    s[0].done = attestationDone;
    s[1].done = attestationDone && !!loan.agreementDate;
    s[2].done = hasUpload;
    s[3].done = review === "APPROVED";
    s[4].done = false;

    let idx = 0;
    if (!attestationDone) idx = 0;
    else if (!hasUpload || review === "NONE" || review === "REJECTED") idx = 1;
    else if (review === "PENDING") idx = 3;
    else if (review === "APPROVED") idx = 4;
    else idx = 2;

    for (let i = 0; i < s.length; i++) {
      s[i].active = i === idx;
    }

    return { steps: s };
  }, [loan, attestationDone]);

  const handleDownloadPdf = () => {
    if (!loan) return;
    const d = agreementDate.trim();
    if (!d) {
      toast.error("Enter the agreement date (YYYY-MM-DD), or contact your lender.");
      return;
    }
    window.open(borrowerLoanGenerateAgreementUrl(loanId, d), "_blank", "noopener,noreferrer");
  };

  const onUpload = async (file: File) => {
    if (!loanId) return;
    setUploading(true);
    try {
      await uploadBorrowerSignedAgreement(loanId, file);
      toast.success("Signed agreement uploaded. Waiting for admin approval.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const runAttest = async (fn: () => Promise<unknown>, msg?: string) => {
    setAttestBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setAttestBusy(false);
    }
  };

  const onProceedSigning = () =>
    runAttest(() => postAttestationProceedToSigning(loanId), "You can now download and sign the agreement.");

  const onRequestMeeting = async () => {
    setAttestBusy(true);
    try {
      await postAttestationRequestMeeting(loanId);
      toast.success("Meeting requested — choose a time.");
      await refresh();
      router.push(`/loans/${loanId}/schedule-meeting`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setAttestBusy(false);
    }
  };

  const onAcceptCounter = () =>
    runAttest(async () => {
      await postAttestationAcceptCounter(loanId);
    }, "Meeting confirmed. Check your Meet link below.");

  const onDeclineCounter = () =>
    runAttest(() => postAttestationDeclineCounter(loanId), "You can pick another slot.");

  const onCompleteMeeting = () =>
    runAttest(() => postAttestationCompleteMeeting(loanId), "Attestation complete. You can now download and sign.");

  const onCancelLoan = (reason: "WITHDRAWN" | "REJECTED_AFTER_ATTESTATION") =>
    runAttest(async () => {
      await postAttestationCancelLoan(loanId, { reason });
      router.push("/loans");
    }, "Loan cancelled.");

  if (loading) {
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
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">
          {loan.attestationCancellationReason === "PROPOSAL_REJECTED_BY_LENDER"
            ? "Your meeting proposal was not accepted and this loan has been cancelled."
            : loan.attestationCancellationReason === "PROPOSAL_DEADLINE_EXPIRED"
              ? "The attestation proposal expired without a response and this loan has been cancelled."
              : `This loan was cancelled${loan.attestationCancellationReason ? ` (${loan.attestationCancellationReason})` : ""}.`}
        </p>
      </div>
    );
  }

  if (loan.status !== "PENDING_DISBURSEMENT") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">
          This page is only for loans pending disbursement. Current status: {loan.status}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/loans">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loans
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-muted/30 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Before payout</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loan.product?.name ?? "Loan"} · {formatRm(loan.principalAmount)} · {loan.term} months
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Badge variant="outline" className="shrink-0 w-fit">
              {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
            </Badge>
            <Badge variant="secondary" className="shrink-0 w-fit">
              {!loan.attestationCompletedAt ? "Pending Attestation" : "Pending disbursement"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Journey stepper */}
      <div className="rounded-lg border bg-card p-4 overflow-x-auto">
        <p className="text-xs font-medium text-muted-foreground mb-3">Your progress</p>
        <div className="flex min-w-[520px] items-center gap-1">
          {steps.map((st, i) => (
            <div key={st.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    st.done && "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    st.active && !st.done && "border-primary bg-primary/10 text-primary",
                    !st.active && !st.done && "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {st.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </div>
                <span
                  className={cn(
                    "text-[10px] text-center leading-tight px-0.5",
                    st.active ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {st.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 min-w-[12px] -mt-5 rounded-full",
                    steps[i].done ? "bg-emerald-500/50" : "bg-border"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Attestation */}
      {!attestationDone && (
        <Card className="border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Step 1 — Attestation
            </CardTitle>
            <CardDescription>
              You may watch the attestation video, or request an online meeting first. Meet links are sent
              after your lender confirms a time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {attestationStatus === "NOT_STARTED" && (
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">Choose how to start</p>
                <p className="text-xs text-muted-foreground">
                  Start by watching the attestation video or request an online meeting immediately.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button type="button" asChild>
                    <Link href={`/loans/${loanId}/watch-video`}>
                      <Video className="h-4 w-4 mr-2" />
                      Watch a video
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onRequestMeeting()}
                    disabled={attestBusy}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Request Online Meeting
                  </Button>
                </div>
              </div>
            )}

            {attestationStatus === "VIDEO_COMPLETED" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button type="button" onClick={() => void onProceedSigning()} disabled={attestBusy}>
                    Accept terms — continue to agreement signing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onRequestMeeting()}
                    disabled={attestBusy}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Request meeting — choose a time
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void onCancelLoan("WITHDRAWN")}
                    disabled={attestBusy}
                  >
                    Withdraw / cancel loan
                  </Button>
                </div>
              </div>
            )}

            {attestationStatus === "MEETING_REQUESTED" && (
              <div className="space-y-3 rounded-lg border p-4 bg-background">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Choose a meeting time
                </p>
                <p className="text-xs text-muted-foreground">
                  Pick an available slot on the scheduling page (one proposal per loan).
                </p>
                <Button type="button" asChild>
                  <Link href={`/loans/${loanId}/schedule-meeting`}>Open schedule page</Link>
                </Button>
              </div>
            )}

            {attestationStatus === "SLOT_PROPOSED" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                <p className="text-sm font-medium">Waiting for lender confirmation</p>
                {loan.attestationProposalStartAt && (
                  <p className="text-xs text-muted-foreground">
                    Your slot:{" "}
                    {new Date(loan.attestationProposalStartAt).toLocaleString("en-MY", {
                      timeZone: "Asia/Kuala_Lumpur",
                    })}
                    {loan.attestationProposalDeadlineAt && (
                      <> — respond by lender before {new Date(loan.attestationProposalDeadlineAt).toLocaleString()}</>
                    )}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  A Google Meet link appears here only after your lender accepts this time.
                </p>
              </div>
            )}

            {attestationStatus === "COUNTER_PROPOSED" && loan.attestationProposalStartAt && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="text-sm font-medium">Your lender proposed a different time</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(loan.attestationProposalStartAt).toLocaleString("en-MY", {
                    timeZone: "Asia/Kuala_Lumpur",
                  })}{" "}
                  —{" "}
                  {loan.attestationProposalEndAt
                    ? new Date(loan.attestationProposalEndAt).toLocaleTimeString("en-MY", {
                        timeZone: "Asia/Kuala_Lumpur",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </p>
                {loan.attestationProposalDeadlineAt && (
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Respond by: {new Date(loan.attestationProposalDeadlineAt).toLocaleString()}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void onAcceptCounter()} disabled={attestBusy}>
                    Accept this time
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void onDeclineCounter()} disabled={attestBusy}>
                    Decline and pick another slot
                  </Button>
                </div>
              </div>
            )}

            {attestationStatus === "MEETING_SCHEDULED" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                <p className="text-sm font-medium">Your meeting</p>
                {loan.attestationMeetingStartAt && (
                  <p className="text-xs text-muted-foreground">
                    {formatDate(loan.attestationMeetingStartAt)}
                    {loan.attestationMeetingEndAt ? ` — ${formatDate(loan.attestationMeetingEndAt)}` : ""}
                  </p>
                )}
                {loan.attestationMeetingNotes ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
                    {loan.attestationMeetingNotes}
                  </p>
                ) : null}
                {loan.attestationMeetingLink ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={loan.attestationMeetingLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Join meeting
                    </a>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Meet link not available yet — check your email or contact your lender.
                  </p>
                )}
                <Button
                  type="button"
                  className="block mt-2"
                  onClick={() => void onCompleteMeeting()}
                  disabled={attestBusy}
                >
                  I’ve completed the meeting — continue to signing
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive mt-2"
                  onClick={() => void onCancelLoan("REJECTED_AFTER_ATTESTATION")}
                  disabled={attestBusy}
                >
                  Reject agreement — cancel loan
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Signing & upload — only after attestation */}
      {attestationDone && (
        <>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Signed agreement status
              </CardTitle>
              <CardDescription>
                Disbursement can only happen after your signed agreement is uploaded and approved by us.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {reviewBadge(loan.signedAgreementReviewStatus)}
              {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && loan.signedAgreementReviewNotes && (
                <p className="text-sm text-destructive w-full mt-2">{loan.signedAgreementReviewNotes}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Download agreement PDF</CardTitle>
              <CardDescription>
                Set the agreement date, open the PDF, sign it, then upload the signed copy below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="agreement-date">Agreement date</Label>
                <Input
                  id="agreement-date"
                  type="date"
                  value={agreementDate}
                  onChange={(e) => setAgreementDate(e.target.value)}
                />
                {loan.agreementDate && (
                  <p className="text-xs text-muted-foreground">
                    On file: {formatDate(loan.agreementDate)} — adjust if needed for this download.
                  </p>
                )}
              </div>
              <Button type="button" variant="outline" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4 mr-2" />
                Download agreement PDF
              </Button>
            </CardContent>
          </Card>

          <Card className="border-dashed border-2">
            <CardHeader>
              <CardTitle className="text-base">Upload signed agreement</CardTitle>
              <CardDescription>
                PDF only, max size per lender settings. Uploading replaces any previous file and sends it
                for admin review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label
                htmlFor="signed-agreement-upload"
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-10 text-center cursor-pointer transition-colors",
                  uploading ? "opacity-60 pointer-events-none" : "hover:border-primary/50 hover:bg-primary/5"
                )}
              >
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Drop your signed PDF here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Signed loan agreement (PDF)</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  id="signed-agreement-upload"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <Button type="button" disabled={uploading} asChild>
                  <label htmlFor="signed-agreement-upload" className="cursor-pointer">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Choose PDF
                  </label>
                </Button>
                {loan.agreementPath && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(borrowerLoanViewSignedAgreementUrl(loanId), "_blank", "noopener,noreferrer")
                    }
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View uploaded
                  </Button>
                )}
              </div>
              {loan.agreementOriginalName && (
                <p className="text-xs text-muted-foreground text-center sm:text-left">
                  Last file: <span className="font-medium text-foreground">{loan.agreementOriginalName}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
