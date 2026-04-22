"use client";

import { CheckCircle2 } from "lucide-react";
import { IDENTITY_EKYC_LOCKED_BANNER_TEXT } from "../../lib/identity-ekyc-copy";
import { cn } from "../../lib/utils";

export { IDENTITY_EKYC_LOCKED_BANNER_TEXT } from "../../lib/identity-ekyc-copy";

export function IdentityEkycLockedBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border/50 bg-muted/15 px-3 py-2 text-sm text-muted-foreground",
        className
      )}
      role="status"
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
      <span>{IDENTITY_EKYC_LOCKED_BANNER_TEXT}</span>
    </div>
  );
}
