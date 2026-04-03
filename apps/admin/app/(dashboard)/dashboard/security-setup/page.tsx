"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountSecurityCard } from "@/components/account-security-card";
import { useSession } from "@/lib/auth-client";

interface PasswordInfo {
  passwordChangedAt: string | null;
}

export default function SecuritySetupPage() {
  const { data: session, isPending } = useSession();
  const [passwordInfo, setPasswordInfo] = useState<PasswordInfo | null>(null);

  useEffect(() => {
    if (isPending || !session?.user?.id) {
      return;
    }

    let cancelled = false;

    const loadPasswordInfo = async () => {
      try {
        const res = await fetch("/api/proxy/auth/password-info", { credentials: "include" });
        const json = await res.json().catch(() => null);

        if (!cancelled && json?.success && json.data) {
          setPasswordInfo(json.data);
        }
      } catch {
        // ignore
      }
    };

    void loadPasswordInfo();

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
      </div>

      <AccountSecurityCard
        passwordChangedAt={passwordInfo?.passwordChangedAt ?? null}
      />

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard">Continue to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
