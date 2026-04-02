"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import {
  getSecuritySetupPreferenceCopy,
  type SecuritySetupPreference,
} from "@kredit/shared";
import { Button } from "@borrower_pro/components/ui/button";
import { AccountSecurityCard } from "@borrower_pro/components/account-security-card";

export default function SecuritySetupPage() {
  const searchParams = useSearchParams();
  const requestedSetup = searchParams.get("setup");
  const setupPreference =
    requestedSetup === "passkey" ||
    requestedSetup === "authenticator" ||
    requestedSetup === "either"
      ? (requestedSetup as SecuritySetupPreference)
      : null;

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
        {setupPreference ? (
          <p className="text-sm text-muted-foreground">
            You chose {getSecuritySetupPreferenceCopy(setupPreference).title.toLowerCase()} during
            signup. Start there, or switch to the other option if you prefer.
          </p>
        ) : null}
      </div>

      <AccountSecurityCard />

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard">Continue to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
