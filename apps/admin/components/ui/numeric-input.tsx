"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface NumericInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: number | "";
  onChange: (value: number | "") => void;
  /** "int" for whole numbers, "float" for decimals */
  mode?: "int" | "float";
  /** Fallback when parsing yields NaN (e.g. user typed "abc"). Default: 0 for int, 0 for float */
  fallback?: number;
}

/**
 * Numeric input that allows clearing to empty, making it easy to type values like "24"
 * without the field snapping back to 0 or 1 on backspace.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, mode = "int", fallback = 0, className, ...props }, ref) => {
    const displayValue = value === "" ? "" : String(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        onChange("");
        return;
      }
      const parsed = mode === "int" ? parseInt(raw, 10) : parseFloat(raw);
      onChange(Number.isNaN(parsed) ? fallback : parsed);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };
