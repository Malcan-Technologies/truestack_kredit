/**
 * Borrower-scoped signing API client (proxied to backend_pro /api/borrower-auth/signing).
 */

import type {
  SigningHealthResult,
  CertStatusResult,
  OtpResult,
  EnrollResult,
  SignAgreementResult,
  SigningAuthMethod,
  CheckEmailChangeResult,
  ConfirmEmailChangeResult,
} from "@kredit/borrower";

export type {
  SigningHealthResult,
  CertStatusResult,
  OtpResult,
  EnrollResult,
  SignAgreementResult,
  SigningAuthMethod,
  CheckEmailChangeResult,
  ConfirmEmailChangeResult,
} from "@kredit/borrower";

const BASE = "/api/proxy/borrower-auth/signing";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || "Invalid response");
  }
}

export async function checkSigningGatewayHealth(): Promise<SigningHealthResult> {
  try {
    const res = await fetch(`${BASE}/health`, { credentials: "include" });
    return await parseJson<SigningHealthResult>(res);
  } catch {
    return { success: false, online: false, reason: "Network error" };
  }
}

export async function getSigningCertStatus(): Promise<CertStatusResult> {
  const res = await fetch(`${BASE}/cert-status`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const json = await parseJson<CertStatusResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to check certificate status");
  }
  return json;
}

export async function requestEnrollmentOTP(): Promise<OtpResult> {
  const res = await fetch(`${BASE}/request-otp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const json = await parseJson<OtpResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to request OTP");
  }
  return json;
}

export async function enrollSigningCert(otp: string): Promise<EnrollResult> {
  const res = await fetch(`${BASE}/enroll`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp }),
  });
  const json = await parseJson<EnrollResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to enroll certificate");
  }
  return json;
}

// ---- Agreement Preview ----

export async function fetchAgreementPreview(loanId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/agreement-preview`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loanId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate agreement preview");
  }
  return res.blob();
}

// ---- Signing Operations ----

export async function requestSigningOTP(): Promise<OtpResult> {
  const res = await fetch(`${BASE}/request-signing-otp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const json = await parseJson<OtpResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to request signing OTP");
  }
  return json;
}

export async function signAgreement(
  loanId: string,
  authFactor: string,
  signatureImage: string,
  authMethod: SigningAuthMethod = "emailOtp",
): Promise<SignAgreementResult> {
  const res = await fetch(`${BASE}/sign-agreement`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loanId, authFactor, authMethod, signatureImage }),
  });
  const json = await parseJson<SignAgreementResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to sign agreement");
  }
  return json;
}

// ---- MTSA Email Change ----

export async function checkEmailChange(
  newEmail: string
): Promise<CheckEmailChangeResult> {
  const res = await fetch(`${BASE}/check-email-change`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail }),
  });
  const json = await parseJson<CheckEmailChangeResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to check email change");
  }
  return json;
}

export async function confirmEmailChange(
  newEmail: string,
  otp: string
): Promise<ConfirmEmailChangeResult> {
  const res = await fetch(`${BASE}/confirm-email-change`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail, otp }),
  });
  const json = await parseJson<ConfirmEmailChangeResult>(res);
  if (!res.ok) {
    throw new Error((json as any).error || "Failed to confirm email change");
  }
  return json;
}
