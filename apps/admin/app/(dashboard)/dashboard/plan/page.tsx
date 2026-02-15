"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Send,
  Fingerprint,
  Loader2,
  ExternalLink,
  Check,
  X,
  Shield,
  Sparkles,
  Zap,
  Rocket,
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
import { formatCurrency, formatNumber } from "@/lib/utils";

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

const MINS_PER_EMAIL = 5;
const MINS_PER_VERIFICATION = 10;
const LOANS_INCLUDED = 500;
const EXTRA_BLOCK_PRICE = 200;
const TRUESEND_EXTRA_BLOCK_PRICE = 50;

function formatTimeSaved(totalCount: number, minsPerUnit: number): string {
  const totalMins = totalCount * minsPerUnit;
  if (totalMins < 60) return `${Math.round(totalMins)} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

type DetailSelection = "TRUESEND" | "TRUEIDENTITY" | null;

function LoanUsageBar({ used, limit, truesendActive = false }: { used: number; limit: number; truesendActive?: boolean }) {
  // Always show at least 1 block (included block is active even at 0 loans)
  const totalBlocks = Math.max(1, Math.ceil(used / limit));
  const fullBlocks = Math.floor(used / limit);
  const currentBlockUsage = used % limit || (used > 0 ? limit : 0); // 0–500 in current partial block
  const currentBlockPct = (currentBlockUsage / limit) * 100;
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const extraCost = extraBlocks * EXTRA_BLOCK_PRICE;
  const truesendExtraCost = truesendActive ? extraBlocks * TRUESEND_EXTRA_BLOCK_PRICE : 0;

  const isSingleBlock = totalBlocks <= 1;
  const isNearLimit = !isSingleBlock ? false : currentBlockPct >= 80;

  return (
    <div className="mt-4 p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800/50">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">Loan usage</span>
        <span className="text-sm font-heading font-bold tabular-nums text-foreground">
          {formatNumber(used, 0)} loans · {totalBlocks} block{totalBlocks !== 1 ? "s" : ""} · {formatNumber(currentBlockUsage, 0)}/{limit} in current
        </span>
      </div>
      {/* Block segments: each full block + one partial block (min 1 when used > 0) */}
      <div className="flex gap-1 mt-2">
        {Array.from({ length: Math.min(Math.max(totalBlocks, 1), 5) }).map((_, i) => {
          const isFull = i < fullBlocks;
          const isPartial = i === fullBlocks && currentBlockUsage > 0;
          const fillPct = isFull ? 100 : isPartial ? currentBlockPct : 0;
          return (
            <div
              key={i}
              className="flex-1 min-w-0 h-2 rounded-full bg-secondary overflow-hidden"
              title={isFull ? "500/500" : isPartial ? `${currentBlockUsage}/500` : "0/500"}
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull ? "bg-primary" : isPartial && isNearLimit ? "bg-warning" : isPartial ? "bg-primary" : "bg-transparent"
                }`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          );
        })}
        {totalBlocks > 5 && (
          <span className="text-xs text-muted-foreground self-center ml-1">+{totalBlocks - 5}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {extraBlocks > 0 ? (
          <>
            1 included + {extraBlocks} extra · +{formatCurrency(extraCost)}/month
            {truesendActive && truesendExtraCost > 0 && (
              <> (+{formatCurrency(truesendExtraCost)} TrueSend)</>
            )}
          </>
        ) : (
          <>
            {limit} loans included. Extra blocks: +{formatCurrency(EXTRA_BLOCK_PRICE)}/month each
            {truesendActive && <> (+{formatCurrency(TRUESEND_EXTRA_BLOCK_PRICE)}/block TrueSend)</>}
            .
          </>
        )}
      </p>
    </div>
  );
}

// ============================================
// Page Component
// ============================================

interface SubscriptionData {
  plan: string;
}

export default function PlanPage() {
  const [addOns, setAddOns] = useState<AddOnStatus[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [verificationStats, setVerificationStats] = useState<VerificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [subscribeAddOnType, setSubscribeAddOnType] = useState<string | null>(null);
  const [cancelAddOnType, setCancelAddOnType] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailSelection>("TRUESEND");
  const [loanCount, setLoanCount] = useState<number>(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [addOnsRes, subRes, tenantRes] = await Promise.all([
        api.get<{
          addOns: AddOnStatus[];
          emailStats?: EmailStats;
          verificationStats?: VerificationStats;
        }>("/api/billing/add-ons"),
        api.get<{ plan: string }>("/api/billing/subscription"),
        api.get<{ counts: { loans: number } }>("/api/tenants/current"),
      ]);
      if (addOnsRes.success && addOnsRes.data) {
        setAddOns(addOnsRes.data.addOns || []);
        setEmailStats(addOnsRes.data.emailStats || null);
        setVerificationStats(addOnsRes.data.verificationStats || null);
      }
      if (subRes.success && subRes.data) {
        setSubscription(subRes.data);
      } else {
        setSubscription(null);
      }
      if (tenantRes.success && tenantRes.data?.counts) {
        setLoanCount(tenantRes.data.counts.loans);
      } else {
        setLoanCount(0);
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

  const getAddOnStatus = (type: string): AddOnStatus | undefined =>
    addOns.find((a) => a.addOnType === type);

  const isTrueSendActive = getAddOnStatus("TRUESEND")?.status === "ACTIVE";
  const isTrueIdentityActive = getAddOnStatus("TRUEIDENTITY")?.status === "ACTIVE";

  const planName =
    subscription?.plan === "Core+"
      ? "Core+"
      : subscription?.plan === "Core"
        ? "Core"
        : "Free";
  const trueSendPlanContext =
    isTrueSendActive ? "CORE_PLUS" : subscription?.plan === "Core" ? "CORE" : "FREE";

  const isCorePlus = planName === "Core+";
  const planFeaturesSectionTitle = isCorePlus
    ? "Included in your plan"
    : "Not included in your plan";

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
            ? "TrueIdentity activated successfully"
            : "TrueIdentity cancelled"
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <RoleGate allowedRoles={["OWNER", "ADMIN"]}>
      <div className="space-y-6">
        {/* Header with action button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gradient">Plan</h1>
            <p className="text-muted-foreground mt-1">
              {planName === "Free"
                ? "Subscribe to unlock the full platform."
                : "Your plan features and optional add-ons."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm shrink-0">
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Admin Only
            </Badge>
            <Button
              variant="default"
              asChild
              className="bg-black text-white hover:bg-black/90"
            >
              <Link href="/dashboard/subscription" className="inline-flex items-center">
                <Sparkles className="h-4 w-4 mr-2" />
                {planName === "Free" ? "Choose plan" : "Update plan"}
              </Link>
            </Button>
          </div>
        </div>

        {/* Empty state for users without subscription */}
        {planName === "Free" ? (
          <Card className="border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
            <CardContent className="pt-10 pb-10 px-8">
              <div className="max-w-xl mx-auto text-center space-y-6">
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Rocket className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-heading font-bold text-foreground">
                    Unlock your full plan
                  </h2>
                  <p className="text-muted-foreground mt-2">
                    Subscribe to Core or Core+ to access loan management, compliance tools,
                    schedules, and optional automated emails.
                  </p>
                </div>
                <ul className="text-left space-y-3 text-sm text-muted-foreground max-w-sm mx-auto">
                  <li className="flex gap-3 items-start">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                    Borrower management, loan products & applications
                  </li>
                  <li className="flex gap-3 items-start">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                    Payment tracking, Jadual J & K generation
                  </li>
                  <li className="flex gap-3 items-start">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                    KPKT compliance, Lampiran A, full audit logs
                  </li>
                  <li className="flex gap-3 items-start">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                    Core+ adds TrueSend™ — automated email delivery
                  </li>
                </ul>
                <Button
                  size="lg"
                  asChild
                  className="bg-black text-white hover:bg-black/90 font-semibold px-8"
                >
                  <Link href="/dashboard/subscription" className="inline-flex items-center">
                    View plans & pricing
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Your plan */}
            <Card>
              <CardContent className="pt-6 pb-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Your plan
                </h2>
                <p className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
                  {planName === "Core+" ? (
                    <Rocket className="h-5 w-5 text-primary" />
                  ) : planName === "Core" ? (
                    <Zap className="h-5 w-5 text-primary" />
                  ) : null}
                  {planName} Plan
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {planName === "Core+"
                    ? "Full loan management, compliance, schedules, and automated emails (TrueSend™) included."
                    : planName === "Core"
                      ? "Full loan management, compliance, and schedules. Upgrade to Core+ for automated emails."
                      : "Subscribe to Core or Core+ to unlock the full platform."}
                </p>
                {(planName === "Core" || planName === "Core+") && (
                  <LoanUsageBar used={loanCount} limit={LOANS_INCLUDED} truesendActive={isTrueSendActive} />
                )}
                <Button variant="outline" size="sm" asChild className="mt-4">
                  <Link href="/dashboard/billing">
                    Manage billing
                    <ExternalLink className="h-3 w-3 ml-1.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Plan features — title depends on Core vs Core+ */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {planFeaturesSectionTitle}
              </h2>
              {!isCorePlus && (
                <p className="text-sm text-muted-foreground mb-3">
                  Upgrade to Core+ to unlock these features.
                </p>
              )}
              <div className="space-y-2">
                <Card
                  className={`cursor-pointer transition-colors ${
                    isTrueSendActive ? "border-l-4 border-l-emerald-500" : ""
                  } ${selectedDetail === "TRUESEND" ? "ring-2 ring-primary/20" : ""}`}
                  onClick={() => setSelectedDetail("TRUESEND")}
                >
                  <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          isTrueSendActive ? "bg-emerald-500/20" : "bg-muted"
                        }`}
                      >
                        {isTrueSendActive ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            TrueSend™
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              isTrueSendActive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {isTrueSendActive ? "Enabled" : "Not enabled"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {isTrueSendActive
                            ? "Auto-sends receipts, reminders, arrears & default notices."
                            : trueSendPlanContext === "CORE"
                              ? "Upgrade to Core+ to enable automated emails."
                              : "Subscribe to Core+ to enable automated emails."}
                        </p>
                        {isTrueSendActive && emailStats && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatNumber(emailStats.total, 0)} emails sent ·{" "}
                            {formatTimeSaved(emailStats.total, MINS_PER_EMAIL)}{" "}
                            saved
                          </p>
                        )}
                      </div>
                    </div>
                    {!isTrueSendActive && (
                      <Button variant="outline" size="sm" asChild className="shrink-0">
                        <Link href="/dashboard/subscription">
                          {trueSendPlanContext === "CORE"
                            ? "Upgrade to Core+"
                            : "Subscribe"}
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Available add-ons — usage based */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Available add-ons
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                Pay per use — no monthly fee. Activate anytime.
              </p>
              <div className="space-y-2">
                <Card
                  className={`cursor-pointer transition-colors ${
                    isTrueIdentityActive ? "border-l-4 border-l-emerald-500" : ""
                  } ${selectedDetail === "TRUEIDENTITY" ? "ring-2 ring-primary/20" : ""}`}
                  onClick={() => setSelectedDetail("TRUEIDENTITY")}
                >
                  <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          isTrueIdentityActive ? "bg-emerald-500/20" : "bg-muted"
                        }`}
                      >
                        {isTrueIdentityActive ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            TrueIdentity™
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              isTrueIdentityActive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {isTrueIdentityActive ? "Active" : "Not active"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          e-KYC via QR code. RM 4 per verification.
                        </p>
                        {isTrueIdentityActive && verificationStats && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatNumber(verificationStats.total, 0)} verifications ·{" "}
                            {formatTimeSaved(
                              verificationStats.total,
                              MINS_PER_VERIFICATION
                            )}{" "}
                            saved
                          </p>
                        )}
                      </div>
                    </div>
                    {isTrueIdentityActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={toggling === "TRUEIDENTITY"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelAddOnType("TRUEIDENTITY");
                        }}
                        className="shrink-0"
                      >
                        {toggling === "TRUEIDENTITY" && (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        )}
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={toggling === "TRUEIDENTITY"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubscribeAddOnType("TRUEIDENTITY");
                        }}
                        className="shrink-0"
                      >
                        {toggling === "TRUEIDENTITY" && (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        )}
                        Activate
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Usage-based charges appear on your monthly invoice.{" "}
              <Link href="/dashboard/billing" className="text-foreground hover:underline">
                Go to Billing
              </Link>
            </p>
          </div>

          {/* Right: detail card */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="pt-6 pb-6">
                {selectedDetail === "TRUESEND" ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <Send className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-heading font-semibold text-foreground">
                        TrueSend™
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      TrueKredit generates all loan documents. TrueSend™ sends them
                      straight to your borrowers&apos; inbox automatically with full
                      delivery tracking.
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-2 mb-4">
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        Payment receipts sent after each payment
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        Reminders 3 days and 1 day before due dates
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        Arrears & default notices with letter attachments
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        Real-time delivery tracking & audit trail
                      </li>
                    </ul>
                    <p className="text-sm font-medium text-foreground">
                      RM 50/month extra per extra block of 500 loans
                    </p>
                    <Link
                      href="/dashboard/help?doc=add-ons/automated-emails"
                      className="text-sm text-primary hover:underline mt-2 inline-block"
                    >
                      Learn more
                    </Link>
                  </>
                ) : selectedDetail === "TRUEIDENTITY" ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <Fingerprint className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-heading font-semibold text-foreground">
                        TrueIdentity™
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Integrated e-KYC verification. Generate a QR code, let
                      borrowers scan to photograph their IC and complete a face
                      liveness check. Results are saved for KPKT audit &
                      compliance.
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-2 mb-4">
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        QR-based flow — borrowers verify from anywhere
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        IC photo capture with automatic OCR extraction
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        Face liveness check to prevent identity fraud
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                        Results saved for KPKT compliance
                      </li>
                    </ul>
                    <p className="text-sm font-medium text-foreground">
                      RM 4 per verification · No monthly fee
                    </p>
                    <a
                      href="https://www.truestack.my/trueidentity"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline mt-2 inline-block"
                    >
                      Learn more
                    </a>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
        )}

        {/* Activate confirmation (TrueIdentity only) */}
        <AlertDialog
          open={!!subscribeAddOnType}
          onOpenChange={(open) => !open && setSubscribeAddOnType(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Activate TrueIdentity™?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    TrueIdentity™ is free to activate — you only pay RM 4 per
                    verification. No monthly fee.
                  </p>
                  <p>Do you want to proceed?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!toggling}>Cancel</AlertDialogCancel>
              <Button
                disabled={!!toggling}
                onClick={async () => {
                  if (!subscribeAddOnType) return;
                  await handleToggleAddOn(subscribeAddOnType);
                  setSubscribeAddOnType(null);
                }}
              >
                {toggling === subscribeAddOnType ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Activating…
                  </>
                ) : (
                  "Activate"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Deactivate confirmation (TrueIdentity only) */}
        <AlertDialog
          open={!!cancelAddOnType}
          onOpenChange={(open) => !open && setCancelAddOnType(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate TrueIdentity™</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    This will disable TrueIdentity™. You will no longer be
                    able to verify borrowers' identities.
                  </p>
                  <p>Are you sure?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!toggling}>Keep active</AlertDialogCancel>
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
                    Deactivating…
                  </>
                ) : (
                  "Deactivate"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGate>
  );
}
