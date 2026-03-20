/**
 * Client helpers for borrower-auth API (proxied to backend_pro).
 */

const BASE = "/api/proxy/borrower-auth";

/** Dispatched when user switches borrower profile. Listen to re-fetch borrower data. */
export const BORROWER_PROFILE_SWITCHED_EVENT = "borrower-profile-switched";

export function dispatchBorrowerProfileSwitched(borrowerId: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(BORROWER_PROFILE_SWITCHED_EVENT, { detail: { borrowerId } })
    );
  }
}

export interface BorrowerProfile {
  id: string;
  name: string;
  companyName?: string | null;
  borrowerType: string;
  icNumber: string | null;
  phone: string | null;
  email: string | null;
}

export interface BorrowerMeResponse {
  success: boolean;
  data: {
    user: { id: string; email: string; name: string | null };
    profileCount: number;
    profiles: BorrowerProfile[];
    activeBorrower: BorrowerProfile | null;
    activeBorrowerId: string | null;
  };
}

export async function fetchBorrowerMe(): Promise<BorrowerMeResponse> {
  const res = await fetch(BASE + "/me", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to fetch borrower context");
  }
  return res.json();
}

/** Lender (tenant) details for the borrower About page — mirrors admin tenant display fields. */
export interface LenderInfo {
  name: string;
  type: "PPW" | "PPG";
  licenseNumber: string | null;
  registrationNumber: string | null;
  email: string | null;
  contactNumber: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
}

export interface LenderInfoResponse {
  success: boolean;
  data: LenderInfo;
}

export async function fetchLenderInfo(): Promise<LenderInfoResponse> {
  const res = await fetch(BASE + "/lender", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to load lender information");
  }
  return res.json();
}

/**
 * Resolve tenant logo URL for the borrower app: absolute URLs pass through;
 * local `/uploads/...` paths are loaded via the Next.js proxy to backend_pro.
 */
export function resolveBorrowerLenderLogoSrc(logoUrl: string | null): string | undefined {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }
  const trimmed = logoUrl.replace(/^\/+/, "");
  if (trimmed.startsWith("uploads/")) {
    return `/api/proxy/${trimmed}`;
  }
  if (trimmed.startsWith("api/uploads/")) {
    return `/api/proxy/${trimmed.replace(/^api\//, "")}`;
  }
  return `/api/proxy/${trimmed}`;
}

export async function fetchBorrowerProfiles(): Promise<{
  success: boolean;
  data: BorrowerProfile[];
}> {
  const res = await fetch(BASE + "/profiles", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to fetch profiles");
  }
  return res.json();
}

export async function switchBorrowerProfile(borrowerId: string): Promise<void> {
  const res = await fetch(BASE + "/switch-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ borrowerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to switch profile");
  }
}

export interface CrossTenantInsights {
  hasHistory: boolean;
  otherLenderCount: number;
  lenderNames: string[];
  totalLoans: number;
  activeLoans: number;
  completedLoans: number;
  defaultedLoans: number;
  latePaymentsCount?: number;
  totalBorrowedRange: string | null;
  paymentPerformance: {
    rating: string;
    onTimeRateRange: string | null;
  };
  lastBorrowedAt: string | null;
  lastActivityAt: string | null;
  nameConsistency?: string;
  phoneConsistency?: string;
  addressConsistency?: string;
}

export async function fetchCrossTenantInsights(params: {
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
  const search = new URLSearchParams({
    borrowerType: params.borrowerType,
    identifier: params.identifier,
  });
  if (params.name) search.set("name", params.name);
  if (params.phone) search.set("phone", params.phone);
  if (params.addressLine1) search.set("addressLine1", params.addressLine1);
  if (params.addressLine2) search.set("addressLine2", params.addressLine2);
  if (params.city) search.set("city", params.city);
  if (params.state) search.set("state", params.state);
  if (params.postcode) search.set("postcode", params.postcode);
  const res = await fetch(BASE + "/cross-tenant-insights?" + search.toString(), {
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false };
  return json;
}

export interface OnboardingPayload {
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  name: string;
  icNumber?: string;
  documentType?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  dateOfBirth?: string;
  gender?: string;
  race?: string;
  educationLevel?: string;
  occupation?: string;
  employmentStatus?: string;
  bankName?: string;
  bankNameOther?: string;
  bankAccountNo?: string;
  monthlyIncome?: number | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  linkedin?: string;
  xTwitter?: string;
  companyName?: string;
  ssmRegistrationNo?: string;
  businessAddress?: string;
  authorizedRepName?: string;
  authorizedRepIc?: string;
  companyPhone?: string;
  companyEmail?: string;
  natureOfBusiness?: string;
  dateOfIncorporation?: string;
  paidUpCapital?: number | null;
  numberOfEmployees?: number | null;
  bumiStatus?: string;
  directors?: Array<{ name: string; icNumber: string; position?: string }>;
}

export async function submitOnboarding(
  payload: OnboardingPayload
): Promise<{ success: boolean; data: { borrower: BorrowerProfile } }> {
  const res = await fetch(BASE + "/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "Failed to create borrower");
  }
  return json;
}
