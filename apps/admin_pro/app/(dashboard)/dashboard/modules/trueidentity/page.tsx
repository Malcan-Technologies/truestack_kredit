"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Fingerprint, Info, ReceiptText } from "lucide-react";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, formatNumber, safeMultiply, toSafeNumber } from "@/lib/utils";

interface AddOnEntry {
  addOnType: string;
  status: string;
}

interface SubscriptionData {
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

interface InvoiceEntry {
  status: string;
  billingType?: string;
  periodStart?: string;
  paidAt?: string | null;
}

interface TrueIdentityUsagePoint {
  date: string;
  count: number;
}

interface TrueIdentityUsageData {
  source: "admin" | "local";
  verificationCount: number;
  usageCredits?: number;
  usageAmountMyr?: number;
  periodStart?: string;
  periodEnd?: string;
  usage?: TrueIdentityUsagePoint[];
}

const VERIFICATION_PRICE_MYR = 4;
const MINS_PER_VERIFICATION = 10;

function formatTimeSaved(totalCount: number, minsPerUnit: number): string {
  const totalMins = totalCount * minsPerUnit;
  if (totalMins < 60) return `${Math.round(totalMins)} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function toApiDateParam(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const directDateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDateMatch) return directDateMatch[1];
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

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

function addDaysToDateParam(dateParam: string, days: number): string {
  const utc = new Date(`${dateParam}T00:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function maxDateParam(a: string, b: string): string {
  return a >= b ? a : b;
}

export default function TrueIdentityModulePage() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<TrueIdentityUsageData | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    const fetchModuleData = async () => {
      if (process.env.NEXT_PUBLIC_PRODUCT_MODE === "pro") {
        setEnabled(true);
        setLoading(false);
        setUsage(null);
        setUsageError(null);
        return;
      }
      setLoading(true);
      try {
        const [addOnsRes, subscriptionRes, invoicesRes] = await Promise.all([
          api.get<{ addOns: AddOnEntry[] }>("/billing/add-ons"),
          api.get<SubscriptionData>("/billing/subscription"),
          api.get<InvoiceEntry[]>("/billing/invoices"),
        ]);

        if (addOnsRes.success && addOnsRes.data?.addOns) {
          const trueIdentityAddOn = addOnsRes.data.addOns.find((item) => item.addOnType === "TRUEIDENTITY");
          setEnabled(trueIdentityAddOn?.status === "ACTIVE");
        }

        let usageEndpoint = "/billing/trueidentity-usage";
        let cycleFromSubscription: { start: string; end: string } | null = null;
        if (
          subscriptionRes.success &&
          subscriptionRes.data?.currentPeriodStart &&
          subscriptionRes.data?.currentPeriodEnd
        ) {
          const latestPaidRenewal = invoicesRes.success && Array.isArray(invoicesRes.data)
            ? invoicesRes.data
                .filter((inv) => inv.billingType === "RENEWAL" && inv.status === "PAID" && !!inv.paidAt)
                .sort((a, b) => new Date(b.paidAt ?? 0).getTime() - new Date(a.paidAt ?? 0).getTime())[0]
            : null;
          const isPostExpiry = getMytDaysUntil(subscriptionRes.data.currentPeriodEnd) <= 0;
          // Always start from period start so the displayed usage matches the renewal invoice,
          // which covers from currentPeriodStart to now (regardless of expiry status).
          const baseFrom = toApiDateParam(subscriptionRes.data.currentPeriodStart);
          const paidAtDate = latestPaidRenewal?.paidAt ? toApiDateParam(latestPaidRenewal.paidAt) : null;
          const latestPaidPeriodStart = latestPaidRenewal?.periodStart
            ? toApiDateParam(latestPaidRenewal.periodStart)
            : null;
          // Clamp applies in two cases:
          // 1. Post-expiry and unpaid: paid renewal covers same period start → exclude already-paid day.
          // 2. Same-day billing (paid on same MYT day as currentPeriodStart): usage can't be split
          //    intra-day, so shift from to the next day to avoid showing pre-payment charges.
          // For normal monthly cycles paidAtDate is ~30 days before baseFrom, so clamp is a no-op.
          const paidSameDayAsStart = paidAtDate !== null && paidAtDate === baseFrom;
          const shouldClamp =
            paidAtDate &&
            latestPaidPeriodStart &&
            latestPaidPeriodStart === baseFrom &&
            (isPostExpiry || paidSameDayAsStart);
          const from = baseFrom
            ? (
                shouldClamp
                  ? maxDateParam(baseFrom, addDaysToDateParam(paidAtDate!, 1))
                  : baseFrom
              )
            : null;
          const to = isPostExpiry
            ? getTomorrowMytDateParam()
            : toApiDateParam(subscriptionRes.data.currentPeriodEnd);
          if (from && to) {
            usageEndpoint = `/billing/trueidentity-usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            cycleFromSubscription = {
              start: from,
              end: to,
            };
            setBillingCycle(cycleFromSubscription);
          }
        }

        const usageRes = await api.get<TrueIdentityUsageData>(usageEndpoint);
        if (usageRes.success && usageRes.data) {
          setUsage(usageRes.data);
          setUsageError(null);
          if (!cycleFromSubscription && usageRes.data.periodStart && usageRes.data.periodEnd) {
            setBillingCycle({ start: usageRes.data.periodStart, end: usageRes.data.periodEnd });
          }
        } else {
          setUsage(null);
          setUsageError(usageRes.error || "Unable to load usage right now.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchModuleData();
  }, []);

  const verificationCount = usage?.verificationCount ?? 0;
  const usageAmountMyr = usage?.usageAmountMyr !== undefined
    ? toSafeNumber(usage.usageAmountMyr)
    : safeMultiply(verificationCount, VERIFICATION_PRICE_MYR);

  const billingPeriodLabel =
    billingCycle?.start && billingCycle?.end
      ? `${formatDate(billingCycle.start)} - ${formatDate(billingCycle.end)}`
      : usage?.periodStart && usage?.periodEnd
      ? `${formatDate(usage.periodStart)} - ${formatDate(usage.periodEnd)}`
      : "Current billing cycle";

  const isPro = process.env.NEXT_PUBLIC_PRODUCT_MODE === "pro";

  return (
    <RoleGate allowedRoles={["OWNER", "ADMIN"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Fingerprint className="h-6 w-6 text-muted-foreground" />
              TrueIdentity™ Module
            </h1>
            <p className="text-muted text-sm mt-1">
              {isPro
                ? "e-KYC via TrueStack public KYC API (Pro). Start verification from each borrower’s detail page."
                : "e-KYC verification module with usage-based billing."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
            {!isPro && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/settings">Manage Add-ons</Link>
              </Button>
            )}
          </div>
        </div>

        {isPro ? (
        <Card>
          <CardHeader>
            <CardTitle>Pro deployment</CardTitle>
            <CardDescription>
              SaaS subscription billing and TrueStack Admin add-on provisioning are not used. Staff start e-KYC from
              Borrowers → borrower detail; the API uses the same public TrueStack KYC flow as borrower self-service when{" "}
              <code className="text-xs bg-muted px-1 rounded">PRODUCT_MODE=pro</code> on the server.
            </CardDescription>
          </CardHeader>
        </Card>
        ) : null}

        {!isPro ? (
        <Card>
          <CardHeader>
            <CardTitle>How TrueIdentity works</CardTitle>
            <CardDescription>
              Verify borrower identity using QR-based e-KYC. Every successful verification is billed per use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-neutral-100 dark:bg-neutral-800/50 px-4 py-3 text-sm text-muted flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Price is <span className="font-medium text-foreground">RM 4.00 per verification</span>. Charges are usage-based and added to your invoice in your regular billing cycle period.
                {" "}
                <Link href="/dashboard/settings" className="inline-flex items-center gap-1 font-medium text-foreground underline hover:text-muted-foreground">
                  Manage on Plan page
                </Link>
                .
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">
              Billing cycle period: <span className="font-medium text-foreground">{billingPeriodLabel}</span>
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Unit price</p>
                <p className="mt-2 text-xl font-semibold">{formatCurrency(VERIFICATION_PRICE_MYR)}</p>
                <p className="text-xs text-muted mt-1">Per verification</p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Amount sent</p>
                <p className="mt-2 text-xl font-semibold">{formatNumber(verificationCount, 0)} verifications</p>
                <p className="text-xs text-muted mt-1">{billingPeriodLabel}</p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Estimated time saved</p>
                <p className="mt-2 text-xl font-semibold">{formatTimeSaved(verificationCount, MINS_PER_VERIFICATION)}</p>
                <p className="text-xs text-muted mt-1">Compared to manual verification</p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Estimated charges</p>
                <p className="mt-2 text-xl font-semibold">{formatCurrency(usageAmountMyr)}</p>
                <p className="text-xs text-muted mt-1">Based on current cycle usage</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border px-4 py-3 text-sm text-muted flex items-start gap-2">
              <ReceiptText className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {loading
                  ? "Loading usage..."
                  : usageError
                  ? usageError
                  : usage?.source === "admin"
                  ? `Usage synced from billing service${usage.usageCredits !== undefined ? ` (${formatNumber(usage.usageCredits, 0)} credits)` : ""}.`
                  : "Usage shown from local verification records."}
              </span>
            </div>
          </CardContent>
        </Card>
        ) : null}
      </div>
    </RoleGate>
  );
}
