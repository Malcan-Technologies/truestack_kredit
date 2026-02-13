"use client";

import { useEffect, useState } from "react";
import { CreditCard, FileText, Receipt, AlertTriangle, Shield } from "lucide-react";
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

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [subRes, invRes] = await Promise.all([
        api.get<Subscription>("/api/billing/subscription"),
        api.get<Invoice[]>("/api/billing/invoices"),
      ]);

      if (subRes.success) {
        setSubscription(subRes.data || null);
      }
      if (invRes.success && invRes.data) {
        setInvoices(invRes.data);
      } else {
        setInvoices([]);
      }
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
      setInvoices([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerateInvoice = async () => {
    const res = await api.post<Invoice>("/api/billing/invoices/generate", {});
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Billing</h1>
          <p className="text-muted">Manage your subscription and invoices</p>
        </div>
        <Badge variant="outline" className="text-sm">
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
                <CreditCard className="h-6 w-6 text-muted-foreground" />
                <div>
                  <CardTitle>
                    {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan
                  </CardTitle>
                  <CardDescription>
                    Current billing period: {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                  </CardDescription>
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
    </div>
    </RoleGate>
  );
}
