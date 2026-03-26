"use client";

import { User, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Field } from "./field";
import type { CorporateFormData, CorporateDirector } from "../../lib/borrower-form-types";

interface DirectorsCardProps {
  data: Pick<CorporateFormData, "directors" | "authorizedRepName" | "authorizedRepIc" | "name">;
  onChange: (updates: Partial<CorporateFormData>) => void;
  errors: Record<string, string>;
  onErrorClear: (key: string) => void;
}

export function DirectorsCard({
  data,
  onChange,
  errors,
  onErrorClear,
}: DirectorsCardProps) {
  const directors = data.directors;

  const updateDirector = (index: number, updates: Partial<CorporateDirector>) => {
    const nextDirectors = [...directors];
    nextDirectors[index] = { ...nextDirectors[index], ...updates };
    const firstDirector = nextDirectors[0];
    const result: Partial<CorporateFormData> = {
      directors: nextDirectors,
      authorizedRepName: index === 0 ? (updates.name ?? firstDirector?.name) : data.authorizedRepName,
      authorizedRepIc: index === 0 ? (updates.icNumber ?? firstDirector?.icNumber) : data.authorizedRepIc,
      name: index === 0 ? (updates.name ?? firstDirector?.name) : data.name,
    };
    onChange(result);
    if (errors[`directorName_${index}`]) onErrorClear(`directorName_${index}`);
    if (errors[`directorIc_${index}`]) onErrorClear(`directorIc_${index}`);
    if (errors.directors) onErrorClear("directors");
  };

  const removeDirector = (index: number) => {
    if (directors.length <= 1) return;
    const nextDirectors = directors.filter((_, i) => i !== index);
    const firstDirector = nextDirectors[0];
    onChange({
      directors: nextDirectors,
      authorizedRepName: firstDirector?.name || "",
      authorizedRepIc: firstDirector?.icNumber || "",
      name: firstDirector?.name || "",
    });
    if (errors.directors) onErrorClear("directors");
  };

  const addDirector = () => {
    if (directors.length >= 10) return;
    onChange({
      directors: [...directors, { name: "", icNumber: "", position: "" }],
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
          Add 1 to 10 directors. The first director will be used as authorized representative.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {directors.map((director, index) => (
            <div
              key={`director-${index}`}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Director {index + 1}
                  {index === 0 ? " (Authorized Representative)" : ""}
                </p>
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

          {errors.directors && (
            <p className="text-xs text-error">{errors.directors}</p>
          )}

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
