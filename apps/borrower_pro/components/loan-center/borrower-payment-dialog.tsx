"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { recordBorrowerLoanPayment } from "../../lib/borrower-loans-client";

export function BorrowerPaymentDialog({
  loanId,
  open,
  onOpenChange,
  onSuccess,
}: {
  loanId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await recordBorrowerLoanPayment(loanId, { amount: n, reference: reference || undefined });
      onSuccess();
      setAmount("");
      setReference("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-background rounded-lg border shadow-lg max-w-md w-full p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Record payment</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Payments are allocated to installments automatically (same rules as the lender portal). Amount cannot exceed
            outstanding balance.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pay-amt">Amount (RM)</Label>
            <Input
              id="pay-amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank transfer ref"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
