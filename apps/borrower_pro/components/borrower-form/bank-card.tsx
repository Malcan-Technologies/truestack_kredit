"use client";

import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Field } from "./field";
import { BANK_OPTIONS } from "../../lib/borrower-form-options";
import { isIndividualBankComplete } from "../../lib/borrower-form-validation";
import type { IndividualFormData } from "../../lib/borrower-form-types";
import { SectionCompleteBadge } from "../ui/status-row";

interface BankCardData {
  bankName: string;
  bankNameOther: string;
  bankAccountNo: string;
}

interface BankCardProps {
  data: BankCardData;
  onChange: (updates: Partial<BankCardData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

export function BankCard({ data, onChange, errors, onErrorClear }: BankCardProps) {
  const bankComplete = isIndividualBankComplete(data as IndividualFormData);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          Bank Information
        </CardTitle>
        <SectionCompleteBadge complete={bankComplete} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Bank"
            value={data.bankName}
            onChange={(val) => {
              onChange({
                bankName: val,
                bankNameOther: val === "OTHER" ? data.bankNameOther : "",
              });
              if (errors.bankName) onErrorClear("bankName");
            }}
            type="select"
            options={BANK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            error={errors.bankName}
          />
          {data.bankName === "OTHER" && (
            <Field
              label="Bank Name"
              value={data.bankNameOther}
              onChange={(val) => {
                onChange({ bankNameOther: val });
                if (errors.bankNameOther) onErrorClear("bankNameOther");
              }}
              error={errors.bankNameOther}
              placeholder="Enter bank name"
            />
          )}
          <Field
            label="Account Number"
            value={data.bankAccountNo}
            onChange={(val) => {
              const clean = val.replace(/\D/g, "").substring(0, 17);
              onChange({ bankAccountNo: clean });
              if (errors.bankAccountNo) onErrorClear("bankAccountNo");
            }}
            error={errors.bankAccountNo}
            placeholder="8-17 digits"
          />
        </div>
      </CardContent>
    </Card>
  );
}
