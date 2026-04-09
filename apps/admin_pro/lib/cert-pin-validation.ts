/** Certificate PIN (enroll, verify, revoke, reset, signing): exactly 8 numeric digits */
export const CERT_PIN_REGEX = /^\d{8}$/;

export function filterCertPinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}
