"use client";

import { Check, CheckCircle2, Circle, Info } from "lucide-react";
import { cn } from "../../lib/utils";

/** Inline green “Verified” pill for field labels (e-KYC / TrueIdentity). */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success",
        className
      )}
    >
      <Check className="h-3 w-3 shrink-0" aria-hidden />
      Verified
    </span>
  );
}

/** Section header: green “Complete” or muted “Incomplete”. */
export function SectionCompleteBadge({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
      <Circle className="h-4 w-4 shrink-0" aria-hidden />
      Incomplete
    </span>
  );
}

/** Optional section: “Complete” when filled, else “Optional”. */
export function SectionOptionalBadge({
  complete,
  optionalLabel = "Optional",
}: {
  complete: boolean;
  optionalLabel?: string;
}) {
  if (complete) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
      <Info className="h-4 w-4 shrink-0" aria-hidden />
      {optionalLabel}
    </span>
  );
}
