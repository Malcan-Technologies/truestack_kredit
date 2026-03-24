"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "../lib/utils";
import {
  fetchLenderInfo,
  resolveBorrowerLenderLogoSrc,
} from "../lib/borrower-auth-client";

interface SidebarLenderBrandingProps {
  className?: string;
}

export function SidebarLenderBranding({
  className,
}: SidebarLenderBrandingProps) {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchLenderInfo()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setCompanyName(res.data.name);
          setLogoUrl(res.data.logoUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompanyName(null);
          setLogoUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedLogoUrl = resolveBorrowerLenderLogoSrc(logoUrl);
  const lenderName = companyName?.trim() || "Your lender";
  const lenderInitial = lenderName.slice(0, 1).toUpperCase() || "?";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-1 py-2 text-center",
        className
      )}
    >
      <div className="flex h-20 w-full max-w-[9rem] shrink-0 items-center justify-center overflow-hidden">
        {resolvedLogoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- proxied / S3 URLs; avoids remotePatterns setup */
          <img
            src={resolvedLogoUrl}
            alt={`${lenderName} logo`}
            className="max-h-20 w-full max-w-[9rem] object-contain"
          />
        ) : companyName ? (
          <span className="text-2xl font-semibold text-foreground">
            {lenderInitial}
          </span>
        ) : (
          <Building2 className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 w-full">
        <p className="truncate text-base font-semibold leading-tight">
          {lenderName}
        </p>
      </div>
    </div>
  );
}
