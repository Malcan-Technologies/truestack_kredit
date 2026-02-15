"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Sparkles, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

// ============================================
// Component
// ============================================

interface TrueIdentityBoxProps {
  borrowerId: string;
}

export function TrueIdentityBox({ borrowerId }: TrueIdentityBoxProps) {
  const [isActive, setIsActive] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const checkAddOn = async () => {
      try {
        const res = await api.get<{
          addOns: Array<{ addOnType: string; status: string }>;
        }>("/api/billing/add-ons");
        if (res.success && res.data) {
          const active = res.data.addOns.some(
            (a) => a.addOnType === "TRUEIDENTITY" && a.status === "ACTIVE"
          );
          setIsActive(active);
        } else {
          setIsActive(false);
        }
      } catch {
        setIsActive(false);
      }
    };
    checkAddOn();
  }, []);

  const inactive = isActive === false;

  return (
    <Card className={inactive ? "opacity-50 border-dashed border-muted-foreground/30" : "bg-emerald-500/[0.04] border-emerald-500/15"}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Fingerprint className={`h-4 w-4 ${inactive ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-500"}`} />
            Identity Verification
          </CardTitle>
          <Badge
            variant={inactive ? "outline" : "default"}
            className={`text-[10px] ${inactive ? "text-muted-foreground" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/15"}`}
          >
            <Fingerprint className="h-3 w-3 mr-1" />
            TrueIdentity
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {inactive ? (
          // Not subscribed state
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Fingerprint className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              e-KYC verification is not enabled
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[260px] mb-4">
              Subscribe to TrueIdentity to verify borrower identity via QR-based IC capture and face liveness check.
            </p>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/dashboard/plan">
                <Sparkles className="h-3.5 w-3.5" />
                Learn More
              </Link>
            </Button>
          </div>
        ) : isActive === null ? (
          // Loading
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          // Active state — placeholder until functionality is built
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">TrueIdentity is active</p>
                <p className="text-xs text-muted-foreground">
                  e-KYC verification is available for this borrower.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full" disabled>
              <Fingerprint className="h-3.5 w-3.5 mr-1.5" />
              Start Verification (Coming Soon)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
