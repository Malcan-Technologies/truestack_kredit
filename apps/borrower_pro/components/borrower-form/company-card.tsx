"use client";

import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Field } from "./field";
import { getCountryOptions, getStateOptions } from "../../lib/address-options";
import { BUMI_STATUS_OPTIONS } from "../../lib/borrower-form-options";
import type { CorporateFormData } from "../../lib/borrower-form-types";

interface CompanyCardProps {
  data: Pick<
    CorporateFormData,
    | "companyName"
    | "ssmRegistrationNo"
    | "bumiStatus"
    | "natureOfBusiness"
    | "dateOfIncorporation"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "state"
    | "postcode"
    | "country"
  >;
  onChange: (updates: Partial<CorporateFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

export function CompanyCard({
  data,
  onChange,
  errors,
  onErrorClear,
}: CompanyCardProps) {
  const countryOptions = getCountryOptions();
  const stateOptions = getStateOptions(data.country);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          Company Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Company Name"
            value={data.companyName}
            onChange={(val) => {
              onChange({ companyName: val });
              if (errors.companyName) onErrorClear("companyName");
            }}
            error={errors.companyName}
            placeholder="Company Sdn Bhd"
          />
          <Field
            label="SSM Registration No"
            value={data.ssmRegistrationNo}
            onChange={(val) => {
              onChange({ ssmRegistrationNo: val, icNumber: val });
              if (errors.ssmRegistrationNo) onErrorClear("ssmRegistrationNo");
            }}
            error={errors.ssmRegistrationNo}
            placeholder="202001012345 (1234567-X)"
          />
          <Field
            label="Taraf (Bumi Status)"
            value={data.bumiStatus}
            onChange={(val) => {
              onChange({ bumiStatus: val });
              if (errors.bumiStatus) onErrorClear("bumiStatus");
            }}
            type="select"
            options={BUMI_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            error={errors.bumiStatus}
          />
          <Field
            label="Nature of Business"
            value={data.natureOfBusiness}
            onChange={(val) => onChange({ natureOfBusiness: val })}
            placeholder="e.g., Retail, Manufacturing"
            required={false}
          />
          <Field
            label="Date of Incorporation"
            value={data.dateOfIncorporation}
            onChange={(val) => onChange({ dateOfIncorporation: val })}
            type="date"
            required={false}
          />
          <Field
            label="Address Line 1"
            value={data.addressLine1}
            onChange={(val) => {
              onChange({ addressLine1: val });
              if (errors.addressLine1) onErrorClear("addressLine1");
            }}
            error={errors.addressLine1}
            placeholder="Business address"
            className="md:col-span-2"
          />
          <Field
            label="Address Line 2 (optional)"
            value={data.addressLine2}
            onChange={(val) => onChange({ addressLine2: val })}
            placeholder="Suite, floor, building"
            required={false}
            className="md:col-span-2"
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
