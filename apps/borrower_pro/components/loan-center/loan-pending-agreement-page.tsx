"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Fingerprint,
  Loader2,
  ShieldCheck,
  Video,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";
import {
  getBorrowerLoan,
  borrowerLoanViewSignedAgreementUrl,
  postAttestationProceedToSigning,
  postAttestationRequestMeeting,
  postAttestationAcceptCounter,
  postAttestationDeclineCounter,
  postAttestationCancelLoan,
} from "../../lib/borrower-loans-client";
import { fetchBorrower, getTruestackKycStatusWithActiveSessionSync } from "../../lib/borrower-api-client";
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
import dynamic from "next/dynamic";
import { DigitalCertificateStep } from "./digital-certificate-step";

const AgreementSigningView = dynamic(
  () => import("./agreement-signing-view").then((m) => m.AgreementSigningView),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-xl" /> }
);

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

type StepId = "attestation" | "ekyc" | "certificate" | "sign" | "review";

export function LoanPendingAgreementPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [attestBusy, setAttestBusy] = useState(false);
  const [journeyUiStep, setJourneyUiStep] = useState<"attestation" | "ekyc" | "certificate" | "sign" | "lender_review">("attestation");
  const [showMeetingConfirm, setShowMeetingConfirm] = useState(false);
  const [preDisbursementTab, setPreDisbursementTab] = useState<"loan" | "agreement">("agreement");
  const attestationDoneSeenRef = useRef(false);
  const [kycDone, setKycDone] = useState(false);
  const [kycLoading, setKycLoading] = useState(true);
  const [certDone, setCertDone] = useState(() => {
    try {
      return sessionStorage.getItem(`cert_done_${loanId}`) === "1";
    } catch {
      return false;
    }
  });
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
        getTruestackKycStatusWithActiveSessionSync().catch(() => null),
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
    if (searchParams.get("focus") !== "attestation" || !loanId) return;
    setPreDisbursementTab("agreement");
    setJourneyUiStep("attestation");
    router.replace(`/loans/${loanId}`, { scroll: false });
  }, [searchParams, loanId, router]);

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
    if (!certDone) {
      setJourneyUiStep("certificate");
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
  }, [loan, loan?.id, loan?.signedAgreementReviewStatus, attestationDone, requiresAttestation, journeyUiStep, kycDone, kycLoading, certDone]);

  const { steps } = useMemo(() => {
    const s: { id: StepId; label: string; done: boolean; active: boolean }[] = [];
    if (requiresAttestation) {
      s.push({ id: "attestation", label: "Attestation", done: false, active: false });
    }
    s.push({ id: "ekyc", label: "e-KYC", done: false, active: false });
    s.push({ id: "certificate", label: "Certificate", done: false, active: false });
    s.push({ id: "sign", label: "Sign agreement", done: false, active: false });
    s.push({ id: "review", label: "Lender review", done: false, active: false });
    if (!loan) {
      return { steps: s };
    }
    const review = loan.signedAgreementReviewStatus ?? "NONE";
    const hasUpload = !!loan.agreementPath;
    const canStartSigning = (!requiresAttestation || attestationDone) && kycDone && certDone;

    let stepCursor = 0;
    if (requiresAttestation) {
      s[stepCursor].done = attestationDone;
      stepCursor++;
    }
    s[stepCursor].done = kycDone;
    stepCursor++;
    s[stepCursor].done = certDone;
    stepCursor++;
    s[stepCursor].done =
      canStartSigning &&
      hasUpload &&
      (review === "PENDING" || review === "APPROVED");
    stepCursor++;
    s[stepCursor].done = review === "APPROVED";

    const stepIdToIdx = new Map(s.map((st, i) => [st.id, i]));
    let activeIdx = 0;
    if (requiresAttestation && !attestationDone) {
      activeIdx = stepIdToIdx.get("attestation") ?? 0;
    } else if (journeyUiStep === "attestation" && requiresAttestation) {
      activeIdx = stepIdToIdx.get("attestation") ?? 0;
    } else if (journeyUiStep === "ekyc") {
      activeIdx = stepIdToIdx.get("ekyc") ?? 0;
    } else if (journeyUiStep === "certificate") {
      activeIdx = stepIdToIdx.get("certificate") ?? 0;
    } else if (journeyUiStep === "sign") {
      activeIdx = stepIdToIdx.get("sign") ?? 0;
    } else {
      activeIdx = stepIdToIdx.get("review") ?? 0;
    }

    for (let i = 0; i < s.length; i++) {
      s[i].active = i === activeIdx;
    }

    return { steps: s };
  }, [loan, attestationDone, requiresAttestation, kycDone, certDone, journeyUiStep]);

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
      if (stepId === "certificate") {
        if (requiresAttestation && !attestationDone) {
          toast.error("Complete attestation first.");
          return;
        }
        if (!kycDone) {
          toast.error("Complete e-KYC first.");
          setJourneyUiStep("ekyc");
          return;
        }
        setJourneyUiStep("certificate");
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
      if (!certDone) {
        toast.error("Get your digital certificate first.");
        setJourneyUiStep("certificate");
        return;
      }
      if (stepId === "sign") {
        if (review === "PENDING" || review === "APPROVED") {
          toast.info("The signed agreement is already with your lender.");
          return;
        }
        setJourneyUiStep("sign");
        return;
      }
      if (review === "PENDING" || review === "APPROVED") {
        setJourneyUiStep("lender_review");
        return;
      }
      if (!may) return;
      if (!loan.agreementPath) {
        toast.error("Sign your agreement first.");
        return;
      }
      setJourneyUiStep("lender_review");
    },
    [loan, attestationDone, requiresAttestation, kycDone, certDone]
  );

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
    setShowMeetingConfirm(false);
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
  const canStartSigning = (!requiresAttestation || attestationDone) && kycDone && certDone;
  const attestationStepNumber = requiresAttestation ? 1 : null;
  const ekycStepNumber = requiresAttestation ? 2 : 1;
  const certStepNumber = requiresAttestation ? 3 : 2;
  const signStepNumber = requiresAttestation ? 4 : 3;

  if (isPreDisbursement && loan.loanChannel === "PHYSICAL") {
    return (
      <div className="w-full min-w-0 space-y-6 pb-12">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Awaiting disbursement</span>
            <Badge variant={borrowerLoanStatusBadgeVariant(loan)}>{loanStatusBadgeLabelFromDb(loan)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            This physical loan does not require any more borrower action here. Your lender will handle the remaining
            disbursement steps and your repayment schedule will appear once funds are released.
          </p>
        </div>
        <BorrowerLoanServicingPanel loanId={loanId} loan={loan} onRefresh={() => void refresh()} />
      </div>
    );
  }

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
              <Button type="button" onClick={() => setJourneyUiStep(kycDone ? (certDone ? "sign" : "certificate") : "ekyc")}>
                {kycDone ? (certDone ? "Go to Sign Agreement" : "Go to Certificate") : "Go to e-KYC"}
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
              You may watch the attestation video, or request an online meeting with a lawyer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {attestationStatus === "NOT_STARTED" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                  href={`/loans/${loanId}/watch-video`}
                  className={cn(
                    "relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all block",
                    "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                      <Video className="h-5 w-5" />
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                      <Clock3 className="h-3.5 w-3.5" />
                      About 5 mins
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Attestation video
                  </span>
                  <span className="mt-1 block text-2xl font-bold tracking-tight">Watch video</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    Instant option. Watch the required video and continue as soon as you finish.
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowMeetingConfirm(true)}
                  disabled={attestBusy}
                  className={cn(
                    "relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all w-full",
                    "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
                    "disabled:opacity-50 disabled:pointer-events-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                      <Users className="h-5 w-5" />
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                      <Clock3 className="h-3.5 w-3.5" />
                      2 - 3 business days
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Online meeting
                  </span>
                  <span className="mt-1 block text-xl font-semibold tracking-tight">Request online meeting</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    Schedule an online meeting with a lawyer to explain the terms of your loan before you continue.
                  </span>
                </button>
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

      <Dialog open={showMeetingConfirm} onOpenChange={setShowMeetingConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Video attestation is faster</DialogTitle>
            <DialogDescription>
              The attestation video usually takes about 5 minutes. An online meeting usually takes 2 - 3
              business days because your lender needs to arrange a lawyer session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium text-foreground">Recommended: Watch the video</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This is the instant option and lets you move forward right away once the video is complete.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">Online meeting</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This schedules an online meeting with a lawyer who will explain the loan terms, but it may
                take 2 - 3 business days before a session is available.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowMeetingConfirm(false);
                router.push(`/loans/${loanId}/watch-video`);
              }}
            >
              Use video instead
            </Button>
            <Button type="button" onClick={() => void onRequestMeeting()} disabled={attestBusy}>
              {attestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue to online meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              You can now proceed to get your digital signing certificate.
            </p>
            <Button type="button" onClick={() => setJourneyUiStep("certificate")}>
              Go to Digital Certificate
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Digital certificate step — after e-KYC, before signing */}
      {kycDone && (!requiresAttestation || attestationDone) && journeyUiStep === "certificate" && (
        <DigitalCertificateStep
          stepNumber={certStepNumber}
          onCertReady={() => {
            setCertDone(true);
            try { sessionStorage.setItem(`cert_done_${loanId}`, "1"); } catch {}
            setJourneyUiStep("sign");
          }}
        />
      )}

      {/* Signing & upload — only after required pre-signing steps */}
      {canStartSigning && (
        <>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Signed agreement status
              </CardTitle>
              <CardDescription>
                Your agreement is digitally signed using PKI. Your lender reviews the signed document
                before proceeding with disbursement.
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
            <AgreementSigningView
              loan={loan}
              loanId={loanId}
              stepNumber={signStepNumber}
              onSignComplete={async () => {
                await refresh();
                setJourneyUiStep("lender_review");
              }}
              onBack={() => setJourneyUiStep("certificate")}
            />
          )}

          {journeyUiStep === "lender_review" && (
            <Card className="border-success/25 bg-success/5 shadow-sm overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  Lender review
                </CardTitle>
                <CardDescription>
                  Your agreement has been digitally signed and submitted for your lender to review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    {reviewBadge(loan.signedAgreementReviewStatus)}
                  </p>
                  {loan.agreementUploadedAt && (
                    <p>
                      <span className="text-muted-foreground">Signed on:</span>{" "}
                      {formatDate(loan.agreementUploadedAt)}
                    </p>
                  )}
                  {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && loan.signedAgreementReviewNotes && (
                    <p className="text-sm text-destructive mt-2">{loan.signedAgreementReviewNotes}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {loan.agreementPath && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(borrowerLoanViewSignedAgreementUrl(loanId), "_blank", "noopener,noreferrer")
                      }
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download signed agreement
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {(loan.signedAgreementReviewStatus ?? "NONE") === "APPROVED"
                    ? "Your agreement has been approved. Your lender will proceed with disbursement."
                    : (loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED"
                      ? "Your lender has requested changes. Please contact them for further instructions."
                      : "Your lender will review and approve the signed agreement. No further action is needed from you at this time."}
                </p>
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
/*  Digital Signing Card                                              */
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
