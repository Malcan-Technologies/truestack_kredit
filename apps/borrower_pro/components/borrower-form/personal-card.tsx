"use client";

import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { NumericInput } from "../ui/numeric-input";
import { Field } from "./field";
import {
  GENDER_OPTIONS,
  RACE_OPTIONS,
  EDUCATION_OPTIONS,
  EMPLOYMENT_OPTIONS,
} from "../../lib/borrower-form-options";
import { extractDateFromIC, extractGenderFromIC } from "../../lib/borrower-form-helpers";
import { isIndividualPersonalInnerComplete } from "../../lib/borrower-form-validation";
import type { IndividualFormData } from "../../lib/borrower-form-types";
import { SectionCompleteBadge } from "../ui/status-row";

interface PersonalCardProps {
  data: Pick<
    IndividualFormData,
    | "dateOfBirth"
    | "gender"
    | "race"
    | "educationLevel"
    | "occupation"
    | "employmentStatus"
    | "monthlyIncome"
    | "icNumber"
    | "documentType"
  >;
  onChange: (updates: Partial<IndividualFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
  noMonthlyIncome: boolean;
  onNoMonthlyIncomeChange: (checked: boolean) => void;
  identityLocked?: boolean;
}

export function PersonalCard({
  data,
  onChange,
  errors,
  onErrorClear,
  noMonthlyIncome,
  onNoMonthlyIncomeChange,
  identityLocked = false,
}: PersonalCardProps) {
  const isIC = data.documentType === "IC";
  const dobFromIC = extractDateFromIC(data.icNumber);
  const genderFromIC = extractGenderFromIC(data.icNumber);
  const dobDisplay = data.dateOfBirth || (isIC && dobFromIC ? dobFromIC : "");
  const genderDisplay = data.gender || (isIC && genderFromIC ? genderFromIC : "");

  const numValue: number | "" =
    data.monthlyIncome === ""
      ? ""
      : parseFloat(data.monthlyIncome) || 0;

  const personalComplete = isIndividualPersonalInnerComplete(
    {
      ...(data as IndividualFormData),
      dateOfBirth: dobDisplay,
      gender: genderDisplay,
    },
    noMonthlyIncome
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Personal information
        </CardTitle>
        <SectionCompleteBadge complete={personalComplete} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Date of birth"
            value={dobDisplay}
            onChange={(val) => {
              onChange({ dateOfBirth: val });
              if (errors.dateOfBirth) onErrorClear("dateOfBirth");
            }}
            type="date"
            error={errors.dateOfBirth}
            disabled={identityLocked || (isIC && !!dobFromIC)}
          />
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
            disabled={identityLocked || (isIC && !!genderFromIC)}
          />
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
          <Field
            label="Employment Status"
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
                id="no-monthly-income"
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
                htmlFor="no-monthly-income"
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
