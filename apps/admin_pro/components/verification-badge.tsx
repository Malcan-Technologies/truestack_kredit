"use client";

import { Fingerprint, AlertTriangle, ChartPie } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type VerificationStatus = "FULLY_VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";

export interface VerificationBadgeProps {
  /** Resolved verification status from API (single source of truth) */
  verificationStatus: VerificationStatus | null | undefined;
  /** Fallback when verificationStatus is null (e.g. legacy data) */
  documentVerified?: boolean;
  /** Label style: "full" = "e-KYC Verified", "compact" = "e-KYC", "minimal" = "Verified" */
  size?: "full" | "compact" | "minimal";
  /** Wrap in tooltip (for table cells) */
  showTooltip?: boolean;
  className?: string;
}

const LABELS = {
  full: {
    verified: "e-KYC Verified",
    partial: "Partially verified",
    manual: "Unverified",
  },
  compact: {
    verified: "e-KYC",
    partial: "Partially verified",
    manual: "Unverified",
  },
  minimal: {
    verified: "Verified",
    partial: "Partial",
    manual: "Unverified",
  },
} as const;

/**
 * Unified verification badge. Uses verificationStatus as single source of truth.
 * Backend resolves this via resolveVerificationStatus() (cached + documentVerified fallback).
 */
export function VerificationBadge({
  verificationStatus,
  documentVerified = false,
  size = "compact",
  showTooltip = false,
  className,
}: VerificationBadgeProps) {
  const isFullyVerified =
    verificationStatus === "FULLY_VERIFIED" ||
    (!verificationStatus && documentVerified);
  const isPartiallyVerified = verificationStatus === "PARTIALLY_VERIFIED";

  const labels = LABELS[size];

  const sizeClass = size !== "full" ? "text-xs" : "";

  const verifiedBadge = (
    <Badge variant="verified" className={cn(sizeClass, className)}>
      <Fingerprint className="h-3 w-3 mr-1" />
      {labels.verified}
    </Badge>
  );

  const partialBadge = (
    <Badge
      variant="outline"
      className={cn(
        sizeClass,
        "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-700",
        className
      )}
      title={size === "full" ? "Some directors are verified, but not all yet" : undefined}
    >
      <ChartPie className="h-3 w-3 mr-1" />
      {labels.partial}
    </Badge>
  );

  const manualBadge = (
    <Badge variant="unverified" className={cn(sizeClass, className)}>
      <AlertTriangle className="h-3 w-3 mr-1" />
      {labels.manual}
    </Badge>
  );

  const content = isFullyVerified
    ? verifiedBadge
    : isPartiallyVerified
      ? partialBadge
      : manualBadge;

  if (showTooltip) {
    const tooltip =
      isFullyVerified
        ? "Borrower verified via TrueIdentity e-KYC"
        : isPartiallyVerified
          ? "Some corporate directors are verified, but not all yet"
          : "Borrower verified manually";

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
