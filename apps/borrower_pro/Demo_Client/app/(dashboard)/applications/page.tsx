"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { Button } from "@borrower_pro/components/ui/button";
import { BORROWER_PROFILE_SWITCHED_EVENT } from "@borrower_pro/lib/borrower-auth-client";
import { listBorrowerApplications } from "@borrower_pro/lib/borrower-applications-client";
import type { LoanApplicationDetail } from "@borrower_pro/lib/application-form-types";
import { toAmountNumber } from "@borrower_pro/lib/application-form-validation";
import { cn } from "@borrower_pro/lib/utils";

type AppFilter = "all" | "draft" | "submitted";

export default function ApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LoanApplicationDetail[]>([]);
  const [filter, setFilter] = useState<AppFilter>("all");

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBorrowerApplications({ pageSize: 100 });
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

  const filtered = useMemo(() => {
    switch (filter) {
      case "draft":
        return rows.filter((a) => a.status === "DRAFT");
      case "submitted":
        return rows.filter((a) => a.status === "SUBMITTED");
      default:
        return rows;
    }
  }, [rows, filter]);

  const filterButtons: { id: AppFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft" },
    { id: "submitted", label: "Submitted" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Applications</h1>
          <p className="text-muted text-base mt-1">View your loan applications or start a new one.</p>
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
          <CardDescription>
            Draft and submitted applications for your active borrower profile. After approval, continue
            in <Link href="/loans" className="text-primary underline font-medium">Loans</Link> for
            attestation and signing.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {filterButtons.map((b) => (
              <Button
                key={b.id}
                type="button"
                variant={filter === b.id ? "secondary" : "outline"}
                size="sm"
                className={cn(filter === b.id && "ring-2 ring-primary/30")}
                onClick={() => setFilter(b.id)}
              >
                {b.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No applications in this filter.{" "}
              <Link href="/applications/apply" className="text-primary underline font-medium">
                Start an application
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((app) => {
                const canUploadDocuments =
                  app.status === "DRAFT" ||
                  app.status === "SUBMITTED" ||
                  app.status === "UNDER_REVIEW";
                const loanId = app.loan?.id;
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
                        {app.status === "APPROVED" && (
                          <Button size="sm" asChild>
                            <Link href={loanId ? `/loans/${loanId}` : "/loans"}>
                              Continue in Loans
                            </Link>
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
