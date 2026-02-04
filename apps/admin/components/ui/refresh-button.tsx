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
}

/**
 * Reusable refresh button with loading state and optional toast notification
 */
export function RefreshButton({
  onRefresh,
  successMessage = "Data refreshed",
  errorMessage = "Failed to refresh",
  showToast = true,
  className,
  variant = "secondary",
  size = "icon",
  ...props
}: RefreshButtonProps) {
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
      variant={variant}
      size={size}
      onClick={handleRefresh}
      disabled={isRefreshing}
      className={cn(className)}
      title="Refresh"
      {...props}
    >
      <RefreshCw
        className={cn(
          "h-4 w-4",
          isRefreshing && "animate-spin"
        )}
      />
    </Button>
  );
}
