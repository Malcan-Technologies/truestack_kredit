"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import {
  setLegalBackSource,
  type LegalBackSource,
} from "@borrower_pro/lib/legal-back-context";

export type LegalNavLinkProps = Omit<ComponentProps<typeof Link>, "onClick"> & {
  backSource: LegalBackSource;
  onClick?: ComponentProps<typeof Link>["onClick"];
};

/** Sets sessionStorage so legal pages can choose landing vs app “back” (still gated by session for /dashboard). */
export function LegalNavLink({ backSource, onClick, ...props }: LegalNavLinkProps) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        setLegalBackSource(backSource);
        onClick?.(e);
      }}
    />
  );
}
