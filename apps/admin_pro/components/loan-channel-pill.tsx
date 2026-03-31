import { Building2, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

/** Channel pill aligned with borrower portal `LoanChannelPill` (loans table). */
export function LoanChannelPill({ channel }: { channel: string | undefined | null }) {
  const isPhysical = channel === "PHYSICAL";
  const label = isPhysical ? "Physical" : "Online";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium tabular-nums",
        isPhysical
          ? "border-border/80 bg-muted/50 text-foreground"
          : "border-sky-500/25 bg-sky-500/[0.08] text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100"
      )}
    >
      {isPhysical ? (
        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      ) : (
        <Monitor className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      )}
      {label}
    </span>
  );
}
