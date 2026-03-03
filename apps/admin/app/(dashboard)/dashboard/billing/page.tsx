"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Receipt, AlertTriangle, Shield, ExternalLink, Zap, Clock, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RoleGate } from "@/components/role-gate";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  gracePeriodEnd: string | null;
  tenantSubscriptionStatus?: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
}

interface AddOnStatus {
  addOnType: string;
  status: string;
}

interface LatestPaymentRequest {
  requestId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  receipts: Array<{
    id: string;
    amount: string;
    paidAt: string;
  }>;
}

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  ACTIVE: "success",
  PENDING: "warning",
  GRACE_PERIOD: "warning",
  BLOCKED: "destructive",
  CANCELLED: "destructive",
  DRAFT: "secondary" as "default",
  ISSUED: "info",
  PAID: "success",
  OVERDUE: "destructive",
  SUSPENDED: "destructive",
};

const ADD_ON_LABELS: Record<string, string> = {
  TRUESEND: "TrueSend™",
  TRUEIDENTITY: "TrueIdentity™",
};

/** Plan pricing (RM) */
const CORE_PLAN_PRICE = 499;
const TRUESEND_ADDON_PRICE = 50;
const EXTRA_BLOCK_PRICE = 200;
const TRUESEND_EXTRA_BLOCK_PRICE = 50;
const LOANS_PER_BLOCK = 500;
const SST_RATE = 0.08; // 8% SST (Service Tax)

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [addOns, setAddOns] = useState<AddOnStatus[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loanCount, setLoanCount] = useState(0);
  const [latestPaymentRequest, setLatestPaymentRequest] = useState<LatestPaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [subRes, addOnsRes, invRes, tenantRes, paymentReqRes] = await Promise.all([
        api.get<Subscription>("/billing/subscription"),
        api.get<{ addOns: AddOnStatus[] }>("/billing/add-ons"),
        api.get<Invoice[]>("/billing/invoices"),
        api.get<{ counts: { loans: number } }>("/tenants/current"),
        api.get<LatestPaymentRequest | null>("/billing/subscription-payment-request/latest"),
      ]);

      if (subRes.success) {
        setSubscription(subRes.data || null);
      }
      if (addOnsRes.success && addOnsRes.data?.addOns) {
        setAddOns(addOnsRes.data.addOns);
      } else {
        setAddOns([]);
      }
      if (invRes.success && invRes.data) {
        setInvoices(invRes.data);
      } else {
        setInvoices([]);
      }
      if (tenantRes.success && tenantRes.data?.counts) {
        setLoanCount(tenantRes.data.counts.loans);
      } else {
        setLoanCount(0);
      }
      if (paymentReqRes.success) {
        setLatestPaymentRequest(paymentReqRes.data ?? null);
      }
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
      setInvoices([]);
    }
    setLoading(false);
  };

  const enabledAddOns = addOns.filter((a) => a.status === "ACTIVE");
  const truesendActive = addOns.some((a) => a.addOnType === "TRUESEND" && a.status === "ACTIVE");
  const isPaidTenant =
    subscription?.tenantSubscriptionStatus === "PAID" ||
    subscription?.tenantSubscriptionStatus === "OVERDUE";
  const isOverdueTenant = subscription?.tenantSubscriptionStatus === "OVERDUE";

  // Calculate monthly subscription: Core + TrueSend add-on (billed with Core) + extra blocks
  const totalBlocks = Math.max(1, Math.ceil(loanCount / LOANS_PER_BLOCK));
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const basePlanPrice = CORE_PLAN_PRICE;
  const extraBlockCost = extraBlocks * EXTRA_BLOCK_PRICE;
  const truesendCost = truesendActive ? TRUESEND_ADDON_PRICE + extraBlocks * TRUESEND_EXTRA_BLOCK_PRICE : 0;
  const subtotalMonthly = basePlanPrice + extraBlockCost + truesendCost;
  const sstAmount = Math.round(subtotalMonthly * SST_RATE * 100) / 100;
  const totalMonthlySubscription = Math.round((subtotalMonthly + sstAmount) * 100) / 100;

  useEffect(() => {
    fetchData();
  }, []);

  const handleDownloadInvoice = (invoiceId: string, invoiceNumber: string) => {
    const url = `/api/proxy/billing/invoices/${invoiceId}/download`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <RoleGate allowedRoles={["OWNER", "ADMIN"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Billing</h1>
          <p className="text-muted">Manage your subscription and invoices</p>
        </div>
        <Badge variant="outline" className="text-sm shrink-0">
          <Shield className="h-3.5 w-3.5 mr-1.5" />
          Admin Only
        </Badge>
      </div>

      {/* Payment pending verification notification */}
      {latestPaymentRequest?.status === "PENDING" && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <p className="text-base font-medium text-blue-600 dark:text-blue-400">
              Waiting for payment to be verified
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your subscription will be activated within 1 business day after we confirm your payment.
            </p>
          </div>
        </div>
      )}

      {/* Not subscribed notification */}
      {(!subscription || (!isPaidTenant && !isOverdueTenant)) && latestPaymentRequest?.status !== "PENDING" && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
            <Rocket className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <p className="text-base font-medium text-amber-600 dark:text-amber-400">
              Your tenant is not yet subscribed to a plan
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Subscribe to Core to access loan management, compliance, and more.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0 ml-auto border-amber-500/50 hover:bg-amber-500/10">
            <Link href="/dashboard/subscription">Choose plan</Link>
          </Button>
        </div>
      )}

      {isOverdueTenant && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-base font-medium text-red-600 dark:text-red-400">
              Your subscription is overdue
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Reactivate by updating your plan. Payment will include Core plan plus selected add-ons.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0 ml-auto border-red-500/50 hover:bg-red-500/10">
            <Link href="/dashboard/plan">Update plan</Link>
          </Button>
        </div>
      )}

      {/* Subscription status */}
      {(subscription || latestPaymentRequest?.status === "PENDING") && (
        <Card className={subscription?.status === "GRACE_PERIOD" ? "border-warning" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle>
                    <Link
                      href="/dashboard/plan"
                      className="inline-flex items-center gap-2 hover:underline underline-offset-2 font-heading font-semibold"
                    >
                      <Zap className="h-5 w-5 text-primary" />
                      {subscription?.plan === "Core+" ? "Core" : subscription?.plan ?? "Core"} Plan
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {subscription
                      ? isPaidTenant
                        ? `Current billing period: ${formatDate(subscription.currentPeriodStart)} - ${formatDate(subscription.currentPeriodEnd)}`
                        : "Subscribe to unlock full access"
                      : "Awaiting payment verification"}
                  </CardDescription>
                  {enabledAddOns.length > 0 && subscription && isPaidTenant && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Add-ons: {enabledAddOns.map((a) => ADD_ON_LABELS[a.addOnType] ?? a.addOnType).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <Badge
                variant={statusColors[
                  latestPaymentRequest?.status === "PENDING"
                    ? "PENDING"
                    : !isPaidTenant
                      ? "PENDING"
                      : (subscription?.status ?? "PENDING")
                ]}
              >
                {latestPaymentRequest?.status === "PENDING"
                  ? "Pending"
                  : !isPaidTenant
                    ? "Pending"
                    : (subscription?.status ?? "Pending").replace(/_/g, " ")}
              </Badge>
            </div>
          </CardHeader>
          {subscription?.status === "GRACE_PERIOD" && subscription.gracePeriodEnd && (
            <CardContent>
              <div className="flex items-center gap-2 text-warning bg-warning/10 p-3 rounded-lg">
                <AlertTriangle className="h-5 w-5" />
                <p className="text-sm">
                  Your subscription is in grace period. Please pay before{" "}
                  <strong>{formatDate(subscription.gracePeriodEnd)}</strong> to avoid service interruption.
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Monthly subscription breakdown */}
      {subscription && isPaidTenant && (subscription.status === "ACTIVE" || subscription.status === "GRACE_PERIOD" || subscription.status === "OVERDUE") && latestPaymentRequest?.status !== "PENDING" && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly subscription</CardTitle>
            <CardDescription>Recurring charges based on your plan and usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Core Plan
                </span>
                <span>{formatCurrency(basePlanPrice)}</span>
              </div>
              {truesendActive && truesendCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    TrueSend™ add-on (billed with Core)
                  </span>
                  <span>+{formatCurrency(truesendCost)}</span>
                </div>
              )}
              {extraBlocks > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Extra blocks ({extraBlocks} × {LOANS_PER_BLOCK} loans)
                  </span>
                  <span>+{formatCurrency(extraBlockCost)}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotalMonthly)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SST (8%)</span>
                  <span>+{formatCurrency(sstAmount)}</span>
                </div>
                <div className="flex justify-between font-medium pt-1">
                  <span>Total (recurring)</span>
                  <span>{formatCurrency(totalMonthlySubscription)}/month</span>
                </div>
              </div>
            </div>

            {/* Usage-based charges (placeholder) */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">Usage-based charges</h4>
              <p className="text-xs text-muted-foreground">
                TrueIdentity™ verifications and other usage-based charges appear on your monthly invoice.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Your billing history</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Receipt className="h-12 w-12 text-muted mb-4" />
              <p className="text-muted">No invoices yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                    </TableCell>
                    <TableCell>{formatCurrency(Number(invoice.amount))}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[invoice.status]}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                    <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                    <TableCell>
                      {invoice.paidAt ? formatDate(invoice.paidAt) : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadInvoice(invoice.id, invoice.invoiceNumber)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add-ons link */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Extend your platform with TrueSend and TrueIdentity.
        </p>
          <Button variant="link" size="sm" asChild className="text-sm gap-1">
            <Link href="/dashboard/plan">
              Go to Plan
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
    </RoleGate>
  );
}
