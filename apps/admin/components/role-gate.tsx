"use client";

import { ShieldX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentRole } from "@/components/tenant-context";
import type { TenantRole } from "@/lib/permissions";

interface RoleGateProps {
  children: React.ReactNode;
  /** Roles that are allowed to see the content */
  allowedRoles: TenantRole[];
}

/**
 * Wraps page content and blocks access if the user's role is not in allowedRoles.
 * Shows an "Access Denied" card instead of the page content.
 * Use this to protect entire pages from direct URL access.
 */
export function RoleGate({ children, allowedRoles }: RoleGateProps) {
  const role = useCurrentRole();

  if (!allowedRoles.includes(role)) {
    return <AccessDeniedCard />;
  }

  return <>{children}</>;
}

function AccessDeniedCard() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center py-12 px-6">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-heading font-bold mb-2">Access Denied</h2>
          <p className="text-muted text-sm">
            You don&apos;t have permission to access this page.
            Contact your administrator if you believe this is an error.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
