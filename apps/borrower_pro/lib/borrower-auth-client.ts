/**
 * Client helpers for borrower-auth API (proxied to backend_pro).
 */

const BASE = "/api/proxy/borrower-auth";

const PENDING_ACCEPT_INVITATION_KEY = "borrower_pending_accept_invitation";
const PENDING_ACCEPT_INVITATION_TTL_MS = 30 * 60 * 1000;

type PendingAcceptInvitationPayload = {
  path: string;
  createdAt: number;
};

function getWebStorage(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function safeStorageSetItem(kind: "local" | "session", key: string, value: string): void {
  const storage = getWebStorage(kind);
  if (!storage) return;

  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write errors (disabled storage, quota exceeded, etc.).
  }
}

function safeStorageGetItem(kind: "local" | "session", key: string): string | null {
  const storage = getWebStorage(kind);
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageRemoveItem(kind: "local" | "session", key: string): void {
  const storage = getWebStorage(kind);
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage removal errors.
  }
}

function encodePendingAcceptInvitation(pathWithQuery: string): string {
  return JSON.stringify({
    path: pathWithQuery,
    createdAt: Date.now(),
  } satisfies PendingAcceptInvitationPayload);
}

function decodePendingAcceptInvitation(raw: string | null): string | null {
  if (!raw) return null;

  // Backward-compat: accept previous plain-string format.
  if (raw.startsWith("/accept-invitation")) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingAcceptInvitationPayload>;
    if (typeof parsed.path !== "string" || !parsed.path.startsWith("/accept-invitation")) {
      return null;
    }
    if (typeof parsed.createdAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.createdAt > PENDING_ACCEPT_INVITATION_TTL_MS) {
      return null;
    }
    return parsed.path;
  } catch {
    return null;
  }
}

/** Remember invite URL path across sign-up / verify-email so post-login routing can resume acceptance. */
export function setPendingAcceptInvitationPath(pathWithQuery: string): void {
  if (typeof window === "undefined") return;
  if (!pathWithQuery.startsWith("/accept-invitation")) return;

  const payload = encodePendingAcceptInvitation(pathWithQuery);
  safeStorageSetItem("session", PENDING_ACCEPT_INVITATION_KEY, payload);
  safeStorageSetItem("local", PENDING_ACCEPT_INVITATION_KEY, payload);
}

export function peekPendingAcceptInvitationPath(): string | null {
  const sessionValue = decodePendingAcceptInvitation(
    safeStorageGetItem("session", PENDING_ACCEPT_INVITATION_KEY)
  );
  if (sessionValue) return sessionValue;

  const localValue = decodePendingAcceptInvitation(
    safeStorageGetItem("local", PENDING_ACCEPT_INVITATION_KEY)
  );
  if (localValue) return localValue;

  return null;
}

export function consumePendingAcceptInvitationPath(options?: {
  allowLocalFallback?: boolean;
}): string | null {
  const sessionValue = decodePendingAcceptInvitation(
    safeStorageGetItem("session", PENDING_ACCEPT_INVITATION_KEY)
  );
  if (sessionValue) {
    clearPendingAcceptInvitationPath();
    return sessionValue;
  }

  if (!options?.allowLocalFallback) {
    safeStorageRemoveItem("session", PENDING_ACCEPT_INVITATION_KEY);
    return null;
  }

  const localValue = decodePendingAcceptInvitation(
    safeStorageGetItem("local", PENDING_ACCEPT_INVITATION_KEY)
  );
  clearPendingAcceptInvitationPath();
  return localValue;
}

export function clearPendingAcceptInvitationPath(): void {
  safeStorageRemoveItem("session", PENDING_ACCEPT_INVITATION_KEY);
  safeStorageRemoveItem("local", PENDING_ACCEPT_INVITATION_KEY);
}

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

/** Company org context for the active corporate borrower (Better Auth organization + roles). */
export interface CompanyMembersContext {
  isCorporate: boolean;
  organizationId: string | null;
  role: string | null;
  canManageMembers: boolean;
  canEditCompanyProfile: boolean;
  needsOrgBackfill?: boolean;
}

export async function fetchCompanyMembersContext(): Promise<{
  success: boolean;
  data: CompanyMembersContext;
}> {
  const res = await fetch(BASE + "/company-members/context", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to load company members context");
  }
  return res.json();
}

export async function fetchBorrowerInvitationPreview(invitationId: string): Promise<{
  success: boolean;
  data: { inviteKind: "email" | "open_link"; expiresAt: string };
}> {
  const q = new URLSearchParams({ invitationId });
  const res = await fetch(`${BASE}/company-members/invitation-preview?${q}`, {
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "Invalid or expired invitation");
  }
  return json;
}

export async function bindOpenCompanyInvitation(invitationId: string): Promise<void> {
  const res = await fetch(BASE + "/company-members/bind-open-invitation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ invitationId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Could not link invitation to your account");
  }
}

export async function createOpenCompanyInvitation(
  role: "member" | "admin" = "member"
): Promise<{
  invitationId: string;
  expiresAt: string;
}> {
  const res = await fetch(BASE + "/company-members/open-invitation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "Failed to create shareable invite");
  }
  return json.data;
}

export async function leaveCompanyOrganization(organizationId: string): Promise<void> {
  const res = await fetch(BASE + "/company-members/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ organizationId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to leave company");
  }
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
