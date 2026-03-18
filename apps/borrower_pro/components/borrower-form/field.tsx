"use client";

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
}: FieldProps) {
  if (type === "select" && options) {
    return (
      <div className={className}>
        <Label className="text-xs text-muted-foreground">
          {label} {required && "*"}
        </Label>
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className={error ? "border-red-500" : ""}>
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
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  if (type === "number") {
    const numValue: number | "" =
      value === "" ? "" : numberMode === "float" ? parseFloat(value) || 0 : parseInt(value, 10) || 0;
    return (
      <div className={className}>
        <Label className="text-xs text-muted-foreground">
          {label} {required && "*"}
        </Label>
        <NumericInput
          mode={numberMode}
          value={numValue}
          onChange={(v) => onChange(v === "" ? "" : String(v))}
          placeholder={placeholder}
          disabled={disabled}
          className={error ? "border-red-500" : ""}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">
        {label} {required && "*"}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? "border-red-500" : ""}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
