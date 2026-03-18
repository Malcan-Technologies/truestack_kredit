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
import type { IndividualFormData } from "../../lib/borrower-form-types";

interface IdentityCardProps {
  data: Pick<IndividualFormData, "name" | "icNumber" | "documentType">;
  onChange: (updates: Partial<IndividualFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

export function IdentityCard({ data, onChange, errors, onErrorClear }: IdentityCardProps) {
  const isIC = data.documentType === "IC";

  const handleIcNumberChange = (value: string) => {
    const cleanValue = isIC ? value.replace(/\D/g, "").substring(0, 12) : value;
    const updates: Partial<IndividualFormData> = { icNumber: cleanValue };
    if (isIC) {
      const extractedDate = extractDateFromIC(cleanValue);
      if (extractedDate) updates.dateOfBirth = extractedDate;
      const extractedGender = extractGenderFromIC(cleanValue);
      if (extractedGender) updates.gender = extractedGender;
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
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Identity Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Name"
            value={data.name}
            onChange={(val) => {
              onChange({ name: val });
              if (errors.name) onErrorClear("name");
            }}
            error={errors.name}
            placeholder="Full name"
          />
          <div>
            <Label className="text-xs text-muted-foreground">Document Type *</Label>
            <Select value={data.documentType} onValueChange={handleDocumentTypeChange}>
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
            <Label className="text-xs text-muted-foreground">
              {isIC ? "IC Number" : "Passport Number"} *
            </Label>
            <Input
              value={data.icNumber}
              onChange={(e) => handleIcNumberChange(e.target.value)}
              placeholder={isIC ? "880101011234" : "A12345678"}
              className={errors.icNumber ? "border-red-500" : ""}
            />
            {errors.icNumber && (
              <p className="text-xs text-red-500 mt-1">{errors.icNumber}</p>
            )}
            {isIC && (
              <p className="text-xs text-muted-foreground mt-1">
                Enter a complete 12-digit IC number to preview TrueSight data. DOB and gender auto-extracted.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
