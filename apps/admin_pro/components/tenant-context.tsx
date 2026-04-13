"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { normalizePermissions, type TenantRole } from "@/lib/permissions";
import type { TenantPermission } from "@kredit/shared";

interface TenantContextValue {
  /**
   * Counter that increments each time tenant data is updated.
   * Components can watch this to know when to refetch tenant data.
   */
  refreshKey: number;
  /**
   * Call this when tenant data (logo, name, etc.) has been updated
   * to notify other components to refetch their data.
   */
  refreshTenantData: () => void;
  /**
   * The current user's role within the active tenant.
   * Defaults to `GENERAL_STAFF` until membership data is loaded.
   */
  currentRole: TenantRole;
  /**
   * Human readable name for the active tenant role.
   */
  currentRoleName: string;
  /**
   * Database role ID for tenant-configured roles.
   */
  currentRoleId: string | null;
  /**
   * Resolved permission set for the active tenant membership.
   */
  permissions: TenantPermission[];
  /**
   * Whether the user has at least one tenant membership.
   * When false, membership-only sidebar items are disabled and those routes return 404.
   */
  hasTenants: boolean;
  /**
   * Current tenant subscription status.
   * FREE/SUSPENDED tenants are treated as non-paid for premium feature access.
   */
  subscriptionStatus: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
}

const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: ReactNode;
  /** Role passed from the layout after membership is fetched */
  role?: TenantRole;
  /** Display name for the current role */
  roleName?: string;
  /** Role ID for the current role */
  roleId?: string | null;
  /** Resolved permissions for the current role */
  permissions?: string[];
  /** Whether the user has at least one tenant membership */
  hasTenants?: boolean;
  /** Current tenant's subscription status */
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

  // Sync role prop from layout into state
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

/** Convenience hook to get just the current tenant role */
export function useCurrentRole(): TenantRole {
  const { currentRole } = useTenantContext();
  return currentRole;
}

export function useTenantPermissions(): TenantPermission[] {
  const { permissions } = useTenantContext();
  return permissions;
}
