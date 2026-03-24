"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  getBorrowerLoan,
  borrowerLoanGenerateAgreementUrl,
  borrowerLoanViewSignedAgreementUrl,
  uploadBorrowerSignedAgreement,
} from "../../lib/borrower-loans-client";
import type { BorrowerLoanDetail, SignedAgreementReviewStatus } from "../../lib/borrower-loan-types";
import { toAmountNumber } from "../../lib/application-form-validation";

function formatRm(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-MY");
  } catch {
    return iso;
  }
}

/** Stored agreement dates are UTC midnight; match `<input type="date">` value. */
function agreementIsoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function reviewBadge(status: SignedAgreementReviewStatus | undefined) {
  const s = status ?? "NONE";
  switch (s) {
    case "APPROVED":
      return <Badge className="bg-emerald-600">Approved</Badge>;
    case "PENDING":
      return <Badge variant="secondary">Awaiting admin approval</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected — upload again</Badge>;
    default:
      return <Badge variant="outline">Not uploaded</Badge>;
  }
}

export function LoanPendingAgreementPage() {
  const params = useParams();
  const router = useRouter();
  const loanId = typeof params.loanId === "string" ? params.loanId : "";
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [agreementDate, setAgreementDate] = useState("");
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!loanId) return;
    const r = await getBorrowerLoan(loanId);
    if (r.success) {
      setLoan(r.data);
    }
  }, [loanId]);

  useEffect(() => {
    if (!loanId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await getBorrowerLoan(loanId);
        if (!cancelled && r.success) {
          setLoan(r.data);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load loan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    if (loan?.agreementDate) {
      setAgreementDate(agreementIsoToDateInput(loan.agreementDate));
    }
  }, [loan?.agreementDate]);

  const handleDownloadPdf = () => {
    if (!loan) return;
    const d = agreementDate.trim();
    if (!d) {
      toast.error("Enter the agreement date (YYYY-MM-DD), or contact your lender.");
      return;
    }
    window.open(borrowerLoanGenerateAgreementUrl(loanId, d), "_blank", "noopener,noreferrer");
  };

  const onUpload = async (file: File) => {
    if (!loanId) return;
    setUploading(true);
    try {
      await uploadBorrowerSignedAgreement(loanId, file);
      toast.success("Signed agreement uploaded. Waiting for admin approval.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/loans">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Loan not found.</p>
      </div>
    );
  }

  if (loan.status !== "PENDING_DISBURSEMENT") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/loans")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">
          This page is only for loans pending disbursement. Current status: {loan.status}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/loans">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to loans
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loan agreement</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loan.product?.name ?? "Loan"} · {formatRm(loan.principalAmount)} · {loan.term} months
        </p>
      </div>

      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Signed agreement status
          </CardTitle>
          <CardDescription>
            Disbursement can only happen after your signed agreement is uploaded and approved by us.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {reviewBadge(loan.signedAgreementReviewStatus)}
          {(loan.signedAgreementReviewStatus ?? "NONE") === "REJECTED" && loan.signedAgreementReviewNotes && (
            <p className="text-sm text-destructive w-full mt-2">
              {loan.signedAgreementReviewNotes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Download agreement PDF</CardTitle>
          <CardDescription>
            Set the agreement date, download the PDF, sign it, then upload the signed copy below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="agreement-date">Agreement date</Label>
            <Input
              id="agreement-date"
              type="date"
              value={agreementDate}
              onChange={(e) => setAgreementDate(e.target.value)}
            />
            {loan.agreementDate && (
              <p className="text-xs text-muted-foreground">
                On file: {formatDate(loan.agreementDate)} — adjust above if you need a different date for this
                download.
              </p>
            )}
          </div>
          <Button type="button" variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" />
            Download agreement PDF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload signed agreement</CardTitle>
          <CardDescription>PDF only. Uploading replaces any previous file and sends it for admin review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              id="signed-agreement-upload"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            <Button type="button" disabled={uploading} asChild>
              <label htmlFor="signed-agreement-upload" className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload signed PDF
              </label>
            </Button>
            {loan.agreementPath && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(borrowerLoanViewSignedAgreementUrl(loanId), "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View uploaded
              </Button>
            )}
          </div>
          {loan.agreementOriginalName && (
            <p className="text-xs text-muted-foreground">Last file: {loan.agreementOriginalName}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
