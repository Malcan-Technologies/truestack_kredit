"use client";

import * as React from "react";
import PhoneInputWithCountry from "react-phone-number-input";
import { getCountries } from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import { Input } from "./input";
import { cn } from "../../lib/utils";
import "react-phone-number-input/style.css";

const PRIORITY_COUNTRIES: Country[] = ["MY", "SG", "ID", "TH", "BN", "PH"];

function getCountriesWithMalaysiaFirst(): Country[] {
  const all = getCountries();
  const priority = PRIORITY_COUNTRIES.filter((c) => all.includes(c));
  const rest = all.filter((c) => !PRIORITY_COUNTRIES.includes(c));
  return [...priority, ...rest];
}

const PhoneInputField = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("border-0 shadow-none focus-visible:ring-0 px-0", className)} {...props} />
  )
);
PhoneInputField.displayName = "PhoneInputField";

export type PhoneInputValue = string | undefined;

export interface PhoneInputProps
  extends Omit<React.ComponentProps<typeof PhoneInputWithCountry>, "value" | "onChange"> {
  value?: PhoneInputValue;
  onChange?: (value: PhoneInputValue) => void;
  error?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const PhoneInput = React.forwardRef<HTMLDivElement, PhoneInputProps>(
  ({ value, onChange, error, disabled, placeholder = "16 2487680", className, ...props }, _ref) => {
    const countries = React.useMemo(getCountriesWithMalaysiaFirst, []);

    return (
      <div
        ref={_ref}
        className={cn(
          "flex h-11 w-full items-center rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden",
          error && "border-error",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <PhoneInputWithCountry
          international
          defaultCountry="MY"
          countries={countries}
          value={value ?? undefined}
          onChange={(v) => onChange?.(v ?? undefined)}
          disabled={disabled}
          placeholder={placeholder}
          inputComponent={PhoneInputField}
          className="flex flex-1 min-w-0"
          numberInputProps={{ className: "flex-1 min-w-0" }}
          countrySelectProps={{ className: "!mr-2" }}
          {...props}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
