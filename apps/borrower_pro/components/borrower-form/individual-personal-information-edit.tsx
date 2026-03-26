"use client";

import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Field } from "./field";
import { NumericInput } from "../ui/numeric-input";
import {
  DOCUMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  RACE_OPTIONS,
  EDUCATION_OPTIONS,
  EMPLOYMENT_OPTIONS,
} from "../../lib/borrower-form-options";
import { extractDateFromIC, extractGenderFromIC } from "../../lib/borrower-form-helpers";
import { formatDate, formatICForDisplay, getOptionLabel } from "../../lib/borrower-form-display";
import type { IndividualFormData } from "../../lib/borrower-form-types";

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  const display = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground break-words">{display}</p>
    </div>
  );
}

interface IndividualPersonalInformationEditProps {
  data: IndividualFormData;
  onChange: (updates: Partial<IndividualFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
  noMonthlyIncome: boolean;
  onNoMonthlyIncomeChange: (checked: boolean) => void;
  identityLocked?: boolean;
}

/**
 * Single "Personal Information" block for profile edit — same title, icon, and field order as read-only view.
 */
export function IndividualPersonalInformationEdit({
  data,
  onChange,
  errors,
  onErrorClear,
  noMonthlyIncome,
  onNoMonthlyIncomeChange,
  identityLocked = false,
}: IndividualPersonalInformationEditProps) {
  const isIC = data.documentType === "IC";
  const dobFromIC = extractDateFromIC(data.icNumber);
  const genderFromIC = extractGenderFromIC(data.icNumber);
  const dobDisplay = data.dateOfBirth || (isIC && dobFromIC ? dobFromIC : "");
  const genderDisplay = data.gender || (isIC && genderFromIC ? genderFromIC : "");

  const numValue: number | "" =
    data.monthlyIncome === "" ? "" : parseFloat(data.monthlyIncome) || 0;

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

  const dobReadOnly = identityLocked;
  const genderReadOnly = identityLocked;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Personal Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        {identityLocked && (
          <p className="text-xs text-muted-foreground mb-4 rounded-md border border-border bg-muted/40 px-3 py-2">
            Identity details are locked because your profile is verified. To change them, start a new
            TrueStack KYC session and complete verification again.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Row 1 — matches view */}
          {identityLocked ? (
            <>
              <InfoCell label="Name" value={data.name} />
              <InfoCell
                label="Document Type"
                value={getOptionLabel("documentType", data.documentType)}
              />
            </>
          ) : (
            <>
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
            </>
          )}

          {/* Row 2 — IC / Passport | Date of Birth */}
          {identityLocked ? (
            <>
              <InfoCell
                label="IC / Passport"
                value={isIC ? formatICForDisplay(data.icNumber) : data.icNumber}
              />
              <InfoCell label="Date of Birth" value={formatDate(dobDisplay)} />
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">IC / Passport *</Label>
                <Input
                  value={data.icNumber}
                  onChange={(e) => handleIcNumberChange(e.target.value)}
                  placeholder={isIC ? "880101011234" : "A12345678"}
                  className={errors.icNumber ? "border-error" : ""}
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
              {dobReadOnly ? (
                <InfoCell label="Date of Birth" value={formatDate(dobDisplay)} />
              ) : (
                <Field
                  label="Date of Birth"
                  value={dobDisplay}
                  onChange={(val) => {
                    onChange({ dateOfBirth: val });
                    if (errors.dateOfBirth) onErrorClear("dateOfBirth");
                  }}
                  type="date"
                  error={errors.dateOfBirth}
                />
              )}
            </>
          )}

          {/* Row 3 */}
          {identityLocked ? (
            <>
              <InfoCell label="Gender" value={getOptionLabel("gender", genderDisplay)} />
              <Field
                label="Race"
                value={data.race}
                onChange={(val) => {
                  onChange({ race: val });
                  if (errors.race) onErrorClear("race");
                }}
                type="select"
                options={RACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                error={errors.race}
              />
            </>
          ) : (
            <>
              {genderReadOnly ? (
                <InfoCell label="Gender" value={getOptionLabel("gender", genderDisplay)} />
              ) : (
                <Field
                  label="Gender"
                  value={genderDisplay}
                  onChange={(val) => {
                    onChange({ gender: val });
                    if (errors.gender) onErrorClear("gender");
                  }}
                  type="select"
                  options={GENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  error={errors.gender}
                />
              )}
              <Field
                label="Race"
                value={data.race}
                onChange={(val) => {
                  onChange({ race: val });
                  if (errors.race) onErrorClear("race");
                }}
                type="select"
                options={RACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                error={errors.race}
              />
            </>
          )}

          {/* Row 4 */}
          <Field
            label="Education"
            value={data.educationLevel}
            onChange={(val) => {
              onChange({ educationLevel: val });
              if (errors.educationLevel) onErrorClear("educationLevel");
            }}
            type="select"
            options={EDUCATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            error={errors.educationLevel}
          />
          <Field
            label="Occupation"
            value={data.occupation}
            onChange={(val) => {
              onChange({ occupation: val });
              if (errors.occupation) onErrorClear("occupation");
            }}
            error={errors.occupation}
            placeholder="e.g., Accountant"
          />

          {/* Row 5 */}
          <Field
            label="Employment"
            value={data.employmentStatus}
            onChange={(val) => {
              onChange({ employmentStatus: val });
              if (errors.employmentStatus) onErrorClear("employmentStatus");
            }}
            type="select"
            options={EMPLOYMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            error={errors.employmentStatus}
          />
          <div>
            <Label className="text-xs text-muted-foreground">Monthly Income (RM) *</Label>
            <NumericInput
              mode="float"
              value={noMonthlyIncome ? 0 : numValue}
              onChange={(v) => {
                onChange({ monthlyIncome: v === "" ? "" : String(v) });
                if (errors.monthlyIncome) onErrorClear("monthlyIncome");
              }}
              placeholder="e.g., 3500"
              disabled={noMonthlyIncome}
              className={errors.monthlyIncome ? "border-error" : ""}
            />
            {errors.monthlyIncome && (
              <p className="text-xs text-error mt-1">{errors.monthlyIncome}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Checkbox
                id="no-monthly-income-edit"
                checked={noMonthlyIncome}
                onCheckedChange={(checked) => {
                  onNoMonthlyIncomeChange(checked === true);
                  if (checked) {
                    onChange({ monthlyIncome: "0" });
                    onErrorClear("monthlyIncome");
                  } else {
                    onChange({ monthlyIncome: "" });
                  }
                }}
              />
              <label
                htmlFor="no-monthly-income-edit"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                No monthly income (Tiada Pendapatan)
              </label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
