"use client";

import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Field } from "./field";
import { DOCUMENT_TYPE_OPTIONS } from "../../lib/borrower-form-options";
import { extractDateFromIC, extractGenderFromIC } from "../../lib/borrower-form-helpers";
import { isIndividualIdentityFieldsComplete } from "../../lib/borrower-form-validation";
import type { IndividualFormData } from "../../lib/borrower-form-types";
import { SectionCompleteBadge, VerifiedBadge } from "../ui/status-row";

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
  const v = identityLocked ? <VerifiedBadge /> : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Identity Information
        </CardTitle>
        <SectionCompleteBadge complete={identityComplete} />
      </CardHeader>
      <CardContent>
        {identityLocked && (
          <p className="text-xs text-muted-foreground mb-4 rounded-md border border-border bg-muted/40 px-3 py-2">
            Your identity has been verified by e-KYC. Your name, IC, date of birth and gender are locked. Contact
            support or redo KYC from your Profile if any of these need updating.
          </p>
        )}
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
            labelSuffix={v}
          />
          <div>
            <Label className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>Document type *</span>
              {identityLocked ? <VerifiedBadge /> : null}
            </Label>
            <Select
              value={data.documentType}
              onValueChange={handleDocumentTypeChange}
              disabled={identityLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>{isIC ? "IC / Passport number" : "Passport number"} *</span>
              {identityLocked ? <VerifiedBadge /> : null}
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
