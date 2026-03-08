"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
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
import { OnboardingStepper } from "@/components/onboarding-stepper";
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
const SST_RATE = 0.08; // 8% SST (Service Tax)

const BANK_DETAILS = {
  accountName: "Truestack Technologies Sdn Bhd",
  bank: "RHB Bank",
  accountNumber: "26409400034271",
};

interface InvoiceLineItem {
  itemType: string;
  description: string;
  amount: number;
  quantity: number;
  unitPrice: number;
}

interface InvoiceSummary {
  id: string;
  amount: string;
  status: string;
  dueAt: string;
  lineItems?: InvoiceLineItem[];
}

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

function PaymentPageContent() {
  const searchParams = useSearchParams();
  const isOnboardingFlow = searchParams.get("from") === "onboarding";
  const mode = searchParams.get("mode");
  const overdueInvoiceId = searchParams.get("invoiceId");
  const isOverdueMode = mode === "overdue";

  // Parse query params from subscription page
  const queryAmount = Number(searchParams.get("amount")) || CORE_PRICE;
  const hasTruesend = searchParams.get("truesend") === "1";
  const hasTrueIdentity = searchParams.get("trueidentity") === "1";

  // State
  const [selectedMethod, setSelectedMethod] = useState<"bank" | "gateway" | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<"FREE" | "PAID" | "OVERDUE" | "SUSPENDED">("FREE");
  const [existingTruesendActive, setExistingTruesendActive] = useState(false);
  const [existingTrueIdentityActive, setExistingTrueIdentityActive] = useState(false);
  const [loanCount, setLoanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [latestPaymentRequest, setLatestPaymentRequest] = useState<{
    requestId: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    rejectionReason?: string | null;
  } | null>(null);
  const [latestOverdueInvoice, setLatestOverdueInvoice] = useState<InvoiceSummary | null>(null);
  const [truesendPreview, setTruesendPreview] = useState<{
    proratedAmountMyr: number;
    remainingDays: number;
    totalDays: number;
    sstMyr: number;
    totalAmountMyr: number;
    monthlyAmountMyr: number;
    freeActivation?: boolean;
    alreadyActive?: boolean;
    isFirstTimeSubscription?: boolean;
  } | null>(null);

  // Fetch tenant name, subscription status, and loan usage
  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const [authRes, tenantRes, requestRes, addOnsRes, invoicesRes] = await Promise.all([
          fetch("/api/proxy/auth/me", { credentials: "include" }).then((r) => r.json()),
          api.get<{ counts: { loans: number } }>("/api/tenants/current"),
          api.get<{
            requestId: string;
            status: "PENDING" | "APPROVED" | "REJECTED";
            rejectionReason?: string | null;
          } | null>("/api/billing/subscription-payment-request/latest"),
          api.get<{ addOns: { addOnType: string; status: string }[] }>("/api/billing/add-ons"),
          api.get<InvoiceSummary[]>("/api/billing/invoices"),
        ]);
        let status: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED" = "FREE";
        if (authRes.success && authRes.data?.tenant) {
          const s = authRes.data.tenant.subscriptionStatus || "";
          if (s === "PAID" || s === "OVERDUE" || s === "SUSPENDED") {
            status = s;
          }
        }
        if (authRes.success && authRes.data?.tenant) {
          const t = authRes.data.tenant;
          setTenantName(t.name || t.companyName || "");
          if (status === "PAID" || status === "OVERDUE" || status === "SUSPENDED") {
            setSubscriptionStatus(status);
          } else {
            setSubscriptionStatus("FREE");
          }
        }
        if (status === "PAID" && searchParams.get("truesend") === "1") {
          const previewRes = await api.get<{
            proratedAmountMyr: number;
            remainingDays: number;
            totalDays: number;
            sstMyr: number;
            totalAmountMyr: number;
            monthlyAmountMyr: number;
            freeActivation?: boolean;
            alreadyActive?: boolean;
            isFirstTimeSubscription?: boolean;
          }>("/api/billing/add-ons/purchase-preview?addOnType=TRUESEND");
          if (previewRes.success && previewRes.data && !previewRes.data.alreadyActive) {
            setTruesendPreview({
              proratedAmountMyr: previewRes.data.proratedAmountMyr,
              remainingDays: previewRes.data.remainingDays,
              totalDays: previewRes.data.totalDays,
              sstMyr: previewRes.data.sstMyr,
              totalAmountMyr: previewRes.data.totalAmountMyr,
              monthlyAmountMyr: previewRes.data.monthlyAmountMyr,
              freeActivation: previewRes.data.freeActivation ?? false,
              isFirstTimeSubscription: previewRes.data.isFirstTimeSubscription ?? true,
            });
          } else {
            setTruesendPreview(null);
          }
        } else {
          setTruesendPreview(null);
        }
        if (tenantRes.success && tenantRes.data?.counts) {
          setLoanCount(tenantRes.data.counts.loans ?? 0);
        } else {
          setLoanCount(0);
        }
        if (requestRes.success) {
          setLatestPaymentRequest(requestRes.data ?? null);
        }
        if (addOnsRes.success && addOnsRes.data?.addOns) {
          const truesendActive = addOnsRes.data.addOns.some(
            (a) => a.addOnType === "TRUESEND" && a.status === "ACTIVE"
          );
          const trueidentityActive = addOnsRes.data.addOns.some(
            (a) => a.addOnType === "TRUEIDENTITY" && a.status === "ACTIVE"
          );
          setExistingTruesendActive(truesendActive);
          setExistingTrueIdentityActive(trueidentityActive);
        }
        if (invoicesRes.success && Array.isArray(invoicesRes.data)) {
          const unpaidRenewal = invoicesRes.data
            .filter(
              (inv: { status: string; billingType?: string }) =>
                inv.billingType === "RENEWAL" &&
                ["ISSUED", "PENDING_APPROVAL", "OVERDUE"].includes(inv.status)
            )
            .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime())[0];
          setLatestOverdueInvoice(unpaidRenewal ?? null);
        } else {
          setLatestOverdueInvoice(null);
        }
      } catch {
        console.error("Failed to fetch tenant info");
      } finally {
        setLoading(false);
      }
    };
    fetchTenant();
  }, [searchParams]);

  const autoOverdueMode =
    !isOverdueMode &&
    !!latestOverdueInvoice &&
    (subscriptionStatus === "PAID" || subscriptionStatus === "OVERDUE");
  const effectiveOverdueMode = isOverdueMode || autoOverdueMode;
  const effectiveOverdueInvoiceId = isOverdueMode ? overdueInvoiceId : latestOverdueInvoice?.id;
  const effectiveOverdueAmount = latestOverdueInvoice
    ? Number(latestOverdueInvoice.amount)
    : queryAmount;
  const effectiveOverdueLineItems = latestOverdueInvoice?.lineItems ?? [];

  /** I've Made the Transfer — activate subscription/add-ons (testing only) */
  const handleMadeTransfer = async () => {
    setSubmitting(true);
    try {
      if (effectiveOverdueMode && effectiveOverdueInvoiceId) {
        const res = await fetch("/api/proxy/billing/overdue/submit-payment", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: effectiveOverdueInvoiceId,
            paymentReference: reference,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Failed to submit overdue payment request");
          return;
        }
        const createdRequest = data.data?.request ?? null;
        if (createdRequest) {
          setLatestPaymentRequest({
            requestId: createdRequest.requestId,
            status: createdRequest.status,
            rejectionReason: createdRequest.rejectionReason,
          });
        }
        if (data.data?.existing) {
          toast.info("Overdue payment request is already pending verification.");
        } else {
          toast.success("Overdue payment submitted. Awaiting admin verification.");
        }
        window.location.href = "/dashboard/billing";
      } else if (effectiveOverdueMode && !effectiveOverdueInvoiceId) {
        toast.error("Renewal invoice is still being prepared. Please try again in a moment.");
        return;
      } else if (subscriptionStatus !== "PAID") {
        // Subscribe with plan; CORE_TRUESEND enables TrueSend
        const plan = hasTruesend ? "CORE_TRUESEND" : "CORE";
        const requestAddOns = [
          ...(hasTruesend ? ["TRUESEND"] : []),
          ...(hasTrueIdentity ? ["TRUEIDENTITY"] : []),
        ];
        const res = await fetch("/api/proxy/billing/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            paymentReference: reference,
            requestAddOns,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Failed to subscribe");
          return;
        }

        const createdRequest = data.data?.request ?? null;
        if (createdRequest) {
          setLatestPaymentRequest({
            requestId: createdRequest.requestId,
            status: createdRequest.status,
            rejectionReason: createdRequest.rejectionReason,
          });
        }

        if (data.data?.existing) {
          toast.info("Payment request is already pending verification.");
        } else {
          toast.success("Payment submitted. Awaiting admin verification.");
        }
        window.location.href = "/dashboard";
      } else {
        // PAID: purchase/activate add-ons only (no base subscription re-charge)
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
        const toPurchase: string[] = [];
        if (hasTruesend && !active.has("TRUESEND")) toPurchase.push("TRUESEND");
        if (hasTrueIdentity && !active.has("TRUEIDENTITY")) toPurchase.push("TRUEIDENTITY");
        let pendingCount = 0;
        let activatedCount = 0;
        for (const addOnType of toPurchase) {
          const purchaseRes = await api.post<{
            pending?: boolean;
            activated?: boolean;
          }>("/api/billing/add-ons/purchase", {
            addOnType,
            paymentReference: reference,
          });
          if (!purchaseRes.success) {
            toast.error(purchaseRes.error || `Failed to process ${addOnType}`);
            continue;
          }
          if (purchaseRes.data?.pending) pendingCount++;
          if (purchaseRes.data?.activated) activatedCount++;
        }
        if (pendingCount > 0 || activatedCount > 0) {
          toast.success("Add-on request submitted. Reloading…");
          setTimeout(() => (window.location.href = "/dashboard"), 1200);
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
  const hasPendingApproval = latestPaymentRequest?.status === "PENDING";
  const trueIdentityOnlyActivation =
    subscriptionStatus === "PAID" && hasTrueIdentity && !hasTruesend;

  const totalBlocks = Math.max(1, Math.ceil(loanCount / LOANS_PER_BLOCK));
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const coreExtraBlockCost = safeMultiply(extraBlocks, EXTRA_BLOCK_PRICE);
  const truesendExtraBlockCost = hasTruesend ? safeMultiply(extraBlocks, TRUESEND_EXTRA_BLOCK_PRICE) : 0;
  const truesendAddOnAmount =
    subscriptionStatus === "PAID" && hasTruesend && !existingTruesendActive
      ? (truesendPreview != null ? truesendPreview.proratedAmountMyr : TRUESEND_PRICE)
      : 0;
  const addOnOnlySubtotal = safeAdd(truesendAddOnAmount, 0);
  const subscriptionSubtotal = safeAdd(
    CORE_PRICE,
    coreExtraBlockCost,
    hasTruesend ? safeAdd(TRUESEND_PRICE, truesendExtraBlockCost) : 0
  );
  const treatAsPaidTenant = subscriptionStatus === "PAID";
  const usePreviewPricing =
    treatAsPaidTenant &&
    hasTruesend &&
    !existingTruesendActive &&
    truesendPreview != null &&
    !truesendPreview.alreadyActive;
  const subtotal = treatAsPaidTenant ? addOnOnlySubtotal : subscriptionSubtotal;
  const computedBeforeTax = subtotal > 0 ? subtotal : queryAmount;
  const sstAmount =
    effectiveOverdueMode
      ? 0
      : usePreviewPricing
        ? truesendPreview!.sstMyr
        : Math.round(computedBeforeTax * SST_RATE * 100) / 100;
  const amount =
    effectiveOverdueMode
      ? effectiveOverdueAmount
      : usePreviewPricing
        ? truesendPreview!.totalAmountMyr
        : Math.round((computedBeforeTax + sstAmount) * 100) / 100;

  // ── Derived pricing breakdown ──
  const lineItems = useMemo(() => {
    const items: { label: string; amount: number; isCore?: boolean }[] = [];
    if (!treatAsPaidTenant) {
      items.push({ label: "TrueKredit Core Plan", amount: CORE_PRICE, isCore: true });
      if (coreExtraBlockCost > 0) {
        items.push({
          label: `Core extra blocks (${extraBlocks} x ${LOANS_PER_BLOCK} loans)`,
          amount: coreExtraBlockCost,
        });
      }
    }
    if (hasTruesend) {
      const amt =
        treatAsPaidTenant && existingTruesendActive
          ? 0
          : treatAsPaidTenant && truesendPreview != null && !truesendPreview.alreadyActive
            ? truesendPreview.proratedAmountMyr
            : TRUESEND_PRICE;
      const prorationLabel =
        treatAsPaidTenant &&
        truesendPreview != null &&
        !truesendPreview.alreadyActive &&
        truesendPreview.isFirstTimeSubscription !== false &&
        truesendPreview.totalDays > 0 &&
        truesendPreview.remainingDays < truesendPreview.totalDays
          ? ` (prorated ${truesendPreview.remainingDays}/${truesendPreview.totalDays} days)`
          : "";
      items.push({
        label: `TrueSend™ Add-on${prorationLabel}`,
        amount: amt,
      });
    }
    if (hasTruesend && truesendExtraBlockCost > 0 && !treatAsPaidTenant) {
      items.push({
        label: `TrueSend extra blocks (${extraBlocks} x ${LOANS_PER_BLOCK} loans)`,
        amount: truesendExtraBlockCost,
      });
    }
    if (hasTrueIdentity) {
      items.push({
        label: "TrueIdentity™ Add-on",
        amount: 0,
      });
    }
    return items;
  }, [
    treatAsPaidTenant,
    existingTruesendActive,
    truesendPreview,
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
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {isOnboardingFlow && <OnboardingStepper currentStep={3} />}

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link href={isOnboardingFlow ? "/dashboard/subscription?from=onboarding" : "/dashboard/subscription"}>
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

                  {hasTrueIdentity && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                      <p className="text-sm text-blue-700 dark:text-blue-200">
                        <strong>TrueIdentity Disclaimer:</strong> Activation is free. Each verification
                        call is usage-based and charged according to your current TrueIdentity price.
                      </p>
                    </div>
                  )}

                  {hasPendingApproval && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                      <p className="text-sm text-blue-700 dark:text-blue-200">
                        Payment request <strong>{latestPaymentRequest?.requestId}</strong> is pending
                        admin approval. We&apos;ll activate your subscription once verified.
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMadeTransfer();
                    }}
                    disabled={submitting || hasPendingApproval}
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : hasPendingApproval ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {hasPendingApproval
                      ? "Awaiting Admin Verification"
                      : trueIdentityOnlyActivation
                        ? "Activate TrueIdentity"
                        : "I've Made the Transfer"}
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
                {effectiveOverdueMode ? (
                  effectiveOverdueLineItems.length > 0 ? (
                    effectiveOverdueLineItems
                      .filter((li) => li.itemType !== "SST")
                      .map((li, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{li.description}</span>
                          <span className="font-medium">{formatCurrency(li.amount)}</span>
                        </div>
                      ))
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overdue invoice amount</span>
                      <span className="font-medium">{formatCurrency(effectiveOverdueAmount)}</span>
                    </div>
                  )
                ) : lineItems.map((item) => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground inline-flex items-center gap-2">
                      {item.label}
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

              <div className="space-y-1">
                {effectiveOverdueMode ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal (overdue period)</span>
                      <span>{formatCurrency(
                        effectiveOverdueLineItems.length > 0
                          ? effectiveOverdueLineItems
                              .filter((li) => li.itemType !== "SST")
                              .reduce((sum, li) => sum + li.amount, 0)
                          : effectiveOverdueAmount
                      )}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SST (8%)</span>
                      <span>+{formatCurrency(
                        effectiveOverdueLineItems.find((li) => li.itemType === "SST")?.amount ?? 0
                      )}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {treatAsPaidTenant ? "Subtotal (selected add-ons)" : "Subtotal"}
                      </span>
                      <span>{formatCurrency(subtotal > 0 ? subtotal : queryAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SST (8%)</span>
                      <span>+{formatCurrency(sstAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-semibold pt-1">
                  <span>{effectiveOverdueMode || treatAsPaidTenant ? "Due Now" : "Monthly Total"}</span>
                  <span className="text-lg">{formatCurrency(amount)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {effectiveOverdueMode
                  ? "This payment settles your overdue billing period only. After admin approval, your subscription stays in sync with the billed period."
                  : treatAsPaidTenant
                  ? "Only selected add-ons are charged now. You can manage your plan and add-ons anytime from the "
                  : "Billed monthly. You can manage your plan and add-ons anytime from the "}
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

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PaymentPageContent />
    </Suspense>
  );
}
