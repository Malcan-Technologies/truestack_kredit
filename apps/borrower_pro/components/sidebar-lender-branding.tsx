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
  /** Icon-only compact header (matches admin collapsed sidebar). */
  collapsed?: boolean;
}

export function SidebarLenderBranding({
  className,
  collapsed = false,
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

  if (collapsed) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          {resolvedLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolvedLogoUrl}
              alt={`${lenderName} logo`}
              className="h-full w-full object-contain p-1"
            />
          ) : companyName ? (
            <span className="text-sm font-semibold text-muted-foreground">{lenderInitial}</span>
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center px-1 py-2",
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
    </div>
  );
}
