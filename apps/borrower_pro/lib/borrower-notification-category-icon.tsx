"use client";

import type { BorrowerNotificationCategoryKind } from "@kredit/borrower";
import {
  borrowerNotificationCategoryLabel,
  resolveBorrowerNotificationCategoryKind,
} from "@kredit/borrower";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Landmark,
  Megaphone,
  Wallet,
} from "lucide-react";

const ICONS: Record<BorrowerNotificationCategoryKind, LucideIcon> = {
  payments: Wallet,
  collections: AlertTriangle,
  loan_lifecycle: Landmark,
  applications: ClipboardList,
  announcements: Megaphone,
  other: Bell,
};

export interface BorrowerNotificationCategoryIconProps {
  category: string;
  className?: string;
  /** When set, used for the wrapper’s accessible name (icon is decorative). */
  label?: string;
}

export function BorrowerNotificationCategoryIcon({
  category,
  className,
  label,
}: BorrowerNotificationCategoryIconProps) {
  const kind = resolveBorrowerNotificationCategoryKind(category);
  const Icon = ICONS[kind];
  const ariaLabel = label ?? borrowerNotificationCategoryLabel(category);

  return (
    <span className="inline-flex shrink-0 items-center justify-center" aria-label={ariaLabel}>
      <Icon className={className} aria-hidden />
    </span>
  );
}
