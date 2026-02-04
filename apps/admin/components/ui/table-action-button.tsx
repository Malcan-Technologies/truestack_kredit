import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface TableActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label?: string;
  variant?: "default" | "success" | "destructive" | "warning";
}

/**
 * TableActionButton - A reusable action button for tables
 * 
 * Visual hierarchy:
 * - Primary CTA (Add User, etc.) = Orange gradient background (default Button)
 * - Table action buttons = Bordered, subtle, lower visual weight
 * 
 * Usage:
 * <TableActionButton icon={Eye} onClick={...} />
 * <TableActionButton icon={Edit2} label="Edit" onClick={...} />
 * <TableActionButton icon={Check} variant="success" onClick={...} />
 * <TableActionButton icon={X} variant="destructive" onClick={...} />
 */
const TableActionButton = React.forwardRef<HTMLButtonElement, TableActionButtonProps>(
  ({ className, icon: Icon, label, variant = "default", disabled, ...props }, ref) => {
    const variantStyles = {
      default: "text-muted hover:text-foreground hover:border-border",
      success: "text-success hover:text-success hover:border-success/50 hover:bg-success/10",
      destructive: "text-destructive hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10",
      warning: "text-warning hover:text-warning hover:border-warning/50 hover:bg-warning/10",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md",
          "border border-border/50 bg-transparent",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        <Icon className="h-4 w-4" />
        {label && <span>{label}</span>}
      </button>
    );
  }
);

TableActionButton.displayName = "TableActionButton";

export { TableActionButton };
