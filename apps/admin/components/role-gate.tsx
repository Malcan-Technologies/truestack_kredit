"use client";

import { ShieldX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCurrentRole,
  useTenantPermissions,
} from "@/components/tenant-context";
import {
  hasAnyPermission,
  type TenantRole,
} from "@/lib/permissions";
import type { TenantPermission } from "@kredit/shared";

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles?: TenantRole[];
  requiredPermissions?: TenantPermission[];
}

export function RoleGate({
  children,
  allowedRoles,
  requiredPermissions,
}: RoleGateProps) {
  const role = useCurrentRole();
  const permissions = useTenantPermissions();
  const roleAllowed =
    !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(role);
  const permissionAllowed =
    !requiredPermissions ||
    requiredPermissions.length === 0 ||
    hasAnyPermission(permissions, ...requiredPermissions);

  if (!roleAllowed || !permissionAllowed) {
    return <AccessDeniedCard />;
  }

  return <>{children}</>;
}

export function AccessDeniedCard() {
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
