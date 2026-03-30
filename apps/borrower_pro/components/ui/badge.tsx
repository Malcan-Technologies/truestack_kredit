import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/** Semantic colors aligned with `admin_pro/components/ui/badge.tsx` (loan status, etc.). */
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        destructive: "bg-red-500/15 text-red-700 dark:text-red-400",
        info: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
        outline: "border border-border text-foreground",
        "outline-success":
          "border border-emerald-400 dark:border-emerald-600 bg-background text-emerald-700 dark:text-emerald-400",
        "outline-destructive":
          "border border-red-400 dark:border-red-600 bg-background text-red-700 dark:text-red-400",
        "outline-warning":
          "border border-amber-400 dark:border-amber-600 bg-background text-amber-700 dark:text-amber-400",
        "outline-info":
          "border border-blue-400 dark:border-blue-600 bg-background text-blue-700 dark:text-blue-400",
        verified:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700",
        unverified:
          "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
