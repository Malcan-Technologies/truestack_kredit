"use client";

import { useEffect, useState, useCallback } from "react";
import { Fingerprint, Sparkles, ShieldCheck, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

// ============================================
// Types
// ============================================

interface TrueIdentityBoxProps {
  borrowerId: string;
}

interface VerifyStatus {
  status: string | null;
  result: string | null;
  session_id: string | null;
  onboarding_url: string | null;
  expires_at: string | null;
  last_webhook_at: string | null;
  reject_message: string | null;
  document_verified: boolean;
  verified_at: string | null;
  latest_session: {
    id: string;
    admin_session_id: string;
    status: string;
    result: string | null;
    expires_at: string;
  } | null;
}

// ============================================
// Component
// ============================================

export function TrueIdentityBox({ borrowerId }: TrueIdentityBoxProps) {
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [status, setStatus] = useState<VerifyStatus | null>(null);
  const [sending, setSending] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<VerifyStatus>(`/api/borrowers/${borrowerId}/verify/status`);
      if (res.success && res.data) {
        setStatus(res.data);
      }
    } catch {
      setStatus(null);
    }
  }, [borrowerId]);

  const fetchAddOn = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchAddOn();
  }, [fetchAddOn]);

  useEffect(() => {
    if (isActive) {
      fetchStatus();
    }
  }, [isActive, fetchStatus]);

  const handleSendVerification = async () => {
    setSending(true);
    try {
      const res = await api.post<{
        session_id: string;
        onboarding_url: string;
        status: string;
        expires_at: string;
      }>(`/api/borrowers/${borrowerId}/verify/start`, {});
      if (res.success && res.data) {
        toast.success("Verification link ready. Show the QR code or copy link to the borrower.");
        await fetchStatus();
      } else {
        toast.error(res.error || "Failed to start verification");
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
  const isPending = status?.status === "pending" || status?.status === "processing";
  const isCompleted = status?.status === "completed";
  const isApproved = status?.result === "approved";
  const isRejected = status?.result === "rejected";
  const isExpired = status?.status === "expired";
  const showQrAndLink = onboardingUrl && (isPending || isCompleted);

  const getStatusBadge = () => {
    if (status?.document_verified) {
      return <Badge variant="verified">e-KYC Verified</Badge>;
    }
    if (isApproved) return <Badge variant="verified">Approved</Badge>;
    if (isRejected) return <Badge variant="destructive">Rejected</Badge>;
    if (isExpired) return <Badge variant="outline">Expired</Badge>;
    if (isPending) return <Badge variant="secondary">Pending</Badge>;
    if (status?.status) return <Badge variant="outline">{status.status}</Badge>;
    return null;
  };

  return (
    <Card className={inactive ? "opacity-50 border-dashed border-muted-foreground/30" : "bg-emerald-500/[0.04] border-emerald-500/15"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Fingerprint className={`h-4 w-4 ${inactive ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-500"}`} />
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
              Subscribe to TrueIdentity to verify borrower identity via QR-based IC capture and face liveness check.
            </p>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/dashboard/plan">
                <Sparkles className="h-3.5 w-3.5" />
                Learn More
              </Link>
            </Button>
          </div>
        ) : isActive === null ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">TrueIdentity is active</p>
                <p className="text-xs text-muted-foreground">
                  e-KYC verification is available for this borrower.
                </p>
              </div>
            </div>

            {getStatusBadge() && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                {getStatusBadge()}
              </div>
            )}

            {status?.expires_at && showQrAndLink && (
              <p className="text-xs text-muted-foreground">
                Expires: {formatDate(status.expires_at)}
              </p>
            )}

            {showQrAndLink && (
              <div className="space-y-2">
                <div className="flex justify-center p-3 bg-white dark:bg-secondary rounded-lg">
                  <QRCodeSVG value={onboardingUrl} size={160} level="M" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleCopyLink}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy verification link
                </Button>
              </div>
            )}

            {status?.reject_message && (
              <p className="text-xs text-destructive">{status.reject_message}</p>
            )}

            {(!onboardingUrl || isExpired || isCompleted) && (
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
                Send Verification
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
