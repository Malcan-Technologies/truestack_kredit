"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileSignature,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  checkSigningGatewayHealth,
  getSigningCertStatus,
  type CertStatusResult,
} from "../lib/borrower-signing-client";

type Phase = "loading" | "offline" | "no_cert" | "valid" | "expired" | "revoked" | "error";

function formatCertDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function DigitalSigningComingSoonCard() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [cert, setCert] = useState<CertStatusResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runCheck = async () => {
    setPhase("loading");
    setErrorMsg(null);

    try {
      const health = await checkSigningGatewayHealth();
      if (!health.online) {
        setPhase("offline");
        return;
      }

      const result = await getSigningCertStatus();
      setCert(result);

      if (!result.success || !result.hasCert) {
        setPhase("no_cert");
        return;
      }

      const status = (result.certStatus ?? "").toLowerCase();
      if (status === "valid") {
        setPhase("valid");
      } else if (status === "expired") {
        setPhase("expired");
      } else if (status === "revoked") {
        setPhase("revoked");
      } else {
        setPhase("no_cert");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to check certificate");
      setPhase("error");
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground">
            <FileSignature className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-heading">Digital Signing Certificate</CardTitle>
            <CardDescription>PKI certificate for signing loan agreements</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {phase === "loading" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking certificate status...
          </div>
        )}

        {phase === "offline" && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <WifiOff className="h-4 w-4" />
              Signing service offline
            </div>
            <p className="text-xs text-muted-foreground">
              The signing gateway is currently unreachable. Certificate status will be available
              once the service is back online.
            </p>
            <Button variant="outline" size="sm" onClick={() => void runCheck()}>
              Retry
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm text-destructive">{errorMsg || "An error occurred"}</p>
            <Button variant="outline" size="sm" onClick={() => void runCheck()}>
              Retry
            </Button>
          </div>
        )}

        {phase === "no_cert" && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              No certificate found
            </div>
            <p className="text-xs text-muted-foreground">
              You don&apos;t have a digital signing certificate yet. One will be created
              during the loan agreement signing process.
            </p>
          </div>
        )}

        {phase === "valid" && cert && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Certificate active
              </span>
              <Badge variant="verified" className="text-xs ml-auto">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Valid
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Serial</span>
              <span className="font-mono truncate" title={cert.certSerialNo ?? undefined}>
                {cert.certSerialNo
                  ? `${cert.certSerialNo.slice(0, 8)}...${cert.certSerialNo.slice(-4)}`
                  : "—"}
              </span>
              <span className="text-muted-foreground">Valid from</span>
              <span>{formatCertDate(cert.certValidFrom)}</span>
              <span className="text-muted-foreground">Valid to</span>
              <span>{formatCertDate(cert.certValidTo)}</span>
            </div>
          </div>
        )}

        {phase === "expired" && cert && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Certificate expired
              </span>
              <Badge variant="warning" className="text-xs ml-auto">Expired</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Your certificate expired on {formatCertDate(cert.certValidTo)}. A new one will
              be issued during the next loan signing.
            </p>
          </div>
        )}

        {phase === "revoked" && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">Certificate revoked</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Your certificate has been revoked. A new one will be issued during the next loan
              signing process.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
