/**
 * Convert between BorrowerDetail (API) and form data types.
 */

import type { BorrowerDetail, UpdateBorrowerPayload } from "./borrower-api-client";
import type { IndividualFormData, CorporateFormData, CorporateDirector } from "./borrower-form-types";
import { extractDateFromIC, extractGenderFromIC } from "./borrower-form-helpers";

const empty = (v: string | null | undefined) => v?.trim() ?? "";
const numStr = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

/** YYYY-MM-DD for <input type="date" /> from API ISO or plain date strings */
function normalizeDateInput(v: string | null | undefined): string {
  const s = empty(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

export function borrowerToIndividualForm(b: BorrowerDetail): IndividualFormData {
  const documentType = b.documentType || "IC";
  let dateOfBirth = normalizeDateInput(b.dateOfBirth);
  let gender = empty(b.gender);

  if (documentType === "IC") {
    const icDigits = empty(b.icNumber).replace(/\D/g, "");
    if (icDigits.length >= 12) {
      if (!dateOfBirth) {
        const fromIc = extractDateFromIC(icDigits);
        if (fromIc) dateOfBirth = fromIc;
      }
      if (!gender) {
        const fromIc = extractGenderFromIC(icDigits);
        if (fromIc) gender = fromIc;
      }
    }
  }

  return {
    name: empty(b.name),
    icNumber: empty(b.icNumber),
    documentType,
    phone: empty(b.phone),
    email: empty(b.email),
    addressLine1: empty(b.addressLine1),
    addressLine2: empty(b.addressLine2),
    city: empty(b.city),
    state: empty(b.state),
    postcode: empty(b.postcode),
    country: empty(b.country),
    dateOfBirth,
    gender,
    race: empty(b.race),
    educationLevel: empty(b.educationLevel),
    occupation: empty(b.occupation),
    employmentStatus: empty(b.employmentStatus),
    bankName: empty(b.bankName),
    bankNameOther: empty(b.bankNameOther),
    bankAccountNo: empty(b.bankAccountNo),
    emergencyContactName: empty(b.emergencyContactName),
    emergencyContactPhone: empty(b.emergencyContactPhone),
    emergencyContactRelationship: empty(b.emergencyContactRelationship),
    monthlyIncome: numStr(b.monthlyIncome),
    instagram: empty(b.instagram),
    tiktok: empty(b.tiktok),
    facebook: empty(b.facebook),
    linkedin: empty(b.linkedin),
    xTwitter: empty(b.xTwitter),
  };
}

export function borrowerToCorporateForm(b: BorrowerDetail): CorporateFormData {
  const directors: CorporateDirector[] = (b.directors ?? []).map((d) => ({
    name: d.name,
    icNumber: d.icNumber,
    position: d.position ?? "",
  }));
  if (directors.length === 0) {
    directors.push({
      name: empty(b.authorizedRepName),
      icNumber: empty(b.authorizedRepIc),
      position: "",
    });
  }
  return {
    name: empty(b.name),
    icNumber: empty(b.icNumber),
    phone: empty(b.phone),
    email: empty(b.email),
    companyName: empty(b.companyName),
    ssmRegistrationNo: empty(b.ssmRegistrationNo),
    addressLine1: empty(b.addressLine1),
    addressLine2: empty(b.addressLine2),
    city: empty(b.city),
    state: empty(b.state),
    postcode: empty(b.postcode),
    country: empty(b.country),
    bumiStatus: empty(b.bumiStatus),
    authorizedRepName: empty(b.authorizedRepName),
    authorizedRepIc: empty(b.authorizedRepIc),
    companyPhone: empty(b.companyPhone),
    companyEmail: empty(b.companyEmail),
    natureOfBusiness: empty(b.natureOfBusiness),
    dateOfIncorporation: empty(b.dateOfIncorporation),
    paidUpCapital: numStr(b.paidUpCapital),
    numberOfEmployees: numStr(b.numberOfEmployees),
    bankName: empty(b.bankName),
    bankNameOther: empty(b.bankNameOther),
    bankAccountNo: empty(b.bankAccountNo),
    instagram: empty(b.instagram),
    tiktok: empty(b.tiktok),
    facebook: empty(b.facebook),
    linkedin: empty(b.linkedin),
    xTwitter: empty(b.xTwitter),
    directors,
  };
}

export function individualFormToPayload(
  data: IndividualFormData
): UpdateBorrowerPayload {
  return {
    name: data.name || undefined,
    icNumber: data.icNumber || undefined,
    documentType: data.documentType || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    addressLine1: data.addressLine1 || undefined,
    addressLine2: data.addressLine2 || undefined,
    city: data.city || undefined,
    state: data.state || undefined,
    postcode: data.postcode || undefined,
    country: data.country || undefined,
    dateOfBirth: data.dateOfBirth || undefined,
    gender: data.gender || undefined,
    race: data.race || undefined,
    educationLevel: data.educationLevel || undefined,
    occupation: data.occupation || undefined,
    employmentStatus: data.employmentStatus || undefined,
    bankName: data.bankName || undefined,
    bankNameOther: data.bankNameOther || undefined,
    bankAccountNo: data.bankAccountNo || undefined,
    monthlyIncome: data.monthlyIncome ? parseFloat(data.monthlyIncome) : null,
    emergencyContactName: data.emergencyContactName || undefined,
    emergencyContactPhone: data.emergencyContactPhone || undefined,
    emergencyContactRelationship: data.emergencyContactRelationship || undefined,
    instagram: data.instagram || undefined,
    tiktok: data.tiktok || undefined,
    facebook: data.facebook || undefined,
    linkedin: data.linkedin || undefined,
    xTwitter: data.xTwitter || undefined,
  };
}

export function corporateFormToPayload(
  data: CorporateFormData
): UpdateBorrowerPayload {
  return {
    name: data.name || undefined,
    icNumber: data.icNumber || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    companyName: data.companyName || undefined,
    ssmRegistrationNo: data.ssmRegistrationNo || undefined,
    addressLine1: data.addressLine1 || undefined,
    addressLine2: data.addressLine2 || undefined,
    city: data.city || undefined,
    state: data.state || undefined,
    postcode: data.postcode || undefined,
    country: data.country || undefined,
    bumiStatus: data.bumiStatus || undefined,
    authorizedRepName: data.authorizedRepName || undefined,
    authorizedRepIc: data.authorizedRepIc || undefined,
    companyPhone: data.companyPhone || undefined,
    companyEmail: data.companyEmail || undefined,
    natureOfBusiness: data.natureOfBusiness || undefined,
    dateOfIncorporation: data.dateOfIncorporation || undefined,
    paidUpCapital: data.paidUpCapital ? parseFloat(data.paidUpCapital) : null,
    numberOfEmployees: data.numberOfEmployees
      ? parseInt(data.numberOfEmployees, 10)
      : null,
    bankName: data.bankName || undefined,
    bankNameOther: data.bankNameOther || undefined,
    bankAccountNo: data.bankAccountNo || undefined,
    instagram: data.instagram || undefined,
    tiktok: data.tiktok || undefined,
    facebook: data.facebook || undefined,
    linkedin: data.linkedin || undefined,
    xTwitter: data.xTwitter || undefined,
    directors: data.directors.map((d) => ({
      name: d.name,
      icNumber: d.icNumber,
      position: d.position || undefined,
    })),
  };
}
