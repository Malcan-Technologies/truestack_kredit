"use client";

import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { PhoneInput } from "../ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { RELATIONSHIP_OPTIONS } from "../../lib/borrower-form-options";

interface EmergencyContactData {
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
}

interface EmergencyContactCardProps {
  data: EmergencyContactData;
  onChange: (updates: Partial<EmergencyContactData>) => void;
}

export function EmergencyContactCard({ data, onChange }: EmergencyContactCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-muted-foreground" />
          Emergency Contact
        </CardTitle>
        <CardDescription>Optional</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={data.emergencyContactName}
              onChange={(e) =>
                onChange({ emergencyContactName: e.target.value })
              }
              placeholder="Contact name"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <PhoneInput
              value={data.emergencyContactPhone || undefined}
              onChange={(val: string | undefined) =>
                onChange({ emergencyContactPhone: val ?? "" })
              }
              placeholder="16 4818800"
            />
            <p className="text-xs text-muted-foreground mt-1">e.g. 16 4818800</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Relationship</Label>
            <Select
              value={data.emergencyContactRelationship}
              onValueChange={(val) =>
                onChange({ emergencyContactRelationship: val })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
