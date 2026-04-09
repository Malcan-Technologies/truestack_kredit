"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import SignaturePad from "signature_pad";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  PenTool,
  Undo2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  signLoanAgreement,
  type InternalSignature,
} from "@/lib/admin-signing-client";
import {
  CERT_PIN_REGEX,
  filterCertPinInput,
} from "@/lib/cert-pin-validation";
import { formatDateTime } from "@/lib/utils";

interface InternalSigningCardProps {
  loanId: string;
  role: "COMPANY_REP" | "WITNESS";
  existingSignature?: InternalSignature | null;
  currentUserId: string;
  onSignComplete: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  COMPANY_REP: "Company Representative",
  WITNESS: "Witness",
};

export default function InternalSigningCard({
  loanId,
  role,
  existingSignature,
  currentUserId,
  onSignComplete,
}: InternalSigningCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);
  const [pin, setPin] = useState("");
  const [signing, setSigning] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const roleLabel = ROLE_LABELS[role] || role;

  const initPad = useCallback(() => {
    if (!canvasRef.current || existingSignature) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    if (sigPadRef.current) sigPadRef.current.off();
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#1a1a2e",
      minWidth: 1.5,
      maxWidth: 3,
    });
    pad.addEventListener("endStroke", () => setHasDrawn(!pad.isEmpty()));
    sigPadRef.current = pad;
  }, [existingSignature]);

  useEffect(() => {
    initPad();
    return () => {
      sigPadRef.current?.off();
    };
  }, [initPad]);

  const handleClear = () => {
    sigPadRef.current?.clear();
    setHasDrawn(false);
  };

  const handleSign = async () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error("Please draw your signature");
      return;
    }
    if (!CERT_PIN_REGEX.test(pin)) {
      toast.error("Certificate PIN must be exactly 8 digits (numbers only)");
      return;
    }

    setSigning(true);
    try {
      const sigImage = sigPadRef.current.toDataURL("image/png");
      const res = await signLoanAgreement(loanId, pin, sigImage, role);

      if (res.success) {
        toast.success(`Signed as ${roleLabel}`);
        onSignComplete();
      } else {
        toast.error(
          res.errorDescription || res.statusMsg || (res as any).error || "Signing failed",
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Signing failed. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  // Already signed
  if (existingSignature) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {roleLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Signed by <span className="font-medium">{existingSignature.signerName}</span>
            {" "}on{" "}
            {formatDateTime(existingSignature.signedAt)}
          </p>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <PenTool className="h-4 w-4" />
          Sign as {roleLabel}
        </CardTitle>
        <CardDescription className="text-xs">
          Draw your signature and enter your 8-digit certificate PIN
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Signature Pad */}
        <div className="space-y-2">
          <Label className="text-xs">Signature</Label>
          <div className="rounded-lg border-2 border-dashed border-primary/30 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ height: 160, touchAction: "none" }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 text-xs"
          >
            <Undo2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>

        {/* PIN Input */}
        <div className="space-y-2">
          <Label className="text-xs" htmlFor={`internal-sign-pin-${role}`}>
            Certificate PIN (8 digits)
          </Label>
          <Input
            id={`internal-sign-pin-${role}`}
            type="text"
            inputMode="numeric"
            name={`signing-cert-pin-${role}`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={pin}
            onChange={(e) => setPin(filterCertPinInput(e.target.value))}
            placeholder="8-digit PIN"
            className="max-w-[200px] [-webkit-text-security:disc]"
            maxLength={8}
            pattern="\d{8}"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
          />
        </div>

        {/* Sign Button */}
        <Button
          onClick={handleSign}
          disabled={signing || !hasDrawn || !CERT_PIN_REGEX.test(pin)}
          size="sm"
        >
          {signing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <ShieldCheck className="h-4 w-4 mr-2" />
          Sign as {roleLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
