"use client";

import { cn } from "../lib/utils";

/**
 * Decorative corner at the junction of sidebar and navbar.
 * L-shaped transition: vertical from bottom, then 90° to horizontal (rounded corner).
 * Matches admin layout design. Shared across borrower_pro apps.
 */
export function NavbarCorner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute left-0 top-0 z-10 h-5 w-5 -translate-x-1/2",
        "bg-background",
        "rounded-br-[10px]",
        "border-b border-r border-border",
        className
      )}
      aria-hidden
    />
  );
}
