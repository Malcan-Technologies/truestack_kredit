"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "../../../../lib/borrower-auth-client";
import { listBorrowerApplications } from "../../../../lib/borrower-applications-client";
import type { LoanApplicationDetail } from "../../../../lib/application-form-types";
import { toAmountNumber } from "../../../../lib/application-form-validation";

export default function ApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LoanApplicationDetail[]>([]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBorrowerApplications({ pageSize: 50 });
      if (res.success) setRows(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  useEffect(() => {
    const onSwitch = () => {
      void loadApplications();
    };
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
  }, [loadApplications]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View your loan applications or start a new one.
          </p>
        </div>
        <Button asChild>
          <Link href="/applications/apply">
            <Plus className="h-4 w-4 mr-2" />
            Apply for a loan
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your applications</CardTitle>
          <CardDescription>Submitted and draft applications for your active borrower profile.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No applications yet.{" "}
              <Link href="/applications/apply" className="text-primary underline font-medium">
                Start an application
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((app) => {
                const canUploadDocuments =
                  app.status === "DRAFT" ||
                  app.status === "SUBMITTED" ||
                  app.status === "UNDER_REVIEW";
                return (
                  <li
                    key={app.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{app.product?.name ?? "Product"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrencyMaybe(app.amount)} · {app.term} mo ·{" "}
                        <span className="uppercase">{app.status}</span>
                      </p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2 shrink-0">
                      <div className="flex flex-wrap gap-2">
                        {canUploadDocuments && (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/applications/${app.id}/documents`}>Documents</Link>
                          </Button>
                        )}
                        {app.status === "DRAFT" && (
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/applications/apply?applicationId=${app.id}`}>Continue</Link>
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatCurrencyMaybe(v: unknown): string {
  const n = toAmountNumber(v);
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
