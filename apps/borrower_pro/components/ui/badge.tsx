import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning-foreground",
        destructive: "bg-error/15 text-error",
        info: "bg-info/15 text-info-foreground",
        outline: "border border-border text-foreground",
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
