"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RefreshButtonProps extends Omit<ButtonProps, "onClick"> {
  onRefresh: () => Promise<void> | void;
  successMessage?: string;
  errorMessage?: string;
  showToast?: boolean;
  /** Show "Refresh" label next to icon (matches loan detail style) */
  showLabel?: boolean;
}

/**
 * Reusable refresh button with loading state and optional toast notification
 */
export function RefreshButton({
  onRefresh,
  successMessage = "Data refreshed",
  errorMessage = "Failed to refresh",
  showToast = true,
  showLabel = false,
  className,
  variant = "secondary",
  size = "icon",
  ...props
}: RefreshButtonProps) {
  const effectiveVariant = showLabel ? "outline" : variant;
  const effectiveSize = showLabel ? "default" : size;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      if (showToast) {
        toast.success(successMessage);
      }
    } catch (error) {
      console.error("Refresh failed:", error);
      if (showToast) {
        toast.error(errorMessage);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button
      type="button"
      variant={effectiveVariant}
      size={effectiveSize}
      onClick={handleRefresh}
      disabled={isRefreshing}
      className={cn(className)}
      title="Refresh"
      {...props}
    >
      <RefreshCw
        className={cn(
          "h-4 w-4",
          showLabel && "mr-2",
          isRefreshing && "animate-spin"
        )}
      />
      {showLabel && "Refresh"}
    </Button>
  );
}
