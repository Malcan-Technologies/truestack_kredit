/**
 * Validation helpers for borrower onboarding forms.
 */

import { getStateOptions } from "./address-options";
import { BANK_ACCOUNT_REGEX, POSTCODE_REGEX } from "./borrower-form-options";
import type { IndividualFormData, CorporateFormData } from "./borrower-form-types";

export function validateIndividualForm(
  data: IndividualFormData,
  noMonthlyIncome: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.name.trim()) errors.name = "Name is required";
  if (!data.icNumber.trim()) errors.icNumber = "IC/Passport number is required";
  else if (data.documentType === "IC") {
    const cleanIC = data.icNumber.replace(/\D/g, "");
    if (cleanIC.length !== 12) errors.icNumber = "IC number must be exactly 12 digits";
  }
  if (!data.phone.trim()) errors.phone = "Phone number is required";
  if (!data.email.trim()) errors.email = "Email is required";
  if (!data.addressLine1.trim()) errors.addressLine1 = "Address line 1 is required";
  if (!data.city.trim()) errors.city = "City is required";
  if (!data.postcode.trim()) errors.postcode = "Postcode is required";
  else if (!POSTCODE_REGEX.test(data.postcode))
    errors.postcode = "Postcode must contain numbers only";
  if (!data.country) errors.country = "Country is required";
  if (
    data.country &&
    getStateOptions(data.country).length > 0 &&
    !data.state
  )
    errors.state = "State is required";
  if (!data.dateOfBirth) errors.dateOfBirth = "Date of birth is required";
  if (!data.gender) errors.gender = "Gender is required";
  if (!data.race) errors.race = "Race is required";
  if (!data.educationLevel) errors.educationLevel = "Education level is required";
  if (!data.occupation.trim()) errors.occupation = "Occupation is required";
  if (!data.employmentStatus) errors.employmentStatus = "Employment status is required";
  if (!noMonthlyIncome) {
    if (!data.monthlyIncome.trim()) errors.monthlyIncome = "Monthly income is required";
    else if (
      isNaN(parseFloat(data.monthlyIncome)) ||
      parseFloat(data.monthlyIncome) < 0
    )
      errors.monthlyIncome = "Enter a valid income amount";
  }
  if (!data.bankName) errors.bankName = "Bank is required";
  if (data.bankName === "OTHER" && !data.bankNameOther.trim()) {
    errors.bankNameOther = "Bank name is required";
  }
  if (!data.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
  else if (!BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ""))) {
    errors.bankAccountNo = "Account number must be 8-17 digits only";
  }
  return errors;
}

/** Validate only the fields for a specific Individual onboarding sub-step */
export function validateIndividualFormStep(
  data: IndividualFormData,
  subStep: 1 | 2 | 3,
  noMonthlyIncome: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (subStep === 1) {
    if (!data.name.trim()) errors.name = "Name is required";
    if (!data.icNumber.trim()) errors.icNumber = "IC/Passport number is required";
    else if (data.documentType === "IC") {
      const cleanIC = data.icNumber.replace(/\D/g, "");
      if (cleanIC.length !== 12) errors.icNumber = "IC number must be exactly 12 digits";
    }
    if (!data.dateOfBirth) errors.dateOfBirth = "Date of birth is required";
    if (!data.gender) errors.gender = "Gender is required";
    if (!data.race) errors.race = "Race is required";
    if (!data.educationLevel) errors.educationLevel = "Education level is required";
    if (!data.occupation.trim()) errors.occupation = "Occupation is required";
    if (!data.employmentStatus) errors.employmentStatus = "Employment status is required";
    if (!noMonthlyIncome) {
      if (!data.monthlyIncome.trim()) errors.monthlyIncome = "Monthly income is required";
      else if (
        isNaN(parseFloat(data.monthlyIncome)) ||
        parseFloat(data.monthlyIncome) < 0
      )
        errors.monthlyIncome = "Enter a valid income amount";
    }
  }
  if (subStep === 2) {
    if (!data.phone.trim()) errors.phone = "Phone number is required";
    if (!data.email.trim()) errors.email = "Email is required";
    if (!data.addressLine1.trim()) errors.addressLine1 = "Address line 1 is required";
    if (!data.city.trim()) errors.city = "City is required";
    if (!data.postcode.trim()) errors.postcode = "Postcode is required";
    else if (!POSTCODE_REGEX.test(data.postcode))
      errors.postcode = "Postcode must contain numbers only";
    if (!data.country) errors.country = "Country is required";
    if (
      data.country &&
      getStateOptions(data.country).length > 0 &&
      !data.state
    )
      errors.state = "State is required";
    if (!data.bankName) errors.bankName = "Bank is required";
    if (data.bankName === "OTHER" && !data.bankNameOther.trim()) {
      errors.bankNameOther = "Bank name is required";
    }
    if (!data.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
    else if (!BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ""))) {
      errors.bankAccountNo = "Account number must be 8-17 digits only";
    }
  }
  return errors;
}

/** Validate only the fields for a specific Corporate onboarding sub-step */
export function validateCorporateFormStep(
  data: CorporateFormData,
  subStep: 1 | 2 | 3 | 4 | 5
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (subStep === 1) {
    if (!data.companyName.trim()) errors.companyName = "Company name is required";
    if (!data.ssmRegistrationNo.trim())
      errors.ssmRegistrationNo = "SSM registration number is required";
    if (!data.addressLine1.trim()) errors.addressLine1 = "Address line 1 is required";
    if (!data.city.trim()) errors.city = "City is required";
    if (!data.postcode.trim()) errors.postcode = "Postcode is required";
    else if (!POSTCODE_REGEX.test(data.postcode))
      errors.postcode = "Postcode must contain numbers only";
    if (!data.country) errors.country = "Country is required";
    if (
      data.country &&
      getStateOptions(data.country).length > 0 &&
      !data.state
    )
      errors.state = "State is required";
    if (!data.bumiStatus) errors.bumiStatus = "Taraf (Bumi status) is required for compliance";
  }
  if (subStep === 2) {
    if (!data.companyPhone.trim()) errors.companyPhone = "Company phone is required";
    if (!data.companyEmail.trim()) errors.companyEmail = "Company email is required";
  }
  if (subStep === 3) {
    if (!Array.isArray(data.directors) || data.directors.length < 1) {
      errors.directors = "At least 1 director is required";
    } else if (data.directors.length > 10) {
      errors.directors = "Maximum 10 directors allowed";
    } else {
      data.directors.forEach((director, index) => {
        if (!director.name.trim()) {
          errors[`directorName_${index}`] = `Director ${index + 1} name is required`;
        }
        if (!director.icNumber.trim()) {
          errors[`directorIc_${index}`] = `Director ${index + 1} IC number is required`;
        } else {
          const cleanIC = director.icNumber.replace(/\D/g, "");
          if (cleanIC.length !== 12) {
            errors[`directorIc_${index}`] = `Director ${index + 1} IC must be exactly 12 digits`;
          }
        }
      });
      const arCount = data.directors.filter((d) => d.isAuthorizedRepresentative).length;
      if (arCount !== 1) {
        errors.authorizedRepresentative =
          arCount === 0
            ? "Select one director as the authorized representative"
            : "Only one director can be the authorized representative";
      }
    }
  }
  if (subStep === 4) {
    if (!data.bankName) errors.bankName = "Bank is required";
    if (data.bankName === "OTHER" && !data.bankNameOther.trim()) {
      errors.bankNameOther = "Bank name is required";
    }
    if (!data.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
    else if (!BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ""))) {
      errors.bankAccountNo = "Account number must be 8-17 digits only";
    }
  }
  return errors;
}

/** Identity fields only (name, document type, IC/passport) — for section completion UI. */
export function isIndividualIdentityFieldsComplete(
  data: Pick<IndividualFormData, "name" | "icNumber" | "documentType">
): boolean {
  if (!data.name.trim()) return false;
  if (!data.documentType) return false;
  if (!data.icNumber.trim()) return false;
  if (data.documentType === "IC") {
    const cleanIC = data.icNumber.replace(/\D/g, "");
    if (cleanIC.length !== 12) return false;
  }
  return true;
}

/** Personal block fields for step 1 (excluding identity card fields). */
export function isIndividualPersonalInnerComplete(
  data: IndividualFormData,
  noMonthlyIncome: boolean
): boolean {
  if (!data.dateOfBirth) return false;
  if (!data.gender) return false;
  if (!data.race) return false;
  if (!data.educationLevel) return false;
  if (!data.occupation.trim()) return false;
  if (!data.employmentStatus) return false;
  if (!noMonthlyIncome) {
    if (!data.monthlyIncome.trim()) return false;
    if (isNaN(parseFloat(data.monthlyIncome)) || parseFloat(data.monthlyIncome) < 0) return false;
  }
  return true;
}

export function isIndividualEmergencyContactComplete(data: IndividualFormData): boolean {
  return Boolean(
    data.emergencyContactName?.trim() &&
      data.emergencyContactPhone?.trim() &&
      data.emergencyContactRelationship
  );
}

/** Any social field filled (optional section “complete”). */
export function isIndividualSocialComplete(data: IndividualFormData): boolean {
  const fields = [
    data.instagram,
    data.tiktok,
    data.facebook,
    data.linkedin,
    data.xTwitter,
  ];
  return fields.some((f) => Boolean(f?.trim()));
}

/** All social fields filled — profile “Complete” badge for optional social section. */
export function isIndividualSocialFullyComplete(data: IndividualFormData): boolean {
  const fields = [
    data.instagram,
    data.tiktok,
    data.facebook,
    data.linkedin,
    data.xTwitter,
  ];
  return fields.every((f) => Boolean(f?.trim()));
}

export function isIndividualAddressComplete(data: IndividualFormData): boolean {
  if (!data.addressLine1.trim()) return false;
  if (!data.city.trim()) return false;
  if (!data.postcode.trim()) return false;
  if (!POSTCODE_REGEX.test(data.postcode)) return false;
  if (!data.country) return false;
  if (
    data.country &&
    getStateOptions(data.country).length > 0 &&
    !data.state
  ) {
    return false;
  }
  return true;
}

export function isIndividualContactComplete(data: IndividualFormData): boolean {
  return Boolean(data.phone.trim() && data.email.trim());
}

export function isIndividualBankComplete(data: IndividualFormData): boolean {
  if (!data.bankName) return false;
  if (data.bankName === "OTHER" && !data.bankNameOther.trim()) return false;
  if (!data.bankAccountNo.trim()) return false;
  return BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ""));
}

export function isCorporateAddressComplete(data: CorporateFormData): boolean {
  if (!data.addressLine1.trim()) return false;
  if (!data.city.trim()) return false;
  if (!data.postcode.trim()) return false;
  if (!POSTCODE_REGEX.test(data.postcode)) return false;
  if (!data.country) return false;
  if (
    data.country &&
    getStateOptions(data.country).length > 0 &&
    !data.state
  ) {
    return false;
  }
  return true;
}

export function isCorporateCompanyContactComplete(data: CorporateFormData): boolean {
  return Boolean(data.companyPhone.trim() && data.companyEmail.trim());
}

export function isCorporateBankComplete(data: CorporateFormData): boolean {
  if (!data.bankName) return false;
  if (data.bankName === "OTHER" && !data.bankNameOther.trim()) return false;
  if (!data.bankAccountNo.trim()) return false;
  return BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ""));
}

export function isCorporateSocialFullyComplete(data: CorporateFormData): boolean {
  return [data.instagram, data.tiktok, data.facebook, data.linkedin, data.xTwitter].every((f) =>
    Boolean(f?.trim())
  );
}

export function validateCorporateForm(
  data: CorporateFormData
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.companyName.trim()) errors.companyName = "Company name is required";
  if (!data.ssmRegistrationNo.trim())
    errors.ssmRegistrationNo = "SSM registration number is required";
  if (!data.addressLine1.trim()) errors.addressLine1 = "Address line 1 is required";
  if (!data.city.trim()) errors.city = "City is required";
  if (!data.postcode.trim()) errors.postcode = "Postcode is required";
  else if (!POSTCODE_REGEX.test(data.postcode))
    errors.postcode = "Postcode must contain numbers only";
  if (!data.country) errors.country = "Country is required";
  if (
    data.country &&
    getStateOptions(data.country).length > 0 &&
    !data.state
  )
    errors.state = "State is required";
  if (!data.bumiStatus) errors.bumiStatus = "Taraf (Bumi status) is required for compliance";
  if (!data.companyPhone.trim()) errors.companyPhone = "Company phone is required";
  if (!data.companyEmail.trim()) errors.companyEmail = "Company email is required";
  if (!data.bankName) errors.bankName = "Bank is required";
  if (data.bankName === "OTHER" && !data.bankNameOther.trim()) {
    errors.bankNameOther = "Bank name is required";
  }
  if (!data.bankAccountNo.trim()) errors.bankAccountNo = "Account number is required";
  else if (!BANK_ACCOUNT_REGEX.test(data.bankAccountNo.replace(/\D/g, ""))) {
    errors.bankAccountNo = "Account number must be 8-17 digits only";
  }
  if (!Array.isArray(data.directors) || data.directors.length < 1) {
    errors.directors = "At least 1 director is required";
  } else if (data.directors.length > 10) {
    errors.directors = "Maximum 10 directors allowed";
  } else {
    data.directors.forEach((director, index) => {
      if (!director.name.trim()) {
        errors[`directorName_${index}`] = `Director ${index + 1} name is required`;
      }
      if (!director.icNumber.trim()) {
        errors[`directorIc_${index}`] = `Director ${index + 1} IC number is required`;
      } else {
        const cleanIC = director.icNumber.replace(/\D/g, "");
        if (cleanIC.length !== 12) {
          errors[`directorIc_${index}`] = `Director ${index + 1} IC must be exactly 12 digits`;
        }
      }
    });
    const arCount = data.directors.filter((d) => d.isAuthorizedRepresentative).length;
    if (arCount !== 1) {
      errors.authorizedRepresentative =
        arCount === 0
          ? "Select one director as the authorized representative"
          : "Only one director can be the authorized representative";
    }
  }
  return errors;
}
