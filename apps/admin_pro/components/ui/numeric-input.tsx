"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Value type passed to NumericInput onChange (number, empty string, or intermediate string e.g. "5.") */
export type NumericInputValue = number | "" | string;

export interface NumericInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: NumericInputValue;
  onChange: (value: NumericInputValue) => void;
  /** "int" for whole numbers, "float" for decimals */
  mode?: "int" | "float";
  /** Max decimal places (float mode only). Enables typing intermediates like "5." */
  maxDecimals?: number;
  /** Fallback when parsing yields NaN (e.g. user typed "abc"). Default: 0 for int, 0 for float */
  fallback?: number;
}

/**
 * Numeric input that allows clearing to empty, making it easy to type values like "24"
 * without the field snapping back to 0 or 1 on backspace.
 */
/** Matches valid partial float input: digits, optional ".", optional fractional digits */
const FLOAT_PARTIAL = /^-?\d*\.?\d*$/;

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, mode = "int", maxDecimals, fallback = 0, className, ...props }, ref) => {
    const displayValue = value === "" ? "" : String(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const fireChange = (val: NumericInputValue) => (onChange as (v: NumericInputValue) => void)(val);
      if (raw === "") {
        fireChange("");
        return;
      }
      if (mode === "float" && FLOAT_PARTIAL.test(raw)) {
        const decimalPart = raw.includes(".") ? raw.split(".")[1] ?? "" : "";
        if (maxDecimals != null && decimalPart.length > maxDecimals) return;
        // Preserve "5." so user can type "5.5" without decimal snapping away
        if (raw.endsWith(".")) {
          fireChange(raw);
          return;
        }
        const parsed = parseFloat(raw);
        // Preserve raw when parseFloat would strip trailing zeros (e.g. "10000.0" -> 10000),
        // so user can type "10000.01" without losing the decimal context
        if (raw.includes(".") && !Number.isNaN(parsed) && String(parsed) !== raw) {
          fireChange(raw);
          return;
        }
        fireChange(Number.isNaN(parsed) ? fallback : parsed);
        return;
      }
      const parsed = mode === "int" ? parseInt(raw, 10) : parseFloat(raw);
      fireChange(Number.isNaN(parsed) ? fallback : parsed);
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
