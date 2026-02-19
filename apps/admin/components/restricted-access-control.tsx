"use client";

import { notFound } from "next/navigation";
import { useTenantContext } from "@/components/tenant-context";

interface RestrictedAccessControlProps {
  children: React.ReactNode;
}

/**
 * Client component that restricts access to paid subscription features.
 * Used by route layouts that need both metadata (server) and access control (client).
 */
export function RestrictedAccessControl({ children }: RestrictedAccessControlProps) {
  const { subscriptionStatus } = useTenantContext();

  if (subscriptionStatus === "FREE") {
    notFound();
  }

  return <>{children}</>;
}
