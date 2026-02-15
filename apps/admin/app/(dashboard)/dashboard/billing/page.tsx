"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Receipt, AlertTriangle, Shield, ExternalLink, Zap, Rocket } from "lucide-react";
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
}

interface AddOnStatus {
  addOnType: string;
  status: string;
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
  GRACE_PERIOD: "warning",
  BLOCKED: "destructive",
  CANCELLED: "destructive",
  DRAFT: "secondary" as "default",
  ISSUED: "info",
  PAID: "success",
  OVERDUE: "destructive",
};

const ADD_ON_LABELS: Record<string, string> = {
  TRUESEND: "TrueSend™",
  TRUEIDENTITY: "TrueIdentity™",
};

/** Plan pricing (RM) */
const CORE_PLAN_PRICE = 499;
const CORE_PLUS_PLAN_PRICE = 549;
const EXTRA_BLOCK_PRICE = 200;
const TRUESEND_EXTRA_BLOCK_PRICE = 50;
const LOANS_PER_BLOCK = 500;

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [addOns, setAddOns] = useState<AddOnStatus[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loanCount, setLoanCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [subRes, addOnsRes, invRes, tenantRes] = await Promise.all([
        api.get<Subscription>("/billing/subscription"),
        api.get<{ addOns: AddOnStatus[] }>("/billing/add-ons"),
        api.get<Invoice[]>("/billing/invoices"),
        api.get<{ counts: { loans: number } }>("/tenants/current"),
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
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
      setInvoices([]);
    }
    setLoading(false);
  };

  const enabledAddOns = addOns.filter((a) => a.status === "ACTIVE");
  const isCorePlus = subscription?.plan === "Core+";
  const truesendActive = addOns.some((a) => a.addOnType === "TRUESEND" && a.status === "ACTIVE");

  // Calculate monthly subscription
  const totalBlocks = Math.max(1, Math.ceil(loanCount / LOANS_PER_BLOCK));
  const extraBlocks = Math.max(0, totalBlocks - 1);
  const basePlanPrice = isCorePlus ? CORE_PLUS_PLAN_PRICE : CORE_PLAN_PRICE;
  const extraBlockCost = extraBlocks * EXTRA_BLOCK_PRICE;
  const truesendExtraCost = truesendActive ? extraBlocks * TRUESEND_EXTRA_BLOCK_PRICE : 0;
  const totalMonthlySubscription = basePlanPrice + extraBlockCost + truesendExtraCost;

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerateInvoice = async () => {
    const res = await api.post<Invoice>("/billing/invoices/generate", {});
    if (res.success) {
      toast.success("Invoice generated successfully");
      fetchData();
    } else {
      toast.error(res.error || "Failed to generate invoice");
    }
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

      {/* Subscription status */}
      {subscription && (
        <Card className={subscription.status === "GRACE_PERIOD" ? "border-warning" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle>
                    <Link
                      href="/dashboard/plan"
                      className="inline-flex items-center gap-2 hover:underline underline-offset-2 font-heading font-semibold"
                    >
                      {subscription.plan === "Core+" ? (
                        <Rocket className="h-5 w-5 text-primary" />
                      ) : (
                        <Zap className="h-5 w-5 text-primary" />
                      )}
                      {subscription.plan} Plan
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    Current billing period: {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                  </CardDescription>
                  {enabledAddOns.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Add-ons: {enabledAddOns.map((a) => ADD_ON_LABELS[a.addOnType] ?? a.addOnType).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={statusColors[subscription.status]}>
                {subscription.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </CardHeader>
          {subscription.status === "GRACE_PERIOD" && subscription.gracePeriodEnd && (
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
      {subscription && (subscription.status === "ACTIVE" || subscription.status === "GRACE_PERIOD") && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly subscription</CardTitle>
            <CardDescription>Recurring charges based on your plan and usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {subscription.plan} Plan
                </span>
                <span>{formatCurrency(basePlanPrice)}</span>
              </div>
              {extraBlocks > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Extra blocks ({extraBlocks} × {LOANS_PER_BLOCK} loans)
                    </span>
                    <span>+{formatCurrency(extraBlockCost)}</span>
                  </div>
                  {truesendActive && truesendExtraCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        TrueSend™ ({extraBlocks} extra blocks)
                      </span>
                      <span>+{formatCurrency(truesendExtraCost)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                <span>Total (recurring)</span>
                <span>{formatCurrency(totalMonthlySubscription)}/month</span>
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
          <Button onClick={handleGenerateInvoice} variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Generate Invoice
          </Button>
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
