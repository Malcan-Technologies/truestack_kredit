"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

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
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshTenantData = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <TenantContext.Provider value={{ refreshKey, refreshTenantData }}>
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
