"use client";

import { FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";

export function DigitalSigningComingSoonCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground">
            <FileSignature className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-heading">Digital Signing Certificate</CardTitle>
            <CardDescription>
              Secure document signing
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
          <p className="font-medium text-foreground">Coming soon</p>
          <p className="text-sm text-muted-foreground mt-1">
            Digital signing certificates will enable secure, legally binding
            electronic signatures for loan agreements and documents.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
