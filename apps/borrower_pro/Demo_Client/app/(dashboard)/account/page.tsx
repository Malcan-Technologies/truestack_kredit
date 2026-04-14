"use client";

import { AccountProfileCard } from "@borrower_pro/components/account-profile-card";
import { AccountSecurityCard } from "@borrower_pro/components/account-security-card";
import { AccountLoginActivityCard } from "@borrower_pro/components/account-login-activity-card";
import { Card, CardContent, CardHeader } from "@borrower_pro/components/ui/card";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";

function AccountPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading account">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 max-w-[90vw]" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full max-w-lg" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-52 max-w-full" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border">
              <div className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, row) => (
                <div key={row} className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { isPending } = useSession();

  if (isPending) {
    return <AccountPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">My account</h1>
        <p className="text-muted text-base mt-1">
          Manage your login, security, and account information
        </p>
      </div>

      <div className="space-y-6">
        <AccountProfileCard />
        <AccountSecurityCard />
        <AccountLoginActivityCard />
      </div>
    </div>
  );
}
