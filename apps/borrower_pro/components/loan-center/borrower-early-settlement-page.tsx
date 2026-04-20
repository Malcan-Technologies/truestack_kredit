"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  FileUp,
  Loader2,
  Percent,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { cn } from "@borrower_pro/lib/utils";
import { toAmountNumber } from "@borrower_pro/lib/application-form-validation";
import {
  createBorrowerEarlySettlementRequest,
  fetchBorrowerLender,
  getBorrowerEarlySettlementQuote,
  getBorrowerLoan,
  listBorrowerEarlySettlementRequests,
  type EarlySettlementQuoteData,
  type BorrowerLenderInfo,
} from "@borrower_pro/lib/borrower-loans-client";
import type { BorrowerLoanDetail } from "@kredit/borrower";
import { getBankLabel } from "@borrower_pro/lib/bank-options";

function formatRm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateTransferReference(loanId: string): string {
  const loanPart = loanId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "LOAN";
  const timestampPart = new Date().toISOString().replace(/\D/g, "").slice(-10);
  const randomPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
      : Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TSK-ES-${loanPart}-${timestampPart}-${randomPart}`;
}

function discountSummaryLine(q: EarlySettlementQuoteData): string | null {
  if (!q.eligible || (q.discountAmount ?? 0) <= 0) return null;
  const t = q.discountType === "PERCENTAGE" ? `${q.discountValue ?? 0}% off future interest` : "Fixed discount on interest";
  return t;
}

export function BorrowerEarlySettlementPage({ loanId }: { loanId: string }) {
  const router = useRouter();
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [lender, setLender] = useState<BorrowerLenderInfo | null>(null);
  const [quote, setQuote] = useState<EarlySettlementQuoteData | null>(null);
  const [pendingRequest, setPendingRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [borrowerNote, setBorrowerNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTransferred, setConfirmTransferred] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, lenderRes, quoteRes, reqRes] = await Promise.all([
        getBorrowerLoan(loanId),
        fetchBorrowerLender().catch(() => null),
        getBorrowerEarlySettlementQuote(loanId).catch(() => ({ success: false as const, data: null })),
        listBorrowerEarlySettlementRequests(loanId).catch(() => ({ success: true, data: [] })),
      ]);
      setLoan(loanRes.data);
      setLender(lenderRes);
      setQuote(quoteRes.success && quoteRes.data ? quoteRes.data : null);
      const pend = (reqRes.data ?? []).some((r) => r.status === "PENDING");
      setPendingRequest(pend);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load loan");
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setReference((c) => c || generateTransferReference(loanId));
  }, [loanId]);

  const bankConfigured =
    !!lender?.lenderBankCode &&
    !!lender.lenderAccountHolderName?.trim() &&
    !!lender.lenderAccountNumber?.trim();

  const totalSettlement = quote?.eligible ? toAmountNumber(quote.totalSettlement ?? 0) : null;
  const canSubmit =
    quote?.eligible === true &&
    !pendingRequest &&
    reference.trim().length > 0 &&
    bankConfigured;

  const copyReference = async () => {
    if (!reference.trim()) return;
    try {
      await navigator.clipboard.writeText(reference.trim());
      setReferenceCopied(true);
      toast.success("Transfer reference copied");
      window.setTimeout(() => setReferenceCopied(false), 2000);
    } catch {
      toast.error("Failed to copy reference");
    }
  };

  const openConfirm = () => {
    if (!quote?.eligible || totalSettlement == null) {
      toast.error("Settlement is not available");
      return;
    }
    if (!bankConfigured) {
      toast.error("Bank details are not available yet. Please contact your lender.");
      return;
    }
    if (!reference.trim()) {
      toast.error("Transfer reference is required");
      return;
    }
    setConfirmTransferred(false);
    setConfirmOpen(true);
  };

  const submitRequest = async () => {
    if (!quote?.eligible || totalSettlement == null) {
      toast.error("Settlement is not available");
      return;
    }
    if (!bankConfigured) {
      toast.error("Bank details are not available yet. Please contact your lender.");
      return;
    }
    if (!reference.trim()) {
      toast.error("Transfer reference is required");
      return;
    }

    setSubmitting(true);
    try {
      await createBorrowerEarlySettlementRequest(loanId, {
        reference: reference.trim(),
        borrowerNote: borrowerNote.trim() || undefined,
      });
      toast.success("Early settlement request submitted. Your lender will review it.");
      setConfirmOpen(false);
      router.push(`/loans/${loanId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const productAllowsEarly = loan?.product?.earlySettlementEnabled === true;
  const statusOk =
    loan?.status === "ACTIVE" || loan?.status === "IN_ARREARS";

  const discountLine = useMemo(() => (quote ? discountSummaryLine(quote) : null), [quote]);

  if (loading || !loan) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!statusOk) {
    return (
      <div className="mx-auto max-w-5xl pb-20 px-4">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link href={`/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loan
          </Link>
        </Button>
        <p className="text-muted-foreground">Early settlement is only available for active or in-arrears loans.</p>
      </div>
    );
  }

  if (!productAllowsEarly) {
    return (
      <div className="mx-auto max-w-5xl pb-20 px-4">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link href={`/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loan
          </Link>
        </Button>
        <p className="text-muted-foreground">Early settlement is not enabled for this product.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-20 lg:pb-16 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/loans/${loanId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loan
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gradient">Early settlement</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Pay off your loan in one lump sum using the{" "}
          <span className="font-medium text-foreground">discounted early settlement amount</span> calculated from your
          product rules. Transfer to your lender&apos;s account, then submit this request for approval — same flow as a
          manual payment, with settlement pricing applied.
        </p>
      </div>

      {pendingRequest ? (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/10">
          <CardContent className="py-4 text-sm text-amber-950 dark:text-amber-50">
            You already have a <strong>pending</strong> early settlement request. Please wait for your lender to respond,
            or go back to your loan for status updates.
          </CardContent>
        </Card>
      ) : null}

      {!quote ? (
        <p className="text-sm text-muted-foreground">Could not load settlement quote. Try again later.</p>
      ) : !quote.eligible ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not available right now</CardTitle>
            <CardDescription>{quote.reason ?? "See your product terms or contact your lender."}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-3 space-y-6">
            {/* Step 1 — Settlement amount (product rules + discount) */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    1
                  </span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Settlement amount
                    </CardTitle>
                    <CardDescription>
                      Based on your loan schedule, unpaid instalments, late fees, and your product&apos;s early settlement
                      discount ({quote.discountType === "PERCENTAGE" ? "percentage of remaining interest" : "fixed amount"}).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Remaining principal</span>
                    <span className="font-medium tabular-nums">{formatRm(toAmountNumber(quote.remainingPrincipal ?? 0))}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Interest (unpaid portion)</span>
                    <span className="font-medium tabular-nums">{formatRm(toAmountNumber(quote.remainingInterest ?? 0))}</span>
                  </div>
                  {(quote.remainingFutureInterest ?? 0) > 0 && (
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">Of which future-scheduled interest</span>
                      <span className="tabular-nums">{formatRm(toAmountNumber(quote.remainingFutureInterest ?? 0))}</span>
                    </div>
                  )}
                  {(quote.discountAmount ?? 0) > 0 && (
                    <div className="flex justify-between gap-4 text-emerald-700 dark:text-emerald-400">
                      <span>
                        Early settlement discount
                        {discountLine ? <span className="block text-xs font-normal opacity-90">{discountLine}</span> : null}
                      </span>
                      <span className="font-semibold tabular-nums">
                        − {formatRm(toAmountNumber(quote.discountAmount ?? 0))}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Outstanding late fees</span>
                    <span className="font-medium tabular-nums">{formatRm(toAmountNumber(quote.outstandingLateFees ?? 0))}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between gap-4 items-baseline">
                    <span className="font-semibold">Total to transfer</span>
                    <span className="text-xl font-bold tabular-nums">{formatRm(toAmountNumber(quote.totalSettlement ?? 0))}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Figures follow the same rules as your lender&apos;s admin portal. The final amount may be adjusted slightly
                  when your lender approves, if the schedule has changed.
                </p>
              </CardContent>
            </Card>

            {/* Step 2 — Payment method */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </span>
                  <CardTitle className="text-base">Payment method</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="w-full rounded-xl border-2 border-primary bg-primary/5 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">Bank transfer</p>
                      <p className="text-sm text-muted-foreground">
                        Transfer the settlement total to your lender&apos;s account, then submit this request for review.
                      </p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 3 — Transfer details */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <div>
                    <CardTitle className="text-base">Transfer details</CardTitle>
                    <CardDescription>Use the reference in your banking app and submit your request here.</CardDescription>
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
                      Transfer{" "}
                      <span className="font-semibold text-foreground">
                        {totalSettlement != null ? formatRm(totalSettlement) : "—"}
                      </span>{" "}
                      for early settlement. Use the reference below in your bank transfer description where possible.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                    <p className="font-medium">Bank details not available</p>
                    <p className="text-muted-foreground mt-1">Contact your lender before transferring funds.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="es-ref">Transfer reference</Label>
                  <div className="flex gap-2">
                    <Input
                      id="es-ref"
                      value={reference}
                      readOnly
                      className="h-11 font-mono text-sm"
                      disabled={!bankConfigured}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 shrink-0"
                      onClick={() => void copyReference()}
                      disabled={!bankConfigured || !reference.trim()}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {referenceCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="es-note">Note to lender (optional)</Label>
                  <textarea
                    id="es-note"
                    value={borrowerNote}
                    onChange={(e) => setBorrowerNote(e.target.value)}
                    placeholder="e.g. transfer date, bank used, anything helpful for matching your payment"
                    maxLength={1000}
                    rows={4}
                    disabled={!bankConfigured || pendingRequest}
                    className={cn(
                      "flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
                      "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    )}
                  />
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <FileUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>
                    Proof-of-transfer files are not attached here yet. Put transfer details in the note if your lender
                    needs them, or follow their instructions after submitting.
                  </p>
                </div>

                <Button
                  className="w-full h-12 text-base font-semibold hidden lg:flex"
                  onClick={openConfirm}
                  disabled={submitting || !canSubmit || pendingRequest}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Submit early settlement request
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <div className="sticky top-20 space-y-4">
              <Card className="overflow-hidden">
                <div className="bg-muted/40 px-5 py-4 border-b">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Settlement summary</p>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="text-center py-2">
                    <p className="text-xs text-muted-foreground mb-1">Settlement total</p>
                    <p className="text-3xl font-bold tracking-tight">
                      {totalSettlement != null ? formatRm(totalSettlement) : "RM —"}
                    </p>
                    {(quote.totalSavings ?? 0) > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Includes {formatRm(toAmountNumber(quote.totalSavings ?? 0))} interest discount
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method</span>
                      <span className="font-medium">Bank transfer</span>
                    </div>
                    {bankConfigured && lender && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Pay to</span>
                        <span className="font-medium text-right truncate min-w-0">
                          {getBankLabel(lender.lenderBankCode, lender.lenderBankOtherName)}
                        </span>
                      </div>
                    )}
                    {reference.trim() && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reference</span>
                        <span className="font-mono text-xs truncate max-w-[140px]">{reference.trim()}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <p>
                      Your lender will confirm the settlement amount and complete the loan after approval — same process
                      as manual payments, with early settlement pricing applied.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {quote?.eligible && !pendingRequest ? (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4 lg:hidden">
          <div className="mx-auto max-w-5xl flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Settlement total</p>
              <p className="text-lg font-bold truncate">
                {totalSettlement != null ? formatRm(totalSettlement) : "RM —"}
              </p>
            </div>
            <Button
              className="h-11 px-6 font-semibold shrink-0"
              onClick={openConfirm}
              disabled={submitting || !canSubmit}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={(open) => (submitting ? null : setConfirmOpen(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm early settlement</DialogTitle>
            <DialogDescription>
              Please confirm you have transferred the exact settlement amount to your lender&apos;s bank account before
              submitting this request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Amount transferred</span>
                <span className="text-xl font-bold tabular-nums">
                  {totalSettlement != null ? formatRm(totalSettlement) : "—"}
                </span>
              </div>
              {bankConfigured && lender ? (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">To</span>
                    <span className="text-right">
                      {getBankLabel(lender.lenderBankCode, lender.lenderBankOtherName)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-mono text-xs text-right">{lender.lenderAccountNumber}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono text-xs text-right truncate max-w-[200px]">{reference.trim()}</span>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-input"
                checked={confirmTransferred}
                onChange={(e) => setConfirmTransferred(e.target.checked)}
                disabled={submitting}
              />
              <span className="text-sm leading-snug">
                I confirm I have transferred the exact amount of{" "}
                <span className="font-semibold">
                  {totalSettlement != null ? formatRm(totalSettlement) : "—"}
                </span>{" "}
                to the lender&apos;s bank account using the reference above.
              </span>
            </label>

            <p className="text-xs text-muted-foreground">
              False confirmations may delay approval or be rejected when the lender reconciles incoming transfers.
            </p>
          </div>

          <DialogFooter className="sm:space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitRequest()}
              disabled={submitting || !confirmTransferred}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm and submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
