"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  fetchLenderInfo,
  resolveBorrowerLenderLogoSrc,
  type LenderInfo,
} from "@borrower_pro/lib/borrower-auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@borrower_pro/components/ui/card";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import { Badge } from "@borrower_pro/components/ui/badge";
import { PhoneDisplay } from "@borrower_pro/components/ui/phone-display";
import { APP_VERSION } from "@/lib/version";

const POLICY_LINKS = [
  { href: "/legal/terms", label: "Terms of use" },
  { href: "/legal/privacy", label: "Privacy policy" },
  { href: "/legal/security", label: "Security policy" },
  { href: "/legal/pdpa", label: "PDPA notice" },
  { href: "/legal/cookies", label: "Cookie policy" },
] as const;

function PoweredByPinjocep() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground max-w-md">
            Lending software powered by{" "}
            <span className="font-medium text-foreground">pinjocep</span>
            {` · v${APP_VERSION}`}
          </p>
          <div className="inline-flex shrink-0 rounded-md p-2 -m-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static public asset */}
            <img
              src="/pinjocep-logo.png"
              alt="Pinjocep"
              className="h-[2.6rem] w-auto max-w-[182px] object-contain object-left"
              width={182}
              height={42}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PoliciesLegalCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Policies &amp; legal</CardTitle>
        <CardDescription>
          Important documents governing your use of this portal and how we handle your data. Each link opens in a new tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {POLICY_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.label} (opens in new tab)`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <span>{item.label}</span>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

function licenseTypeLabel(type: LenderInfo["type"]): string {
  if (type === "PPW") return "PPW — Pemberi Pinjam Wang";
  if (type === "PPG") return "PPG — Pemberi Pajak Gadai";
  return "—";
}

function AboutLenderCardSkeleton() {
  return (
    <Card role="status" aria-label="Loading lender information">
      <CardHeader>
        <Skeleton className="h-7 w-48 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl mt-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-56 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
          <div className="md:col-span-2 lg:col-span-3 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AboutPage() {
  const [lender, setLender] = useState<LenderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLenderInfo()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setLender(res.data);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <AboutLenderCardSkeleton />
        <PoliciesLegalCard />
        <PoweredByPinjocep />
      </div>
    );
  }

  if (error || !lender) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>About your lender</CardTitle>
            <CardDescription>We couldn&apos;t load company details.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error || "Unknown error"}</p>
          </CardContent>
        </Card>
        <PoliciesLegalCard />
        <PoweredByPinjocep />
      </div>
    );
  }

  const logoSrc = resolveBorrowerLenderLogoSrc(lender.logoUrl);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>About your lender</CardTitle>
          <CardDescription>
            Licensed moneylender details for the company you are borrowing from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {logoSrc && (
            <div className="flex items-center gap-4 pb-4 border-b border-border">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied / S3 URLs; avoids remotePatterns setup */}
                <img
                  src={logoSrc}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Company</p>
                <p className="font-medium">{lender.name}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!logoSrc && (
              <div className="md:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground">Company name</p>
                <p className="font-medium">{lender.name}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">License type</p>
              <Badge variant="outline" className="mt-1">
                {licenseTypeLabel(lender.type)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">KPKT license number</p>
              <p className="font-medium">{lender.licenseNumber || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registration number (SSM)</p>
              <p className="font-medium">{lender.registrationNumber || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Company email</p>
              {lender.email ? (
                <a
                  href={`mailto:${encodeURIComponent(lender.email)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {lender.email}
                </a>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>
            <PhoneDisplay label="Contact number" value={lender.contactNumber} />
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-sm text-muted-foreground">Business address</p>
              <p className="font-medium whitespace-pre-wrap">
                {lender.businessAddress || "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <PoliciesLegalCard />

      <PoweredByPinjocep />
    </div>
  );
}
