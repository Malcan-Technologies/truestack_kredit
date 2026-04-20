"use client";

import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { PhoneInput } from "../ui/phone-input";
import { Field } from "./field";
import { getCountryOptions, getStateOptions } from "../../lib/address-options";
import {
  isIndividualAddressComplete,
  isIndividualContactComplete,
} from "../../lib/borrower-form-validation";
import type { IndividualFormData } from "../../lib/borrower-form-types";
import { SectionCompleteBadge } from "../ui/status-row";

interface ContactCardProps {
  data: Pick<
    IndividualFormData,
    | "phone"
    | "email"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "state"
    | "postcode"
    | "country"
  >;
  onChange: (updates: Partial<IndividualFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
  /** When true (default), include address fields. When false, show only phone and email. */
  includeAddress?: boolean;
}

export function ContactCard({
  data,
  onChange,
  errors,
  onErrorClear,
  includeAddress = true,
}: ContactCardProps) {
  const countryOptions = getCountryOptions();
  const stateOptions = getStateOptions(data.country);

  const asFull = data as IndividualFormData;
  const sectionComplete = includeAddress
    ? isIndividualContactComplete(asFull) && isIndividualAddressComplete(asFull)
    : isIndividualContactComplete(asFull);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-muted-foreground" />
          Contact Information
        </CardTitle>
        <SectionCompleteBadge complete={sectionComplete} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Phone *</Label>
            <PhoneInput
              value={data.phone || undefined}
              onChange={(val: string | undefined) => {
                onChange({ phone: val ?? "" });
                if (errors.phone) onErrorClear("phone");
              }}
              error={!!errors.phone}
              placeholder="16 4818800"
            />
            <p className="text-xs text-muted-foreground mt-1">e.g. 16 4818800</p>
            {errors.phone && (
              <p className="text-xs text-error mt-1">{errors.phone}</p>
            )}
          </div>
          <div>
            <Field
              label="Email"
              value={data.email}
              onChange={(val) => {
                onChange({ email: val });
                if (errors.email) onErrorClear("email");
              }}
              type="email"
              error={errors.email}
              placeholder="email@example.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              If you have a signing certificate, changing your email will require
              OTP verification to the new address.
            </p>
          </div>
          {includeAddress && (
            <>
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
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
