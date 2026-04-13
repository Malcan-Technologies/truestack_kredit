"use client";

import { User, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Field } from "./field";
import type { CorporateFormData, CorporateDirector } from "../../lib/borrower-form-types";

interface DirectorsCardProps {
  data: Pick<CorporateFormData, "directors" | "authorizedRepName" | "authorizedRepIc" | "name">;
  onChange: (updates: Partial<CorporateFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

function syncRepFieldsFromDirectors(directors: CorporateDirector[]): Pick<
  CorporateFormData,
  "authorizedRepName" | "authorizedRepIc" | "name"
> {
  const ar = directors.find((d) => d.isAuthorizedRepresentative) ?? directors[0];
  if (!ar) {
    return { authorizedRepName: "", authorizedRepIc: "", name: "" };
  }
  return {
    authorizedRepName: ar.name,
    authorizedRepIc: ar.icNumber,
    name: ar.name,
  };
}

export function DirectorsCard({
  data,
  onChange,
  errors,
  onErrorClear,
}: DirectorsCardProps) {
  const directors = data.directors;

  const setAuthorizedRepIndex = (index: number) => {
    const nextDirectors = directors.map((d, i) => ({
      ...d,
      isAuthorizedRepresentative: i === index,
    }));
    onChange({
      directors: nextDirectors,
      ...syncRepFieldsFromDirectors(nextDirectors),
    });
    if (errors.authorizedRepresentative) onErrorClear("authorizedRepresentative");
  };

  const updateDirector = (index: number, updates: Partial<CorporateDirector>) => {
    const nextDirectors = [...directors];
    const prev = nextDirectors[index];
    const merged: CorporateDirector = {
      ...prev,
      ...updates,
      // Preserve AR flag unless we’re replacing the whole row
      isAuthorizedRepresentative:
        updates.isAuthorizedRepresentative ?? prev.isAuthorizedRepresentative,
    };
    nextDirectors[index] = merged;

    let normalized = nextDirectors;
    if (!normalized.some((d) => d.isAuthorizedRepresentative) && normalized.length > 0) {
      normalized = normalized.map((d, i) => ({
        ...d,
        isAuthorizedRepresentative: i === 0,
      }));
    }

    onChange({
      directors: normalized,
      ...syncRepFieldsFromDirectors(normalized),
    });
    if (errors[`directorName_${index}`]) onErrorClear(`directorName_${index}`);
    if (errors[`directorIc_${index}`]) onErrorClear(`directorIc_${index}`);
    if (errors.directors) onErrorClear("directors");
    if (errors.authorizedRepresentative) onErrorClear("authorizedRepresentative");
  };

  const removeDirector = (index: number) => {
    if (directors.length <= 1) return;
    const removedWasAr = directors[index]?.isAuthorizedRepresentative;
    const nextDirectors = directors.filter((_, i) => i !== index);
    let normalized = nextDirectors;
    if (removedWasAr || !normalized.some((d) => d.isAuthorizedRepresentative)) {
      normalized = normalized.map((d, i) => ({
        ...d,
        isAuthorizedRepresentative: i === 0,
      }));
    }
    onChange({
      directors: normalized,
      ...syncRepFieldsFromDirectors(normalized),
    });
    if (errors.directors) onErrorClear("directors");
    if (errors.authorizedRepresentative) onErrorClear("authorizedRepresentative");
  };

  const addDirector = () => {
    if (directors.length >= 10) return;
    onChange({
      directors: [
        ...directors,
        { name: "", icNumber: "", position: "", isAuthorizedRepresentative: false },
      ],
    });
    if (errors.directors) onErrorClear("directors");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          Company Directors
        </CardTitle>
        <CardDescription>
          Add 1 to 10 directors. Choose exactly one authorized representative for e-KYC and loan agreements.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {errors.authorizedRepresentative ? (
            <p className="text-xs text-destructive">{errors.authorizedRepresentative}</p>
          ) : null}

          {directors.map((director, index) => (
            <div
              key={`director-${index}`}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">Director {index + 1}</p>
                  {director.isAuthorizedRepresentative ? (
                    <span className="text-xs font-medium rounded-full bg-primary/15 text-primary px-2 py-0.5">
                      Authorized representative
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDirector(index)}
                  disabled={directors.length <= 1}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>

              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
                <input
                  type="radio"
                  id={`director-ar-${index}`}
                  name="authorized-representative"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={director.isAuthorizedRepresentative}
                  onChange={() => setAuthorizedRepIndex(index)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor={`director-ar-${index}`} className="text-sm font-medium cursor-pointer">
                    Authorized representative for this company
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    This person will complete TrueStack e-KYC and sign loan documents on behalf of the company.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Director Name"
                  value={director.name}
                  onChange={(val) => updateDirector(index, { name: val })}
                  error={errors[`directorName_${index}`]}
                  placeholder="Full name"
                />
                <div>
                  <Field
                    label="Director IC Number"
                    value={director.icNumber}
                    onChange={(val) => {
                      const cleanVal = val.replace(/\D/g, "").substring(0, 12);
                      updateDirector(index, { icNumber: cleanVal });
                    }}
                    error={errors[`directorIc_${index}`]}
                    placeholder="880101011234"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter 12 digits only (e.g., 880101011234)
                  </p>
                </div>
                <Field
                  label="Position"
                  value={director.position}
                  onChange={(val) => updateDirector(index, { position: val })}
                  placeholder="e.g., Director"
                  required={false}
                />
              </div>
            </div>
          ))}

          {errors.directors ? (
            <p className="text-xs text-destructive">{errors.directors}</p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={addDirector}
            disabled={directors.length >= 10}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Director
          </Button>
          <p className="text-xs text-muted-foreground">
            {directors.length}/10 directors
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
