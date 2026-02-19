"use client";

import { useEffect, useState, useCallback } from "react";
import { Fingerprint, Sparkles, ShieldCheck, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { toast } from "sonner";

// ============================================
// Component
// ============================================

interface VerifyStatus {
  status: string | null;
  result: string | null;
  onboarding_url: string | null;
  expires_at: string | null;
  reject_message: string | null;
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
      const res = await api.get<VerifyStatus>(
        `/api/borrowers/${borrowerId}/verify/status`
      );
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
        onboarding_url: string;
        session_id: string;
        expires_at: string;
      }>(`/api/borrowers/${borrowerId}/verify/start`, {});
      if (res.success && res.data) {
        setStatus((prev) => ({
          status: "pending",
          result: prev?.result ?? null,
          onboarding_url: res.data!.onboarding_url,
          expires_at: res.data!.expires_at,
          reject_message: prev?.reject_message ?? null,
        }));
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
    const url = status?.onboarding_url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const inactive = isActive === false;
  const onboardingUrl = status?.onboarding_url;
  const isPending = status?.status === "pending";
  const isCompleted = status?.status === "completed";
  const isRejected = status?.status === "rejected" || status?.result === "rejected";
  const isApproved = status?.result === "approved";

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
          <Badge
            variant={inactive ? "outline" : "default"}
            className={`text-[10px] ${inactive ? "text-muted-foreground" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15"}`}
          >
            <Fingerprint className="h-3 w-3 mr-1" />
            TrueIdentity
          </Badge>
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
              Subscribe to TrueIdentity to verify borrower identity via QR-based
              IC capture and face liveness check.
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
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {isApproved && (
              <div className="flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Verified</p>
                  <p className="text-xs text-muted-foreground">
                    Identity verified via TrueIdentity.
                  </p>
                </div>
              </div>
            )}

            {isRejected && status?.reject_message && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <p className="text-sm font-medium text-destructive">Rejected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {status.reject_message}
                </p>
              </div>
            )}

            {onboardingUrl && (isPending || !isCompleted) && (
              <div className="space-y-2">
                <div className="flex justify-center rounded-md border border-emerald-500/20 bg-white dark:bg-muted/30 p-3">
                  <QRCodeSVG value={onboardingUrl} size={140} level="M" />
                </div>
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={handleCopyLink}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy Link
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Copy the onboarding URL to share with the borrower</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}

            {!isApproved && (
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
                {onboardingUrl ? "Regenerate Link" : "Send Verification"}
              </Button>
            )}

            {isPending && onboardingUrl && (
              <p className="text-xs text-muted-foreground text-center">
                Share the QR code or link with the borrower. Status updates
                automatically.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
