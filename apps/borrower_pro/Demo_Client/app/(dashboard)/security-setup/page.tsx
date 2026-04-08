"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { normalizeAuthReturnTo } from "@borrower_pro/lib/finish-login";
import { Button } from "@borrower_pro/components/ui/button";
import { AccountSecurityCard } from "@borrower_pro/components/account-security-card";

function SecuritySetupInner() {
  const searchParams = useSearchParams();
  const rawReturn = searchParams.get("returnTo")?.trim() || null;
  const returnTo = normalizeAuthReturnTo(rawReturn) || "/dashboard";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-heading font-bold">Finish security setup</h1>
        </div>
        <p className="text-muted-foreground">
          Before you can use the rest of the app, set up either a passkey or an authenticator app.
        </p>
      </div>

      <AccountSecurityCard />

      <div className="flex justify-end">
        <Button asChild>
          <Link href={returnTo}>Continue</Link>
        </Button>
      </div>
    </div>
  );
}

export default function SecuritySetupPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <SecuritySetupInner />
    </Suspense>
  );
}
