/**
 * Helpers for displaying borrower form values (e.g. in Review step).
 */

import {
  DOCUMENT_TYPE_OPTIONS,
  BANK_OPTIONS,
  GENDER_OPTIONS,
  RACE_OPTIONS,
  EDUCATION_OPTIONS,
  EMPLOYMENT_OPTIONS,
  BUMI_STATUS_OPTIONS,
  RELATIONSHIP_OPTIONS,
} from "./borrower-form-options";
import { formatFullAddress } from "./address-options";

const OPTION_MAPS = {
  documentType: Object.fromEntries(DOCUMENT_TYPE_OPTIONS.map((o) => [o.value, o.label])),
  bankName: Object.fromEntries(BANK_OPTIONS.map((o) => [o.value, o.label])),
  gender: Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label])),
  race: Object.fromEntries(RACE_OPTIONS.map((o) => [o.value, o.label])),
  educationLevel: Object.fromEntries(EDUCATION_OPTIONS.map((o) => [o.value, o.label])),
  employmentStatus: Object.fromEntries(EMPLOYMENT_OPTIONS.map((o) => [o.value, o.label])),
  bumiStatus: Object.fromEntries(BUMI_STATUS_OPTIONS.map((o) => [o.value, o.label])),
  emergencyContactRelationship: Object.fromEntries(
    RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label])
  ),
} as const;

export function getOptionLabel(
  key: keyof typeof OPTION_MAPS,
  value: string | null | undefined
): string {
  if (!value?.trim()) return "—";
  return OPTION_MAPS[key][value] ?? value;
}

export function formatDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  try {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-MY");
  } catch {
    return value;
  }
}

export function formatAddress(data: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}): string {
  const addr = formatFullAddress(data);
  return addr || "—";
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === "" || value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return `RM ${num.toLocaleString("en-MY")}`;
}
