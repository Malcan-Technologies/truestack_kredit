"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import {
  getSecuritySetupPreferenceCopy,
  type SecuritySetupPreference,
} from "@kredit/shared";
import { Button } from "@/components/ui/button";
import { AccountSecurityCard } from "@/components/account-security-card";
import { useSession } from "@/lib/auth-client";

interface PasswordInfo {
  passwordChangedAt: string | null;
}

interface LoginLog {
  id: string;
  ipAddress: string | null;
  deviceType: string | null;
  createdAt: string;
}

export default function SecuritySetupPage() {
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const requestedSetup = searchParams.get("setup");
  const setupPreference =
    requestedSetup === "passkey" ||
    requestedSetup === "authenticator" ||
    requestedSetup === "either"
      ? (requestedSetup as SecuritySetupPreference)
      : null;
  const [passwordInfo, setPasswordInfo] = useState<PasswordInfo | null>(null);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);

  useEffect(() => {
    if (isPending || !session?.user?.id) {
      return;
    }

    let cancelled = false;

    const loadSecurityDetails = async () => {
      try {
        const [passwordInfoRes, loginHistoryRes] = await Promise.all([
          fetch("/api/proxy/auth/password-info", { credentials: "include" }).then((response) =>
            response.json().catch(() => null)
          ),
          fetch("/api/proxy/auth/login-history", { credentials: "include" }).then((response) =>
            response.json().catch(() => null)
          ),
        ]);

        if (cancelled) {
          return;
        }

        if (passwordInfoRes?.success && passwordInfoRes.data) {
          setPasswordInfo(passwordInfoRes.data);
        }

        if (loginHistoryRes?.success && Array.isArray(loginHistoryRes.data)) {
          setLoginLogs(loginHistoryRes.data);
        }
      } catch {
        if (!cancelled) {
          setLoginLogs([]);
        }
      }
    };

    void loadSecurityDetails();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isPending]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-heading font-bold text-gradient">Finish Security Setup</h1>
        </div>
        <p className="text-muted">
          Before you can use the rest of the dashboard, set up either a passkey or an authenticator app.
        </p>
        {setupPreference ? (
          <p className="text-sm text-muted">
            You chose {getSecuritySetupPreferenceCopy(setupPreference).title.toLowerCase()} during
            signup. Start there, or switch to the other option if you prefer.
          </p>
        ) : null}
      </div>

      <AccountSecurityCard
        passwordChangedAt={passwordInfo?.passwordChangedAt ?? null}
        loginLogs={loginLogs}
      />

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard">Continue to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
