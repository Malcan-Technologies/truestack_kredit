"use client";

import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Field } from "./field";
import { DOCUMENT_TYPE_OPTIONS } from "../../lib/borrower-form-options";
import { extractDateFromIC, extractGenderFromIC } from "../../lib/borrower-form-helpers";
import { isIndividualIdentityFieldsComplete } from "../../lib/borrower-form-validation";
import type { IndividualFormData } from "../../lib/borrower-form-types";
import { SectionCompleteBadge } from "../ui/status-row";
import { IdentityEkycLockedBanner } from "./identity-ekyc-locked-banner";

interface IdentityCardProps {
  data: Pick<IndividualFormData, "name" | "icNumber" | "documentType">;
  onChange: (updates: Partial<IndividualFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
  /** When true, name / document type / IC cannot be edited (verified identity). */
  identityLocked?: boolean;
}

export function IdentityCard({
  data,
  onChange,
  errors,
  onErrorClear,
  identityLocked = false,
}: IdentityCardProps) {
  const isIC = data.documentType === "IC";

  const handleIcNumberChange = (value: string) => {
    const cleanValue = isIC ? value.replace(/\D/g, "").substring(0, 12) : value;
    const updates: Partial<IndividualFormData> = { icNumber: cleanValue };
    if (isIC) {
      const extractedDate = extractDateFromIC(cleanValue);
      if (extractedDate) {
        updates.dateOfBirth = extractedDate;
        if (errors.dateOfBirth) onErrorClear("dateOfBirth");
      }
      const extractedGender = extractGenderFromIC(cleanValue);
      if (extractedGender) {
        updates.gender = extractedGender;
        if (errors.gender) onErrorClear("gender");
      }
    }
    onChange(updates);
    if (errors.icNumber) onErrorClear("icNumber");
  };

  const handleDocumentTypeChange = (value: string) => {
    if (value === "PASSPORT") {
      onChange({ documentType: value, dateOfBirth: "", gender: "" });
    } else {
      const extractedDate = extractDateFromIC(data.icNumber);
      const extractedGender = extractGenderFromIC(data.icNumber);
      onChange({
        documentType: value,
        dateOfBirth: extractedDate || "",
        gender: extractedGender || "",
      });
      if (extractedDate && errors.dateOfBirth) onErrorClear("dateOfBirth");
      if (extractedGender && errors.gender) onErrorClear("gender");
    }
  };

  const identityComplete = identityLocked || isIndividualIdentityFieldsComplete(data);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Identity Information
        </CardTitle>
        {!identityLocked ? <SectionCompleteBadge complete={identityComplete} /> : null}
      </CardHeader>
      <CardContent>
        {identityLocked && <IdentityEkycLockedBanner className="mb-4" />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Full name"
            value={data.name}
            onChange={(val) => {
              onChange({ name: val });
              if (errors.name) onErrorClear("name");
            }}
            error={errors.name}
            placeholder="Full name"
            disabled={identityLocked}
          />
          <Field
            label="Document type"
            type="select"
            value={data.documentType}
            onChange={handleDocumentTypeChange}
            options={DOCUMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            disabled={identityLocked}
          />
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {isIC ? "IC / Passport number" : "Passport number"} *
            </Label>
            <Input
              value={data.icNumber}
              onChange={(e) => handleIcNumberChange(e.target.value)}
              placeholder={isIC ? "880101011234" : "A12345678"}
              className={errors.icNumber ? "border-error" : ""}
              disabled={identityLocked}
            />
            {errors.icNumber && (
              <p className="text-xs text-error mt-1">{errors.icNumber}</p>
            )}
            {isIC && (
              <p className="text-xs text-muted-foreground mt-1">
                Enter a complete 12-digit IC number. DOB and gender are auto-extracted.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
