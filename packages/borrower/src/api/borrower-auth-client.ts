import type {
  BorrowerProfile,
  BorrowerMeResponse,
  LenderInfoResponse,
  CrossTenantInsights,
  OnboardingPayload,
  CompanyMembersContext,
} from "../types/auth";
import type { FetchFn } from "./shared";
import { parseJson } from "./shared";

export function createBorrowerAuthApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function fetchBorrowerMe(): Promise<BorrowerMeResponse> {
    const res = await fetchFn(baseUrl + "/me");
    const json = await parseJson<BorrowerMeResponse & { error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to fetch borrower context");
    }
    return json;
  }

  async function fetchLenderInfo(): Promise<LenderInfoResponse> {
    const res = await fetchFn(baseUrl + "/lender");
    const json = await parseJson<LenderInfoResponse & { error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load lender information");
    }
    return json;
  }

  async function fetchBorrowerProfiles(): Promise<{
    success: boolean;
    data: BorrowerProfile[];
  }> {
    const res = await fetchFn(baseUrl + "/profiles");
    const json = await parseJson<{ success: boolean; data: BorrowerProfile[]; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to fetch profiles");
    }
    return { success: json.success, data: json.data };
  }

  async function switchBorrowerProfile(borrowerId: string): Promise<void> {
    const res = await fetchFn(baseUrl + "/switch-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrowerId }),
    });
    if (!res.ok) {
      const json = await parseJson<{ error?: string }>(res);
      throw new Error(json.error || "Failed to switch profile");
    }
  }

  async function fetchCompanyMembersContext(): Promise<{
    success: boolean;
    data: CompanyMembersContext;
  }> {
    const res = await fetchFn(baseUrl + "/company-members/context");
    const json = await parseJson<{ success: boolean; data: CompanyMembersContext; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load company members context");
    }
    return { success: json.success, data: json.data };
  }

  async function fetchBorrowerInvitationPreview(invitationId: string): Promise<{
    success: boolean;
    data: { inviteKind: "email" | "open_link"; expiresAt: string };
  }> {
    const q = `invitationId=${encodeURIComponent(invitationId)}`;
    const res = await fetchFn(`${baseUrl}/company-members/invitation-preview?${q}`);
    const json = await parseJson<{
      success: boolean;
      data: { inviteKind: "email" | "open_link"; expiresAt: string };
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Invalid or expired invitation");
    }
    return json;
  }

  async function bindOpenCompanyInvitation(invitationId: string): Promise<void> {
    const res = await fetchFn(baseUrl + "/company-members/bind-open-invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    if (!res.ok) {
      const json = await parseJson<{ error?: string }>(res);
      throw new Error(json.error || "Could not link invitation to your account");
    }
  }

  async function createOpenCompanyInvitation(
    role: "member" | "admin" = "member"
  ): Promise<{
    invitationId: string;
    expiresAt: string;
  }> {
    const res = await fetchFn(baseUrl + "/company-members/open-invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await parseJson<{
      data: { invitationId: string; expiresAt: string };
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to create shareable invite");
    }
    return json.data;
  }

  async function leaveCompanyOrganization(organizationId: string): Promise<void> {
    const res = await fetchFn(baseUrl + "/company-members/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!res.ok) {
      const json = await parseJson<{ error?: string }>(res);
      throw new Error(json.error || "Failed to leave company");
    }
  }

  async function submitOnboarding(
    payload: OnboardingPayload
  ): Promise<{ success: boolean; data: { borrower: BorrowerProfile } }> {
    const res = await fetchFn(baseUrl + "/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJson<{ success: boolean; data: { borrower: BorrowerProfile }; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to create borrower");
    }
    return json;
  }

  async function fetchCrossTenantInsights(params: {
    borrowerType: string;
    identifier: string;
    name?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postcode?: string;
  }): Promise<{ success: boolean; data?: CrossTenantInsights }> {
    const parts: string[] = [
      `borrowerType=${encodeURIComponent(params.borrowerType)}`,
      `identifier=${encodeURIComponent(params.identifier)}`,
    ];
    if (params.name) parts.push(`name=${encodeURIComponent(params.name)}`);
    if (params.phone) parts.push(`phone=${encodeURIComponent(params.phone)}`);
    if (params.addressLine1) parts.push(`addressLine1=${encodeURIComponent(params.addressLine1)}`);
    if (params.addressLine2) parts.push(`addressLine2=${encodeURIComponent(params.addressLine2)}`);
    if (params.city) parts.push(`city=${encodeURIComponent(params.city)}`);
    if (params.state) parts.push(`state=${encodeURIComponent(params.state)}`);
    if (params.postcode) parts.push(`postcode=${encodeURIComponent(params.postcode)}`);
    const res = await fetchFn(baseUrl + "/cross-tenant-insights?" + parts.join("&"));
    if (!res.ok) return { success: false };
    const json = await parseJson<{ success: boolean; data?: CrossTenantInsights }>(res);
    return json;
  }

  return {
    fetchBorrowerMe,
    fetchLenderInfo,
    fetchBorrowerProfiles,
    switchBorrowerProfile,
    fetchCompanyMembersContext,
    fetchBorrowerInvitationPreview,
    bindOpenCompanyInvitation,
    createOpenCompanyInvitation,
    leaveCompanyOrganization,
    submitOnboarding,
    fetchCrossTenantInsights,
  };
}
