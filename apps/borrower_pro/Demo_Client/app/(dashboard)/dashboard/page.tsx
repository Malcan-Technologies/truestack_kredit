"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { fetchBorrowerMe } from "../../../../lib/borrower-auth-client";

function OnboardingBanner() {
  const [show, setShow] = useState(false);
  const [draftProgress, setDraftProgress] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchBorrowerMe()
      .then((res) => {
        if (res.success && res.data.profileCount === 0) {
          setShow(true);
          try {
            const raw = localStorage.getItem("onboarding_draft");
            if (raw) {
              const draft = JSON.parse(raw);
              const step = draft.step ?? 1;
              const subStep = draft.borrowerDetailSubStep ?? 1;
              const type = draft.borrowerType ?? "INDIVIDUAL";
              const maxSub = type === "INDIVIDUAL" ? 3 : 5;
              const totalSteps = maxSub + 2; // type + sub-steps + review
              let currentIndex = 0;
              if (step === 1) currentIndex = 0;
              else if (step === 2) currentIndex = subStep;
              else currentIndex = totalSteps - 1;

              if (currentIndex > 0) {
                setDraftProgress(
                  `Step ${currentIndex + 1} of ${totalSteps}`
                );
              }
            }
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking || !show) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">
            Complete your borrower profile
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            You need a borrower profile before you can apply for loans.
            {draftProgress && (
              <span className="ml-1 text-primary font-medium">
                ({draftProgress} saved)
              </span>
            )}
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/onboarding">
            {draftProgress ? "Continue" : "Get Started"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Overview of your borrowing activity
        </p>
      </div>

      <OnboardingBanner />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Loan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">No active loans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">RM 0</p>
            <p className="text-xs text-muted-foreground">Total outstanding</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Next Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground">No upcoming payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Total applications</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your recent borrowing activity
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No recent activity. Complete onboarding to get started.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Payments and application status
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No recent payments or applications.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
