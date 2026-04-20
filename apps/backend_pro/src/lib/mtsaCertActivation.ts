import type { CertInfoResponse } from './signingGatewayClient.js';

export type MtsaCertActivationSignals = {
  success?: boolean;
  certStatus?: string | null;
  /** SOAP may return the string "true" / "false". */
  allowedToSign?: boolean | string | null;
  authStatus?: string | null;
};

function activationFieldsPresent(s: MtsaCertActivationSignals): { hasAllowed: boolean; hasAuth: boolean } {
  const a = s.allowedToSign;
  const hasAllowed =
    a !== undefined && a !== null && !(typeof a === 'string' && a.trim() === '');
  const hasAuth = s.authStatus != null && String(s.authStatus).trim() !== '';
  return { hasAllowed, hasAuth };
}

function coerceAllowedToSign(v: boolean | string | null | undefined): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return undefined;
}

/**
 * Whether the signer can sign right now (universal for internal and external users).
 * Per Trustgate (latest MTSA): both `allowedToSign === true` and `authStatus === Active` indicate
 * a usable certificate. `certStatus === Valid` alone only means a credential exists — it may not
 * yet be enabled for signing. Older SOAP responses without these fields fall back to `Valid`.
 *
 * Internal vs external is a separate dimension — see {@link parseMtsaSignerTypeFromSubjectDN}.
 */
export function isMtsaSigningActiveForProject(signals: MtsaCertActivationSignals): boolean {
  if (signals.success === false) return false;
  if (signals.certStatus !== 'Valid') return false;

  const { hasAllowed, hasAuth } = activationFieldsPresent(signals);
  if (!hasAllowed && !hasAuth) return true;

  const allowed = coerceAllowedToSign(signals.allowedToSign as boolean | string | null | undefined);
  const auth = String(signals.authStatus ?? '')
    .trim()
    .toLowerCase();

  if (hasAllowed && hasAuth) return allowed === true && auth === 'active';
  if (hasAllowed) return allowed === true;
  return auth === 'active';
}

export type StaffSigningCertRow = {
  certStatus?: string | null;
  mtsaAllowedToSign?: boolean | null;
  mtsaAuthStatus?: string | null;
};

export function isStaffSigningActiveFromStored(row: StaffSigningCertRow): boolean {
  return isMtsaSigningActiveForProject({
    success: true,
    certStatus: row.certStatus,
    allowedToSign: row.mtsaAllowedToSign,
    authStatus: row.mtsaAuthStatus,
  });
}

export function parseMtsaAllowedToSignForDb(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === '') return null;
  }
  return null;
}

export function certInfoToActivationSignals(info: CertInfoResponse): MtsaCertActivationSignals {
  return {
    success: info.success,
    certStatus: info.certStatus,
    allowedToSign: info.allowedToSign,
    authStatus: info.authStatus,
  };
}

export type MtsaSignerType = 'internal' | 'external' | 'unknown';

/**
 * Internal certs carry organisation attributes in the Subject DN
 * (e.g. `O=ANDAS EL, T=Director, OID.2.5.4.97=NTRMY-...`).
 * External certs are personal — `CN`, `SERIALNUMBER`, `C` only.
 */
export function parseMtsaSignerTypeFromSubjectDN(subjectDN: string | null | undefined): MtsaSignerType {
  if (!subjectDN || typeof subjectDN !== 'string') return 'unknown';
  const dn = subjectDN.trim();
  if (!dn) return 'unknown';
  if (/(^|,\s*)O\s*=/i.test(dn)) return 'internal';
  if (/(^|,\s*)OID\.2\.5\.4\.97\s*=/i.test(dn)) return 'internal';
  if (/(^|,\s*)T\s*=/i.test(dn)) return 'internal';
  return 'external';
}
