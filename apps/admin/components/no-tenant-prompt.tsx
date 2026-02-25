"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NoTenantPrompt() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Welcome to TrueKredit</CardTitle>
          <CardDescription>
            Create your first tenant to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            A tenant represents your company or organization. You can manage multiple tenants from one account.
          </p>
          <Button asChild className="w-full">
            <Link href="/dashboard/onboarding">
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
