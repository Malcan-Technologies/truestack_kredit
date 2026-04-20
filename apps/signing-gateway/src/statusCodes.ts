/**
 * MTSA status code descriptions keyed by code prefix / exact code.
 * Used to enrich raw MTSA responses with human-readable detail.
 */

const STATUS_CODES: Record<string, string> = {
  // ---- Common / WS (all operations) ----
  '000': 'Success',
  WS100: 'Failed to initiate API',
  WS101: 'Read config failed',
  WS102: 'Invalid API credential',
  WS103: 'Credential file not found',
  WS104: 'Missing required parameters',
  WS105: 'Failed to get Project Profile',
  WS106: 'Failed to auto renew cert',
  WS110: 'Username value is missing from Web Service Header',
  WS111: 'Username is missing from Web Service Header',
  WS112: 'Password value is missing from Web Service Header',
  WS113: 'Password is missing from Web Service Header',
  WS114: 'Error in processing Web Service Header',
  WS115: 'MyTrustSigner Service returns error',
  WS116: 'No permission to execute this API function',
  WS117: 'Error in initiating API execution',

  // ---- GetCertInfo (GC) ----
  GC100: 'Cert not found',
  GC101: 'Failed to read user\'s digital certificate',
  GC102: 'Error while reading user\'s digital certificate',
  GC103: 'Error while processing user\'s digital certificate info',
  GC104: 'Cert has been revoked',
  GC200: 'Get Cert detail failed',

  // ---- RequestCertificate / AP (Auto Provision) ----
  AP100: 'Certificate auto-enrolment failed',
  AP101: 'Missing required parameter',
  AP102: 'Invalid parameter length',
  AP103: 'Invalid value for UserType (must be 1 or 2)',
  AP104: 'Error in parameter validation',
  AP105: 'Invalid value for Nationality (must be MY or ZZ)',
  AP106: 'Invalid validator value',
  AP107: 'Invalid parameter format',
  AP108: 'Invalid image file',
  AP109: 'Invalid base64 string',
  AP110: 'Invalid value for IDType (must be P or N)',
  AP111: 'User already has a certificate',
  AP112: 'Invalid AuthFactor',
  AP113: 'AuthFactor has expired',
  AP114: 'AuthFactor validation failed',
  AP115: 'EKYC Error',
  AP120: 'MyTrustID Service returns error',
  AP121: 'User already has an active certificate request',
  AP122: 'Document size is bigger than the limit',
  AP123: 'No document to upload',

  // ---- SignPDF (DS) ----
  DS002: 'Failed to call signPDF function',
  DS100: 'Failed to read digital signing config',
  DS101: 'Missing required parameter for digital signing',
  DS102: 'Failed to read user certificate — please ensure your certificate is valid',
  DS103: 'Your digital certificate has expired — please request a new certificate',
  DS104: 'Your digital certificate has been revoked — please contact support',
  DS105: 'Digital certificate not found — please complete certificate enrolment first',
  DS106: 'Failed to auto renew expired cert',
  DS107: 'Invalid PDF form field name',
  DS110: 'Failed to prepare document for signing',
  DS111: 'Failed to process document signature',
  DS112: 'Invalid OTP — please check the code and try again',
  DS113: 'OTP has expired — please request a new OTP and try again',
  DS114: 'OTP verification failed — please request a new OTP and try again',
  DS120: 'Failed to embed signature into pdf',
  DS121: 'Failed to generate signed pdf file',
  DS122: 'Failed to create Base64 String from signed pdf file',
  DS130: 'Failed to read cert from X509',
  DS131: 'Failed to create external signature',
  DS132: 'Failed to embed signature into pdf',
  DS133: 'Certificate type is not supported',
  DS134: 'Cannot define certificate type',
  DS135: 'Error on getting info from Timestamping Authority Service',

  // ---- VerifyPDFSignature (VS) ----
  VS100: 'Missing pdf path',
  VS101: 'Invalid pdf file path',
  VS102: 'IOException Error',
  VS103: 'GeneralSecurityException Error',
  VS104: 'Exceptions Error',
  VS110: 'Date parse error',
  VS111: 'No signature found in document',

  // ---- RequestRevokeCert (RV) ----
  RV100: 'Certificate auto-revocation failed',
  RV101: 'Missing required parameter',
  RV102: 'Invalid parameter length',
  RV103: 'Invalid value for RevokeBy (must be Admin or Self)',
  RV104: 'Error in parameter validation',
  RV105: 'Manual approval is required',
  RV106: 'Invalid validator value',
  RV107: 'Invalid parameter format',
  RV108: 'Invalid image file',
  RV109: 'Invalid base64 string',
  RV110: 'Invalid value for IDType (must be P or N)',
  RV111: 'Invalid certificate status',
  RV112: 'Invalid AuthFactor',
  RV113: 'AuthFactor has expired',
  RV114: 'AuthFactor validation failed',
  RV115: 'Failed to retrieve certificate request record',
  /** Shown as a warning: another revoke is already in flight at Trustgate. */
  RV116:
    'A revoke is already pending at Trustgate. Wait for it to finish or check status with Trustgate.',
  RV117: 'MyTrustID Service returns error',
  RV118: 'Document size is bigger than the limit',
  RV119: 'No document to upload',
  RV120: 'Failed to revoke',

  // ---- RequestEmailOTP (OT) ----
  OT100: 'Failed to generate OTP',

  // ---- RequestSMSOTP (OT) ----
  // Uses same OT prefix as RequestEmailOTP

  // ---- UpdateEmailAddress (UI) ----
  UI100: 'Failed to update email address',

  // ---- UpdateMobileNo (UM) ----
  UM100: 'Failed to update mobile number',

  // ---- VerifyCertPin (VP) ----
  VP100: 'Failed to verify PIN',
  VP101: 'User has no valid certificate',
  VP102: 'The certificate has not yet been activated',
  VP103: 'Failed to read user\'s digital certificate',
  VP104: 'Certificate PIN is invalid',
  VP105: 'Invalid certificate serial number',

  // ---- ResetCertificatePin (RP) ----
  RP101: 'MyTrustSigner Reset Pin Service returns error',
  RP102: 'Error in reset certificate pin - Cert has been revoked',
  RP103: 'PIN length too short (minimum 8)',
  RP104: 'Failed to reset PIN',
};

export interface EnrichedFields {
  success: boolean;
  errorDescription?: string;
}

export interface RevokeEnrichedFields extends EnrichedFields {
  /** True when the request was accepted for Trustgate workflow but the cert is not revoked yet (or a duplicate pending). */
  pendingAtTrustgate?: boolean;
}

/** MTIDA / MTSA text meaning the revoke is queued for Trustgate manual processing (not an immediate failure). */
export function isTrustgatePendingRevokeStatusMsg(statusMsg: string | undefined): boolean {
  if (!statusMsg) return false;
  const m = statusMsg.toLowerCase();
  return (
    m.includes('pending manual process revocation') ||
    m.includes('pending revoke') ||
    m.includes('manual process revocation')
  );
}

/**
 * Revoke has a two-step lifecycle: user submits → Trustgate processes.
 * MTSA often returns statusCode `000` with a "pending … revocation" message; that must not be treated as `success: true`
 * (which would imply the certificate is already revoked).
 */
export function enrichRevokeResponse<T extends { statusCode?: string; statusMsg?: string }>(
  raw: T
): T & RevokeEnrichedFields {
  const code = String(raw.statusCode ?? 'ERR').trim();
  const msg = raw.statusMsg;

  if (code === '000' && isTrustgatePendingRevokeStatusMsg(msg)) {
    return {
      ...raw,
      success: false,
      pendingAtTrustgate: true,
    };
  }

  const base = enrichResponse(raw) as T & RevokeEnrichedFields;
  if (code === 'RV116') {
    return {
      ...base,
      success: false,
      pendingAtTrustgate: true,
    };
  }

  return {
    ...base,
    pendingAtTrustgate: false,
  };
}

export function enrichResponse<T extends { statusCode?: string; statusMsg?: string }>(
  raw: T
): T & EnrichedFields {
  const code = String(raw.statusCode ?? 'ERR').trim();
  const success = code === '000';
  const description = STATUS_CODES[code];

  return {
    ...raw,
    success,
    ...(description && !success ? { errorDescription: description } : {}),
  };
}

export function getStatusDescription(code: string): string | undefined {
  return STATUS_CODES[code];
}
