/**
 * Admin signing API client — proxied to backend_pro /api/admin/signing.
 */

const BASE = "/api/proxy/admin/signing";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || "Invalid response");
  }
}

// ---- Types ----

export interface StaffSigningProfile {
  id: string;
  tenantId: string;
  userId: string;
  icNumber: string;
  fullName: string;
  email: string;
  phone?: string;
  nationality: string;
  documentType: string;
  designation?: string;
  certSerialNo?: string;
  certStatus?: string;
  certValidFrom?: string;
  certValidTo?: string;
  kycComplete: boolean;
  documents: StaffDocument[];
  kycSessions?: StaffKycSession[];
}

export interface StaffDocument {
  id: string;
  category: string;
  originalName: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface StaffKycSession {
  status: string;
  result?: string;
  rejectMessage?: string;
  onboardingUrl?: string;
  expiresAt?: string;
}

export interface CertInfo {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certStatus?: string;
  certValidFrom?: string;
  certValidTo?: string;
  certSerialNo?: string;
}

export interface TenantSigner {
  id: string;
  userId: string;
  fullName: string;
  icNumber: string;
  email: string;
  designation?: string;
  certStatus?: string;
  certSerialNo?: string;
  certValidFrom?: string;
  certValidTo?: string;
  kycComplete: boolean;
  user: { name: string | null; email: string };
}

export interface InternalSignature {
  id: string;
  role: string;
  signerName: string;
  signerIc: string;
  signedAt: string;
  agreementVersion: number;
  userId: string;
}

// ---- Profile ----

export async function getSigningProfile(): Promise<{
  success: boolean;
  profile: StaffSigningProfile | null;
}> {
  const res = await fetch(`${BASE}/profile`, {
    credentials: "include",
  });
  return parseJson(res);
}

export async function saveSigningProfile(data: {
  icNumber: string;
  fullName: string;
  email: string;
  phone?: string;
  nationality?: string;
  documentType?: string;
  designation?: string;
}): Promise<{ success: boolean; profile: StaffSigningProfile }> {
  const res = await fetch(`${BASE}/profile`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseJson(res);
}

// ---- KYC ----

export async function startStaffKyc(): Promise<{
  success: boolean;
  sessionId?: string;
  onboardingUrl?: string;
  expiresAt?: string;
  error?: string;
}> {
  const res = await fetch(`${BASE}/kyc/start`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  return parseJson(res);
}

export async function getStaffKycStatus(): Promise<{
  success: boolean;
  kycComplete: boolean;
  hasProfile: boolean;
  hasDocuments?: boolean;
  latestSession?: StaffKycSession | null;
}> {
  const res = await fetch(`${BASE}/kyc/status`, {
    credentials: "include",
  });
  return parseJson(res);
}

// ---- Health ----

export async function checkSigningHealth(): Promise<{
  success: boolean;
  online: boolean;
  mtsaConnected: boolean;
}> {
  const res = await fetch(`${BASE}/health`, {
    credentials: "include",
  });
  return parseJson(res);
}

// ---- Certificates ----

export async function getCertStatus(): Promise<{
  success: boolean;
  certInfo: CertInfo;
}> {
  const res = await fetch(`${BASE}/cert-status`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  return parseJson(res);
}

export async function checkCertByIc(icNumber: string): Promise<{
  success: boolean;
  certInfo: CertInfo;
}> {
  const res = await fetch(`${BASE}/cert-check`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icNumber }),
  });
  return parseJson(res);
}

export async function requestEnrollmentOtp(): Promise<{
  success: boolean;
  statusCode: string;
  statusMsg?: string;
}> {
  const res = await fetch(`${BASE}/request-otp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  return parseJson(res);
}

export interface EnrollOrgInfo {
  orgName: string;
  orgUserDesignation?: string;
  orgUserRegistrationNo: string;
  orgUserRegistrationType: "IDC" | "PAS";
  orgAddress: string;
  orgAddressCity: string;
  orgAddressState: string;
  orgAddressPostcode: string;
  orgAddressCountry: string;
  orgRegistationNo: string;
  orgRegistationType: string;
  orgPhoneNo: string;
}

export async function enrollCert(
  pin: string,
  phone: string,
  organisationInfo: EnrollOrgInfo,
): Promise<{
  success: boolean;
  statusCode?: string;
  statusMsg?: string;
  errorDescription?: string;
  error?: string;
  detail?: string;
  certSerialNo?: string;
  certValidFrom?: string;
  certValidTo?: string;
  certRequestID?: string;
  certRequestStatus?: string;
}> {
  const res = await fetch(`${BASE}/enroll`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, phone, organisationInfo }),
  });
  return parseJson(res);
}

export async function revokeCert(
  certSerialNo: string,
  reason: string,
  pin: string,
): Promise<{
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}> {
  const res = await fetch(`${BASE}/revoke`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certSerialNo, reason, pin }),
  });
  return parseJson(res);
}

// ---- PIN Management ----

export async function verifyCertPin(pin: string): Promise<{
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certStatus?: string;
  certPinStatus?: string;
}> {
  const res = await fetch(`${BASE}/verify-pin`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return parseJson(res);
}

export async function resetCertPin(
  currentPin: string,
  newPin: string,
): Promise<{
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}> {
  const res = await fetch(`${BASE}/reset-pin`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPin, newPin }),
  });
  return parseJson(res);
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

export async function verifyPdfSignature(pdfBase64: string): Promise<{
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  totalSignatureInPdf?: number;
  pdfSignatureList?: PdfSignatureData[];
}> {
  const res = await fetch(`${BASE}/verify-pdf`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfBase64 }),
  });
  if (res.status === 413) {
    return {
      success: false,
      statusCode: "ERR",
      errorDescription:
        "The file is too large to process. Please upload a smaller PDF (max 50 MB).",
    };
  }
  return parseJson(res);
}

// ---- Email Change (MTSA sync) ----

export async function checkStaffEmailChange(newEmail: string): Promise<{
  requiresOtp: boolean;
  otpSent?: boolean;
  error?: string;
}> {
  const res = await fetch(`${BASE}/check-email-change`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail }),
  });
  return parseJson(res);
}

export async function confirmStaffEmailChange(
  newEmail: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${BASE}/confirm-email-change`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail, otp }),
  });
  return parseJson(res);
}

// ---- Loan signing ----

export async function signLoanAgreement(
  loanId: string,
  pin: string,
  signatureImage: string,
  role: "COMPANY_REP" | "WITNESS",
): Promise<{
  success: boolean;
  statusCode?: string;
  statusMsg?: string;
  errorDescription?: string;
  role?: string;
  agreementVersion?: number;
  signedAgreementReviewStatus?: string;
}> {
  const res = await fetch(`${BASE}/sign-agreement`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loanId, pin, signatureImage, role }),
  });
  return parseJson(res);
}

export async function getLoanSignatures(loanId: string): Promise<{
  success: boolean;
  signatures: InternalSignature[];
}> {
  const res = await fetch(`${BASE}/loan-signatures/${loanId}`, {
    credentials: "include",
  });
  return parseJson(res);
}

export async function getTenantSigners(): Promise<{
  success: boolean;
  signers: TenantSigner[];
}> {
  const res = await fetch(`${BASE}/signers`, {
    credentials: "include",
  });
  return parseJson(res);
}

export async function deleteSigner(
  profileId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/signers/${profileId}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson(res);
}
