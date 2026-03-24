/**
 * Borrower-scoped loan center API (proxied to backend_pro /api/borrower-auth).
 */

import type {
  BorrowerLoanDetail,
  BorrowerLoanListItem,
  BorrowerLoanMetrics,
  LoanCenterOverview,
  RecordBorrowerPaymentBody,
} from "./borrower-loan-types";
import type { LoanApplicationDetail } from "./application-form-types";

const BASE = "/api/proxy/borrower-auth";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || "Invalid response");
  }
}

export async function fetchLoanCenterOverview(): Promise<{
  success: boolean;
  data: LoanCenterOverview;
}> {
  const res = await fetch(`${BASE}/loan-center/overview`, { credentials: "include" });
  const json = await parseJson<{ success: boolean; data?: LoanCenterOverview; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load overview");
  }
  return { success: true, data: json.data! };
}

export async function listBorrowerLoans(params?: {
  tab?: "active" | "discharged" | "pending_disbursement";
  page?: number;
  pageSize?: number;
}): Promise<{
  success: boolean;
  data: BorrowerLoanListItem[];
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
}> {
  const search = new URLSearchParams();
  if (params?.tab) search.set("tab", params.tab);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const q = search.toString();
  const res = await fetch(`${BASE}/loans${q ? `?${q}` : ""}`, { credentials: "include" });
  const json = await parseJson<{
    success: boolean;
    data?: BorrowerLoanListItem[];
    pagination?: { total: number; page: number; pageSize: number; totalPages: number };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to list loans");
  }
  return {
    success: true,
    data: json.data ?? [],
    pagination: json.pagination,
  };
}

export async function getBorrowerLoan(loanId: string): Promise<{ success: boolean; data: BorrowerLoanDetail }> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}`, { credentials: "include" });
  const json = await parseJson<{ success: boolean; data?: BorrowerLoanDetail; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load loan");
  }
  return { success: true, data: json.data! };
}

/** Opens in new tab — borrower must be logged in (cookies). */
export function borrowerLoanGenerateAgreementUrl(loanId: string, agreementDate?: string): string {
  const q = new URLSearchParams();
  if (agreementDate) q.set("agreementDate", agreementDate);
  const qs = q.toString();
  return `${BASE}/loans/${encodeURIComponent(loanId)}/generate-agreement${qs ? `?${qs}` : ""}`;
}

export function borrowerLoanViewSignedAgreementUrl(loanId: string): string {
  return `${BASE}/loans/${encodeURIComponent(loanId)}/agreement`;
}

export async function postAttestationVideoComplete(loanId: string): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/video-complete`,
    { method: "POST", credentials: "include" }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not record video completion");
  }
  return { success: true, data: json.data };
}

export async function postAttestationProceedToSigning(loanId: string): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/proceed-to-signing`,
    { method: "POST", credentials: "include" }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not continue to signing");
  }
  return { success: true, data: json.data };
}

export async function postAttestationRequestMeeting(loanId: string): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/request-meeting`,
    { method: "POST", credentials: "include" }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not request meeting");
  }
  return { success: true, data: json.data };
}

export async function postAttestationScheduleMeeting(
  loanId: string,
  body: { startAt: string; endAt?: string }
): Promise<{
  success: boolean;
  data: { loan: unknown; meetLink: string; htmlLink: string; startAt: string; endAt: string };
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/schedule-meeting`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }
  );
  const json = await parseJson<{
    success: boolean;
    data?: { loan: unknown; meetLink: string; htmlLink: string; startAt: string; endAt: string };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not schedule meeting");
  }
  return { success: true, data: json.data! };
}

export async function postAttestationCompleteMeeting(loanId: string): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/complete-meeting`,
    { method: "POST", credentials: "include" }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not complete meeting");
  }
  return { success: true, data: json.data };
}

export async function uploadBorrowerSignedAgreement(
  loanId: string,
  file: File
): Promise<{
  success: boolean;
  data: {
    agreementOriginalName: string | null;
    agreementVersion: number;
    agreementUploadedAt: string | null;
    signedAgreementReviewStatus: string;
  };
}> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/agreement`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const json = await parseJson<{
    success: boolean;
    data?: {
      agreementOriginalName: string | null;
      agreementVersion: number;
      agreementUploadedAt: string | null;
      signedAgreementReviewStatus: string;
    };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Upload failed");
  }
  return { success: true, data: json.data! };
}

export async function getBorrowerLoanSchedule(loanId: string): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/schedule`, {
    credentials: "include",
  });
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load schedule");
  }
  return { success: true, data: json.data };
}

export async function getBorrowerLoanMetrics(loanId: string): Promise<{
  success: boolean;
  data: BorrowerLoanMetrics;
}> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/metrics`, {
    credentials: "include",
  });
  const json = await parseJson<{ success: boolean; data?: BorrowerLoanMetrics; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load metrics");
  }
  return { success: true, data: json.data! };
}

export async function listBorrowerLoanPayments(loanId: string): Promise<{ success: boolean; data: unknown[] }> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/payments`, {
    credentials: "include",
  });
  const json = await parseJson<{ success: boolean; data?: unknown[]; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load payments");
  }
  return { success: true, data: json.data ?? [] };
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function recordBorrowerLoanPayment(
  loanId: string,
  body: RecordBorrowerPaymentBody
): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": randomIdempotencyKey(),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await parseJson<{
    success: boolean;
    data?: unknown;
    emailSent?: boolean;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Payment failed");
  }
  return { success: true, data: json.data ?? json };
}

export async function withdrawBorrowerApplication(applicationId: string): Promise<{
  success: boolean;
  data: LoanApplicationDetail;
}> {
  const res = await fetch(
    `${BASE}/applications/${encodeURIComponent(applicationId)}/withdraw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    }
  );
  const json = await parseJson<{ success: boolean; data?: LoanApplicationDetail; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Withdraw failed");
  }
  return { success: true, data: json.data! };
}

export async function getBorrowerApplicationTimeline(
  applicationId: string,
  params?: { cursor?: string; limit?: number }
): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    action: string;
    previousData: unknown;
    newData: unknown;
    createdAt: string;
    user: { id: string; email: string; name: string | null } | null;
  }>;
  pagination: { hasMore: boolean; nextCursor: string | null };
}> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  const q = search.toString();
  const res = await fetch(
    `${BASE}/applications/${encodeURIComponent(applicationId)}/timeline${q ? `?${q}` : ""}`,
    { credentials: "include" }
  );
  const json = await parseJson<{
    success: boolean;
    data?: unknown[];
    pagination?: { hasMore: boolean; nextCursor: string | null };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load timeline");
  }
  return {
    success: true,
    data: (json.data ?? []) as Array<{
      id: string;
      action: string;
      previousData: unknown;
      newData: unknown;
      createdAt: string;
      user: { id: string; email: string; name: string | null } | null;
    }>,
    pagination: json.pagination ?? { hasMore: false, nextCursor: null },
  };
}
