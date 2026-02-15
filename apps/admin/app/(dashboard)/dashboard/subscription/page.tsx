"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Zap, Rocket, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { cn, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";

/** Core = RM 499, Core+ = RM 549 (Core + TrueSend) */
const CORE_AMOUNT = 49900;
const CORE_PLUS_AMOUNT = 54900;

export default function SubscriptionPage() {
  const router = useRouter();
  const [subscriptionStatus, setSubscriptionStatus] = useState<"FREE" | "PAID">("FREE");
  const [subscriptionAmount, setSubscriptionAmount] = useState<number | null>(null);
  const [truesendActive, setTruesendActive] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [downgrading, setDowngrading] = useState(false);
  const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<"CORE" | "CORE_TRUESEND" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const [authRes, addOnsRes] = await Promise.all([
        fetch("/api/proxy/auth/me", { credentials: "include" }).then((r) => r.json()),
        api.get<{ addOns: { addOnType: string; status: string }[] }>("/api/billing/add-ons"),
      ]);

      if (authRes.success && authRes.data?.tenant) {
        setSubscriptionStatus(authRes.data.tenant.subscriptionStatus || "FREE");
        setSubscriptionAmount(authRes.data.tenant.subscriptionAmount ?? null);
      }

      if (addOnsRes.success && addOnsRes.data?.addOns) {
        const active = addOnsRes.data.addOns.some(
          (a) => a.addOnType === "TRUESEND" && a.status === "ACTIVE"
        );
        setTruesendActive(active);
      }
    } catch (error) {
      console.error("Failed to fetch subscription status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeConfirm = async () => {
    if (!upgradePlan) return;
    const planKey = upgradePlan === "CORE_TRUESEND" ? "core-plus" : "core";
    setSubscribing(planKey);
    setShowUpgradeDialog(false);
    try {
      const res = await fetch("/api/proxy/billing/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: upgradePlan }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Subscription activated! Reloading...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error(data.error || "Failed to subscribe");
      }
    } catch (error) {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribing(null);
      setUpgradePlan(null);
    }
  };

  const openUpgradeDialog = (plan: "CORE" | "CORE_TRUESEND") => {
    setUpgradePlan(plan);
    setShowUpgradeDialog(true);
  };

  const handleDowngrade = async () => {
    setDowngrading(true);
    try {
      const res = await api.post<{ addOnType: string; status: string }>(
        "/api/billing/add-ons/toggle",
        { addOnType: "TRUESEND" }
      );
      if (res.success && res.data?.status === "CANCELLED") {
        toast.success("Plan downgraded to Core. TrueSend™ will be disabled at the end of your billing period.");
        setShowDowngradeDialog(false);
        fetchSubscriptionStatus();
      } else {
        toast.error(res.error || "Failed to downgrade");
      }
    } catch {
      toast.error("Failed to downgrade");
    } finally {
      setDowngrading(false);
    }
  };

  // Core+ = paid with Core+ plan (RM 549) OR paid with TrueSend add-on enabled
  const isCorePlus =
    subscriptionStatus === "PAID" &&
    (subscriptionAmount === CORE_PLUS_AMOUNT || truesendActive);
  const isCore =
    subscriptionStatus === "PAID" &&
    !isCorePlus &&
    (subscriptionAmount === null || subscriptionAmount === CORE_AMOUNT);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3">Upgrade your plan</h1>
        <p className="text-lg text-muted-foreground">
          Get the most out of loan business
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto items-stretch">
        {/* Core Plan */}
        <Card
          className={cn(
            "relative flex flex-col p-6 border-2 transition-all",
            isCore
              ? "border-primary bg-primary/5"
              : "border-primary shadow-lg hover:shadow-xl"
          )}
        >
          {isCore && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge variant="outline" className="bg-background">
                Your current plan
              </Badge>
            </div>
          )}
          {!isCore && !isCorePlus && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-gradient-accent border-0 text-primary-foreground">
                <Sparkles className="h-3 w-3 mr-1" />
                Most Popular
              </Badge>
            </div>
          )}

          <div className="flex flex-col flex-1 space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Core
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">RM 499</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Unlock the full experience</p>
            </div>

            <ul className="flex-1 space-y-3">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Borrower management</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Loan products & applications</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Payment tracking & schedules</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Automatic Jadual J and K generation</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Compliance (KPKT iDeaL export, Lampiran A)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Full audit logs</span>
              </li>
            </ul>

            <div className="mt-auto pt-4">
              {isCore ? (
                <Button variant="default" className="w-full bg-gradient-accent hover:opacity-90" disabled>
                  Current plan
                </Button>
              ) : subscriptionStatus === "PAID" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowDowngradeDialog(true)}
                  disabled={!!subscribing}
                >
                  Downgrade
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-accent hover:opacity-90 text-primary-foreground"
                  onClick={() => openUpgradeDialog("CORE")}
                  disabled={!!subscribing}
                >
                  {subscribing === "core" ? "Processing..." : "Upgrade to Core"}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Core+ Plan (Core + TrueSend) */}
        <Card
          className={cn(
            "relative flex flex-col p-6 border-2 transition-all",
            isCorePlus
              ? "border-primary bg-primary/5"
              : "border-primary shadow-lg hover:shadow-xl"
          )}
        >
          {isCorePlus && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge variant="outline" className="bg-background">
                Your current plan
              </Badge>
            </div>
          )}

          <div className="flex flex-col flex-1 space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Core+
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">RM 549</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Core + TrueSend™ subscription</p>
            </div>

            <ul className="flex-1 space-y-3">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm font-medium">Everything in Core</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">TrueSend™ — automated email delivery</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Payment receipts & reminders auto-sent by email</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Arrears & default notices auto-sent by email</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Delivery tracking & audit trail</span>
              </li>
            </ul>

            <div className="mt-auto pt-4">
              {isCorePlus ? (
                <Button variant="default" className="w-full bg-gradient-accent hover:opacity-90" disabled>
                  Current plan
                </Button>
              ) : subscriptionStatus === "PAID" ? (
                <Button
                  className="w-full bg-gradient-accent hover:opacity-90 text-primary-foreground"
                  onClick={() => openUpgradeDialog("CORE_TRUESEND")}
                  disabled={!!subscribing}
                >
                  {subscribing === "core-plus" ? "Processing..." : "Upgrade to Core+"}
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-accent hover:opacity-90 text-primary-foreground"
                  onClick={() => openUpgradeDialog("CORE_TRUESEND")}
                  disabled={!!subscribing}
                >
                  {subscribing === "core-plus" ? "Processing..." : "Upgrade to Core+"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 max-w-4xl mx-auto rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">All plans:</strong> Includes up to 500 loans in system. Additional blocks of 500 loans will be charged at RM 200/month extra automatically. TrueSend™ will incur an additional RM 50/month for additional blocks of 500 loans.
        </p>
      </div>

      <div className="text-center mt-8">
        <p className="text-sm text-muted-foreground">
          Need more capabilities for your business?{" "}
          <Link href="/dashboard/help" className="text-primary hover:underline">
            Contact us
          </Link>
        </p>
      </div>

      {/* Upgrade confirmation */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={(open) => { setShowUpgradeDialog(open); if (!open) setUpgradePlan(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Upgrade to {upgradePlan === "CORE_TRUESEND" ? "Core+" : "Core"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This upgrade will take effect <strong>immediately</strong>. Your new monthly charge will be{" "}
                  <strong>{formatCurrency(upgradePlan === "CORE_TRUESEND" ? 549 : 499)}</strong> until you downgrade.
                </p>
                <p>Are you sure you want to proceed?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!subscribing}>Cancel</AlertDialogCancel>
            <Button
              disabled={!!subscribing}
              onClick={handleUpgradeConfirm}
            >
              {subscribing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Processing…
                </>
              ) : (
                `Upgrade to ${upgradePlan === "CORE_TRUESEND" ? "Core+" : "Core"}`
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Downgrade confirmation */}
      <AlertDialog open={showDowngradeDialog} onOpenChange={setShowDowngradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade to Core?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will remove TrueSend™ from your subscription and revert your plan from <strong>Core+</strong> to <strong>Core</strong>.
                </p>
                <p className="font-medium text-foreground">You will lose:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>TrueSend™ — automated email delivery</li>
                  <li>Payment receipts & reminders auto-sent by email</li>
                  <li>Arrears & default notices auto-sent by email</li>
                  <li>Delivery tracking & audit trail</li>
                </ul>
                <p>
                  TrueSend™ will be disabled at the end of your current billing period. You will still have access to all Core features.
                </p>
                <p>Are you sure you want to proceed?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={downgrading}>Keep Core+</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={downgrading}
              onClick={handleDowngrade}
            >
              {downgrading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Downgrading…
                </>
              ) : (
                "Downgrade to Core"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
