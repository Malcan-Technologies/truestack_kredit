"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Eraser,
  FileText,
  Loader2,
  Mail,
  PenTool,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  fetchAgreementPreview,
  requestSigningOTP,
  signAgreement,
} from "../../lib/borrower-signing-client";
import type { BorrowerLoanDetail } from "../../lib/borrower-loan-types";

type Phase =
  | "loading"
  | "review"
  | "otp_requesting"
  | "otp_sent"
  | "signing"
  | "signed";

function signingOtpKey(loanId: string) {
  return `signing_otp_sent_${loanId}`;
}

interface Props {
  loan: BorrowerLoanDetail;
  loanId: string;
  stepNumber: number;
  onSignComplete: () => Promise<void>;
  onBack: () => void;
}

export function AgreementSigningView({
  loan,
  loanId,
  stepNumber,
  onSignComplete,
  onBack,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    let revoke: (() => void) | null = null;
    async function loadPreview() {
      try {
        const blob = await fetchAgreementPreview(loanId);
        const url = URL.createObjectURL(blob);
        revoke = () => URL.revokeObjectURL(url);
        setPdfUrl(url);
        setPhase("review");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to load agreement");
        setPhase("review");
      }
    }
    void loadPreview();
    return () => revoke?.();
  }, [loanId]);

  useEffect(() => {
    if (phase !== "review" || signatureDataUrl) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#1a1a2e",
      minWidth: 1.5,
      maxWidth: 3,
    });
    sigPadRef.current = pad;

    return () => {
      pad.off();
      sigPadRef.current = null;
    };
  }, [phase, signatureDataUrl]);

  useEffect(() => {
    if (phase !== "signed") return;
    if (countdown <= 0) {
      void onSignComplete();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, onSignComplete]);

  const handleClearSignature = useCallback(() => {
    sigPadRef.current?.clear();
    setSignatureDataUrl(null);
  }, []);

  const handleConfirmSignature = useCallback(() => {
    const pad = sigPadRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Please draw your signature first.");
      return;
    }
    const dataUrl = pad.toDataURL("image/png");
    setSignatureDataUrl(dataUrl);
  }, []);

  const handleRequestOtp = async () => {
    setBusy(true);
    setErrorMsg(null);
    setPhase("otp_requesting");
    try {
      const result = await requestSigningOTP();
      if (result.success) {
        setPhase("otp_sent");
        if (result.email) setOtpEmail(result.email);
        try {
          sessionStorage.setItem(signingOtpKey(loanId), String(Date.now()));
        } catch {}
        toast.success(
          result.email
            ? `Signing OTP sent to ${result.email}`
            : "Signing OTP sent to your registered email address."
        );
      } else {
        setPhase("review");
        setErrorMsg(
          result.errorDescription || result.statusMsg || "Failed to send OTP"
        );
      }
    } catch (e) {
      setPhase("review");
      setErrorMsg(e instanceof Error ? e.message : "Failed to request OTP");
    } finally {
      setBusy(false);
    }
  };

  const handleSign = async () => {
    if (!otpValue.trim()) {
      toast.error("Enter the OTP from your email.");
      return;
    }
    if (!signatureDataUrl) {
      toast.error("Signature is required.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setPhase("signing");
    try {
      const result = await signAgreement(
        loanId,
        otpValue.trim(),
        signatureDataUrl
      );
      if (result.success) {
        setPhase("signed");
        setCountdown(5);
        try {
          sessionStorage.removeItem(signingOtpKey(loanId));
        } catch {}
        toast.success(
          "Agreement signed successfully! Submitted for lender review."
        );
      } else {
        setPhase("otp_sent");
        setOtpValue("");
        const desc = result.errorDescription || "";
        const msg = result.statusMsg || "";
        const code = result.statusCode || "";
        const isOtpError =
          /otp|authfactor|auth.factor/i.test(desc + msg) ||
          ["DS112", "DS113", "DS114", "AP112", "AP113", "AP114"].includes(code);
        if (isOtpError) {
          setErrorMsg(
            desc || "Invalid or expired OTP. Please request a new code and try again."
          );
        } else {
          setErrorMsg(
            desc || msg || `Signing failed (code: ${code || "unknown"}). Please try again or contact support.`
          );
        }
      }
    } catch (e) {
      setPhase("otp_sent");
      setOtpValue("");
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Signing failed unexpectedly. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const canProceedToOtp = !!signatureDataUrl;

  const hasPersistedOtp = (() => {
    try {
      const stored = sessionStorage.getItem(signingOtpKey(loanId));
      if (stored) {
        return Date.now() - parseInt(stored, 10) < 10 * 60 * 1000;
      }
    } catch {}
    return false;
  })();

  if (phase === "loading") {
    return (
      <Card className="border-primary/20 shadow-md overflow-hidden">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
          <span className="text-muted-foreground">
            Generating agreement preview...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (phase === "signed") {
    return (
      <Card className="border-success/25 bg-success/5 shadow-md overflow-hidden">
        <CardContent className="py-12">
          <div className="flex flex-col items-center text-center space-y-5">
            <div className="rounded-full bg-success/15 p-4">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Agreement signed successfully
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Your digitally signed loan agreement has been submitted for
                lender review. A copy has been sent to your email address.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                PKI digital signature applied
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Signed copy emailed to you
              </div>
            </div>
            <div className="pt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Redirecting to loan details in{" "}
                <span className="font-semibold text-foreground">
                  {countdown}s
                </span>
                ...
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onSignComplete()}
              >
                Go now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 shadow-md overflow-hidden">
      <CardHeader className="border-b border-border/60 bg-muted/12">
        <CardTitle className="text-base flex items-center gap-2">
          <PenTool className="h-5 w-5 text-primary" />
          Step {stepNumber} — Sign agreement
        </CardTitle>
        <CardDescription>
          Review your loan agreement, draw your signature, then authorize with
          OTP.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {errorMsg && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        {/* Two-column layout on lg+, stacked on mobile */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT — PDF Viewer */}
          {pdfUrl && (
            <div className="space-y-2 lg:flex-1 lg:min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Agreement Preview
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => window.open(pdfUrl, "_blank")}
                >
                  Open in new tab
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden bg-muted/20">
                <iframe
                  src={`${pdfUrl}#zoom=page-width`}
                  title="Loan Agreement Preview"
                  className="w-full border-0"
                  style={{ height: "80vh", minHeight: 600 }}
                />
              </div>
            </div>
          )}

          {/* RIGHT — Signature + OTP */}
          <div className="space-y-5 lg:w-[380px] lg:flex-shrink-0">
            {/* Signature Capture */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Your Signature</Label>
                {signatureDataUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSignature}
                    className="text-xs"
                  >
                    <Eraser className="h-3.5 w-3.5 mr-1" />
                    Re-draw
                  </Button>
                )}
              </div>

              {/* Signature placement indicator */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Signature placement on agreement
                </p>
                <div className="flex items-start gap-3">
                  {/* Mini page diagram */}
                  <div className="flex-shrink-0" style={{ width: 72 }}>
                    <div
                      className="border border-border rounded bg-white relative"
                      style={{ width: 72, height: 102, padding: 5 }}
                    >
                      <div className="text-[5px] text-muted-foreground/40 leading-tight select-none">
                        Page 4
                      </div>
                      <div className="mt-1 space-y-[2px]">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="h-[2px] bg-muted-foreground/10 rounded-full"
                            style={{ width: `${60 + Math.random() * 30}%` }}
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 flex gap-[1px] justify-end pr-5">
                        <span className="text-[4px] text-muted-foreground/30 select-none">
                          ) ) )
                        </span>
                      </div>
                      <div
                        className="absolute border-2 border-primary rounded-sm bg-primary/10 flex items-center justify-center"
                        style={{ right: 5, bottom: 14, width: 30, height: 16 }}
                      >
                        {signatureDataUrl ? (
                          <img
                            src={signatureDataUrl}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <PenTool className="h-2 w-2 text-primary/60" />
                        )}
                      </div>
                      <div className="absolute bottom-1 left-1 right-1 space-y-[2px]">
                        <div className="h-[2px] bg-muted-foreground/10 rounded-full w-3/4" />
                        <div className="h-[2px] bg-muted-foreground/10 rounded-full w-1/2" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 text-[11px] text-muted-foreground space-y-1 pt-0.5">
                    <p>
                      Stamped on{" "}
                      <span className="font-semibold text-foreground">
                        Page 4
                      </span>
                      , borrower&apos;s signature block (after closing
                      brackets).
                    </p>
                    <p className="text-muted-foreground/70">
                      A PKI certificate seal is also embedded for tamper-proof
                      verification.
                    </p>
                  </div>
                </div>
              </div>

              {!signatureDataUrl ? (
                <div className="space-y-2">
                  <div className="rounded-lg border-2 border-dashed border-primary/30 bg-white relative">
                    <canvas
                      ref={sigCanvasRef}
                      className="w-full touch-none"
                      style={{ height: 160 }}
                    />
                    <span className="absolute bottom-2 left-3 text-[10px] text-muted-foreground/50 pointer-events-none select-none">
                      Draw your signature above
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmSignature}
                    >
                      Confirm signature
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => sigPadRef.current?.clear()}
                    >
                      <Eraser className="h-3.5 w-3.5 mr-1" />
                      Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center gap-3">
                  <img
                    src={signatureDataUrl}
                    alt="Your signature"
                    className="h-16 border rounded bg-white px-3 py-1"
                  />
                  <span className="text-sm text-success flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Signature captured
                  </span>
                </div>
              )}
            </div>

            {/* OTP + Sign section (only after signature is confirmed) */}
            {canProceedToOtp &&
              (phase === "review" ||
                phase === "otp_requesting" ||
                phase === "otp_sent" ||
                phase === "signing") && (
                <div className="space-y-4 border-t border-border/60 pt-4">
                  {phase === "review" && !hasPersistedOtp && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
                        Your signature has been captured. Click below to receive
                        an OTP to authorize the digital signing.
                        {loan.borrower?.email && (
                          <span className="block mt-1">
                            The OTP will be sent to{" "}
                            <span className="font-medium text-foreground break-all">
                              {loan.borrower.email}
                            </span>
                            .
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleRequestOtp()}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4 mr-2" />
                        )}
                        Send signing OTP
                      </Button>
                    </div>
                  )}

                  {phase === "otp_requesting" && (
                    <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending OTP to your registered email...
                    </div>
                  )}

                  {(phase === "otp_sent" ||
                    phase === "signing" ||
                    (phase === "review" && hasPersistedOtp)) && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm space-y-1">
                        <p className="font-medium text-foreground flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          OTP sent to your email
                        </p>
                        <p className="text-muted-foreground">
                          {(otpEmail || loan.borrower?.email) ? (
                            <>
                              A 6-digit code has been sent to{" "}
                              <span className="font-medium text-foreground break-all">
                                {otpEmail || loan.borrower?.email}
                              </span>
                              . The code will expire in a few minutes.
                            </>
                          ) : (
                            "Check your inbox for the 6-digit code. The code will expire in a few minutes."
                          )}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signing-otp">Email OTP</Label>
                        <Input
                          id="signing-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="Enter 6-digit code"
                          maxLength={8}
                          value={otpValue}
                          onChange={(e) =>
                            setOtpValue(e.target.value.replace(/\D/g, ""))
                          }
                          disabled={phase === "signing"}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => void handleSign()}
                          disabled={busy || !otpValue.trim()}
                        >
                          {phase === "signing" ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-4 w-4 mr-2" />
                          )}
                          Sign agreement
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRequestOtp()}
                          disabled={busy}
                        >
                          Resend OTP
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={busy}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Certificate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
