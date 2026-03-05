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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export default function TrueIdentityModulePage() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<TrueIdentityUsageData | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    const fetchModuleData = async () => {
      setLoading(true);
      try {
        const [addOnsRes, subscriptionRes] = await Promise.all([
          api.get<{ addOns: AddOnEntry[] }>("/billing/add-ons"),
          api.get<SubscriptionData>("/billing/subscription"),
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
          const from = toApiDateParam(subscriptionRes.data.currentPeriodStart);
          const to = toApiDateParam(subscriptionRes.data.currentPeriodEnd);
          if (from && to) {
            usageEndpoint = `/billing/trueidentity-usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            cycleFromSubscription = {
              start: subscriptionRes.data.currentPeriodStart,
              end: subscriptionRes.data.currentPeriodEnd,
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
              e-KYC verification module with usage-based billing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/plan">Manage Add-ons</Link>
            </Button>
          </div>
        </div>

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
                <Link href="/dashboard/plan" className="inline-flex items-center gap-1 font-medium text-foreground underline hover:text-muted-foreground">
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
      </div>
    </RoleGate>
  );
}
