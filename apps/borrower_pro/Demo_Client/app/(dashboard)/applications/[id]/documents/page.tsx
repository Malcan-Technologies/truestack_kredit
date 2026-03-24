"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@borrower_pro/components/ui/button";
import { ApplicationDocumentsCard } from "@borrower_pro/components/application-form/application-documents-card";
import { getBorrowerApplication } from "@borrower_pro/lib/borrower-applications-client";
import type { LoanApplicationDetail } from "@borrower_pro/lib/application-form-types";
import { allDocumentsOptional } from "@borrower_pro/lib/application-form-validation";

const UPLOAD_STATUSES = new Set(["DRAFT", "SUBMITTED", "UNDER_REVIEW"]);

export default function ApplicationDocumentsPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [loading, setLoading] = useState(true);
  const [app, setApp] = useState<LoanApplicationDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const r = await getBorrowerApplication(id);
    if (r.success) setApp(r.data);
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await getBorrowerApplication(id);
        if (!cancelled && r.success) setApp(r.data);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load application");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const requiredDocs = app?.product?.requiredDocuments ?? [];
  const canUpload = app ? UPLOAD_STATUSES.has(app.status) : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/applications">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to applications
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !app ? (
        <p className="text-sm text-muted-foreground">Application not found.</p>
      ) : !canUpload ? (
        <p className="text-sm text-muted-foreground">
          Documents cannot be changed while this application is {app.status.toLowerCase().replace(/_/g, " ")}.
        </p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Supporting documents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {app.product?.name ?? "Application"} ·{" "}
              <span className="uppercase">{app.status}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload PDF, PNG, or JPG up to 5MB per file. You can add or replace files here while your
            application is still under review.
          </p>
          <ApplicationDocumentsCard
            applicationId={app.id}
            requiredDocs={requiredDocs}
            documents={app.documents ?? []}
            onDocumentsChange={refresh}
            showOptionalBadge={requiredDocs.length > 0 && allDocumentsOptional(requiredDocs)}
          />
        </div>
      )}
    </div>
  );
}
