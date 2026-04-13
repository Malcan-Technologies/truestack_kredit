/** Certificate PIN for enrollment wizard and document signing: exactly 8 numeric digits */
export const CERT_PIN_REGEX = /^\d{8}$/;

/**
 * Verify / reset / revoke certificate PIN in admin UI: numeric digits only, 4–32 chars
 * (matches backend admin-signing limits; longer than enroll UI when the CA supports it).
 */
export const CERT_PIN_MANAGEMENT_REGEX = /^\d{4,32}$/;

export function filterCertPinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** Same as {@link filterCertPinInput} but allows up to 32 digits for PIN management flows. */
export function filterCertPinManagementInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 32);
}
