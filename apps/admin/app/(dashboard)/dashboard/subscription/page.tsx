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
  Loader2,
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
import { toast } from "sonner";

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

const roundHalfUp2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const differenceInDays = (start: Date, end: Date) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / msPerDay));
};

/** Days until target date (MYT). Positive = future, negative = past. */
function getMytDaysUntil(targetIsoDate: string): number {
  const target = new Date(targetIsoDate);
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const getParts = (d: Date) => {
    const parts = formatter.formatToParts(d);
    return {
      y: parts.find((p) => p.type === "year")?.value ?? "1970",
      m: parts.find((p) => p.type === "month")?.value ?? "01",
      d: parts.find((p) => p.type === "day")?.value ?? "01",
    };
  };
  const nowP = getParts(now);
  const targetP = getParts(target);
  const nowUtc = Date.UTC(Number(nowP.y), Number(nowP.m) - 1, Number(nowP.d));
  const targetUtc = Date.UTC(Number(targetP.y), Number(targetP.m) - 1, Number(targetP.d));
  return Math.ceil((targetUtc - nowUtc) / (1000 * 60 * 60 * 24));
}

function toApiDateParam(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const directDateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDateMatch) return directDateMatch[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(parsed)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTomorrowMytDateParam(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
  const todayUtc = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  todayUtc.setUTCDate(todayUtc.getUTCDate() + 1);
  return todayUtc.toISOString().slice(0, 10);
}

const CORE_FEATURES = [
  "Borrower management",
  "Loan products & applications",
  "Payment tracking & schedules",
  "Jadual J and K generation",
  "KPKT iDeaL export, Lampiran A",
  "Full audit logs",
];

interface PricingData {
  truesendMonthlyMyr: number;
}

// ============================================
// Page
// ============================================

export default function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboardingFlow = searchParams.get("from") === "onboarding";

  // ── state ──
  const [subscriptionStatus, setSubscriptionStatus] = useState<"FREE" | "PAID" | "OVERDUE" | "SUSPENDED">("FREE");
  const [loading, setLoading] = useState(true);
  const [autoRenew, setAutoRenew] = useState(true);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [latestUnpaidRenewalInvoice, setLatestUnpaidRenewalInvoice] = useState<{
    id: string;
    amount: string;
    status: string;
    dueAt: string;
    billingType?: string;
    lineItems?: Array<{ itemType: string; description: string; amount: unknown; quantity: number; unitPrice: unknown }>;
  } | null>(null);

  // Local toggle state (drives the UI switches) – synced from backend/DB on load
  const [wantsTruesend, setWantsTruesend] = useState(false);
  const [wantsTrueIdentity, setWantsTrueIdentity] = useState(false);
  const [existingTruesendActive, setExistingTruesendActive] = useState(false);
  const [existingTrueIdentityActive, setExistingTrueIdentityActive] = useState(false);
  const [hasEverHadTruesend, setHasEverHadTruesend] = useState(false);
  const [loanCount, setLoanCount] = useState(0);
  const [truesendProration, setTruesendProration] = useState<{
    proratedAmountMyr: number;
    remainingDays: number;
    totalDays: number;
    sstMyr: number;
    totalAmountMyr: number;
    monthlyAmountMyr: number;
  } | null>(null);
  const [pendingAddOnAction, setPendingAddOnAction] = useState<{
    addOnType: "TRUESEND" | "TRUEIDENTITY";
    enable: boolean;
  } | null>(null);
  const [addOnActionLoading, setAddOnActionLoading] = useState(false);
  const [renewalPaymentLoading, setRenewalPaymentLoading] = useState(false);
  const [liveTrueIdentityUsage, setLiveTrueIdentityUsage] = useState<{
    verificationCount: number;
    usageAmountMyr: number;
  } | null>(null);

  // Dialog state
  const [showBackToOnboardingConfirm, setShowBackToOnboardingConfirm] = useState(false);
  const [showCancelAutoRenewConfirm, setShowCancelAutoRenewConfirm] = useState(false);
  const [cancelAutoRenewLoading, setCancelAutoRenewLoading] = useState(false);
  const [showCancelOverdueConfirm, setShowCancelOverdueConfirm] = useState(false);
  const [cancelOverdueLoading, setCancelOverdueLoading] = useState(false);

  const isPaid = subscriptionStatus === "PAID";
  const canManageExistingAddOns = subscriptionStatus === "PAID" || subscriptionStatus === "OVERDUE";

  /** Save add-on changes immediately on toggle */
  const saveToggle = async (addOnType: "TRUESEND" | "TRUEIDENTITY") => {
    const res = await api.post<{
      addOnType: string;
      status: string;
      effectiveUntil?: string | null;
    }>("/api/billing/add-ons/toggle", { addOnType });
    return res;
  };

  const handleTruesendToggle = async (newValue: boolean) => {
    if (!canManageExistingAddOns) {
      setWantsTruesend(newValue);
      return;
    }
    if (newValue) {
      setWantsTruesend(true);
      if (!existingTruesendActive) {
        toast.info("TrueSend selected. Proceed to payment to activate.");
      }
      return;
    }

    if (existingTruesendActive) {
      setPendingAddOnAction({ addOnType: "TRUESEND", enable: false });
      return;
    }
    setWantsTruesend(false);
  };

  const handleTrueIdentityToggle = async (newValue: boolean) => {
    if (!canManageExistingAddOns) {
      setWantsTrueIdentity(newValue);
      return;
    }
    setPendingAddOnAction({ addOnType: "TRUEIDENTITY", enable: newValue });
  };

  const handleConfirmAddOnAction = async () => {
    if (!pendingAddOnAction) return;
    setAddOnActionLoading(true);
    try {
      if (pendingAddOnAction.addOnType === "TRUESEND") {
        const res = await saveToggle("TRUESEND");
        if (!res.success) {
          toast.error(res.error || "Failed to update TrueSend");
          return;
        }
        setWantsTruesend(false);
        setExistingTruesendActive(false);
        toast.success("TrueSend disabled. It remains usable until your current period ends.");
      } else {
        const res = await saveToggle("TRUEIDENTITY");
        if (!res.success) {
          toast.error(res.error || "Failed to update TrueIdentity");
          return;
        }
        setWantsTrueIdentity(pendingAddOnAction.enable);
        setExistingTrueIdentityActive(pendingAddOnAction.enable);
        toast.success(
          pendingAddOnAction.enable
            ? "TrueIdentity activated. Usage-based charges apply per verification call."
            : "TrueIdentity disabled immediately."
        );
      }
    } catch {
      toast.error("Failed to update add-on");
    } finally {
      setAddOnActionLoading(false);
      setPendingAddOnAction(null);
    }
  };

  // ── pricing ──
  const totalBlocks = Math.max(1, Math.ceil(loanCount / LOANS_PER_BLOCK));
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const coreExtraBlockCost = safeMultiply(extraBlocks, EXTRA_BLOCK_PRICE);
  const truesendBaseCost = wantsTruesend
    ? (isPaid && !existingTruesendActive && truesendProration
      ? truesendProration.proratedAmountMyr
      : TRUESEND_PRICE)
    : 0;
  const truesendExtraBlockCost = wantsTruesend ? safeMultiply(extraBlocks, TRUESEND_EXTRA_BLOCK_PRICE) : 0;
  const coreMonthlyTotal = safeAdd(CORE_PRICE, coreExtraBlockCost);
  const truesendMonthlyTotal = safeAdd(truesendBaseCost, isPaid ? 0 : truesendExtraBlockCost);
  const selectedAddonSubtotal = safeAdd(
    wantsTruesend && !existingTruesendActive ? truesendMonthlyTotal : 0,
    0
  );
  const hasChargeableAddonSelection = wantsTruesend && !existingTruesendActive;
  const daysUntilPeriodEnd = currentPeriodEnd ? getMytDaysUntil(currentPeriodEnd) : null;
  const isRenewalDueNow =
    (subscriptionStatus === "PAID" || subscriptionStatus === "OVERDUE") &&
    currentPeriodEnd != null &&
    typeof daysUntilPeriodEnd === "number" &&
    daysUntilPeriodEnd <= 0;
  const needsRenewalPayment = isRenewalDueNow;
  const renewalInvoiceTruesend = latestUnpaidRenewalInvoice
    ? (latestUnpaidRenewalInvoice.lineItems ?? [])
        .filter((li) => li.itemType === "ADDON")
        .reduce((s, li) => s + Number(li.amount), 0)
    : 0;
  const renewalInvoiceUsage = latestUnpaidRenewalInvoice
    ? (latestUnpaidRenewalInvoice.lineItems ?? [])
        .filter((li) => li.itemType === "USAGE")
        .reduce((s, li) => s + Number(li.amount), 0)
    : 0;
  const renewalMergeTruesend = needsRenewalPayment && wantsTruesend && renewalInvoiceTruesend === 0;
  const renewalDisplaySubtotal = needsRenewalPayment
    ? (latestUnpaidRenewalInvoice
        ? (() => {
            const inv = latestUnpaidRenewalInvoice;
            const items = inv.lineItems ?? [];
            const core = items.filter((li) => li.itemType === "SUBSCRIPTION").reduce((s, li) => s + Number(li.amount), 0);
            const addons = items.filter((li) => li.itemType === "ADDON").reduce((s, li) => s + Number(li.amount), 0);
            const usage = items.filter((li) => li.itemType === "USAGE").reduce((s, li) => s + Number(li.amount), 0);
            const usageFallback = usage === 0 ? (liveTrueIdentityUsage?.usageAmountMyr ?? 0) : 0;
            const addTruesend = renewalMergeTruesend ? TRUESEND_PRICE : 0;
            const st = core + addons + usage + usageFallback + addTruesend;
            if (st > 0) return st;
            return Math.round((Number(inv.amount) / 1.08) * 100) / 100;
          })()
        : CORE_PRICE + (wantsTruesend ? TRUESEND_PRICE : 0))
    : (CORE_PRICE + (wantsTruesend ? TRUESEND_PRICE : 0));
  const renewalDisplayCore = needsRenewalPayment
    ? (latestUnpaidRenewalInvoice
        ? (() => {
            const inv = latestUnpaidRenewalInvoice;
            const items = inv.lineItems ?? [];
            const core = items.filter((li) => li.itemType === "SUBSCRIPTION").reduce((s, li) => s + Number(li.amount), 0);
            return core > 0 ? core : CORE_PRICE;
          })()
        : CORE_PRICE)
    : 0;
  const renewalDisplayTruesend = needsRenewalPayment
    ? (latestUnpaidRenewalInvoice
        ? (() => {
            const inv = latestUnpaidRenewalInvoice;
            const items = inv.lineItems ?? [];
            const addons = items.filter((li) => li.itemType === "ADDON").reduce((s, li) => s + Number(li.amount), 0);
            const invoiceHasTruesend = addons > 0;
            const mergeTruesendAddon = wantsTruesend && !invoiceHasTruesend;
            return mergeTruesendAddon ? TRUESEND_PRICE : addons;
          })()
        : (wantsTruesend ? TRUESEND_PRICE : 0))
    : 0;
  const renewalDisplayUsage = needsRenewalPayment
    ? (renewalInvoiceUsage > 0 ? renewalInvoiceUsage : (liveTrueIdentityUsage?.usageAmountMyr ?? 0))
    : 0;
  const hasUsageFallback = needsRenewalPayment && renewalInvoiceUsage === 0 && (liveTrueIdentityUsage?.usageAmountMyr ?? 0) > 0;
  const renewalDisplaySst = needsRenewalPayment
    ? (renewalMergeTruesend || hasUsageFallback
        ? Math.round(renewalDisplaySubtotal * SST_RATE * 100) / 100
        : (() => {
            if (!latestUnpaidRenewalInvoice) {
              return Math.round(renewalDisplaySubtotal * SST_RATE * 100) / 100;
            }
            const inv = latestUnpaidRenewalInvoice;
            const items = inv.lineItems ?? [];
            const sst = items.filter((li) => li.itemType === "SST").reduce((s, li) => s + Number(li.amount), 0);
            if (sst > 0) return sst;
            const total = Number(inv.amount);
            return Math.round((total - total / 1.08) * 100) / 100;
          })())
    : 0;
  const renewalDisplayTotal = needsRenewalPayment
    ? (renewalMergeTruesend || hasUsageFallback
        ? Math.round((renewalDisplaySubtotal + renewalDisplaySst) * 100) / 100
        : latestUnpaidRenewalInvoice
          ? Number(latestUnpaidRenewalInvoice.amount)
          : Math.round((renewalDisplaySubtotal + renewalDisplaySst) * 100) / 100)
    : 0;
  const paidTrueIdentityUsage = liveTrueIdentityUsage?.usageAmountMyr ?? 0;
  const paidRecurringSubtotal = safeAdd(
    coreMonthlyTotal,
    wantsTruesend ? safeAdd(TRUESEND_PRICE, truesendExtraBlockCost) : 0,
    paidTrueIdentityUsage
  );
  const paidRecurringSst = Math.round(paidRecurringSubtotal * SST_RATE * 100) / 100;
  const paidRecurringTotal = Math.round((paidRecurringSubtotal + paidRecurringSst) * 100) / 100;
  const subtotalMonthly = isPaid
    ? selectedAddonSubtotal
    : safeAdd(coreMonthlyTotal, truesendMonthlyTotal);
  const sstAmount = isPaid && wantsTruesend && !existingTruesendActive && truesendProration
    ? truesendProration.sstMyr
    : Math.round(subtotalMonthly * SST_RATE * 100) / 100;
  const monthlyTotal = isPaid && wantsTruesend && !existingTruesendActive && truesendProration
    ? truesendProration.totalAmountMyr
    : Math.round((subtotalMonthly + sstAmount) * 100) / 100;

  // ── fetch ──
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const [authRes, addOnsRes, tenantRes, billingSubRes, pricingRes, invoicesRes] = await Promise.all([
        fetch("/api/proxy/auth/me", { credentials: "include" }).then((r) => r.json()),
        api.get<{ addOns: { addOnType: string; status: string }[] }>("/api/billing/add-ons"),
        api.get<{ counts: { loans: number } }>("/api/tenants/current"),
        api.get<{ autoRenew?: boolean; currentPeriodStart?: string; currentPeriodEnd?: string }>("/api/billing/subscription"),
        api.get<PricingData>("/api/billing/pricing"),
        api.get<Array<{ id: string; amount: string; status: string; dueAt: string; billingType?: string; lineItems?: Array<{ itemType: string; description: string; amount: unknown; quantity: number; unitPrice: unknown }> }>>("/api/billing/invoices"),
      ]);
      const tenantStatus = authRes.data?.tenant?.subscriptionStatus;
      let truesendActive = false;
      let everHadTruesend = false;

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
        everHadTruesend = addOnsRes.data.addOns.some((a) => a.addOnType === "TRUESEND");
        truesendActive = ts;
        setExistingTruesendActive(ts);
        setExistingTrueIdentityActive(ti);
        setHasEverHadTruesend(everHadTruesend);
        // Always sync switch state with backend/DB – show activated when add-on is ACTIVE
        setWantsTruesend(ts);
        setWantsTrueIdentity(ti);
      }

      if (tenantRes.success && tenantRes.data?.counts) {
        setLoanCount(tenantRes.data.counts.loans ?? 0);
      } else {
        setLoanCount(0);
      }

      if (billingSubRes.success && billingSubRes.data) {
        setAutoRenew(billingSubRes.data.autoRenew ?? true);
        setCurrentPeriodEnd(billingSubRes.data.currentPeriodEnd ?? null);
        const periodStart = billingSubRes.data.currentPeriodStart;
        const periodEnd = billingSubRes.data.currentPeriodEnd;
        const truesendMonthlyMyr = pricingRes.success && pricingRes.data
          ? pricingRes.data.truesendMonthlyMyr
          : TRUESEND_PRICE;
        const canPreviewProration =
          tenantStatus === "PAID" &&
          !!periodStart &&
          !!periodEnd &&
          !truesendActive &&
          !everHadTruesend;
        if (canPreviewProration) {
          const start = new Date(periodStart);
          const end = new Date(periodEnd);
          const totalDays = Math.max(1, differenceInDays(start, end));
          // Keep expiry behavior aligned with Billing page (MYT day boundary).
          const remainingDays = Math.max(0, getMytDaysUntil(periodEnd));
          if (remainingDays > 0) {
            const proratedAmountMyr = roundHalfUp2((truesendMonthlyMyr * remainingDays) / totalDays);
            const previewSstMyr = roundHalfUp2(proratedAmountMyr * SST_RATE);
            const totalAmountMyr = roundHalfUp2(proratedAmountMyr + previewSstMyr);
            setTruesendProration({
              proratedAmountMyr,
              remainingDays,
              totalDays,
              sstMyr: previewSstMyr,
              totalAmountMyr,
              monthlyAmountMyr: truesendMonthlyMyr,
            });
          } else {
            setTruesendProration(null);
          }
        } else {
          setTruesendProration(null);
        }
      } else {
        setTruesendProration(null);
      }

      // Fetch live TrueIdentity usage for PAID/OVERDUE tenants (current period)
      if (
        (tenantStatus === "PAID" || tenantStatus === "OVERDUE") &&
        billingSubRes.success &&
        billingSubRes.data?.currentPeriodStart &&
        billingSubRes.data?.currentPeriodEnd
      ) {
        const daysUntilEnd = getMytDaysUntil(billingSubRes.data.currentPeriodEnd);
        const isPostExpiry = daysUntilEnd <= 0;
        const fromDate = toApiDateParam(
          isPostExpiry ? billingSubRes.data.currentPeriodEnd : billingSubRes.data.currentPeriodStart
        );
        const toDate = isPostExpiry
          ? getTomorrowMytDateParam()
          : toApiDateParam(billingSubRes.data.currentPeriodEnd);
        if (fromDate && toDate) {
          try {
            const usageRes = await api.get<{
              verificationCount: number;
              usageAmountMyr: number;
            }>(`/api/billing/trueidentity-usage?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`);
            if (usageRes.success && usageRes.data) {
              setLiveTrueIdentityUsage({
                verificationCount: usageRes.data.verificationCount ?? 0,
                usageAmountMyr: usageRes.data.usageAmountMyr ?? 0,
              });
            } else {
              setLiveTrueIdentityUsage(null);
            }
          } catch {
            setLiveTrueIdentityUsage(null);
          }
        } else {
          setLiveTrueIdentityUsage(null);
        }
      } else {
        setLiveTrueIdentityUsage(null);
      }

      if (invoicesRes.success && Array.isArray(invoicesRes.data)) {
        const unpaid = invoicesRes.data
          .filter(
            (inv) =>
              inv.billingType === "RENEWAL" &&
              ["ISSUED", "PENDING_APPROVAL", "OVERDUE"].includes(inv.status)
          )
          .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime())[0];
        setLatestUnpaidRenewalInvoice(unpaid ?? null);
      } else {
        setLatestUnpaidRenewalInvoice(null);
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

  /** Make payment now (renewal/overdue): update invoice with TrueSend if selected, then redirect */
  const handleMakePaymentNow = async () => {
    setRenewalPaymentLoading(true);
    try {
      if (latestUnpaidRenewalInvoice && renewalMergeTruesend) {
        const res = await fetch("/api/proxy/billing/overdue/update-invoice-addons", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: latestUnpaidRenewalInvoice.id,
            addTruesend: true,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Failed to update invoice");
          return;
        }
      }
      if (latestUnpaidRenewalInvoice) {
        router.push(`/dashboard/subscription/payment?mode=overdue&invoiceId=${latestUnpaidRenewalInvoice.id}`);
      } else {
        // Invoice may still be syncing/being generated. Open overdue payment flow
        // so user can proceed as soon as invoice is visible.
        router.push("/dashboard/subscription/payment?mode=overdue");
      }
    } catch {
      toast.error("Failed to proceed to payment");
    } finally {
      setRenewalPaymentLoading(false);
    }
  };

  const handleCancelRenewal = async () => {
    setShowCancelAutoRenewConfirm(true);
  };

  const handleCancelOverdueSubscription = () => {
    setShowCancelOverdueConfirm(true);
  };

  const handleConfirmCancelOverdueSubscription = async () => {
    setCancelOverdueLoading(true);
    try {
      const res = await fetch("/api/proxy/billing/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: true }),
      });
      const data = await res.json();
      if (!data.success) {
        const usageData = data?.data as
          | {
              trueIdentityUsageCount?: number;
              trueIdentityUsageAmountMyr?: number;
              trueSendUsageCount?: number;
            }
          | undefined;
        if (
          usageData &&
          ((usageData.trueIdentityUsageCount ?? 0) > 0 || (usageData.trueSendUsageCount ?? 0) > 0)
        ) {
          toast.error(
            `Cannot cancel: post-expiry usage detected (TrueIdentity: ${usageData.trueIdentityUsageCount ?? 0}, TrueSend: ${usageData.trueSendUsageCount ?? 0}). Please settle charges first.`
          );
        } else {
          toast.error(data.error || "Failed to cancel overdue subscription");
        }
        return;
      }
      setShowCancelOverdueConfirm(false);
      toast.success("Subscription cancelled. Tenant has been moved to FREE plan.");
      await fetchStatus();
    } catch {
      toast.error("Failed to cancel overdue subscription");
    } finally {
      setCancelOverdueLoading(false);
    }
  };

  const handleConfirmCancelRenewal = async () => {
    setCancelAutoRenewLoading(true);
    try {
      const res = await fetch("/api/proxy/billing/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Failed to disable auto-renew");
        return;
      }
      setAutoRenew(false);
      setShowCancelAutoRenewConfirm(false);
      toast.success("Auto-renew disabled. Your subscription remains active until period end.");
    } catch {
      toast.error("Failed to disable auto-renew");
    } finally {
      setCancelAutoRenewLoading(false);
    }
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
              note={
                isPaid && !existingTruesendActive && !hasEverHadTruesend
                  ? "This cycle is prorated at checkout. Next billing cycle is RM 50.00/month."
                  : isPaid && !existingTruesendActive && hasEverHadTruesend
                    ? "Full month charge applies when re-subscribing."
                    : undefined
              }
              showEnabledBadge={existingTruesendActive}
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
              showEnabledBadge={existingTrueIdentityActive}
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
                {needsRenewalPayment ? (
                  /* Receipt style: only what's needed to pay this renewal */
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">Core plan</span>
                      <span className="tabular-nums">{formatCurrency(renewalDisplayCore)}</span>
                    </div>
                    {renewalDisplayTruesend > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground">TrueSend™</span>
                        <span className="tabular-nums">+{formatCurrency(renewalDisplayTruesend)}</span>
                      </div>
                    )}
                    {renewalDisplayUsage > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground">TrueIdentity™ usage</span>
                        <span className="tabular-nums">+{formatCurrency(renewalDisplayUsage)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="pt-1 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(renewalDisplaySubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SST (8%)</span>
                        <span className="tabular-nums">+{formatCurrency(renewalDisplaySst)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-1">
                        <span className="font-semibold text-foreground">Due now</span>
                        <span className="text-2xl font-bold tabular-nums">
                          {formatCurrency(renewalDisplayTotal)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : isPaid && hasChargeableAddonSelection && truesendProration ? (
                  /* PAID adding TrueSend mid-cycle (first time): receipt for prorated amount */
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">TrueSend™</span>
                      <span className="tabular-nums">
                        {formatCurrency(truesendProration.proratedAmountMyr)} ({truesendProration.remainingDays}/{truesendProration.totalDays} days)
                      </span>
                    </div>
                    <Separator />
                    <div className="pt-1 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(truesendProration.proratedAmountMyr)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SST (8%)</span>
                        <span className="tabular-nums">+{formatCurrency(truesendProration.sstMyr)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-1">
                        <span className="font-semibold text-foreground">Due now</span>
                        <span className="text-2xl font-bold tabular-nums">
                          {formatCurrency(truesendProration.totalAmountMyr)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : isPaid && hasChargeableAddonSelection && hasEverHadTruesend ? (
                  /* PAID re-subscribing to TrueSend mid-cycle: full price (no proration) */
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">TrueSend™</span>
                      <span className="tabular-nums">{formatCurrency(TRUESEND_PRICE)}</span>
                    </div>
                    <Separator />
                    <div className="pt-1 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(TRUESEND_PRICE)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SST (8%)</span>
                        <span className="tabular-nums">+{formatCurrency(Math.round(TRUESEND_PRICE * SST_RATE * 100) / 100)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-1">
                        <span className="font-semibold text-foreground">Due now</span>
                        <span className="text-2xl font-bold tabular-nums">
                          {formatCurrency(Math.round((TRUESEND_PRICE + Math.round(TRUESEND_PRICE * SST_RATE * 100) / 100) * 100) / 100)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : isPaid ? (
                  /* Already paid for current period – no amounts to pay until renewal */
                  <div className="py-2 space-y-2">
                    <p className="text-sm font-medium text-foreground">No payment required right now</p>
                    {paidTrueIdentityUsage > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground">TrueIdentity™ usage</span>
                        <span className="tabular-nums">+{formatCurrency(paidTrueIdentityUsage)}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Your subscription is active. Next billing: {formatCurrency(paidRecurringTotal)}/mo
                      {currentPeriodEnd && ` (renews ${new Date(currentPeriodEnd).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })})`}
                    </p>
                  </div>
                ) : (
                  /* FREE: receipt style for what they'll pay */
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">Core plan</span>
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
                    <div className="pt-1 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(subtotalMonthly)}/mo</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SST (8%)</span>
                        <span className="tabular-nums">+{formatCurrency(sstAmount)}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-1">
                        <span className="font-semibold text-foreground">Total</span>
                        <div className="text-right">
                          <span className="text-2xl font-bold tabular-nums">
                            {formatCurrency(monthlyTotal)}
                          </span>
                          <span className="text-muted-foreground text-sm">/mo</span>
                        </div>
                      </div>
                      {wantsTrueIdentity && (
                        <p className="text-xs text-muted-foreground mt-1">+ RM 4 per e-KYC verification</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Action button */}
              {needsRenewalPayment ? (
                <Button
                  className="w-full mt-5 bg-gradient-accent hover:opacity-90 text-primary-foreground h-11 text-base"
                  onClick={handleMakePaymentNow}
                  disabled={renewalPaymentLoading}
                >
                  {renewalPaymentLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    "Make payment now"
                  )}
                </Button>
              ) : isPaid && !hasChargeableAddonSelection ? (
                <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-center">
                  <p className="text-sm font-medium text-foreground">No payment required right now</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your selected add-ons are already active.
                  </p>
                </div>
              ) : (
                <Button
                  className="w-full mt-5 bg-gradient-accent hover:opacity-90 text-primary-foreground h-11 text-base"
                  onClick={handleProceedToPayment}
                >
                  Proceed to payment
                </Button>
              )}
              {isPaid && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  TrueIdentity activates instantly with no upfront fee. TrueSend changes require payment.
                </p>
              )}
              {isPaid && autoRenew && (
                <button
                  type="button"
                  className="text-foreground hover:underline text-sm mt-2 block w-full text-center"
                  onClick={handleCancelRenewal}
                >
                  Cancel subscription
                </button>
              )}
              {subscriptionStatus === "OVERDUE" && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Your subscription has ended. This payment includes Core plan and selected add-ons for reactivation.
                </p>
              )}
              {subscriptionStatus === "OVERDUE" && (
                <button
                  type="button"
                  className="text-foreground hover:underline text-sm mt-3 block w-full text-center"
                  onClick={handleCancelOverdueSubscription}
                >
                  Cancel subscription now
                </button>
              )}
              {isPaid && !autoRenew && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center">
                  Your subscription will not renew after{" "}
                  {currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString("en-MY") : "period end"}.
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
      {/* Dialog: Confirm add-on action                    */}
      {/* ================================================ */}
      <AlertDialog
        open={!!pendingAddOnAction}
        onOpenChange={(open) => {
          if (!open && !addOnActionLoading) setPendingAddOnAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAddOnAction?.addOnType === "TRUEIDENTITY"
                ? pendingAddOnAction.enable
                  ? "Activate TrueIdentity™?"
                  : "Disable TrueIdentity™?"
                : "Disable TrueSend™?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {pendingAddOnAction?.addOnType === "TRUEIDENTITY" ? (
                  pendingAddOnAction.enable ? (
                    <>
                      <p>TrueIdentity activation has no upfront fee.</p>
                      <p>It will activate immediately after confirmation.</p>
                    </>
                  ) : (
                    <>
                      <p>TrueIdentity will be disabled immediately after confirmation.</p>
                      <p>You can activate it again anytime.</p>
                    </>
                  )
                ) : (
                  <>
                    <p>TrueSend will be disabled and no longer renew next cycle.</p>
                    <p>You can still use it until your current subscription period ends.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={addOnActionLoading}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleConfirmAddOnAction}
              disabled={addOnActionLoading}
            >
              {pendingAddOnAction?.addOnType === "TRUEIDENTITY"
                ? pendingAddOnAction.enable
                  ? "Activate now"
                  : "Disable now"
                : "Disable at period end"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showCancelOverdueConfirm}
        onOpenChange={(open) => {
          if (!cancelOverdueLoading) setShowCancelOverdueConfirm(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel overdue subscription and revert to FREE?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  We will allow cancellation if there is no billable usage after your expiry date.
                </p>
                <p>
                  If post-expiry usage is detected (TrueIdentity/TrueSend), you must settle those charges first.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelOverdueLoading}>Keep subscription</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleConfirmCancelOverdueSubscription}
              disabled={cancelOverdueLoading}
            >
              Cancel and revert to FREE
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================ */}
      {/* Dialog: Back to company details confirmation     */}
      {/* ================================================ */}
      <AlertDialog
        open={showCancelAutoRenewConfirm}
        onOpenChange={(open) => {
          if (!cancelAutoRenewLoading) setShowCancelAutoRenewConfirm(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable auto-renew?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Your subscription will remain active until the current period ends.</p>
                <p>No renewal invoice will be generated for the next cycle.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelAutoRenewLoading}>Cancel</AlertDialogCancel>
            <Button onClick={handleConfirmCancelRenewal} disabled={cancelAutoRenewLoading}>
              Disable at period end
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  note,
  showEnabledBadge,
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
  note?: string;
  showEnabledBadge?: boolean;
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
      {recommended && (showEnabledBadge ?? active) && (
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
            {note && <p className="text-xs text-muted-foreground mt-2">{note}</p>}
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
