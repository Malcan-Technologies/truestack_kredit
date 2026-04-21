"use client";

import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { PhoneInput } from "../ui/phone-input";
import { Field } from "./field";
import { isCorporateCompanyContactComplete } from "../../lib/borrower-form-validation";
import type { CorporateFormData } from "../../lib/borrower-form-types";
import { SectionCompleteBadge } from "../ui/status-row";

interface CompanyContactCardProps {
  data: Pick<
    CorporateFormData,
    "companyPhone" | "companyEmail" | "phone" | "email"
  >;
  onChange: (updates: Partial<CorporateFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

export function CompanyContactCard({
  data,
  onChange,
  errors,
  onErrorClear,
}: CompanyContactCardProps) {
  const contactComplete = isCorporateCompanyContactComplete(data as CorporateFormData);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-muted-foreground" />
          Company Contact
        </CardTitle>
        <SectionCompleteBadge complete={contactComplete} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Company Phone *</Label>
            <PhoneInput
              value={data.companyPhone || undefined}
              onChange={(val: string | undefined) => {
                const v = val ?? "";
                onChange({ companyPhone: v, phone: v });
                if (errors.companyPhone) onErrorClear("companyPhone");
              }}
              error={!!errors.companyPhone}
              placeholder="16 4818800"
            />
            <p className="text-xs text-muted-foreground mt-1">e.g. 16 4818800</p>
            {errors.companyPhone && (
              <p className="text-xs text-error mt-1">{errors.companyPhone}</p>
            )}
          </div>
          <Field
            label="Company Email"
            value={data.companyEmail}
            onChange={(val) => {
              onChange({ companyEmail: val, email: val });
              if (errors.companyEmail) onErrorClear("companyEmail");
            }}
            type="email"
            error={errors.companyEmail}
            placeholder="info@company.com"
          />
        </div>
      </CardContent>
    </Card>
  );
}
