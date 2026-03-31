"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  FileUp,
  Loader2,
  Lock,
  Receipt,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { cn } from "../../lib/utils";
import { toAmountNumber } from "../../lib/application-form-validation";
import {
  createBorrowerManualPaymentRequest,
  fetchBorrowerLender,
  getBorrowerLoan,
  getBorrowerLoanSchedule,
  type BorrowerLenderInfo,
} from "../../lib/borrower-loans-client";
import type { BorrowerLoanDetail } from "../../lib/borrower-loan-types";
import { getBankLabel } from "../../lib/bank-options";

function formatRm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BorrowerMakePaymentPage({ loanId }: { loanId: string }) {
  const router = useRouter();
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [lender, setLender] = useState<BorrowerLenderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amountMode, setAmountMode] = useState<"monthly" | "custom">("monthly");
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState<"manual" | "gateway">("manual");
  const [reference, setReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [monthlyInstallment, setMonthlyInstallment] = useState<number | null>(null);
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, schRes, lenderRes] = await Promise.all([
        getBorrowerLoan(loanId),
        getBorrowerLoanSchedule(loanId),
        fetchBorrowerLender().catch(() => null),
      ]);
      setLoan(loanRes.data);
      setLender(lenderRes);

      const sch = schRes.data as {
        schedule?: { repayments?: Array<{ status: string; totalDue: unknown; dueDate: string }> };
      } | null;
      const reps = sch?.schedule?.repayments ?? [];
      const next = reps.find((r) => r.status !== "PAID" && r.status !== "CANCELLED");
      if (next) {
        setMonthlyInstallment(toAmountNumber(next.totalDue));
        setNextDueDate(next.dueDate);
      } else {
        setMonthlyInstallment(null);
        setNextDueDate(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load loan");
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedAmount = useMemo(() => {
    if (amountMode === "monthly") {
      return monthlyInstallment;
    }
    const n = parseFloat(customAmount.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [amountMode, monthlyInstallment, customAmount]);

  const bankConfigured =
    !!lender?.lenderBankCode &&
    !!lender.lenderAccountHolderName?.trim() &&
    !!lender.lenderAccountNumber?.trim();

  const canSubmit = method === "manual" && resolvedAmount != null && reference.trim().length > 0;

  const submitManual = async () => {
    if (method !== "manual") return;
    if (resolvedAmount == null) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (!bankConfigured) {
      toast.error("Your lender has not configured bank details yet. Please contact them.");
      return;
    }
    if (!reference.trim()) {
      toast.error("Payment reference is required");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("amount", String(resolvedAmount));
      fd.set("reference", reference.trim());
      if (receiptFile) {
        fd.set("receipt", receiptFile);
      }
      await createBorrowerManualPaymentRequest(loanId, fd);
      toast.success("Payment submitted — pending lender approval");
      router.push(`/loans/${loanId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const dueDateLabel = nextDueDate
    ? new Date(nextDueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : null;

  if (loading || !loan) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-16">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loan
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gradient">Make payment</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Choose how you want to pay. Manual bank transfers are reviewed by your lender before your schedule updates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* ── Left column: form ── */}
        <div className="lg:col-span-3 space-y-6">
          {/* Step 1 — Amount */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    Amount
                  </CardTitle>
                  <CardDescription>Pay the suggested instalment or enter a custom amount.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAmountMode("monthly")}
                  className={cn(
                    "relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all",
                    amountMode === "monthly"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
                  )}
                >
                  {amountMode === "monthly" && (
                    <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                  )}
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Monthly instalment
                  </span>
                  <span className="mt-1 block text-2xl font-bold tracking-tight">
                    {monthlyInstallment != null ? formatRm(monthlyInstallment) : "—"}
                  </span>
                  {dueDateLabel && (
                    <span className="mt-1.5 block text-xs text-muted-foreground">Due {dueDateLabel}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode("custom")}
                  className={cn(
                    "relative rounded-xl border-2 p-4 sm:p-5 text-left transition-all",
                    amountMode === "custom"
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
                  )}
                >
                  {amountMode === "custom" && (
                    <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                  )}
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Custom amount
                  </span>
                  <span className="mt-1 block text-lg font-semibold">Enter your own</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground">Any amount you prefer</span>
                </button>
              </div>
              {amountMode === "custom" && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="cust">Amount (RM)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                      RM
                    </span>
                    <Input
                      id="cust"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="pl-10 text-lg font-semibold h-12"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — Method */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  2
                </span>
                <CardTitle className="text-base">Payment method</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => setMethod("gateway")}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all opacity-60 cursor-not-allowed",
                  method === "gateway" ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">Payment gateway</p>
                    <p className="text-sm text-muted-foreground">Online card / FPX checkout</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    <Lock className="h-3 w-3 mr-1" />
                    Soon
                  </Badge>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMethod("manual")}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all",
                  method === "manual"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      method === "manual" ? "bg-primary/10" : "bg-muted",
                    )}
                  >
                    <Building2
                      className={cn("h-5 w-5", method === "manual" ? "text-primary" : "text-muted-foreground")}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">Manual bank transfer</p>
                    <p className="text-sm text-muted-foreground">
                      Transfer to your lender&apos;s account and notify them
                    </p>
                  </div>
                  {method === "manual" && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                </div>
              </button>
            </CardContent>
          </Card>

          {/* Step 3 — Transfer details (manual only) */}
          {method === "manual" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <div>
                    <CardTitle className="text-base">Transfer details</CardTitle>
                    <CardDescription>
                      Transfer to the account below, then enter the reference from your bank (shown after the transfer
                      completes).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {bankConfigured && lender ? (
                  <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-3">
                    <p className="font-semibold text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Lender bank account
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Bank</span>
                        <p className="font-medium mt-0.5">
                          {getBankLabel(lender.lenderBankCode, lender.lenderBankOtherName)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Account name</span>
                        <p className="font-medium mt-0.5">{lender.lenderAccountHolderName}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Account number</span>
                        <p className="font-mono font-semibold text-base mt-0.5 tracking-wider">
                          {lender.lenderAccountNumber}
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <p className="text-xs text-muted-foreground">
                      Transfer exactly{" "}
                      <span className="font-semibold text-foreground">
                        {resolvedAmount != null ? formatRm(resolvedAmount) : "—"}
                      </span>
                      . Use the reference field below only after your bank shows the transaction reference or ID.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
                    <p className="font-medium">Bank details not set up yet</p>
                    <p className="text-muted-foreground mt-1">
                      Your lender has not added a payout account. Please contact them before paying by transfer.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="ref">Bank reference / transaction ID</Label>
                  <Input
                    id="ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="From your bank app or SMS after you complete the transfer"
                    className="h-11"
                    disabled={!bankConfigured}
                  />
                  <p className="text-xs text-muted-foreground">
                    This is the reference your bank generates for the transfer — not the lender&apos;s account number.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcpt" className="flex items-center gap-2">
                    <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
                    Payment receipt
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="rcpt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    className="h-11"
                    disabled={!bankConfigured}
                  />
                  {receiptFile && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Receipt className="h-3 w-3" />
                      {receiptFile.name}
                    </p>
                  )}
                </div>

                {/* Desktop submit — visible in-form on lg+ */}
                <Button
                  className="w-full h-12 text-base font-semibold hidden lg:flex"
                  onClick={() => void submitManual()}
                  disabled={submitting || !canSubmit || !bankConfigured}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirm payment
                </Button>
              </CardContent>
            </Card>
          )}

          {method === "gateway" && (
            <Card>
              <CardContent className="py-12 text-center">
                <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Payment gateway is not available yet.
                  <br />
                  Please use manual bank transfer.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right column: summary ── */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 space-y-4">
            <Card className="overflow-hidden">
              <div className="bg-muted/40 px-5 py-4 border-b">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Payment summary</p>
              </div>
              <CardContent className="p-5 space-y-4">
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground mb-1">You&apos;re paying</p>
                  <p className="text-3xl font-bold tracking-tight">
                    {resolvedAmount != null ? formatRm(resolvedAmount) : "RM —"}
                  </p>
                  {amountMode === "monthly" && dueDateLabel && (
                    <p className="text-xs text-muted-foreground mt-1">Due {dueDateLabel}</p>
                  )}
                  {amountMode === "custom" && resolvedAmount != null && (
                    <p className="text-xs text-muted-foreground mt-1">Custom amount</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Method</span>
                    <span className="font-medium">
                      {method === "manual" ? "Bank transfer" : "Payment gateway"}
                    </span>
                  </div>
                  {method === "manual" && bankConfigured && lender && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Pay to</span>
                      <span className="font-medium text-right truncate min-w-0">
                        {getBankLabel(lender.lenderBankCode, lender.lenderBankOtherName)}
                      </span>
                    </div>
                  )}
                  {method === "manual" && reference.trim() && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference</span>
                      <span className="font-mono text-xs truncate max-w-[140px]">{reference.trim()}</span>
                    </div>
                  )}
                  {receiptFile && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Receipt</span>
                      <span className="text-xs truncate max-w-[140px]">{receiptFile.name}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>Your payment will be reviewed by your lender before the schedule is updated.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Mobile sticky bottom bar ── */}
      {method === "manual" && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4 lg:hidden">
          <div className="mx-auto max-w-5xl flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold truncate">
                {resolvedAmount != null ? formatRm(resolvedAmount) : "RM —"}
              </p>
            </div>
            <Button
              className="h-11 px-6 font-semibold shrink-0"
              onClick={() => void submitManual()}
              disabled={submitting || !canSubmit || !bankConfigured}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
