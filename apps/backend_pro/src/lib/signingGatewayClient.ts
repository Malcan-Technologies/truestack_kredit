/**
 * HTTP client for the on-prem Signing Gateway REST API.
 * All calls include the X-API-Key header for authentication.
 */

import { lookup as systemLookup } from 'node:dns';
import type { LookupAddress, LookupAllOptions, LookupOneOptions } from 'node:dns';
import { Resolver } from 'node:dns/promises';
import type { IncomingHttpHeaders } from 'node:http';
import http from 'node:http';
import https, { type RequestOptions as HttpsRequestOptions } from 'node:https';
import { config } from './config.js';

const TIMEOUT_MS = 15_000;
const publicDnsResolver = new Resolver();

publicDnsResolver.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4']);

interface GatewayHealthResponse {
  status: string;
  timestamp: string;
  services: { mtsa: string };
  /** Egress public IPv4 from signing gateway (env or ipify), not container private IP. */
  publicIpv4?: string | null;
}

const FOOTER_IP_CACHE_TTL_MS = 5 * 60 * 1000;
const FOOTER_IP_FAIL_CACHE_MS = 60 * 1000;
let footerIpCache: { value: string | null; expires: number } | null = null;

/**
 * IP to show in "Signed digitally at …" PDF footer after the gateway hostname.
 * Backend SIGNING_GATEWAY_FOOTER_IP overrides; else GET /health `publicIpv4` (cached).
 */
export async function getSigningGatewayFooterIp(): Promise<string | null> {
  if (config.signing.footerIp) {
    return config.signing.footerIp;
  }
  const now = Date.now();
  if (footerIpCache && footerIpCache.expires > now) {
    return footerIpCache.value;
  }
  try {
    const r = await gatewayFetch<GatewayHealthResponse>('GET', '/health');
    const ip =
      typeof r.publicIpv4 === 'string' && r.publicIpv4.trim() ? r.publicIpv4.trim() : null;
    footerIpCache = { value: ip, expires: now + FOOTER_IP_CACHE_TTL_MS };
    return ip;
  } catch {
    footerIpCache = { value: null, expires: now + FOOTER_IP_FAIL_CACHE_MS };
    return null;
  }
}

export interface CertInfoResponse {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certStatus?: string;
  /** Project activation (latest MTSA); may be string "true"/"false" from SOAP/JSON. */
  allowedToSign?: boolean | string;
  authStatus?: string;
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

function previewResponseBody(text: string, maxLength = 300): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function shouldUsePublicDns(url: URL): boolean {
  return url.protocol === 'https:' && url.hostname.endsWith('.truestack.my');
}

async function resolveHostnameViaPublicDns(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  try {
    const addresses = await publicDnsResolver.resolve4(hostname);
    if (addresses.length > 0) {
      return { address: addresses[0], family: 4 };
    }
  } catch {
    // Fall through to IPv6 lookup.
  }

  const addresses = await publicDnsResolver.resolve6(hostname);
  if (addresses.length > 0) {
    return { address: addresses[0], family: 6 };
  }

  throw new Error(`Public DNS returned no records for ${hostname}`);
}

async function gatewayRequest(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS
): Promise<{ status: number; statusText: string; headers: IncomingHttpHeaders; body: string }> {
  const url = new URL(path, `${config.signing.gatewayUrl}/`);
  const requestBody = body ? JSON.stringify(body) : undefined;
  const requestHeaders = headers();

  if (requestBody) {
    requestHeaders['Content-Length'] = Buffer.byteLength(requestBody).toString();
  }

  let resolvedAddress: { address: string; family: 4 | 6 } | undefined;
  if (shouldUsePublicDns(url)) {
    resolvedAddress = await resolveHostnameViaPublicDns(url.hostname);
    requestHeaders.Host = url.host;
  }

  const lookupOverride = resolvedAddress
    ? (
        hostname: string,
        options: LookupOneOptions | LookupAllOptions,
        callback: (
          err: NodeJS.ErrnoException | null,
          address: string | LookupAddress[],
          family?: number
        ) => void
      ) => {
        if (hostname !== url.hostname) {
          systemLookup(hostname, options as never, callback as never);
          return;
        }

        if ('all' in options && options.all) {
          callback(null, [
            {
              address: resolvedAddress.address,
              family: resolvedAddress.family,
            },
          ]);
          return;
        }

        callback(null, resolvedAddress.address, resolvedAddress.family);
      }
    : undefined;

  const requestOptions: HttpsRequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    path: `${url.pathname}${url.search}`,
    method,
    headers: requestHeaders,
    lookup: lookupOverride,
  };

  if (url.protocol === 'https:') {
    requestOptions.servername = url.hostname;
  }

  const requestClient = url.protocol === 'https:' ? https : http;

  return await new Promise((resolve, reject) => {
    const req = requestClient.request(requestOptions, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          headers: res.headers,
          body: responseBody,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

async function gatewayFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${config.signing.gatewayUrl}${path}`;
  let response: { status: number; statusText: string; headers: IncomingHttpHeaders; body: string };

  try {
    response = await gatewayRequest(method, path, body);
  } catch (error) {
    console.error('[SigningGatewayClient] Request failed', {
      method,
      path,
      url,
      timeoutMs: TIMEOUT_MS,
      signingEnabled: config.signing.enabled,
      hasCfAccessClientId: Boolean(config.signing.cfAccessClientId),
      hasCfAccessClientSecret: Boolean(config.signing.cfAccessClientSecret),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const contentTypeHeader = response.headers['content-type'];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(', ')
    : contentTypeHeader || 'unknown';
  const responseText = response.body;

  if (response.status < 200 || response.status >= 300) {
    console.error('[SigningGatewayClient] Non-OK response', {
      method,
      path,
      url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      responseLength: responseText.length,
      bodyPreview: previewResponseBody(responseText),
    });
  }

  try {
    return JSON.parse(responseText) as T;
  } catch (error) {
    console.error('[SigningGatewayClient] Invalid JSON response', {
      method,
      path,
      url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      responseLength: responseText.length,
      bodyPreview: previewResponseBody(responseText),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function checkHealth(): Promise<{ online: boolean; mtsaConnected: boolean }> {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await gatewayFetch<GatewayHealthResponse>('GET', '/health');
      return {
        online: r.status === 'healthy' || r.status === 'degraded',
        mtsaConnected: r.services?.mtsa === 'connected',
      };
    } catch (error) {
      console.error('[SigningGatewayClient] Health check attempt failed', {
        attempt: attempt + 1,
        maxAttempts: MAX_RETRIES + 1,
        gatewayUrl: config.signing.gatewayUrl,
        willRetry: attempt < MAX_RETRIES,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return { online: false, mtsaConnected: false };
    }
  }
  return { online: false, mtsaConnected: false };
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
  orgRegistationNo: string;
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
  const response = await gatewayRequest('POST', '/api/sign-and-store', body, SIGN_TIMEOUT_MS);
  return JSON.parse(response.body) as SignAndStoreResponse;
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
  /** Revoke accepted for Trustgate processing (or duplicate pending) — cert not revoked in our DB yet. */
  pendingAtTrustgate?: boolean;
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
  const response = await gatewayRequest('POST', '/api/verify', { SignedPdfInBase64: signedPdfBase64 }, SIGN_TIMEOUT_MS);
  return JSON.parse(response.body) as VerifyPdfSignatureResponse;
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
  const response = await gatewayRequest(
    'POST',
    `/api/documents/${encodeURIComponent(loanId)}/restore`,
    { pdfBase64 },
    SIGN_TIMEOUT_MS
  );
  return JSON.parse(response.body) as { success: boolean; document?: OnPremDocumentMeta; error?: string };
}
