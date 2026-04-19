"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { normalizePermissions, type TenantRole } from "@/lib/permissions";
import type { TenantPermission } from "@kredit/shared";

interface TenantContextValue {
  refreshKey: number;
  refreshTenantData: () => void;
  currentRole: TenantRole;
  currentRoleName: string;
  currentRoleId: string | null;
  permissions: TenantPermission[];
  hasTenants: boolean;
  subscriptionStatus: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
}

const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: ReactNode;
  role?: TenantRole;
  roleName?: string;
  roleId?: string | null;
  permissions?: string[];
  hasTenants?: boolean;
  subscriptionStatus?: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
}

export function TenantProvider({
  children,
  role,
  roleName,
  roleId,
  permissions,
  hasTenants = true,
  subscriptionStatus = "FREE",
}: TenantProviderProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentRole, setCurrentRole] = useState<TenantRole>(role || "GENERAL_STAFF");
  const [currentRoleName, setCurrentRoleName] = useState(roleName || "General Staff");
  const [currentRoleId, setCurrentRoleId] = useState<string | null>(roleId ?? null);
  const [currentPermissions, setCurrentPermissions] = useState<TenantPermission[]>(
    normalizePermissions(permissions)
  );

  useEffect(() => {
    if (role) {
      setCurrentRole(role);
    }
  }, [role]);

  useEffect(() => {
    setCurrentRoleName(roleName || "General Staff");
  }, [roleName]);

  useEffect(() => {
    setCurrentRoleId(roleId ?? null);
  }, [roleId]);

  useEffect(() => {
    setCurrentPermissions(normalizePermissions(permissions));
  }, [permissions]);

  const refreshTenantData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <TenantContext.Provider
      value={{
        refreshKey,
        refreshTenantData,
        currentRole,
        currentRoleName,
        currentRoleId,
        permissions: currentPermissions,
        hasTenants,
        subscriptionStatus,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenantContext must be used within a TenantProvider");
  }
  return context;
}

export function useCurrentRole(): TenantRole {
  const { currentRole } = useTenantContext();
  return currentRole;
}

export function useTenantPermissions(): TenantPermission[] {
  const { permissions } = useTenantContext();
  return permissions;
}
