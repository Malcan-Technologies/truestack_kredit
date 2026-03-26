"use client";

import * as React from "react";
import { Input } from "./input";
import { cn } from "../../lib/utils";

export type NumericInputValue = number | "" | string;

export interface NumericInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: NumericInputValue;
  onChange: (value: NumericInputValue) => void;
  mode?: "int" | "float";
  maxDecimals?: number;
  fallback?: number;
}

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
        if (raw.endsWith(".")) {
          fireChange(raw);
          return;
        }
        const parsed = parseFloat(raw);
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
