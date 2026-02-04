"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CopyFieldProps {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
  className?: string;
  showCopyButton?: boolean;
  toastMessage?: string;
}

/**
 * Reusable field component with copy-to-clipboard functionality
 */
export function CopyField({
  label,
  value,
  icon,
  className,
  showCopyButton = true,
  toastMessage,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(toastMessage || `${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const displayValue = value || "-";
  const canCopy = showCopyButton && value;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      {icon && (
        <div className="text-muted-foreground mt-0.5">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 group">
          <p className="font-medium truncate" title={displayValue}>
            {displayValue}
          </p>
          {canCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={`Copy ${label.toLowerCase()}`}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
