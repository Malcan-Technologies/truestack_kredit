export interface SigningHealthResult {
  success: boolean;
  online: boolean;
  mtsaConnected?: boolean;
  reason?: string;
}

export interface CertStatusResult {
  success: boolean;
  hasCert: boolean;
  certStatus: string | null;
  certValidFrom: string | null;
  certValidTo: string | null;
  certSerialNo: string | null;
  allowedToSign?: boolean | string | null;
  authStatus?: string | null;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
}

export interface OtpResult {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  email?: string | null;
}

export interface EnrollResult {
  success: boolean;
  statusCode: string;
  statusMsg?: string;
  errorDescription?: string;
  certSerialNo: string | null;
  certValidFrom: string | null;
  certValidTo: string | null;
}

export interface SignAgreementResult {
  success: boolean;
  statusCode?: string;
  statusMsg?: string;
  errorDescription?: string;
  agreementDate?: string;
  filename?: string;
  sizeBytes?: number;
  signedAgreementReviewStatus?: string;
}

export type SigningAuthMethod = "emailOtp" | "pin";

export interface CheckEmailChangeResult {
  success: boolean;
  requiresOtp: boolean;
  otpSent?: boolean;
  error?: string;
}

export interface ConfirmEmailChangeResult {
  success: boolean;
  statusCode?: string;
  statusMsg?: string;
  errorDescription?: string;
}
