"use client";

import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type SsmBadgeState = "verified" | "available";

export interface SsmVerifiedBadgeProps {
  /** "verified" = synced from SSM, "available" = pull-and-apply is possible. */
  state: SsmBadgeState;
  /** ISO timestamp the field was synced (verified state only). */
  syncedAt?: string | null;
  /** TrueStack usage_id from the originating pull (verified state only). */
  usageId?: string | null;
  /** Optional click handler — used by the "available" state to scroll/focus the TrueSSM panel. */
  onClickAffordance?: () => void;
  className?: string;
}

/**
 * Field-level provenance badge that mirrors the e-KYC verification badge in
 * shape and placement but uses a distinct color and icon (Building2 vs
 * Fingerprint) so the two systems do not get confused at a glance.
 *
 * - `verified` is solid emerald, matching the e-KYC "verified" badge variant.
 * - `available` is outlined/dashed and clickable. It is the same affordance
 *   used by unverified directors in TrueIdentityBox — a hint that the field
 *   could be verified by pulling from SSM.
 */
export function SsmVerifiedBadge({
  state,
  syncedAt,
  usageId,
  onClickAffordance,
  className,
}: SsmVerifiedBadgeProps) {
  const verifiedTooltip = (
    <>
      <p>Verified via TrueSSM&trade; company profile</p>
      {syncedAt && (
        <p className="opacity-70 text-xs mt-1">
          {formatDateTime(syncedAt)}
          {usageId ? ` · Usage ${usageId}` : ""}
        </p>
      )}
    </>
  );

  if (state === "verified") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] gap-1 px-1.5 py-0 h-5 font-medium",
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700",
                className,
              )}
            >
              <Building2 className="h-3 w-3" />
              SSM
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{verifiedTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const interactive = typeof onClickAffordance === "function";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={interactive ? onClickAffordance : undefined}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10px] font-medium",
              "border border-dashed border-muted-foreground/40 text-muted-foreground",
              "bg-transparent",
              interactive && "hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-400/60 cursor-pointer",
              !interactive && "cursor-default",
              className,
            )}
            aria-label="Field not verified via TrueSSM — click to open the TrueSSM panel"
          >
            <Building2 className="h-3 w-3" />
            SSM
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>Pull from TrueSSM&trade; to verify this field</p>
          <p className="opacity-70 text-xs mt-1">
            Click to open the TrueSSM&trade; panel on this page.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
