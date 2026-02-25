"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ArrowLeft,
  Send,
  Fingerprint,
  BadgePercent,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { OnboardingStepper } from "@/components/onboarding-stepper";
import { cn, formatCurrency, formatNumber, safeAdd, safeMultiply } from "@/lib/utils";
import { api } from "@/lib/api";

// ============================================
// Constants
// ============================================

const CORE_ORIGINAL_PRICE = 899;
const CORE_PRICE = 499;
const CORE_DISCOUNT_PCT = Math.round(((CORE_ORIGINAL_PRICE - CORE_PRICE) / CORE_ORIGINAL_PRICE) * 100);
const TRUESEND_PRICE = 50;
const LOANS_PER_BLOCK = 500;
const EXTRA_BLOCK_PRICE = 200;
const TRUESEND_EXTRA_BLOCK_PRICE = 50;

const CORE_FEATURES = [
  "Borrower management",
  "Loan products & applications",
  "Payment tracking & schedules",
  "Jadual J and K generation",
  "KPKT iDeaL export, Lampiran A",
  "Full audit logs",
];

// ============================================
// Page
// ============================================

export default function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboardingFlow = searchParams.get("from") === "onboarding";

  // ── state ──
  const [subscriptionStatus, setSubscriptionStatus] = useState<"FREE" | "PAID">("FREE");
  const [loading, setLoading] = useState(true);

  // Local toggle state (drives the UI switches)
  const [wantsTruesend, setWantsTruesend] = useState(true); // all add-ons enabled by default
  const [wantsTrueIdentity, setWantsTrueIdentity] = useState(true);
  const [loanCount, setLoanCount] = useState(0);

  // Dialog state
  const [pendingDisableAddOn, setPendingDisableAddOn] = useState<"TRUESEND" | "TRUEIDENTITY" | null>(null);
  const [showBackToOnboardingConfirm, setShowBackToOnboardingConfirm] = useState(false);

  const isPaid = subscriptionStatus === "PAID";

  /** Intercept add-on toggle: show confirmation when disabling */
  const handleTruesendToggle = (newValue: boolean) => {
    if (newValue === false) {
      setPendingDisableAddOn("TRUESEND");
    } else {
      setWantsTruesend(true);
    }
  };
  const handleTrueIdentityToggle = (newValue: boolean) => {
    if (newValue === false) {
      setPendingDisableAddOn("TRUEIDENTITY");
    } else {
      setWantsTrueIdentity(true);
    }
  };

  // ── pricing ──
  const totalBlocks = Math.max(1, Math.ceil(loanCount / LOANS_PER_BLOCK));
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const coreExtraBlockCost = safeMultiply(extraBlocks, EXTRA_BLOCK_PRICE);
  const truesendBaseCost = wantsTruesend ? TRUESEND_PRICE : 0;
  const truesendExtraBlockCost = wantsTruesend ? safeMultiply(extraBlocks, TRUESEND_EXTRA_BLOCK_PRICE) : 0;
  const coreMonthlyTotal = safeAdd(CORE_PRICE, coreExtraBlockCost);
  const truesendMonthlyTotal = safeAdd(truesendBaseCost, truesendExtraBlockCost);
  const monthlyTotal = safeAdd(coreMonthlyTotal, truesendMonthlyTotal);

  // ── fetch ──
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const [authRes, addOnsRes, tenantRes] = await Promise.all([
        fetch("/api/proxy/auth/me", { credentials: "include" }).then((r) => r.json()),
        api.get<{ addOns: { addOnType: string; status: string }[] }>("/api/billing/add-ons"),
        api.get<{ counts: { loans: number } }>("/api/tenants/current"),
      ]);

      if (authRes.success && authRes.data?.tenant) {
        const status = authRes.data.tenant.subscriptionStatus || "FREE";
        setSubscriptionStatus(status);
      }

      if (addOnsRes.success && addOnsRes.data?.addOns) {
        const ts = addOnsRes.data.addOns.some(
          (a) => a.addOnType === "TRUESEND" && a.status === "ACTIVE"
        );
        const ti = addOnsRes.data.addOns.some(
          (a) => a.addOnType === "TRUEIDENTITY" && a.status === "ACTIVE"
        );
        // Sync local toggles with server for existing subscribers
        if (authRes.success && authRes.data?.tenant?.subscriptionStatus === "PAID") {
          setWantsTruesend(ts);
          setWantsTrueIdentity(ti);
        }
      }

      if (tenantRes.success && tenantRes.data?.counts) {
        setLoanCount(tenantRes.data.counts.loans ?? 0);
      } else {
        setLoanCount(0);
      }
    } catch (error) {
      console.error("Failed to fetch subscription status:", error);
    } finally {
      setLoading(false);
    }
  };

  // ── handlers ──

  /** Navigate to payment page with selected plan & add-ons */
  const handleProceedToPayment = () => {
    const params = new URLSearchParams();
    params.set("plan", "CORE");
    params.set("amount", String(monthlyTotal));
    if (wantsTruesend) params.set("truesend", "1");
    if (wantsTrueIdentity) params.set("trueidentity", "1");
    if (isOnboardingFlow) params.set("from", "onboarding");
    router.push(`/dashboard/subscription/payment?${params.toString()}`);
  };

  // ── loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16">
      {isOnboardingFlow && <OnboardingStepper currentStep={2} />}

      {/* Header */}
      <div>
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-1 mt-0.5"
            onClick={() => {
              if (isOnboardingFlow) {
                setShowBackToOnboardingConfirm(true);
              } else {
                router.push("/dashboard/plan");
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold">
              {isPaid ? "Manage your plan" : "Choose your plan"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isPaid
                ? "Your Core subscription and add-on modules."
                : "Subscribe to Core and pick the add-ons you need."}
            </p>
          </div>
        </div>
      </div>

      {/* 2-column layout: left = plan + add-ons, right = sticky summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ──── Left column ──── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Core Plan Card */}
          <Card
            className={cn(
              "relative p-5 border transition-all",
              isPaid
                ? "border-primary/30 bg-emerald-500/5"
                : "border-primary/30 shadow-sm"
            )}
          >
            {isPaid && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="outline" className="bg-background">
                  Base plan
                </Badge>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Core</h3>
                  <p className="text-sm text-muted-foreground">
                    Full loan management platform
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 text-xs font-semibold border-0 px-2 py-0.5">
                  Save {CORE_DISCOUNT_PCT}%
                </Badge>
                <div className="flex items-baseline gap-1 justify-end">
                  <span className="text-2xl font-bold">{formatCurrency(CORE_PRICE)}</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground line-through leading-none">{formatCurrency(CORE_ORIGINAL_PRICE)}/mo</p>
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {CORE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-lg border border-border/50 bg-muted/10 p-3">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Plan includes:</strong> First {LOANS_PER_BLOCK} loans.
                {extraBlocks > 0 ? (
                  <>
                    {" "}You use {formatNumber(loanCount, 0)} loans ({totalBlocks} block{totalBlocks !== 1 ? "s" : ""}) — +{formatCurrency(coreExtraBlockCost)}/mo
                    {wantsTruesend && truesendExtraBlockCost > 0 && (
                      <> (+{formatCurrency(truesendExtraBlockCost)} TrueSend™)</>
                    )}.
                  </>
                ) : (
                  <> Extra blocks: +{formatCurrency(EXTRA_BLOCK_PRICE)}/mo each{wantsTruesend && <> (+{formatCurrency(TRUESEND_EXTRA_BLOCK_PRICE)} TrueSend™)</>}.</>
                )}
              </p>
            </div>
          </Card>

          {/* Add-on modules */}
          <div className="flex flex-col gap-6">
            {/* TrueSend */}
            <AddOnCard
              icon={Send}
              name="TrueSend™"
              badge="Monthly"
              recommended
              description={
                extraBlocks > 0
                  ? `Automated email delivery — receipts, reminders, arrears & default notices. Current usage adds +${formatCurrency(truesendExtraBlockCost)}/month for ${extraBlocks} extra block${extraBlocks > 1 ? "s" : ""}.`
                  : "Automated email delivery — receipts, reminders, arrears & default notices."
              }
              highlights={[
                "Reduce manual follow-ups and missed reminders",
                "Send receipts and notices instantly with audit trail",
                "Keep borrower communication consistent and professional",
              ]}
              priceLabel={`+${formatCurrency(TRUESEND_PRICE)} /mo`}
              active={wantsTruesend}
              onToggle={handleTruesendToggle}
            />

            {/* TrueIdentity */}
            <AddOnCard
              icon={Fingerprint}
              name="TrueIdentity™"
              badge="Pay per use"
              recommended
              description="e-KYC via QR code — IC capture, face liveness, KPKT compliant. RM 4 per verification."
              highlights={[
                "Verify borrowers faster with QR-based self-service",
                "Reduce fraud risk using face liveness checks",
                "Store verification records for compliance and audits",
              ]}
              priceLabel="Free"
              priceMuted
              active={wantsTrueIdentity}
              onToggle={handleTrueIdentityToggle}
            />
          </div>

          <div className="text-center lg:text-left">
            <p className="text-sm text-muted-foreground">
              Need more capabilities for your business?{" "}
              <Link href="/dashboard/help" className="text-primary hover:underline">
                Contact us
              </Link>
            </p>
          </div>
        </div>

        {/* ──── Right column: sticky summary ──── */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4">
            <Card className="p-5 bg-muted/10 border-border/80">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Summary
              </h3>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">Core Plan</span>
                  <span className="tabular-nums">{formatCurrency(CORE_PRICE)}/mo</span>
                </div>
                {extraBlocks > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Core extra blocks ({extraBlocks} × {LOANS_PER_BLOCK} loans)
                    </span>
                    <span className="tabular-nums">+{formatCurrency(coreExtraBlockCost)}/mo</span>
                  </div>
                )}

                {wantsTruesend && (
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">TrueSend™</span>
                    <span className="tabular-nums">+{formatCurrency(TRUESEND_PRICE)}/mo</span>
                  </div>
                )}
                {wantsTruesend && truesendExtraBlockCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      TrueSend extra blocks ({extraBlocks} × {LOANS_PER_BLOCK} loans)
                    </span>
                    <span className="tabular-nums">+{formatCurrency(truesendExtraBlockCost)}/mo</span>
                  </div>
                )}

                {wantsTrueIdentity && (
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">TrueIdentity™</span>
                    <span className="text-muted-foreground tabular-nums">RM 4/use</span>
                  </div>
                )}

                <Separator />

                <div className="pt-1">
                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-foreground">Total</span>
                    <div className="text-right">
                      <span className="text-2xl font-bold tabular-nums">{formatCurrency(monthlyTotal)}</span>
                      <span className="text-muted-foreground text-sm">/mo</span>
                    </div>
                  </div>
                  {wantsTrueIdentity && (
                    <p className="text-xs text-muted-foreground mt-1">+ RM 4 per e-KYC verification</p>
                  )}
                </div>
              </div>

              {/* Action button */}
              <Button
                className="w-full mt-5 bg-gradient-accent hover:opacity-90 text-primary-foreground h-11 text-base"
                onClick={handleProceedToPayment}
              >
                Proceed to payment
              </Button>
              {isPaid && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Add-on changes are applied when you proceed to payment.
                </p>
              )}
            </Card>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <BadgePercent className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Nice! You save {formatCurrency(CORE_ORIGINAL_PRICE - CORE_PRICE)}/month
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================ */}
      {/* Dialog: Disable add-on confirmation              */}
      {/* ================================================ */}
      <AlertDialog
        open={!!pendingDisableAddOn}
        onOpenChange={(open) => !open && setPendingDisableAddOn(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDisableAddOn === "TRUESEND" ? "Remove TrueSend™?" : "Disable TrueIdentity™?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {pendingDisableAddOn === "TRUESEND" ? (
                  <>
                    <p>
                      This will disable TrueSend™. Automated emails will stop at the end of your current billing period.
                      You will still have access to all Core features.
                    </p>
                    <p>Are you sure?</p>
                  </>
                ) : (
                  <>
                    <p>
                      This will disable TrueIdentity™. You will no longer be able to verify borrowers&apos; identities.
                    </p>
                    <p>Are you sure?</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDisableAddOn === "TRUESEND") setWantsTruesend(false);
                if (pendingDisableAddOn === "TRUEIDENTITY") setWantsTrueIdentity(false);
                setPendingDisableAddOn(null);
              }}
            >
              {pendingDisableAddOn === "TRUESEND" ? "Remove TrueSend" : "Disable"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================ */}
      {/* Dialog: Back to company details confirmation     */}
      {/* ================================================ */}
      <AlertDialog
        open={showBackToOnboardingConfirm}
        onOpenChange={setShowBackToOnboardingConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Go back to company details?</AlertDialogTitle>
            <AlertDialogDescription>
              Your tenant has already been created. Going back to company details will create a new tenant. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setShowBackToOnboardingConfirm(false);
                router.push("/dashboard/onboarding");
              }}
            >
              Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

// ============================================
// AddOnCard component
// ============================================

function AddOnCard({
  icon: Icon,
  name,
  badge,
  description,
  highlights,
  priceLabel,
  priceMuted = false,
  active,
  onToggle,
  recommended = false,
}: {
  icon: React.ElementType;
  name: string;
  badge: string;
  description: string;
  highlights?: string[];
  priceLabel: string;
  priceMuted?: boolean;
  active: boolean;
  onToggle: (value: boolean) => void;
  recommended?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-visible p-4 sm:p-5 border transition-all cursor-pointer",
        active
          ? "border-primary/30 bg-emerald-500/5"
          : "border-border bg-background hover:border-primary/20"
      )}
      onClick={() => onToggle(!active)}
    >
      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
        <Badge variant="outline" className="bg-background">
          Add on
        </Badge>
      </div>
      {recommended && active && (
        <Badge
          variant="secondary"
          className="pointer-events-none absolute right-3 top-3 z-10 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 border-0"
        >
          Enabled
        </Badge>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        {/* Left: icon, name, description */}
        <div className="flex items-start gap-3 sm:flex-1 min-w-0">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              active ? "bg-emerald-500/20" : "bg-muted"
            )}
          >
            {active ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Icon className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{name}</span>
              <Badge variant="secondary" className="text-xs">
                {badge}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
            {highlights && highlights.length > 0 && (
              <ul className="mt-2 space-y-1">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: price + toggle (Apple configurator style) */}
        <div className="flex items-center justify-between sm:justify-end gap-4 sm:shrink-0 sm:border-l sm:border-border/50 sm:pl-6">
          <span className={cn("text-sm font-semibold tabular-nums", priceMuted && "text-muted-foreground")}>
            {priceLabel}
          </span>
          <Switch
            checked={active}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </Card>
  );
}
