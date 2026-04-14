"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type PublicTenantBranding = {
  name: string;
  logoUrl: string | null;
};

function resolveTenantLogoSrc(logoUrl: string | null): string | undefined {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }

  const trimmed = logoUrl.replace(/^\/+/, "");
  if (trimmed.startsWith("uploads/")) {
    return `/api/proxy/${trimmed}`;
  }
  if (trimmed.startsWith("api/uploads/")) {
    return `/api/proxy/${trimmed.replace(/^api\//, "")}`;
  }
  return `/api/proxy/${trimmed}`;
}

export function AuthTenantBranding() {
  const [branding, setBranding] = useState<PublicTenantBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/proxy/borrower-auth/lender", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: { name?: string; logoUrl?: string | null } }
          | null;

        if (!payload?.success || !payload.data?.name) return null;
        return {
          name: payload.data.name,
          logoUrl: payload.data.logoUrl ?? null,
        } satisfies PublicTenantBranding;
      })
      .then((data) => {
        if (!cancelled && data) {
          setBranding(data);
        }
      })
      .catch(() => {
        // Login should continue to work even when branding cannot be loaded.
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

  const logoSrc = resolveTenantLogoSrc(branding?.logoUrl ?? null);

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
          {/* eslint-disable-next-line @next/next/no-img-element -- tenant logo may be proxied or remote */}
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
