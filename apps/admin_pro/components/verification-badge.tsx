"use client";

/**
 * Unified verification badge for borrowers.
 *
 * A single badge summarises **all** identity-verification signals we have on
 * a borrower, so the table cell, name header and any detail card can speak
 * the same language. Three signals feed the state machine:
 *
 *   1. `verificationStatus` (cached on the borrower row, computed server-side
 *      from director e-KYC progress or the individual TrueIdentity result).
 *   2. `documentVerified` (legacy fallback when the cache is empty).
 *   3. `ssmEntityVerified` (corporate only — true when the company's identity
 *      fields have been stamped by a TrueSSM™ pull, i.e. provenance entries
 *      exist for `companyName` AND `ssmRegistrationNo`).
 *
 * The resulting visual is one of five mutually-exclusive states, each with
 * a distinct icon so the table is scannable at a glance:
 *
 *   FULL          — SSM-verified entity + all directors e-KYC approved.
 *                   Highest signal. Icon: BadgeCheck.
 *   SSM_ONLY      — SSM-verified entity, no/partial director e-KYC.
 *                   Icon: Building2 (entity-level signal).
 *   EKYC_FULL     — All directors e-KYC approved (or individual e-KYC).
 *                   Icon: Fingerprint (legacy "verified" state).
 *   PARTIAL       — Some directors e-KYC approved (corporate only).
 *                   Icon: ChartPie.
 *   UNVERIFIED    — Nothing verified yet. Icon: AlertTriangle.
 *
 * Individuals can only resolve to EKYC_FULL or UNVERIFIED (no SSM concept).
 */

import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  ChartPie,
  Fingerprint,
} from "lucide-react";
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
  /** Resolved verification status from API (single source of truth). */
  verificationStatus: VerificationStatus | null | undefined;
  /** Fallback when `verificationStatus` is null (legacy data). */
  documentVerified?: boolean;
  /**
   * Borrower type. Required to decide between corporate states (SSM, partial)
   * and the simpler individual mapping. Defaults to INDIVIDUAL for
   * backwards-compat with existing callers.
   */
  borrowerType?: "INDIVIDUAL" | "CORPORATE";
  /**
   * Corporate only — true when the company identity has been confirmed via
   * a TrueSSM™ pull (both `companyName` and `ssmRegistrationNo` carry
   * provenance entries on the borrower). Ignored for individuals.
   */
  ssmEntityVerified?: boolean;
  /** Label style: "full" = long form, "compact" = table cell, "minimal" = inline. */
  size?: "full" | "compact" | "minimal";
  /** Wrap in tooltip (recommended for compact/minimal). */
  showTooltip?: boolean;
  className?: string;
}

type ResolvedState = "FULL" | "SSM_ONLY" | "EKYC_FULL" | "PARTIAL" | "UNVERIFIED";

interface StateMeta {
  labels: { full: string; compact: string; minimal: string };
  icon: typeof BadgeCheck;
  /** Reuse Badge `variant` when possible, else custom class. */
  variant?: "verified" | "unverified" | "outline";
  className?: string;
  tooltip: string;
}

const STATE_META: Record<ResolvedState, StateMeta> = {
  FULL: {
    labels: {
      full: "Fully Verified",
      compact: "Verified",
      minimal: "Verified",
    },
    icon: BadgeCheck,
    variant: "verified",
    tooltip:
      "SSM-verified entity with all directors e-KYC verified via TrueIdentity\u2122.",
  },
  SSM_ONLY: {
    labels: {
      full: "SSM Verified",
      compact: "SSM",
      minimal: "SSM",
    },
    icon: Building2,
    variant: "outline",
    // Distinct emerald outline so corporate-only verification reads as a
    // first-class state, not "almost verified".
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    tooltip: "Company identity verified via TrueSSM\u2122 Registry.",
  },
  EKYC_FULL: {
    labels: {
      full: "e-KYC Verified",
      compact: "e-KYC",
      minimal: "Verified",
    },
    icon: Fingerprint,
    variant: "verified",
    tooltip: "Verified via TrueIdentity\u2122 e-KYC.",
  },
  PARTIAL: {
    labels: {
      full: "Partially verified",
      compact: "Partial",
      minimal: "Partial",
    },
    icon: ChartPie,
    variant: "outline",
    className:
      "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-700",
    tooltip: "Some corporate directors are verified, but not all yet.",
  },
  UNVERIFIED: {
    labels: {
      full: "Unverified",
      compact: "Unverified",
      minimal: "Unverified",
    },
    icon: AlertTriangle,
    variant: "unverified",
    tooltip: "Borrower not yet verified.",
  },
};

/**
 * Map raw verification signals into a single mutually-exclusive state.
 * Exported so callers (e.g. sort comparators) can rank states without
 * duplicating the logic.
 */
export function resolveBadgeState({
  verificationStatus,
  documentVerified = false,
  borrowerType = "INDIVIDUAL",
  ssmEntityVerified = false,
}: Pick<
  VerificationBadgeProps,
  "verificationStatus" | "documentVerified" | "borrowerType" | "ssmEntityVerified"
>): ResolvedState {
  const fully =
    verificationStatus === "FULLY_VERIFIED" || (!verificationStatus && documentVerified);
  const partial = verificationStatus === "PARTIALLY_VERIFIED";

  if (borrowerType === "CORPORATE") {
    if (ssmEntityVerified && fully) return "FULL";
    if (ssmEntityVerified && partial) return "PARTIAL";
    if (ssmEntityVerified) return "SSM_ONLY";
    if (fully) return "EKYC_FULL";
    if (partial) return "PARTIAL";
    return "UNVERIFIED";
  }

  // Individuals: partial doesn't apply (no directors).
  return fully ? "EKYC_FULL" : "UNVERIFIED";
}

/**
 * Tooltip is contextual: a "Partially verified" badge on an SSM-verified
 * corporate is more informative when we mention both signals.
 */
function buildTooltip(state: ResolvedState, ssmEntityVerified: boolean): string {
  if (state === "PARTIAL" && ssmEntityVerified) {
    return "SSM-verified entity. Some directors are e-KYC verified, but not all yet.";
  }
  return STATE_META[state].tooltip;
}

export function VerificationBadge({
  verificationStatus,
  documentVerified = false,
  borrowerType = "INDIVIDUAL",
  ssmEntityVerified = false,
  size = "compact",
  showTooltip = false,
  className,
}: VerificationBadgeProps) {
  const state = resolveBadgeState({
    verificationStatus,
    documentVerified,
    borrowerType,
    ssmEntityVerified,
  });
  const meta = STATE_META[state];
  const Icon = meta.icon;
  const label = meta.labels[size];
  const sizeClass = size !== "full" ? "text-xs" : "";

  const badge = (
    <Badge
      variant={meta.variant ?? "outline"}
      className={cn(sizeClass, meta.className, className)}
    >
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{buildTooltip(state, ssmEntityVerified)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
