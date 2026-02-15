"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  CreditCard,
  Landmark,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency, formatNumber, safeAdd, safeMultiply } from "@/lib/utils";
import { format } from "date-fns";

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

const BANK_DETAILS = {
  accountName: "Truestack Technologies Sdn Bhd",
  bank: "RHB Bank",
  accountNumber: "26409400034271",
};

// ============================================
// Helpers
// ============================================

/** Build a payment reference: TK-CLIENTNAME-YYMMDD (max 20 chars for name portion) */
function buildReference(clientName: string): string {
  const datePart = format(new Date(), "yyMMdd");
  // Clean & uppercase, remove non-alphanumeric
  const cleaned = clientName.replace(/[^a-zA-Z0-9 ]/g, "").toUpperCase();
  // Take initials or abbreviate if > 12 chars
  let namePart: string;
  if (cleaned.length <= 12) {
    namePart = cleaned.replace(/\s+/g, "");
  } else {
    // Use first letters of each word, up to 12 chars
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      namePart = words.map((w) => w.slice(0, 3)).join("").slice(0, 12);
    } else {
      namePart = cleaned.slice(0, 12);
    }
  }
  return `TK${namePart}${datePart}`;
}

// ============================================
// Copy Button Component
// ============================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label || "Text"} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy ${label || "text"}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ============================================
// Page
// ============================================

export default function PaymentPage() {
  const searchParams = useSearchParams();

  // Parse query params from subscription page
  const queryAmount = Number(searchParams.get("amount")) || CORE_PRICE;
  const hasTruesend = searchParams.get("truesend") === "1";
  const hasTrueIdentity = searchParams.get("trueidentity") === "1";

  // State
  const [selectedMethod, setSelectedMethod] = useState<"bank" | "gateway" | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<"FREE" | "PAID">("FREE");
  const [loanCount, setLoanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch tenant name, subscription status, and loan usage
  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const [authRes, tenantRes] = await Promise.all([
          fetch("/api/proxy/auth/me", { credentials: "include" }).then((r) => r.json()),
          api.get<{ counts: { loans: number } }>("/api/tenants/current"),
        ]);
        if (authRes.success && authRes.data?.tenant) {
          const t = authRes.data.tenant;
          setTenantName(t.name || t.companyName || "");
          setSubscriptionStatus((t.subscriptionStatus || "FREE") === "PAID" ? "PAID" : "FREE");
        }
        if (tenantRes.success && tenantRes.data?.counts) {
          setLoanCount(tenantRes.data.counts.loans ?? 0);
        } else {
          setLoanCount(0);
        }
      } catch {
        console.error("Failed to fetch tenant info");
      } finally {
        setLoading(false);
      }
    };
    fetchTenant();
  }, []);

  /** I've Made the Transfer — activate subscription/add-ons (testing only) */
  const handleMadeTransfer = async () => {
    setSubmitting(true);
    try {
      if (subscriptionStatus === "FREE") {
        // Subscribe with plan; CORE_TRUESEND enables TrueSend
        const plan = hasTruesend ? "CORE_TRUESEND" : "CORE";
        const res = await fetch("/api/proxy/billing/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Failed to subscribe");
          return;
        }
        // Activate TrueIdentity if selected
        if (hasTrueIdentity) {
          await api.post("/api/billing/add-ons/toggle", { addOnType: "TRUEIDENTITY" });
        }
        toast.success("Subscription activated! Reloading…");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        // PAID: activate add-ons that are selected but not yet active (testing only)
        const addOnsRes = await api.get<{ addOns: { addOnType: string; status: string }[] }>(
          "/api/billing/add-ons"
        );
        if (!addOnsRes.success) {
          toast.error(addOnsRes.error || "Failed to fetch add-ons");
          return;
        }
        const active = new Set(
          (addOnsRes.data?.addOns ?? [])
            .filter((a) => a.status === "ACTIVE")
            .map((a) => a.addOnType)
        );
        const toActivate: string[] = [];
        if (hasTruesend && !active.has("TRUESEND")) toActivate.push("TRUESEND");
        if (hasTrueIdentity && !active.has("TRUEIDENTITY")) toActivate.push("TRUEIDENTITY");
        for (const addOnType of toActivate) {
          await api.post("/api/billing/add-ons/toggle", { addOnType });
        }
        if (toActivate.length > 0) {
          toast.success("Add-ons activated! Reloading…");
          setTimeout(() => window.location.reload(), 1000);
        } else {
          toast.info("No add-on changes to apply.");
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const reference = useMemo(() => {
    if (!tenantName) return "TK-...";
    return buildReference(tenantName);
  }, [tenantName]);

  const totalBlocks = Math.max(1, Math.ceil(loanCount / LOANS_PER_BLOCK));
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const coreExtraBlockCost = safeMultiply(extraBlocks, EXTRA_BLOCK_PRICE);
  const truesendExtraBlockCost = hasTruesend ? safeMultiply(extraBlocks, TRUESEND_EXTRA_BLOCK_PRICE) : 0;
  const computedAmount = safeAdd(
    CORE_PRICE,
    coreExtraBlockCost,
    hasTruesend ? safeAdd(TRUESEND_PRICE, truesendExtraBlockCost) : 0
  );
  const amount = computedAmount > 0 ? computedAmount : queryAmount;

  // ── Derived pricing breakdown ──
  const lineItems = useMemo(() => {
    const items: { label: string; amount: number; isCore?: boolean }[] = [];
    items.push({ label: "TrueKredit Core Plan", amount: CORE_PRICE, isCore: true });
    if (coreExtraBlockCost > 0) {
      items.push({
        label: `Core extra blocks (${extraBlocks} x ${LOANS_PER_BLOCK} loans)`,
        amount: coreExtraBlockCost,
      });
    }
    if (hasTruesend) items.push({ label: "TrueSend™ Add-on", amount: TRUESEND_PRICE });
    if (hasTruesend && truesendExtraBlockCost > 0) {
      items.push({
        label: `TrueSend extra blocks (${extraBlocks} x ${LOANS_PER_BLOCK} loans)`,
        amount: truesendExtraBlockCost,
      });
    }
    if (hasTrueIdentity) items.push({ label: "TrueIdentity™ Add-on", amount: 0 });
    return items;
  }, [
    coreExtraBlockCost,
    extraBlocks,
    hasTruesend,
    hasTrueIdentity,
    truesendExtraBlockCost,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/subscription">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-heading">
            Choose Payment Method
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Select how you&apos;d like to pay for your subscription
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: Payment Methods ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Bank Transfer */}
          <Card
            className={cn(
              "cursor-pointer transition-all border-2 hover:border-primary/50",
              selectedMethod === "bank"
                ? "border-primary bg-primary/5"
                : "border-transparent"
            )}
            onClick={() => setSelectedMethod("bank")}
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      selectedMethod === "bank"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Bank Transfer</h3>
                    <p className="text-sm text-muted-foreground">
                      Manual transfer to our bank account
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">
                  Manual
                </Badge>
              </div>

              {/* Expanded bank details */}
              {selectedMethod === "bank" && (
                <div className="mt-5 space-y-4">
                  <Separator />

                  <div className="rounded-lg bg-muted/10 dark:bg-muted/10 p-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Transfer Details
                    </p>

                    {/* Account Name */}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Account Name</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{BANK_DETAILS.accountName}</p>
                      </div>
                    </div>

                    {/* Bank */}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Bank</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{BANK_DETAILS.bank}</p>
                      </div>
                    </div>

                    {/* Account Number */}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Account Number</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-semibold text-lg tracking-wider">
                          {BANK_DETAILS.accountNumber}
                        </p>
                        <CopyButton
                          text={BANK_DETAILS.accountNumber}
                          label="Account number"
                        />
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-lg">
                          {formatCurrency(amount)}
                        </p>
                        <CopyButton
                          text={amount.toFixed(2)}
                          label="Amount"
                        />
                      </div>
                    </div>

                    {/* Reference */}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Payment Reference</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-semibold tracking-wider">
                          {reference}
                        </p>
                        <CopyButton text={reference} label="Reference" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-sm text-amber-700 dark:text-amber-200">
                      <strong>Important:</strong> Please use the exact reference above when making
                      your transfer. Your subscription will be activated within 1 business day
                      after payment is verified.
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMadeTransfer();
                    }}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    I&apos;ve Made the Transfer
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Payment Gateway */}
          <Card
            className={cn(
              "cursor-pointer transition-all border-2 hover:border-primary/50 relative",
              selectedMethod === "gateway"
                ? "border-primary bg-primary/5"
                : "border-transparent"
            )}
            onClick={() => setSelectedMethod("gateway")}
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      selectedMethod === "gateway"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Payment Gateway</h3>
                    <p className="text-sm text-muted-foreground">
                      Pay instantly with credit/debit card or FPX
                    </p>
                  </div>
                </div>
                <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs shrink-0">
                  Coming Soon
                </Badge>
              </div>

              {selectedMethod === "gateway" && (
                <div className="mt-5 space-y-4">
                  <Separator />
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-3">
                      <CreditCard className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h4 className="font-semibold mb-1">Coming Soon</h4>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Online payment via credit/debit card and FPX will be available shortly.
                      For now, please use bank transfer.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right: Order Summary ── */}
        <div className="lg:col-span-2">
          <div className="sticky top-24">
            <Card className="p-5 space-y-4">
              <h3 className="font-semibold text-lg">Order Summary</h3>

              <div className="space-y-2.5">
                {lineItems.map((item) => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground inline-flex items-center gap-2">
                      {item.label}
                      {/* {item.isCore && (
                        <Badge className="bg-black text-white hover:bg-black text-[10px] font-semibold border-0 px-1.5 py-0.5">
                          Save {CORE_DISCOUNT_PCT}%
                        </Badge>
                      )} */}
                    </span>
                    <span className="font-medium">
                      {item.amount === 0 ? (
                        <span className="text-foreground">Free</span>
                      ) : (
                        formatCurrency(item.amount)
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Current usage: {formatNumber(loanCount, 0)} loans ({totalBlocks} block
                {totalBlocks !== 1 ? "s" : ""}).
              </p>

              <Separator />

              <div className="flex justify-between font-semibold">
                <span>Monthly Total</span>
                <span className="text-lg">{formatCurrency(amount)}</span>
              </div>

              <p className="text-xs text-muted-foreground">
                Billed monthly. You can manage your plan and add-ons anytime from
                the{" "}
                <Link
                  href="/dashboard/subscription"
                  className="text-foreground hover:underline"
                >
                  subscription page
                </Link>
                .
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
