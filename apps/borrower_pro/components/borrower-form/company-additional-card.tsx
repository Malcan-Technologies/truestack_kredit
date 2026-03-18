"use client";

import { Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Field } from "./field";
import type { CorporateFormData } from "../../lib/borrower-form-types";

interface CompanyAdditionalCardProps {
  data: Pick<CorporateFormData, "paidUpCapital" | "numberOfEmployees">;
  onChange: (updates: Partial<CorporateFormData>) => void;
}

export function CompanyAdditionalCard({
  data,
  onChange,
}: CompanyAdditionalCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-muted-foreground" />
          Additional Company Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <Field
            label="Paid-up Capital (RM)"
            value={data.paidUpCapital}
            onChange={(val) => onChange({ paidUpCapital: val })}
            type="number"
            numberMode="float"
            placeholder="100000"
            required={false}
          />
          <Field
            label="Number of Employees"
            value={data.numberOfEmployees}
            onChange={(val) => onChange({ numberOfEmployees: val })}
            type="number"
            placeholder="10"
            required={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}
