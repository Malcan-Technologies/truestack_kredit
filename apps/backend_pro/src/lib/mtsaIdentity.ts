/**
 * MTSA RequestCertificate / revoke: Nationality MY = Malaysian → NRIC path (IDType N).
 * Passport ID type is only for non-Malaysians (ZZ) when identity document is passport.
 */

export type MtsaNationality = 'MY' | 'ZZ';

function isMalaysianCountryOrNationality(stored: string | null | undefined): boolean {
  const u = stored?.trim().toUpperCase() ?? '';
  return !u || u === 'MY' || u === 'MYS' || u === 'MALAYSIA';
}

/** Borrower `country`: empty or Malaysia → MY; any other country → ZZ */
export function mtsaNationalityFromBorrowerCountry(country: string | null | undefined): MtsaNationality {
  return isMalaysianCountryOrNationality(country) ? 'MY' : 'ZZ';
}

/** Staff profile `nationality` (defaults MY): Malaysian → MY; otherwise ZZ */
export function mtsaNationalityFromStaffProfile(storedNationality: string | null | undefined): MtsaNationality {
  return isMalaysianCountryOrNationality(storedNationality) ? 'MY' : 'ZZ';
}

/** IC / MYKAD vs PASSPORT in DB */
export function storedDocumentTypeIsPassport(documentType: string | null | undefined): boolean {
  return documentType?.trim().toUpperCase() === 'PASSPORT';
}

/**
 * Malaysians always enroll/revoke with NRIC images (IDType N), not passport,
 * even if `documentType` were mis-set to PASSPORT.
 */
export function mtsaRequestUsesPassportIdType(
  mtsaNationality: MtsaNationality,
  documentTypePassport: boolean,
): boolean {
  if (mtsaNationality === 'MY') return false;
  return documentTypePassport;
}
