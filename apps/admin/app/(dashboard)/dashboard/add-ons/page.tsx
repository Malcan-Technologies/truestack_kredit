"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Send,
  Fingerprint,
  Loader2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { RoleGate } from "@/components/role-gate";
import { formatNumber } from "@/lib/utils";

// ============================================
// Types
// ============================================

interface AddOnStatus {
  addOnType: string;
  status: string;
  enabledAt: string | null;
}

interface EmailStats {
  total: number;
  delivered?: number;
  failed?: number;
  pending?: number;
}

interface VerificationStats {
  total: number;
}

/** 5 mins per email → admin hours saved */
const MINS_PER_EMAIL = 5;
/** 10 mins per verification → admin hours saved */
const MINS_PER_VERIFICATION = 10;

function formatAdminHoursSaved(totalCount: number, minsPerUnit: number): string {
  const totalMins = totalCount * minsPerUnit;
  if (totalMins < 60) return `${Math.round(totalMins)} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================
// Add-on Definitions
// ============================================

interface AddOnDefinition {
  id: string;
  type: string;
  title: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  accentColor: string;
  iconBg: string;
  features: string[];
  pricing: string;
  comingSoon?: boolean;
  learnMoreUrl?: string;
}

const ADD_ON_DEFINITIONS: AddOnDefinition[] = [
  {
    id: "truesend",
    type: "TRUESEND",
    title: "TrueSend™",
    tagline: "Automated email delivery for all loan events",
    description:
      "TrueKredit already generates all loan documents — TrueSend™ sends them straight to your borrowers' inbox automatically with full delivery tracking.",
    icon: Send,
    accentColor: "text-muted-foreground",
    iconBg: "bg-secondary",
    features: [
      "Payment receipts sent automatically after each payment",
      "Payment reminders 3 days and 1 day before due dates",
      "Late payment consolidated notices (1x per month)",
      "Arrears & default notices with letter attachments",
      "Disbursement confirmations and discharge letters",
      "Real-time delivery tracking (delivered, bounced, failed)",
      "Admin-triggered resend for failed emails",
      "Full audit trail for all email activity",
    ],
    pricing: "RM 50/month per 500 active loans",
    learnMoreUrl: "/dashboard/help?doc=add-ons/automated-emails",
  },
  {
    id: "trueidentity",
    type: "TRUEIDENTITY",
    title: "TrueIdentity™",
    tagline: "Verify borrower identity digitally via QR code",
    description:
      "Integrated e-KYC verification. Generate a QR code, let borrowers scan to photograph their IC and complete a face liveness check. Results are saved for KPKT audit & compliance.",
    icon: Fingerprint,
    accentColor: "text-muted-foreground",
    iconBg: "bg-secondary",
    features: [
      "QR-based flow — borrowers verify from anywhere",
      "IC (MyKad) photo capture with automatic OCR data extraction",
      "Face liveness check to prevent identity fraud",
      "Results saved to loan file for KPKT audit & compliance",
      "Up to 3 retries per session at no extra cost",
    ],
    pricing: "RM 4 per verification",
    learnMoreUrl: "https://www.truestack.my/trueidentity",
  },
];

// ============================================
// Page Component
// ============================================

export default function AddOnsPage() {
  const [addOns, setAddOns] = useState<AddOnStatus[]>([]);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [verificationStats, setVerificationStats] = useState<VerificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [cancelAddOnType, setCancelAddOnType] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        addOns: AddOnStatus[];
        emailStats?: EmailStats;
        verificationStats?: VerificationStats;
      }>("/api/billing/add-ons");
      if (res.success && res.data) {
        setAddOns(res.data.addOns || []);
        setEmailStats(res.data.emailStats || null);
        setVerificationStats(res.data.verificationStats || null);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getAddOnStatus = (type: string): AddOnStatus | undefined => {
    return addOns.find((a) => a.addOnType === type);
  };

  const handleToggleAddOn = async (addOnType: string) => {
    setToggling(addOnType);
    try {
      const res = await api.post<{ addOnType: string; status: string }>(
        "/api/billing/add-ons/toggle",
        { addOnType }
      );
      if (res.success && res.data) {
        toast.success(
          res.data.status === "ACTIVE"
            ? `${addOnType === "TRUESEND" ? "TrueSend" : "TrueIdentity"} activated successfully`
            : `${addOnType === "TRUESEND" ? "TrueSend" : "TrueIdentity"} cancelled`
        );
        fetchData();
      } else {
        toast.error(res.error || "Failed to toggle add-on");
      }
    } catch {
      toast.error("Failed to toggle add-on");
    } finally {
      setToggling(null);
    }
  };

  return (
    <RoleGate allowedRoles={["OWNER", "ADMIN"]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-heading font-bold text-foreground">
              Add-ons
            </h1>
          </div>
          <p className="text-base text-muted-foreground ml-6">
            Extend your TrueKredit platform with powerful add-on features
          </p>
        </div>

        {/* Add-on Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {ADD_ON_DEFINITIONS.map((addOn) => {
            const status = getAddOnStatus(addOn.type);
            const isActive = status?.status === "ACTIVE";
            const showTrueSendStats = addOn.type === "TRUESEND" && emailStats;
            const showTrueIdentityStats = addOn.type === "TRUEIDENTITY" && verificationStats;

            return (
              <Card key={addOn.id} className="flex flex-col">
                <CardContent className="pt-6 flex flex-col flex-1 gap-5">
                  {/* Top: Icon + title + badge */}
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${addOn.iconBg}`}>
                      <addOn.icon className={`h-5 w-5 ${addOn.accentColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-2xl font-heading font-bold">
                          {addOn.title}
                        </h3>
                        {addOn.comingSoon ? (
                          <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                        ) : isActive ? (
                          <Badge variant="success" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Not Subscribed</Badge>
                        )}
                      </div>
                      <p className="text-base text-muted-foreground mt-0.5">
                        {addOn.tagline}
                      </p>
                    </div>
                  </div>

                  {/* TrueSend stats (always shown) */}
                  {showTrueSendStats && (
                    <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
                      <p className="text-xs text-muted-foreground mb-3">All time</p>
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-heading font-bold tabular-nums text-foreground">
                            {formatNumber(emailStats.total, 0)}
                          </span>
                          <span className="text-sm text-muted-foreground">emails sent</span>
                        </div>
                        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                        <div className="flex flex-col items-end">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-heading font-bold tabular-nums text-foreground">
                              {formatAdminHoursSaved(emailStats.total, MINS_PER_EMAIL)}
                            </span>
                            <span className="text-sm text-muted-foreground">time saved</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Estimated at 5 min per email
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TrueIdentity stats (always shown) */}
                  {showTrueIdentityStats && (
                    <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 p-4">
                      <p className="text-xs text-muted-foreground mb-3">All time</p>
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-heading font-bold tabular-nums text-foreground">
                            {formatNumber(verificationStats.total, 0)}
                          </span>
                          <span className="text-sm text-muted-foreground">verifications</span>
                        </div>
                        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                        <div className="flex flex-col items-end">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-heading font-bold tabular-nums text-foreground">
                              {formatAdminHoursSaved(verificationStats.total, MINS_PER_VERIFICATION)}
                            </span>
                            <span className="text-sm text-muted-foreground">time saved</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Estimated at 10 min per verification
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {addOn.description}
                  </p>

                  {/* Features */}
                  <div className="flex-1">
                    <div className="space-y-1.5">
                      {addOn.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                          <p className="text-base text-muted-foreground">{feature}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer: pricing + CTA */}
                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
                    <div>
                      <p className="text-sm text-muted-foreground">Pricing</p>
                      <p className="text-base font-heading font-semibold text-foreground">{addOn.pricing}</p>
                      {addOn.learnMoreUrl && (
                        addOn.learnMoreUrl.startsWith("/") ? (
                          <Link
                            href={addOn.learnMoreUrl}
                            className="inline-flex items-center gap-1 text-sm mt-1 text-foreground hover:text-muted-foreground hover:underline"
                          >
                            Learn more
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <a
                            href={addOn.learnMoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm mt-1 text-foreground hover:text-muted-foreground hover:underline"
                          >
                            Learn more
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )
                      )}
                    </div>
                    {addOn.comingSoon ? (
                      <Button variant="outline" size="sm" disabled>
                        Coming Soon
                      </Button>
                    ) : isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={toggling === addOn.type}
                        onClick={() => setCancelAddOnType(addOn.type)}
                      >
                        {toggling === addOn.type && (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        )}
                        Cancel Subscription
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={toggling === addOn.type}
                        onClick={() => handleToggleAddOn(addOn.type)}
                      >
                        {toggling === addOn.type && (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        )}
                        Subscribe
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Billing link */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Add-on subscriptions are tied to your billing cycle and appear on your monthly invoice.
          </p>
          <Button variant="link" size="sm" asChild className="text-sm gap-1">
            <Link href="/dashboard/billing">
              Go to Billing
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        {/* Cancel subscription confirmation */}
        <AlertDialog
          open={!!cancelAddOnType}
          onOpenChange={(open) => !open && setCancelAddOnType(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel subscription</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel {cancelAddOnType === "TRUESEND" ? "TrueSend" : "TrueIdentity"}? You will lose access to this add-on at the end of your current billing period.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!toggling}>Keep subscription</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={!!toggling}
                onClick={async () => {
                  if (!cancelAddOnType) return;
                  await handleToggleAddOn(cancelAddOnType);
                  setCancelAddOnType(null);
                }}
              >
                {toggling === cancelAddOnType ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  "Cancel subscription"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGate>
  );
}