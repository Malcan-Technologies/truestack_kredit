"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { parsePhoneNumber, formatPhoneNumber } from "react-phone-number-input";
import { cn } from "@/lib/utils";

const FLAG_URL = "https://purecatamphetamine.github.io/country-flag-icons/3x2/{XX}.svg";

function getFlagUrl(countryCode: string): string {
  return FLAG_URL.replace("{XX}", countryCode);
}

interface PhoneDisplayProps {
  label: string;
  value: string | null | undefined;
  className?: string;
  valueClassName?: string;
  toastMessage?: string;
}

/**
 * Read-only phone display with country flag and copy-to-clipboard
 */
export function PhoneDisplay({
  label,
  value,
  className,
  valueClassName,
  toastMessage,
}: PhoneDisplayProps) {
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
  const parsed = value ? parsePhoneNumber(value) : null;
  const country = parsed?.country ?? "MY";
  const formatted = parsed ? formatPhoneNumber(value as string) : displayValue;
  const canCopy = !!value;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 group">
          {value ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 h-11 min-w-0",
                valueClassName
              )}
            >
              <img
                src={getFlagUrl(country)}
                alt={country}
                className="h-5 w-[calc(1.5*1.25rem)] shrink-0 object-cover rounded-sm"
              />
              <span className="font-medium truncate" title={displayValue}>
                {formatted}
              </span>
            </div>
          ) : (
            <span className="font-medium text-muted-foreground">-</span>
          )}
          {canCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
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
