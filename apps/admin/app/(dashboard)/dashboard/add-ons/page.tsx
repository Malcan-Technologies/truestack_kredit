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
  delivered: number;
  failed: number;
  pending: number;
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
    accentColor: "text-purple-500",
    iconBg: "bg-purple-500/10",
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
    accentColor: "text-emerald-700 dark:text-emerald-500",
    iconBg: "bg-emerald-500/10",
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
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ addOns: AddOnStatus[]; emailStats?: EmailStats }>(
        "/api/billing/add-ons"
      );
      if (res.success && res.data) {
        setAddOns(res.data.addOns || []);
        setEmailStats(res.data.emailStats || null);
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
            <h1 className="text-2xl font-heading font-bold text-gradient">
              Add-ons
            </h1>
          </div>
          <p className="text-muted text-sm ml-6">
            Extend your TrueKredit platform with powerful add-on features
          </p>
        </div>

        {/* Add-on Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {ADD_ON_DEFINITIONS.map((addOn) => {
            const status = getAddOnStatus(addOn.type);
            const isActive = status?.status === "ACTIVE";
            const showTrueSendStats = addOn.type === "TRUESEND" && isActive && emailStats;

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
                          <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                        ) : isActive ? (
                          <Badge variant="success" className="text-[10px]">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Not Subscribed</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {addOn.tagline}
                      </p>
                    </div>
                  </div>

                  {/* TrueSend email stats (shown inside card when active) */}
                  {showTrueSendStats && (
                    <div className="grid grid-cols-4 gap-1 text-center py-2 border-y border-border/50">
                      <div>
                        <p className="text-xl font-heading font-bold tabular-nums">{formatNumber(emailStats.total, 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Sent</p>
                      </div>
                      <div>
                        <p className="text-xl font-heading font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(emailStats.delivered, 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Delivered</p>
                      </div>
                      <div>
                        <p className="text-xl font-heading font-bold tabular-nums text-red-500">{formatNumber(emailStats.failed, 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Failed</p>
                      </div>
                      <div>
                        <p className="text-xl font-heading font-bold tabular-nums text-muted-foreground">{formatNumber(emailStats.pending, 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Pending</p>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {addOn.description}
                  </p>

                  {/* Features */}
                  <div className="flex-1">
                    <div className="space-y-1.5">
                      {addOn.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${addOn.accentColor}`} />
                          <p className="text-sm text-muted-foreground">{feature}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer: pricing + CTA */}
                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Pricing</p>
                      <p className="text-sm font-heading font-semibold">{addOn.pricing}</p>
                      {addOn.learnMoreUrl && (
                        addOn.learnMoreUrl.startsWith("/") ? (
                          <Link
                            href={addOn.learnMoreUrl}
                            className={`inline-flex items-center gap-1 text-xs mt-1 hover:underline ${addOn.accentColor}`}
                          >
                            Learn more
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <a
                            href={addOn.learnMoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 text-xs mt-1 hover:underline ${addOn.accentColor}`}
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
                        onClick={() => handleToggleAddOn(addOn.type)}
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
          <p className="text-xs text-muted-foreground mb-2">
            Add-on subscriptions are tied to your billing cycle and appear on your monthly invoice.
          </p>
          <Button variant="link" size="sm" asChild className="text-xs gap-1">
            <Link href="/dashboard/billing">
              Go to Billing
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>
    </RoleGate>
  );
}