"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { TenantRole } from "@/lib/permissions";

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
   * Defaults to "STAFF" until membership data is loaded.
   */
  currentRole: TenantRole;
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
  /** Whether the user has at least one tenant membership */
  hasTenants?: boolean;
  /** Current tenant's subscription status */
  subscriptionStatus?: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
}

export function TenantProvider({ children, role, hasTenants = true, subscriptionStatus = "FREE" }: TenantProviderProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentRole, setCurrentRole] = useState<TenantRole>(role || "STAFF");

  // Sync role prop from layout into state
  useEffect(() => {
    if (role) {
      setCurrentRole(role);
    }
  }, [role]);

  const refreshTenantData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <TenantContext.Provider value={{ refreshKey, refreshTenantData, currentRole, hasTenants, subscriptionStatus }}>
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
