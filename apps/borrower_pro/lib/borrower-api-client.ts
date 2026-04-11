/**
 * API client for borrower self-service endpoints (proxied to backend_pro).
 */

import type {
  BorrowerDetail,
  BorrowerDocument,
  BorrowerDirector,
  UpdateBorrowerPayload,
  TruestackKycSessionRow,
  TruestackKycStatusData,
} from "@kredit/borrower";

export type {
  BorrowerDetail,
  BorrowerDocument,
  BorrowerDirector,
  UpdateBorrowerPayload,
  TruestackKycSessionRow,
  TruestackKycStatusData,
} from "@kredit/borrower";

const BASE = "/api/proxy/borrower-auth";

export async function fetchBorrower(): Promise<{
  success: boolean;
  data: BorrowerDetail;
}> {
  const res = await fetch(BASE + "/borrower", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to fetch borrower");
  }
  return res.json();
}

export async function updateBorrower(
  payload: UpdateBorrowerPayload
): Promise<{ success: boolean; data: BorrowerDetail }> {
  const res = await fetch(BASE + "/borrower", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to update borrower");
  }
  return res.json();
}

export async function fetchBorrowerDocuments(): Promise<{
  success: boolean;
  data: BorrowerDocument[];
}> {
  const res = await fetch(BASE + "/borrower/documents", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to fetch documents");
  }
  return res.json();
}

export async function uploadBorrowerDocument(
  formData: FormData
): Promise<{ success: boolean; data: BorrowerDocument }> {
  const res = await fetch(BASE + "/borrower/documents", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to upload document");
  }
  return res.json();
}

export async function startTruestackKycSession(body?: {
  directorId?: string;
}): Promise<{
  success: boolean;
  data: {
    externalSessionId: string;
    onboardingUrl: string;
    status: string;
    expiresAt: string | null;
    directorId?: string;
  };
}> {
  const res = await fetch(BASE + "/kyc/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: {
      externalSessionId: string;
      onboardingUrl: string;
      status: string;
      expiresAt: string | null;
      directorId?: string;
    };
  };
  if (!res.ok) {
    throw new Error(json?.error || "Failed to start KYC session");
  }
  if (!json.success || !json.data) {
    throw new Error(json?.error || "Invalid KYC start response");
  }
  return { success: true, data: json.data };
}

export async function getTruestackKycStatus(): Promise<{
  success: boolean;
  data: TruestackKycStatusData;
}> {
  const res = await fetch(BASE + "/kyc/status", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || "Failed to fetch KYC status");
  }
  return res.json() as Promise<{ success: boolean; data: TruestackKycStatusData }>;
}

/**
 * Fetches KYC status and pulls the latest state from TrueStack for in-flight sessions
 * (same behavior as TruestackKycCard initial load), so callers like before-payout gates
 * see current completion without waiting for a manual sync.
 */
export async function getTruestackKycStatusWithActiveSessionSync(): Promise<{
  success: boolean;
  data: TruestackKycStatusData;
}> {
  const kRes = await getTruestackKycStatus();
  if (!kRes.success) return kRes;
  let effectiveSessions = kRes.data.sessions;
  const toRefresh = kRes.data.sessions.filter(
    (s) =>
      Boolean(s.externalSessionId?.trim()) &&
      s.status !== "completed" &&
      s.status !== "expired" &&
      s.status !== "failed"
  );
  const seen = new Set<string>();
  for (const s of toRefresh) {
    const sid = s.externalSessionId!.trim();
    if (seen.has(sid)) continue;
    seen.add(sid);
    try {
      await refreshTruestackKycSession(sid);
    } catch {
      /* ignore per-session provider errors */
    }
  }
  if (seen.size > 0) {
    const k2 = await getTruestackKycStatus();
    if (k2.success) {
      effectiveSessions = k2.data.sessions;
    }
  }
  return { success: true, data: { ...kRes.data, sessions: effectiveSessions } };
}

export async function refreshTruestackKycSession(
  externalSessionId: string
): Promise<{ success: boolean; data: Record<string, unknown> }> {
  const res = await fetch(BASE + "/kyc/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ externalSessionId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: Record<string, unknown>;
  };
  if (!res.ok) {
    throw new Error(json?.error || "Failed to refresh KYC session");
  }
  if (!json.success || !json.data) {
    throw new Error(json?.error || "Invalid KYC refresh response");
  }
  return { success: true, data: json.data };
}

export async function deleteBorrowerDocument(
  documentId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(BASE + "/borrower/documents/" + documentId, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Failed to delete document");
  }
  return res.json();
}
