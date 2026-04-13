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
