"use client";

import type { ReactNode } from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { NumericInput } from "../ui/numeric-input";
import { cn } from "../../lib/utils";

interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: "text" | "email" | "date" | "select" | "number";
  numberMode?: "int" | "float";
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  className?: string;
  /** Shown after the label (e.g. Verified badge). */
  labelSuffix?: ReactNode;
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  numberMode = "int",
  error,
  disabled,
  placeholder,
  options,
  required = true,
  className,
  labelSuffix,
}: FieldProps) {
  const labelRow = (
    <Label className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {label} {required && "*"}
      </span>
      {labelSuffix}
    </Label>
  );

  if (type === "select" && options) {
    return (
      <div className={className}>
        {labelRow}
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className={error ? "border-error" : ""}>
            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-error mt-1">{error}</p>}
      </div>
    );
  }

  if (type === "number") {
    const numValue: number | "" =
      value === "" ? "" : numberMode === "float" ? parseFloat(value) || 0 : parseInt(value, 10) || 0;
    return (
      <div className={className}>
        {labelRow}
        <NumericInput
          mode={numberMode}
          value={numValue}
          onChange={(v) => onChange(v === "" ? "" : String(v))}
          placeholder={placeholder}
          disabled={disabled}
          className={error ? "border-error" : ""}
        />
        {error && <p className="text-xs text-error mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      {labelRow}
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? "border-error" : ""}
      />
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}
