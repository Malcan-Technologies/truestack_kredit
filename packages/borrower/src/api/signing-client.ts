import type {
  SigningHealthResult,
  CertStatusResult,
  OtpResult,
  EnrollResult,
  SignAgreementResult,
  SigningAuthMethod,
  CheckEmailChangeResult,
  ConfirmEmailChangeResult,
} from "../types/signing";
import type { FetchFn } from "./shared";
import { parseJson } from "./shared";

export function createSigningApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function checkSigningGatewayHealth(): Promise<SigningHealthResult> {
    try {
      const res = await fetchFn(`${baseUrl}/health`);
      return await parseJson<SigningHealthResult>(res);
    } catch {
      return { success: false, online: false, reason: "Network error" };
    }
  }

  async function getSigningCertStatus(): Promise<CertStatusResult> {
    const res = await fetchFn(`${baseUrl}/cert-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await parseJson<CertStatusResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to check certificate status");
    }
    return json;
  }

  async function requestEnrollmentOTP(): Promise<OtpResult> {
    const res = await fetchFn(`${baseUrl}/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await parseJson<OtpResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to request OTP");
    }
    return json;
  }

  async function enrollSigningCert(otp: string): Promise<EnrollResult> {
    const res = await fetchFn(`${baseUrl}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp }),
    });
    const json = await parseJson<EnrollResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to enroll certificate");
    }
    return json;
  }

  async function fetchAgreementPreview(loanId: string): Promise<Blob> {
    const res = await fetchFn(`${baseUrl}/agreement-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanId }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to generate agreement preview");
    }
    return res.blob();
  }

  async function requestSigningOTP(): Promise<OtpResult> {
    const res = await fetchFn(`${baseUrl}/request-signing-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await parseJson<OtpResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to request signing OTP");
    }
    return json;
  }

  async function signAgreement(
    loanId: string,
    authFactor: string,
    signatureImage: string,
    authMethod: SigningAuthMethod = "emailOtp"
  ): Promise<SignAgreementResult> {
    const res = await fetchFn(`${baseUrl}/sign-agreement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanId, authFactor, authMethod, signatureImage }),
    });
    const json = await parseJson<SignAgreementResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to sign agreement");
    }
    return json;
  }

  async function checkEmailChange(
    newEmail: string
  ): Promise<CheckEmailChangeResult> {
    const res = await fetchFn(`${baseUrl}/check-email-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail }),
    });
    const json = await parseJson<CheckEmailChangeResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to check email change");
    }
    return json;
  }

  async function confirmEmailChange(
    newEmail: string,
    otp: string
  ): Promise<ConfirmEmailChangeResult> {
    const res = await fetchFn(`${baseUrl}/confirm-email-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail, otp }),
    });
    const json = await parseJson<ConfirmEmailChangeResult>(res);
    if (!res.ok) {
      throw new Error((json as any).error || "Failed to confirm email change");
    }
    return json;
  }

  return {
    checkSigningGatewayHealth,
    getSigningCertStatus,
    requestEnrollmentOTP,
    enrollSigningCert,
    fetchAgreementPreview,
    requestSigningOTP,
    signAgreement,
    checkEmailChange,
    confirmEmailChange,
  };
}
