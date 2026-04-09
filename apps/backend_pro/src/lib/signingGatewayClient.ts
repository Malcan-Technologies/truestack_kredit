/**
 * HTTP client for the on-prem Signing Gateway REST API.
 * All calls include the X-API-Key header for authentication.
 */

import { config } from './config.js';

const TIMEOUT_MS = 15_000;

interface GatewayHealthResponse {
  status: string;
  timestamp: string;
  services: { mtsa: string };
}

export interface CertInfoResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certStatus?: string;
  certValidFrom?: string;
  certValidTo?: string;
  certSerialNo?: string;
  certX509?: string;
  certIssuer?: string;
  certSubjectDN?: string;
}

export interface OtpResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}

export interface EnrollResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certX509?: string;
  certValidFrom?: string;
  certValidTo?: string;
  certSerialNo?: string;
  certRequestID?: string;
  certRequestStatus?: string;
  userID?: string;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': config.signing.apiKey,
  };
  if (config.signing.cfAccessClientId) {
    h['CF-Access-Client-Id'] = config.signing.cfAccessClientId;
    h['CF-Access-Client-Secret'] = config.signing.cfAccessClientSecret;
  }
  return h;
}

async function gatewayFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${config.signing.gatewayUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json()) as T;
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth(): Promise<{ online: boolean; mtsaConnected: boolean }> {
  try {
    const r = await gatewayFetch<GatewayHealthResponse>('GET', '/health');
    return {
      online: r.status === 'healthy' || r.status === 'degraded',
      mtsaConnected: r.services?.mtsa === 'connected',
    };
  } catch {
    return { online: false, mtsaConnected: false };
  }
}

export async function getCertInfo(userId: string): Promise<CertInfoResponse> {
  return gatewayFetch<CertInfoResponse>('POST', '/api/cert/info', { UserID: userId });
}

export async function requestEmailOTP(
  userId: string,
  usage: 'DS' | 'NU',
  email?: string
): Promise<OtpResponse> {
  return gatewayFetch<OtpResponse>('POST', '/api/otp/request-email', {
    UserID: userId,
    OTPUsage: usage,
    ...(email ? { EmailAddress: email } : {}),
  });
}

export interface OrganisationInfo {
  orgName?: string;
  orgUserDesignation?: string;
  orgUserRegistrationNo?: string;
  orgUserRegistrationType?: string;
  orgAddress?: string;
  orgAddressCity?: string;
  orgAddressState?: string;
  orgAddressPostcode?: string;
  orgAddressCountry?: string;
  orgRegistationNo?: string;
  orgRegistationType?: string;
  orgPhoneNo?: string;
  orgFaxNo?: string;
}

export interface VerificationData {
  verifyDatetime: string;
  verifyMethod: string;
  verifyStatus: string;
  verifyVerifier: string;
}

export interface EnrollCertificateBody {
  UserID: string;
  FullName: string;
  EmailAddress: string;
  MobileNo: string;
  Nationality: string;
  UserType: '1' | '2';
  IDType: 'N' | 'P';
  AuthFactor: string;
  NRICFront?: string;
  NRICBack?: string;
  SelfieImage?: string;
  PassportImage?: string;
  OrganisationInfo?: OrganisationInfo;
  VerificationData?: VerificationData;
}

export async function enrollCertificate(body: EnrollCertificateBody): Promise<EnrollResponse> {
  return gatewayFetch<EnrollResponse>('POST', '/api/cert/enroll', body);
}

// ---- Signing Operations ----

export interface SignAndStoreBody {
  UserID: string;
  FullName: string;
  AuthFactor: string;
  loanId: string;
  SignatureInfo: {
    pdfInBase64: string;
    visibility: boolean;
    pageNo?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    sigImageInBase64?: string;
    visibleOnEveryPages?: boolean;
    additionalInfo1?: string;
    additionalInfo2?: string;
  };
}

export interface SignAndStoreResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  signedPdfInBase64?: string;
  userCert?: string;
  document?: {
    loanId: string;
    filename: string;
    sizeBytes: number;
    signedAt: string;
  };
}

const SIGN_TIMEOUT_MS = 60_000;

export async function signAndStorePdf(body: SignAndStoreBody): Promise<SignAndStoreResponse> {
  const url = `${config.signing.gatewayUrl}/api/sign-and-store`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return (await res.json()) as SignAndStoreResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Email Update ----

export interface UpdateEmailResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}

export async function updateMtsaEmail(
  userId: string,
  newEmail: string,
  emailOtp: string
): Promise<UpdateEmailResponse> {
  return gatewayFetch<UpdateEmailResponse>('POST', '/api/email/update', {
    UserID: userId,
    NewEmailAddress: newEmail,
    EmailOTP: emailOtp,
  });
}

// ---- PIN Verification ----

export interface VerifyCertPinResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certStatus?: string;
  certPinStatus?: string;
}

export async function verifyCertPin(
  userId: string,
  certSerialNo: string,
  pin: string
): Promise<VerifyCertPinResponse> {
  return gatewayFetch<VerifyCertPinResponse>('POST', '/api/cert/verify-pin', {
    UserID: userId,
    CertSerialNo: certSerialNo,
    CertPin: pin,
  });
}

// ---- Certificate Revocation ----

export interface RevokeCertBody {
  UserID: string;
  CertSerialNo: string;
  RevokeReason: 'keyCompromise' | 'CACompromise' | 'affiliationChanged' | 'superseded' | 'cessationOfOperation';
  RevokeBy: 'Admin' | 'Self';
  AuthFactor: string;
  IDType: 'N' | 'P';
  NRICFront?: string;
  NRICBack?: string;
  PassportImage?: string;
  VerificationData: VerificationData;
}

export interface RevokeCertResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}

export async function revokeCertificate(body: RevokeCertBody): Promise<RevokeCertResponse> {
  return gatewayFetch<RevokeCertResponse>('POST', '/api/cert/revoke', body);
}

// ---- PIN Reset ----

export interface ResetCertPinResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}

export async function resetCertPin(
  userId: string,
  certSerialNo: string,
  newPin: string
): Promise<ResetCertPinResponse> {
  return gatewayFetch<ResetCertPinResponse>('POST', '/api/cert/reset-pin', {
    UserID: userId,
    CertSerialNo: certSerialNo,
    NewPin: newPin,
  });
}

// ---- PDF Signature Verification ----

export interface PdfSignatureData {
  sigCoverWholeDocument: boolean;
  sigName: string;
  sigRevisionNo: string;
  sigSignerCert: string;
  sigSignerCertIssuer: string;
  sigSignerCertStatus: string;
  sigSignerCertSubject: string;
  sigStatusValid: boolean;
  sigTimeStamp: string;
}

export interface VerifyPdfSignatureResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  totalSignatureInPdf?: number;
  pdfSignatureList?: PdfSignatureData[];
}

export async function verifyPdfSignature(
  signedPdfBase64: string
): Promise<VerifyPdfSignatureResponse> {
  const url = `${config.signing.gatewayUrl}/api/verify`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ SignedPdfInBase64: signedPdfBase64 }),
      signal: controller.signal,
    });
    return (await res.json()) as VerifyPdfSignatureResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Document Management ----

export interface OnPremDocumentMeta {
  loanId: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  signedAt: string;
  signerUserId: string;
  signerName: string;
}

export async function listOnPremDocuments(): Promise<{ success: boolean; documents: OnPremDocumentMeta[] }> {
  return gatewayFetch<{ success: boolean; documents: OnPremDocumentMeta[] }>('GET', '/api/documents');
}

export async function checkOnPremDocuments(loanIds: string[]): Promise<{ success: boolean; availability: Record<string, boolean> }> {
  return gatewayFetch<{ success: boolean; availability: Record<string, boolean> }>('POST', '/api/documents/check', { loanIds });
}

export async function restoreOnPremDocument(loanId: string, pdfBase64: string): Promise<{ success: boolean; document?: OnPremDocumentMeta; error?: string }> {
  const url = `${config.signing.gatewayUrl}/api/documents/${encodeURIComponent(loanId)}/restore`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ pdfBase64 }),
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; document?: OnPremDocumentMeta; error?: string };
  } finally {
    clearTimeout(timer);
  }
}
