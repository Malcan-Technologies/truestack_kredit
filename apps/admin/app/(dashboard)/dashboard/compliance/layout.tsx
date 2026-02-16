"use client";

import { notFound } from "next/navigation";
import { useTenantContext } from "@/components/tenant-context";

export default function RestrictedLayout({ children }: { children: React.ReactNode }) {
  const { subscriptionStatus } = useTenantContext();

  if (subscriptionStatus === "FREE") {
    notFound();
  }

  return <>{children}</>;
}
