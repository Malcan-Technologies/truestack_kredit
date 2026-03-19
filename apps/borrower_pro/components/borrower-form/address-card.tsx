"use client";

import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Field } from "./field";
import { getCountryOptions, getStateOptions } from "../../lib/address-options";
import type { IndividualFormData } from "../../lib/borrower-form-types";

interface AddressCardProps {
  data: Pick<
    IndividualFormData,
    "addressLine1" | "addressLine2" | "city" | "state" | "postcode" | "country"
  >;
  onChange: (updates: Partial<IndividualFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

export function AddressCard({ data, onChange, errors, onErrorClear }: AddressCardProps) {
  const countryOptions = getCountryOptions();
  const stateOptions = getStateOptions(data.country);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          Address
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <Field
            label="Address Line 1"
            value={data.addressLine1}
            onChange={(val) => {
              onChange({ addressLine1: val });
              if (errors.addressLine1) onErrorClear("addressLine1");
            }}
            error={errors.addressLine1}
            placeholder="Street, building, unit"
          />
          <Field
            label="Address Line 2 (optional)"
            value={data.addressLine2}
            onChange={(val) => onChange({ addressLine2: val })}
            placeholder="Apartment, suite, floor"
            required={false}
          />
          <Field
            label="City"
            value={data.city}
            onChange={(val) => {
              onChange({ city: val });
              if (errors.city) onErrorClear("city");
            }}
            error={errors.city}
            placeholder="City"
          />
          <Field
            label="Postcode"
            value={data.postcode}
            onChange={(val) => {
              const digitsOnly = val.replace(/\D/g, "");
              onChange({ postcode: digitsOnly });
              if (errors.postcode) onErrorClear("postcode");
            }}
            error={errors.postcode}
            placeholder="Postal code (numbers only)"
          />
          <Field
            label="Country"
            value={data.country}
            onChange={(val) => {
              const nextStateOptions = getStateOptions(val);
              onChange({
                country: val,
                state: nextStateOptions.some((o) => o.value === data.state)
                  ? data.state
                  : "",
              });
              onErrorClear("country");
              onErrorClear("state");
            }}
            type="select"
            options={countryOptions}
            error={errors.country}
          />
          <Field
            label="State"
            value={data.state}
            onChange={(val) => {
              onChange({ state: val });
              if (errors.state) onErrorClear("state");
            }}
            type="select"
            options={stateOptions}
            error={errors.state}
            disabled={!data.country || stateOptions.length === 0}
          />
        </div>
      </CardContent>
    </Card>
  );
}
