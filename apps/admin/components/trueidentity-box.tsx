"use client";

import { useEffect, useState, useCallback } from "react";
import { Fingerprint, Sparkles, ShieldCheck, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";

// ============================================
// Component
// ============================================

interface VerifyStatus {
  status: string | null;
  result: string | null;
  rejectMessage: string | null;
  onboardingUrl: string | null;
  expiresAt: string | null;
  lastWebhookAt: string | null;
}

interface TrueIdentityBoxProps {
  borrowerId: string;
}

export function TrueIdentityBox({ borrowerId }: TrueIdentityBoxProps) {
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [status, setStatus] = useState<VerifyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<VerifyStatus>(`/api/borrowers/${borrowerId}/verify/status`);
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

  const handleSendVerification = async () => {
    try {
      setSending(true);
      const res = await api.post<{
        sessionId: string;
        onboardingUrl: string;
        status: string;
        expiresAt: string;
      }>(`/api/borrowers/${borrowerId}/verify/start`, {});
      if (res.success && res.data) {
        setStatus({
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
    } catch {
      toast.error("Failed to start verification");
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = () => {
    const url = status?.onboardingUrl;
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const inactive = isActive === false;
  const hasUrl = Boolean(status?.onboardingUrl);
  const isCompleted = status?.status === "completed";
  const isExpired = status?.status === "expired";
  const isProcessing = status?.status === "processing";
  const isPending = status?.status === "pending";
  const canStart = !hasUrl || isExpired;

  const statusBadge = () => {
    if (!status?.status) return null;
    const variant =
      status.status === "completed"
        ? status.result === "approved"
          ? "default"
          : "destructive"
        : status.status === "expired" || status.status === "failed"
          ? "secondary"
          : "outline";
    const label =
      status.status === "completed"
        ? status.result === "approved"
          ? "Verified"
          : "Rejected"
        : status.status.charAt(0).toUpperCase() + status.status.slice(1);
    return (
      <Badge variant={variant} className="text-[10px]">
        {label}
      </Badge>
    );
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
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Fingerprint
              className={`h-4 w-4 ${inactive ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-500"}`}
            />
            Identity Verification
          </CardTitle>
          <div className="flex items-center gap-2">
            {statusBadge()}
            <Badge
              variant={inactive ? "outline" : "default"}
              className={`text-[10px] ${inactive ? "text-muted-foreground" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15"}`}
            >
              <Fingerprint className="h-3 w-3 mr-1" />
              TrueIdentity
            </Badge>
          </div>
        </div>
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
        ) : (
          <div className="space-y-3">
            {isCompleted && status?.result === "approved" && (
              <div className="flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Identity verified</p>
                  <p className="text-xs text-muted-foreground">
                    Borrower completed e-KYC verification successfully.
                  </p>
                </div>
              </div>
            )}
            {isCompleted && status?.result === "rejected" && (
              <div className="flex flex-col gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                <p className="text-sm font-medium">Verification rejected</p>
                {status.rejectMessage && (
                  <p className="text-xs text-muted-foreground">{status.rejectMessage}</p>
                )}
              </div>
            )}
            {hasUrl && !isCompleted && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Share the QR code or link with the borrower to complete verification.
                </p>
                <div className="flex flex-col items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <QRCodeSVG value={status!.onboardingUrl!} size={140} level="M" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={handleCopyLink}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </Button>
                </div>
              </div>
            )}
            {canStart && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={handleSendVerification}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Fingerprint className="h-3.5 w-3.5" />
                )}
                {sending ? "Creating..." : "Send Verification"}
              </Button>
            )}
            {isProcessing && (
              <p className="text-xs text-muted-foreground">
                Borrower is completing verification. Status will update when done.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
