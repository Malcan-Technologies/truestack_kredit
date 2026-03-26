/**
 * Document category options for borrower documents.
 * Aligns with backend borrower-auth and borrowers routes.
 */

export const INDIVIDUAL_DOCUMENT_OPTIONS = [
  { value: "IC_FRONT", label: "IC Front" },
  { value: "IC_BACK", label: "IC Back" },
  { value: "PASSPORT", label: "Passport" },
  { value: "WORK_PERMIT", label: "Work Permit" },
  { value: "SELFIE_LIVENESS", label: "Selfie / Liveness" },
  { value: "OTHER", label: "Other" },
] as const;

export const CORPORATE_DOCUMENT_OPTIONS = [
  { value: "SSM_CERT", label: "SSM Certificate" },
  { value: "FORM_9", label: "Form 9" },
  { value: "FORM_13", label: "Form 13" },
  { value: "FORM_24", label: "Form 24" },
  { value: "FORM_49", label: "Form 49" },
  { value: "COMPANY_PROFILE", label: "Company Profile" },
  { value: "DIRECTOR_IC_FRONT", label: "Director IC Front" },
  { value: "DIRECTOR_IC_BACK", label: "Director IC Back" },
  { value: "DIRECTOR_PASSPORT", label: "Director Passport" },
  { value: "SELFIE_LIVENESS", label: "Selfie / Liveness" },
  { value: "OTHER", label: "Other" },
] as const;

export const INDIVIDUAL_DOCUMENT_CATEGORIES = INDIVIDUAL_DOCUMENT_OPTIONS.map(
  (o) => o.value
);

export const CORPORATE_DOCUMENT_CATEGORIES = CORPORATE_DOCUMENT_OPTIONS.map(
  (o) => o.value
);

export const MAX_DOCUMENTS_PER_CATEGORY = 3;

const LABEL_MAP: Record<string, string> = {
  IC_FRONT: "IC Front",
  IC_BACK: "IC Back",
  PASSPORT: "Passport",
  WORK_PERMIT: "Work Permit",
  SELFIE_LIVENESS: "Selfie / Liveness",
  OTHER: "Other",
  SSM_CERT: "SSM Certificate",
  FORM_9: "Form 9",
  FORM_13: "Form 13",
  FORM_24: "Form 24",
  FORM_49: "Form 49",
  COMPANY_PROFILE: "Company Profile",
  DIRECTOR_IC_FRONT: "Director IC Front",
  DIRECTOR_IC_BACK: "Director IC Back",
  DIRECTOR_PASSPORT: "Director Passport",
};

export function getDocumentLabel(
  category: string,
  _borrowerType?: "INDIVIDUAL" | "CORPORATE"
): string {
  return LABEL_MAP[category] ?? category;
}
