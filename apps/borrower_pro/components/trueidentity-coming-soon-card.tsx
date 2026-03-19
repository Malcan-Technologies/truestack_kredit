"use client";

import { Fingerprint, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";

export function TrueIdentityComingSoonCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Fingerprint className="h-5 w-5" />
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="font-heading">TrueIdentity e-KYC</CardTitle>
            <CardDescription>
              Digital identity verification
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
          <p className="font-medium text-foreground">Coming soon</p>
          <p className="text-sm text-muted-foreground mt-1">
            TrueIdentity e-KYC will enable secure digital identity verification
            for faster onboarding and compliance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
