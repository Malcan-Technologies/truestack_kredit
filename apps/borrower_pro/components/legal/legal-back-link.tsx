"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "@borrower_pro/lib/auth-client";
import { peekLegalBackSource } from "@borrower_pro/lib/legal-back-context";

type LegalBackLinkProps = {
  className?: string;
};

/**
 * Legal page back link. Never uses open redirects or query params for /dashboard:
 * without a valid session the target is always `/`. Dashboard remains protected by the app layout.
 */
export function LegalBackLink({ className }: LegalBackLinkProps) {
  const { data: session, isPending } = useSession();

  const { href, label } = useMemo(() => {
    if (!session?.user) {
      return { href: "/", label: "Back to home" as const };
    }
    const from = peekLegalBackSource();
    if (from === "landing") {
      return { href: "/", label: "Back to home" as const };
    }
    return { href: "/dashboard", label: "Back to dashboard" as const };
  }, [session?.user]);

  if (isPending) {
    return (
      <Link href="/" className={className}>
        ← Back
      </Link>
    );
  }

  return (
    <Link href={href} className={className}>
      ← {label}
    </Link>
  );
}
