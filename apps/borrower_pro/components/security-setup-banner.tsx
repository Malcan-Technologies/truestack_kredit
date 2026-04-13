"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type SecuritySetupBannerProps = {
  /** When true, show the yellow reminder to set up passkey or 2FA */
  visible: boolean;
  className?: string;
};

/**
 * Optional reminder: passkey / 2FA are recommended but no longer required for navigation.
 */
export function SecuritySetupBanner({ visible, className }: SecuritySetupBannerProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "border-b border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100 dark:bg-amber-950/40 dark:border-amber-500/30",
        className,
      )}
      role="status"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 md:px-6 lg:px-7">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/25 dark:bg-amber-500/20">
            <ShieldAlert className="h-4 w-4 text-amber-800 dark:text-amber-200" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold">Strengthen your account</p>
            <p className="text-sm text-amber-900/90 dark:text-amber-100/90">
              Add a passkey or two-factor authentication (2FA) to protect your account. You can set this up anytime.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button asChild size="sm" variant="secondary" className="bg-background/80 hover:bg-background">
            <Link href="/security-setup">Set up security</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-amber-950 hover:bg-amber-500/20 dark:text-amber-50 dark:hover:bg-amber-500/15">
            <Link href="/account">Account settings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
