"use client";

import { notFound } from "next/navigation";
import { useTenantContext } from "@/components/tenant-context";

interface RestrictedAccessControlProps {
  children: React.ReactNode;
}

/**
 * Client component that restricts access to paid SaaS subscription features.
 * TrueKredit Pro: licensed tenants are always "paid" for product features; only a
 * suspended org is blocked (see tenant status → subscriptionStatus in layout).
 */
export function RestrictedAccessControl({ children }: RestrictedAccessControlProps) {
  const { subscriptionStatus } = useTenantContext();
  const isPro = process.env.NEXT_PUBLIC_PRODUCT_MODE === "pro";

  if (isPro) {
    if (subscriptionStatus === "SUSPENDED") {
      notFound();
    }
    return <>{children}</>;
  }

  if (subscriptionStatus === "FREE" || subscriptionStatus === "SUSPENDED") {
    notFound();
  }

  return <>{children}</>;
}
