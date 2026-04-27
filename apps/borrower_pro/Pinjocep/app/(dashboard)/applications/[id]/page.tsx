"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BorrowerApplicationDetail } from "@borrower_pro/components/application-detail/borrower-application-detail";
import { getBorrowerApplication } from "@borrower_pro/lib/borrower-applications-client";
import type { LoanApplicationDetail } from "@kredit/borrower";

export default function ApplicationDetailPage() {
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

  if (loading && !app) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return <p className="text-sm text-muted-foreground">Application not found.</p>;
  }

  return (
    <BorrowerApplicationDetail
      app={app}
      onDocumentsChange={async () => {
        await refresh();
      }}
    />
  );
}
