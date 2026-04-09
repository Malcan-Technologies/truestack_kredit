"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  checkSigningGatewayHealth,
  getSigningCertStatus,
  requestEnrollmentOTP,
  enrollSigningCert,
  type CertStatusResult,
} from "../../lib/borrower-signing-client";

type Phase =
  | "checking"
  | "gateway_offline"
  | "cert_valid"
  | "cert_missing"
  | "otp_sent"
  | "enrolling"
  | "enrolled";

interface DigitalCertificateStepProps {
  stepNumber: number;
  onCertReady: () => void;
}

export function DigitalCertificateStep({ stepNumber, onCertReady }: DigitalCertificateStepProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [certInfo, setCertInfo] = useState<CertStatusResult | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const didAutoAdvance = useRef(false);

  const runChecks = useCallback(async () => {
    setPhase("checking");
    setErrorMsg(null);
    setCertInfo(null);
    didAutoAdvance.current = false;

    try {
      const health = await checkSigningGatewayHealth();
      if (!health.online) {
        setPhase("gateway_offline");
        return;
      }

      const cert = await getSigningCertStatus();
      setCertInfo(cert);

      if (cert.hasCert) {
        setPhase("cert_valid");
      } else {
        setPhase("cert_missing");
      }
    } catch (e) {
      setPhase("gateway_offline");
      setErrorMsg(e instanceof Error ? e.message : "Connection failed");
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  useEffect(() => {
    if (phase === "cert_valid" && !didAutoAdvance.current) {
      didAutoAdvance.current = true;
    }
  }, [phase]);

  const handleRequestOtp = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await requestEnrollmentOTP();
      if (result.success) {
        setPhase("otp_sent");
        if (result.email) setOtpEmail(result.email);
        toast.success(
          result.email
            ? `OTP sent to ${result.email}`
            : "OTP sent to your registered email address."
        );
      } else {
        setErrorMsg(result.errorDescription || result.statusMsg || "Failed to send OTP");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to request OTP");
    } finally {
      setBusy(false);
    }
  };

  const handleEnroll = async () => {
    if (!otpValue.trim()) {
      toast.error("Enter the OTP from your email.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setPhase("enrolling");
    try {
      const result = await enrollSigningCert(otpValue.trim());
      if (result.success) {
        setPhase("enrolled");
        toast.success("Digital certificate issued successfully.");
      } else {
        setPhase("otp_sent");
        setErrorMsg(result.errorDescription || result.statusMsg || "Certificate enrollment failed");
      }
    } catch (e) {
      setPhase("otp_sent");
      setErrorMsg(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "checking") {
    return (
      <Card className="border-primary/20 shadow-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Step {stepNumber} — Digital Certificate
          </CardTitle>
          <CardDescription>Checking signing service and certificate status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            Connecting to signing service...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "gateway_offline") {
    return (
      <Card className="border-destructive/25 shadow-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-destructive" />
            Step {stepNumber} — Digital Certificate
          </CardTitle>
          <CardDescription>The signing service is currently unavailable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Signing server offline
            </p>
            <p className="text-sm text-muted-foreground">
              The on-premise signing server is not reachable right now. This is usually temporary —
              please try again in a few minutes. If the issue persists, contact your lender.
            </p>
            {errorMsg && (
              <p className="text-xs text-muted-foreground mt-1">Detail: {errorMsg}</p>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => void runChecks()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "cert_valid") {
    return (
      <Card className="border-success/25 bg-success/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Step {stepNumber} — Digital Certificate
          </CardTitle>
          <CardDescription>Your digital signing certificate is valid and ready to use.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {certInfo && (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Status:</span>{" "}
                <span className="font-medium text-success">{certInfo.certStatus}</span>
              </p>
              {certInfo.certSerialNo && (
                <p>
                  <span className="text-muted-foreground">Serial:</span>{" "}
                  <span className="font-mono text-xs">{certInfo.certSerialNo}</span>
                </p>
              )}
              {certInfo.certValidTo && (
                <p>
                  <span className="text-muted-foreground">Valid until:</span>{" "}
                  {certInfo.certValidTo}
                </p>
              )}
            </div>
          )}
          <Button type="button" onClick={onCertReady}>
            Continue to signing
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "enrolled") {
    return (
      <Card className="border-success/25 bg-success/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Step {stepNumber} — Digital Certificate
          </CardTitle>
          <CardDescription>Your digital signing certificate has been issued.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Certificate enrolled successfully. You can now proceed to sign your agreement digitally.
          </p>
          <Button type="button" onClick={onCertReady}>
            Continue to signing
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 shadow-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Step {stepNumber} — Digital Certificate
        </CardTitle>
        <CardDescription>
          {phase === "cert_missing"
            ? "You need a digital signing certificate before you can sign the agreement."
            : "Enter the OTP sent to your email to complete certificate enrollment."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {certInfo && certInfo.certStatus && certInfo.certStatus !== "Valid" && (
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm">
            <p className="font-medium text-warning-foreground">
              Certificate status: {certInfo.certStatus}
            </p>
            {certInfo.errorDescription && (
              <p className="text-xs text-muted-foreground mt-1">{certInfo.errorDescription}</p>
            )}
          </div>
        )}

        {phase === "cert_missing" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground space-y-2">
              <p>
                To sign your loan agreement digitally, a certificate must be issued in your name.
                We will send a one-time password (OTP) to your registered email address to verify
                your identity.
              </p>
            </div>
            {errorMsg && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            <Button type="button" onClick={() => void handleRequestOtp()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Send OTP to my email
            </Button>
          </div>
        )}

        {(phase === "otp_sent" || phase === "enrolling") && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                OTP sent to your email
              </p>
              <p className="text-muted-foreground">
                {otpEmail ? (
                  <>
                    A 6-digit code has been sent to{" "}
                    <span className="font-medium text-foreground break-all">
                      {otpEmail}
                    </span>
                    . The code will expire in a few minutes.
                  </>
                ) : (
                  "Check your inbox for the 6-digit code and enter it below. The code will expire in a few minutes."
                )}
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2 max-w-xs">
              <Label htmlFor="cert-otp">Email OTP</Label>
              <Input
                id="cert-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                maxLength={8}
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ""))}
                disabled={phase === "enrolling"}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleEnroll()}
                disabled={busy || !otpValue.trim()}
              >
                {phase === "enrolling" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Get certificate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRequestOtp()}
                disabled={busy}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend OTP
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
