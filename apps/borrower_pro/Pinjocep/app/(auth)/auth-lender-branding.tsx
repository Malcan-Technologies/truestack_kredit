"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import {
  fetchLenderInfo,
  resolveBorrowerLenderLogoSrc,
} from "@borrower_pro/lib/borrower-auth-client";

type AuthLenderBranding = {
  name: string;
  logoUrl: string | null;
};

export function AuthLenderBranding() {
  const [branding, setBranding] = useState<AuthLenderBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchLenderInfo()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setBranding({
            name: res.data.name,
            logoUrl: res.data.logoUrl ?? null,
          });
        }
      })
      .catch(() => {
        // Auth pages should still render even when branding cannot be loaded.
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logoSrc = resolveBorrowerLenderLogoSrc(branding?.logoUrl ?? null);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="flex min-h-20 items-center justify-center rounded-xl border border-border bg-background px-6 py-4">
          <Skeleton className="h-12 w-[180px]" />
        </div>
      </div>
    );
  }

  if (!logoSrc) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-3 pb-2">
      {logoSrc ? (
        <Link
          href="/"
          aria-label="Go to home page"
          className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex min-h-20 items-center justify-center rounded-xl border border-border bg-background px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied / remote tenant logo */}
            <img
              src={logoSrc}
              alt={branding?.name ? `${branding.name} logo` : "Tenant logo"}
              className="max-h-12 w-auto max-w-[180px] object-contain"
            />
          </div>
        </Link>
      ) : null}
    </div>
  );
}
