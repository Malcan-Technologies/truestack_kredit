"use client";

import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TrueSendBadgeProps {
  /** Show as a compact inline pill (default) or a larger banner-style */
  variant?: "pill" | "banner";
  /** Additional class names */
  className?: string;
  /** Show tooltip on hover */
  showTooltip?: boolean;
}

/**
 * TrueSend brand badge — displays the TrueSend icon and label.
 * Used inline wherever automated emails are triggered to indicate the feature is active.
 */
export function TrueSendBadge({
  variant = "pill",
  className,
  showTooltip = true,
}: TrueSendBadgeProps) {
  const badge =
    variant === "pill" ? (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-500",
          className
        )}
      >
        <Send className="h-3 w-3" />
        TrueSend
      </span>
    ) : (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 text-sm font-medium text-purple-500",
          className
        )}
      >
        <Send className="h-4 w-4" />
        <span>Email will be sent via TrueSend</span>
      </div>
    );

  if (!showTooltip || variant === "banner") {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p>This email is sent automatically via TrueSend</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * TrueSend status indicator for email delivery status.
 * Color-coded based on delivery status.
 */
export function TrueSendStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const statusConfig: Record<
    string,
    { label: string; color: string; bg: string }
  > = {
    pending: { label: "Pending", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
    sent: { label: "Sent", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
    delivered: { label: "Delivered", color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
    bounced: { label: "Bounced", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
    failed: { label: "Failed", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
    delayed: { label: "Delayed", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
    complained: { label: "Spam", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  };

  const config = statusConfig[status] || {
    label: status,
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-muted",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.bg,
        config.color,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.color.replace("text-", "bg-"))} />
      {config.label}
    </span>
  );
}
