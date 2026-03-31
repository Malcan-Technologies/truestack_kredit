"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Fingerprint,
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
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
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
  postAttestationCancelLoan,
} from "../../lib/borrower-loans-client";
import { fetchBorrower, getTruestackKycStatus } from "../../lib/borrower-api-client";
import type {
  BorrowerLoanDetail,
  SignedAgreementReviewStatus,
  AttestationStatus,
} from "../../lib/borrower-loan-types";
import { toAmountNumber } from "../../lib/application-form-validation";
import { useSession } from "../../lib/auth-client";
import { borrowerLoanStatusBadgeVariant, loanStatusBadgeLabelFromDb } from "../../lib/loan-status-label";
import { BorrowerLoanServicingPanel } from "./borrower-loan-servicing-panel";
import { TruestackKycCard } from "../truestack-kyc-card";
import { isBorrowerKycComplete } from "../../lib/borrower-verification";

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
      return <Badge className="bg-success text-background">Approved</Badge>;
    case "PENDING":
      return <Badge variant="secondary">Awaiting lender review</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected — upload again</Badge>;
    default:
      return <Badge variant="outline">Not uploaded</Badge>;
  }
}

type StepId = "attestation" | "ekyc" | "sign" | "review";

export function LoanPendingAgreementPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [agreementDate, setAgreementDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attestBusy, setAttestBusy] = useState(false);
  /** Selected locally; server upload runs only when submitting from Lender review. */
  const [pendingSignedFile, setPendingSignedFile] = useState<File | null>(null);
  /** Which journey panel is shown (stepper + back). Upload is never sent until Submit on lender review. */
  const [journeyUiStep, setJourneyUiStep] = useState<"attestation" | "ekyc" | "sign" | "lender_review">("attestation");
  const [confirmSendToLender, setConfirmSendToLender] = useState(false);
  /** Pre-disbursement: switch between full loan detail (like active, no payment) and agreement steps. */
  const [preDisbursementTab, setPreDisbursementTab] = useState<"loan" | "agreement">("agreement");
  const attestationDoneSeenRef = useRef(false);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const signStageFileInputRef = useRef<HTMLInputElement>(null);
  const [kycDone, setKycDone] = useState(false);
  const [kycLoading, setKycLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!loanId) return;
    const r = await getBorrowerLoan(loanId);
    if (r.success) {
      setLoan(r.data);
    }
  }, [loanId]);

  const attestationMeetNotifyEmail = useMemo(
    () => loan?.borrower?.email?.trim() || session?.user?.email?.trim() || null,
    [loan?.borrower?.email, session?.user?.email]
  );

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

  const loadKyc = useCallback(async () => {
    setKycLoading(true);
    try {
      const [borrowerRes, kycRes] = await Promise.all([
        fetchBorrower(),
        getTruestackKycStatus().catch(() => null),
      ]);
      if (borrowerRes.success) {
        setKycDone(isBorrowerKycComplete(borrowerRes.data, kycRes?.success ? kycRes.data : null));
      } else {
        setKycDone(false);
      }
    } catch {
      setKycDone(false);
    } finally {
      setKycLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loanId) {
      setKycLoading(false);
      return;
    }
    void loadKyc();
  }, [loanId, loadKyc]);

  useEffect(() => {
    attestationDoneSeenRef.current = false;
  }, [loanId]);

  useEffect(() => {
    if (loan?.agreementDate) {
      setAgreementDate(agreementIsoToDateInput(loan.agreementDate));
    }
  }, [loan?.agreementDate]);

  useEffect(() => {
    if (!pendingSignedFile) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingSignedFile);
    setPendingPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingSignedFile]);

  useEffect(() => {
    setConfirmSendToLender(false);
  }, [pendingSignedFile]);


  const attestationDone = !!loan?.attestationCompletedAt;
  const attestationStatus = (loan?.attestationStatus ?? "NOT_STARTED") as AttestationStatus;
  const requiresAttestation = loan?.loanChannel !== "PHYSICAL";

  useEffect(() => {
    if (!loan) return;
    if (requiresAttestation && !attestationDone) {
      attestationDoneSeenRef.current = false;
      setJourneyUiStep("attestation");
      return;
    }
    if (!requiresAttestation && journeyUiStep === "attestation") {
      setJourneyUiStep("ekyc");
    }
    if (kycLoading) return;
    if (!kycDone) {
      setJourneyUiStep("ekyc");
      return;
    }
    const review = loan.signedAgreementReviewStatus ?? "NONE";
    if (review === "PENDING" || review === "APPROVED") {
      setJourneyUiStep("lender_review");
      attestationDoneSeenRef.current = true;
      return;
    }
    if (!attestationDoneSeenRef.current) {
      attestationDoneSeenRef.current = true;
      setJourneyUiStep("sign");
    }
  }, [loan, loan?.id, loan?.signedAgreementReviewStatus, attestationDone, requiresAttestation, journeyUiStep, kycDone, kycLoading]);

  const { steps } = useMemo(() => {
    const s: { id: StepId; label: string; done: boolean; active: boolean }[] = [];
    if (requiresAttestation) {
      s.push({ id: "attestation", label: "Attestation", done: false, active: false });
    }
    s.push({ id: "ekyc", label: "e-KYC", done: false, active: false });
    s.push({ id: "sign", label: "Download & sign", done: false, active: false });
    s.push({ id: "review", label: "Lender review", done: false, active: false });
    if (!loan) {
      return { steps: s };
    }
    const review = loan.signedAgreementReviewStatus ?? "NONE";
    const hasUpload = !!loan.agreementPath;
    const canStartSigning = (!requiresAttestation || attestationDone) && kycDone;

    let stepCursor = 0;
    if (requiresAttestation) {
      s[stepCursor].done = attestationDone;
      stepCursor++;
    }
    s[stepCursor].done = kycDone;
    stepCursor++;
    s[stepCursor].done =
      canStartSigning &&
      !!loan.agreementDate &&
      (journeyUiStep === "lender_review" ||
        !!pendingSignedFile ||
        hasUpload ||
        review === "PENDING" ||
        review === "APPROVED");
    stepCursor++;
    s[stepCursor].done = review === "APPROVED";

    let idx = 0;
    if (requiresAttestation && !attestationDone) idx = 0;
    else if (journeyUiStep === "attestation" && requiresAttestation) idx = 0;
    else if (journeyUiStep === "ekyc") idx = requiresAttestation ? 1 : 0;
    else if (journeyUiStep === "sign") idx = requiresAttestation ? 2 : 1;
    else idx = requiresAttestation ? 3 : 2;

    for (let i = 0; i < s.length; i++) {
      s[i].active = i === idx;
    }

    return { steps: s };
  }, [loan, attestationDone, requiresAttestation, kycDone, journeyUiStep, pendingSignedFile]);

  const onJourneyStepClick = useCallback(
    (stepId: StepId) => {
      if (!loan) return;
      const review = loan.signedAgreementReviewStatus ?? "NONE";
      const may = review === "NONE" || review === "REJECTED";
      if (stepId === "attestation") {
        setJourneyUiStep("attestation");
        return;
      }
      if (stepId === "ekyc") {
        if (requiresAttestation && !attestationDone) {
          toast.error("Complete attestation first.");
          return;
        }
        setJourneyUiStep("ekyc");
        return;
      }
      if (requiresAttestation && !attestationDone) {
        toast.error("Complete attestation first.");
        return;
      }
      if (!kycDone) {
        toast.error("Complete e-KYC first.");
        setJourneyUiStep("ekyc");
        return;
      }
      if (stepId === "sign") {
        if (review === "PENDING" || review === "APPROVED") {
          toast.info("The signed agreement is already with your lender.");
          return;
        }
        setJourneyUiStep("sign");
        setConfirmSendToLender(false);
        return;
      }
      if (review === "PENDING" || review === "APPROVED") {
        setJourneyUiStep("lender_review");
        return;
      }
      if (!may) return;
      if (!pendingSignedFile) {
        toast.error("Upload your signed PDF on Download & sign first.");
        return;
      }
      setJourneyUiStep("lender_review");
      setConfirmSendToLender(false);
    },
    [loan, attestationDone, requiresAttestation, kycDone, pendingSignedFile]
  );

  const handleDownloadPdf = () => {
    if (!loan) return;
    const d = agreementDate.trim();
    if (!d) {
      toast.error("Enter the agreement date (YYYY-MM-DD), or contact your lender.");
      return;
    }
    window.open(borrowerLoanGenerateAgreementUrl(loanId, d), "_blank", "noopener,noreferrer");
  };

  const validateSignedPdf = (file: File): boolean => {
    const okType = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!okType) {
      toast.error("Please choose a PDF file.");
      return false;
    }
    return true;
  };

  const onSignedPdfSelected = (file: File | undefined) => {
    if (!file) return;
    if (!validateSignedPdf(file)) return;
    setPendingSignedFile(file);
  };

  const clearPendingSignedFile = () => {
    setPendingSignedFile(null);
    if (signStageFileInputRef.current) signStageFileInputRef.current.value = "";
  };

  const submitSignedAgreement = async () => {
    if (!loanId || !pendingSignedFile) return;
    const d = agreementDate.trim();
    if (!d) {
      toast.error("Set the agreement date first.");
      return;
    }
    if (!confirmSendToLender) {
      toast.error("Confirm that you have reviewed the document before sending it to your lender.");
      return;
    }
    setUploading(true);
    try {
      await uploadBorrowerSignedAgreement(loanId, pendingSignedFile, d);
      toast.success("Signed agreement sent to your lender for review.");
      clearPendingSignedFile();
      setConfirmSendToLender(false);
      await refresh();
      router.push(`/loans/${loanId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const goToLenderReview = () => {
    const d = agreementDate.trim();
    if (!d) {
      toast.error("Set the agreement date first.");
      return;
    }
    if (!pendingSignedFile) {
      toast.error("Upload your signed PDF on this step before continuing.");
      return;
    }
    setJourneyUiStep("lender_review");
    setConfirmSendToLender(false);
  };

  const backToSignStep = () => {
    setJourneyUiStep("sign");
    setConfirmSendToLender(false);
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
    runAttest(() => postAttestationProceedToSigning(loanId), "Attestation complete. Continue with e-KYC.");

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

  const onCancelLoan = (reason: "WITHDRAWN" | "REJECTED_AFTER_ATTESTATION") =>
    runAttest(async () => {
      await postAttestationCancelLoan(loanId, { reason });
      router.push("/loans");
    }, "Loan cancelled.");

  if (loading) {
    return <LoanDetailSkeleton />;
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

  const isPreDisbursement = loan.status === "PENDING_DISBURSEMENT" || loan.status === "PENDING_ATTESTATION";
  const isServicingView =
    loan.status === "ACTIVE" ||
    loan.status === "IN_ARREARS" ||
    loan.status === "DEFAULTED" ||
    loan.status === "COMPLETED";

  const agreementReview = loan.signedAgreementReviewStatus ?? "NONE";
  const mayStageSignedPdf = agreementReview === "NONE" || agreementReview === "REJECTED";
  /** Submitted to lender — hide Before payout stepper/cards; show repayment schedule only. */
  const awaitingLenderReview = agreementReview === "PENDING";
  const canStartSigning = (!requiresAttestation || attestationDone) && kycDone;
  const attestationStepNumber = requiresAttestation ? 1 : null;
  const ekycStepNumber = requiresAttestation ? 2 : 1;
  const signStepNumber = requiresAttestation ? 3 : 2;

  if (!isPreDisbursement) {
    if (isServicingView) {
      return (
        <BorrowerLoanServicingPanel loanId={loanId} loan={loan} onRefresh={() => void refresh()} />
      );
    }
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">
          This loan cannot be opened here. Current status: {loan.status.replace(/_/g, " ")}
        </p>
      </div>
    );
  }

  if (awaitingLenderReview) {
    return (
      <div className="w-full min-w-0 space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/loans">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to loans
            </Link>
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Agreement submitted</span>
            <Badge variant="secondary">Awaiting lender review</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Your signed agreement is with your lender. You do not need to take further action here until they
            respond. Below is your expected repayment schedule — due dates and amounts apply after the loan is
            disbursed.
          </p>
        </div>
        <BorrowerLoanServicingPanel
          loanId={loanId}
          loan={loan}
          onRefresh={() => void refresh()}
          hideBackLink
        />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-8 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/loans">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loans
          </Link>
        </Button>
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 shrink-0">
          <Button
            type="button"
            size="sm"
            variant={preDisbursementTab === "loan" ? "default" : "ghost"}
            className="rounded-md"
            onClick={() => setPreDisbursementTab("loan")}
          >
            Loan details
          </Button>
          <Button
            type="button"
            size="sm"
            variant={preDisbursementTab === "agreement" ? "default" : "ghost"}
            className="rounded-md"
            onClick={() => setPreDisbursementTab("agreement")}
          >
            Before payout
          </Button>
        </div>
      </div>

      {preDisbursementTab === "loan" ? (
        <BorrowerLoanServicingPanel loanId={loanId} loan={loan} onRefresh={() => void refresh()} hideBackLink />
      ) : (
        <>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Before payout</h1>
            <p className="text-muted text-base mt-1">
              {loan.product?.name ?? "Loan"} · {formatRm(loan.principalAmount)} · {loan.term} months
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Badge variant="outline" className="shrink-0 w-fit">
              {loan.loanChannel === "PHYSICAL" ? "Physical loan" : "Online loan"}
            </Badge>
            <Badge variant={borrowerLoanStatusBadgeVariant(loan)} className="shrink-0 w-fit">
              {loanStatusBadgeLabelFromDb(loan)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Journey stepper */}
      <div className="rounded-lg border bg-card p-4 overflow-x-auto">
        <p className="text-xs font-medium text-muted-foreground mb-3">Your progress</p>
        <div className="flex min-w-[280px] items-center gap-1">
          {steps.map((st, i) => (
            <div key={st.id} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onJourneyStepClick(st.id)}
                className="flex flex-col items-center gap-1 flex-1 min-w-0 rounded-md p-1 -m-1 hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    st.done && "border-success bg-success/15 text-success",
                    st.active && !st.done && "border-foreground/50 bg-foreground/5 text-foreground",
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
              </button>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 min-w-[12px] -mt-5 rounded-full pointer-events-none",
                    steps[i].done ? "bg-success/50" : "bg-border"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Attestation — completed (read-only); use stepper to return here */}
      {requiresAttestation && attestationDone && journeyUiStep === "attestation" && (
        <Card className="border-success/25 bg-success/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Step {attestationStepNumber} — Attestation complete
            </CardTitle>
            <CardDescription>
              You can revisit earlier steps anytime from the progress bar above. Your signed PDF is only sent when
              you submit on Lender review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loan.attestationCompletedAt && (
              <p className="text-sm text-muted-foreground">
                Completed:{" "}
                {new Date(loan.attestationCompletedAt).toLocaleString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                })}
              </p>
            )}
            {loan.attestationVideoCompletedAt && (
              <p className="text-xs text-muted-foreground">Attestation video was completed.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/loans/${loanId}/watch-video`}>
                  <Video className="h-4 w-4 mr-2" />
                  Open attestation video
                </Link>
              </Button>
              <Button type="button" onClick={() => setJourneyUiStep(kycDone ? "sign" : "ekyc")}>
                {kycDone ? "Go to Download & sign" : "Go to e-KYC"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attestation */}
      {requiresAttestation && !attestationDone && (
        <Card className="border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Step {attestationStepNumber} — Attestation
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
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
                <p className="text-sm font-medium">Waiting for lender confirmation</p>
                {loan.attestationProposalStartAt && (
                  <p className="text-xs text-muted-foreground">
                    Your slot:{" "}
                    {new Date(loan.attestationProposalStartAt).toLocaleString("en-MY", {
                      timeZone: "Asia/Kuala_Lumpur",
                    })}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  A Google Meet link appears here only after your lender accepts this time. We will also
                  email the same link to{" "}
                  {attestationMeetNotifyEmail ? (
                    <span className="font-medium text-foreground break-all">{attestationMeetNotifyEmail}</span>
                  ) : (
                    <span className="font-medium text-foreground">your account email</span>
                  )}
                  .
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
                  <p className="text-xs text-warning-foreground">
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
              <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-2">
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
                <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/20">
                  Your lender will mark the meeting complete after it ends. Once confirmed, you can continue to e-KYC
                  and signing.
                </p>
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

      {!kycDone && (!requiresAttestation || attestationDone) && (
        <Card className="border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              Step {ekycStepNumber} — e-KYC
            </CardTitle>
            <CardDescription>
              Complete identity verification before signing. Your verified e-KYC data will be used when issuing the
              digital certificate for signing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kycLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking your e-KYC status...
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  If you already completed e-KYC, this step will unlock automatically. Otherwise, start or resume your
                  TrueStack e-KYC below.
                </div>
                <TruestackKycCard
                  onStatusLoaded={() => {
                    void loadKyc();
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {kycDone && journeyUiStep === "ekyc" && (
        <Card className="border-success/25 bg-success/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Step {ekycStepNumber} — e-KYC complete
            </CardTitle>
            <CardDescription>
              Your identity verification is ready for digital signing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You can now proceed to download, sign, and upload your agreement.
            </p>
            <Button type="button" onClick={() => setJourneyUiStep("sign")}>
              Go to Download &amp; sign
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Signing & upload — only after required pre-signing steps */}
      {canStartSigning && (
        <>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Signed agreement status
              </CardTitle>
              <CardDescription>
                Your lender reviews the signed PDF after you submit it. Payout and any later steps are handled
                outside this screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {reviewBadge(loan.signedAgreementReviewStatus)}
              {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && loan.signedAgreementReviewNotes && (
                <p className="text-sm text-destructive w-full mt-2">{loan.signedAgreementReviewNotes}</p>
              )}
            </CardContent>
          </Card>

          {mayStageSignedPdf && journeyUiStep === "sign" && (
            <Card className="border-border/80 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-muted/30">
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  Download &amp; sign
                </CardTitle>
                <CardDescription>
                  Set the agreement date, download and sign the PDF, then upload the signed copy here. You can
                  continue to <span className="font-medium text-foreground">Lender review</span> only after a
                  file is selected. Nothing is sent to your lender until you submit on the next step.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
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
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 pt-2 border-t border-border/60">
                  <Button type="button" variant="outline" onClick={handleDownloadPdf} className="w-full sm:w-auto shrink-0">
                    <Download className="h-4 w-4 mr-2" />
                    Download agreement PDF
                  </Button>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Signed agreement (PDF)</Label>
                  <label
                    htmlFor="signed-agreement-upload-sign"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const f = e.dataTransfer.files?.[0];
                      if (f) onSignedPdfSelected(f);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/15 px-6 py-8 text-center cursor-pointer transition-colors",
                      "hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    <Upload className="h-9 w-9 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Drop your signed PDF here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">Required before you can continue</p>
                    </div>
                    <input
                      ref={signStageFileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      id="signed-agreement-upload-sign"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onSignedPdfSelected(f);
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <label htmlFor="signed-agreement-upload-sign" className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        Choose PDF
                      </label>
                    </Button>
                    {loan.agreementPath ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            borrowerLoanViewSignedAgreementUrl(loanId),
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View previous upload
                      </Button>
                    ) : null}
                  </div>
                  {pendingSignedFile ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Selected for next step</p>
                        <p className="text-sm font-medium break-all">{pendingSignedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(pendingSignedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {pendingPreviewUrl ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              window.open(pendingPreviewUrl, "_blank", "noopener,noreferrer")
                            }
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            clearPendingSignedFile();
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Upload a signed PDF to enable Continue.</p>
                  )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border/60">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setJourneyUiStep("ekyc")}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to e-KYC
                  </Button>
                  <Button
                    type="button"
                    onClick={goToLenderReview}
                    className="w-full sm:w-auto"
                    disabled={!agreementDate.trim() || !pendingSignedFile}
                  >
                    Continue to lender review
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {mayStageSignedPdf && journeyUiStep === "lender_review" && (
            <Card className="border-primary/25 shadow-md overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-primary/5">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Lender review
                </CardTitle>
                <CardDescription>
                  Review the PDF below (same file you chose on Download &amp; sign). Your lender is notified only
                  after you check the box and click Submit. To pick a different file, use Back to Download &amp;
                  sign.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {pendingSignedFile && pendingPreviewUrl ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground break-all">{pendingSignedFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(pendingSignedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() =>
                          window.open(pendingPreviewUrl, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in new tab
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden shadow-inner">
                      <iframe
                        title="Signed agreement PDF preview"
                        src={`${pendingPreviewUrl}#view=FitH`}
                        className="w-full min-h-[min(70vh,640px)] border-0 bg-background block"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      If the preview does not load in your browser, use &quot;Open in new tab&quot;. To change the
                      file, go back to Download &amp; sign.
                    </p>
                    {loan.agreementPath ? (
                      <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
                        Submitting will replace the previously uploaded agreement on file.
                      </p>
                    ) : null}
                  </div>
                ) : loan.agreementPath ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">No new file selected</p>
                    <p className="break-all mb-2">{loan.agreementOriginalName ?? "—"}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          borrowerLoanViewSignedAgreementUrl(loanId),
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View file on record
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4">
                    No PDF to show. Use &quot;Back to Download &amp; sign&quot; to upload your signed agreement.
                  </p>
                )}

                <div className="flex flex-row items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-4">
                  <Checkbox
                    id="confirm-send-agreement"
                    checked={confirmSendToLender}
                    onCheckedChange={(v) => setConfirmSendToLender(v === true)}
                    disabled={uploading}
                  />
                  <label htmlFor="confirm-send-agreement" className="text-sm leading-snug cursor-pointer">
                    I have reviewed this signed agreement and I am ready to send it to my lender for review.
                  </label>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2 border-t border-border/60">
                  <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-start">
                    <Button type="button" variant="outline" onClick={backToSignStep} disabled={uploading}>
                      Back to Download &amp; sign
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setJourneyUiStep("ekyc")}
                      disabled={uploading}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      e-KYC
                    </Button>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void submitSignedAgreement()}
                    disabled={uploading || !pendingSignedFile || !confirmSendToLender}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Submit for lender review
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                          */
/* ------------------------------------------------------------------ */

function LoanDetailSkeleton() {
  return (
    <div className="w-full min-w-0 space-y-8 pb-12">
      {/* Back button + tab toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>

      {/* Header card */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="rounded-lg border bg-card p-4">
        <Skeleton className="h-3 w-24 mb-3" />
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 flex-1">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-2.5 w-16" />
              </div>
              {i < 2 && <Skeleton className="h-0.5 flex-1 min-w-[12px] -mt-5 rounded-full" />}
            </div>
          ))}
        </div>
      </div>

      {/* Content card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-full max-w-md mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-72" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-36 rounded-md" />
              <Skeleton className="h-9 w-44 rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
