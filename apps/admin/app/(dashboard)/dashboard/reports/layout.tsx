"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function RestrictedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/proxy/auth/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.tenant?.subscriptionStatus === "FREE") {
          toast.error("Upgrade to access this feature");
          router.push("/dashboard/billing");
        }
      })
      .catch(() => {
        // Silently fail - let the page render
      });
  }, [router]);

  return <>{children}</>;
}
