/**
 * Borrower-scoped loan center API (proxied to backend_pro /api/borrower-auth).
 */

import type {
  BorrowerLoanDetail,
  BorrowerLoanListItem,
  BorrowerLoanMetrics,
  BorrowerLoanTimelineEvent,
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

export async function postAttestationVideoComplete(
  loanId: string,
  body: { watchedPercent: number }
): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/video-complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }
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

/** Full attestation reset while still on scheduling (MEETING_REQUESTED, before proposing a slot). */
export async function postAttestationRestart(loanId: string): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/attestation/restart`, {
    method: "POST",
    credentials: "include",
  });
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not restart attestation");
  }
  return { success: true, data: json.data };
}

export async function getAttestationAvailability(loanId: string): Promise<{
  success: boolean;
  data: { slots: Array<{ startAt: string; endAt: string }>; source: string };
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/availability`,
    { credentials: "include" }
  );
  const json = await parseJson<{
    success: boolean;
    data?: { slots: Array<{ startAt: string; endAt: string }>; source: string };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not load availability");
  }
  return { success: true, data: json.data! };
}

export async function postAttestationProposeSlot(
  loanId: string,
  body: { startAt: string }
): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/propose-slot`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not propose slot");
  }
  return { success: true, data: json.data };
}

export async function postAttestationAcceptCounter(loanId: string): Promise<{
  success: boolean;
  data: { loan: unknown; meetLink: string };
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/accept-counter`,
    { method: "POST", credentials: "include" }
  );
  const json = await parseJson<{
    success: boolean;
    data?: { loan: unknown; meetLink: string };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not accept");
  }
  return { success: true, data: json.data! };
}

export async function postAttestationDeclineCounter(loanId: string): Promise<{
  success: boolean;
  data: unknown;
}> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/decline-counter`,
    { method: "POST", credentials: "include" }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not decline");
  }
  return { success: true, data: json.data };
}

export async function postAttestationCancelLoan(
  loanId: string,
  body: { reason: "WITHDRAWN" | "REJECTED_AFTER_ATTESTATION" }
): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(
    `${BASE}/loans/${encodeURIComponent(loanId)}/attestation/cancel-loan`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }
  );
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not cancel loan");
  }
  return { success: true, data: json.data };
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
  file: File,
  agreementDate: string
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
  fd.append("agreementDate", agreementDate);
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

export type BorrowerLenderInfo = {
  name: string;
  lenderBankCode?: string | null;
  lenderBankOtherName?: string | null;
  lenderAccountHolderName?: string | null;
  lenderAccountNumber?: string | null;
};

export async function fetchBorrowerLender(): Promise<BorrowerLenderInfo> {
  const res = await fetch(`${BASE}/lender`, { credentials: "include" });
  const json = await parseJson<{ success: boolean; data?: BorrowerLenderInfo; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load lender details");
  }
  if (!json.data) {
    throw new Error("No lender data");
  }
  return json.data;
}

export async function createBorrowerManualPaymentRequest(
  loanId: string,
  formData: FormData
): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/manual-payment-requests`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not submit payment");
  }
  return { success: true, data: json.data ?? json };
}

export type EarlySettlementQuoteData = {
  eligible: boolean;
  reason?: string;
  lockInEndDate?: string | null;
  remainingPrincipal?: number;
  remainingInterest?: number;
  remainingFutureInterest?: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  outstandingLateFees?: number;
  totalWithoutLateFees?: number;
  totalSettlement?: number;
  totalSavings?: number;
  unpaidInstallments?: number;
};

export async function getBorrowerEarlySettlementQuote(loanId: string): Promise<{
  success: boolean;
  data: EarlySettlementQuoteData;
}> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/early-settlement/quote`, {
    credentials: "include",
  });
  const json = await parseJson<{ success: boolean; data?: EarlySettlementQuoteData; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load settlement quote");
  }
  if (!json.data) {
    throw new Error("No quote data");
  }
  return { success: true, data: json.data };
}

export async function createBorrowerEarlySettlementRequest(
  loanId: string,
  body: { borrowerNote?: string; reference?: string }
): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/early-settlement/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Could not submit early settlement request");
  }
  return { success: true, data: json.data ?? json };
}

export async function listBorrowerEarlySettlementRequests(loanId: string): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    status: string;
    borrowerNote?: string | null;
    reference?: string | null;
    rejectionReason?: string | null;
    createdAt: string;
    snapshotTotalSettlement?: unknown;
    paymentTransaction?: { id: string; receiptNumber?: string | null } | null;
  }>;
}> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/early-settlement/requests`, {
    credentials: "include",
  });
  const json = await parseJson<{
    success: boolean;
    data?: Array<{
      id: string;
      status: string;
      borrowerNote?: string | null;
      reference?: string | null;
      rejectionReason?: string | null;
      createdAt: string;
      snapshotTotalSettlement?: unknown;
      paymentTransaction?: { id: string; receiptNumber?: string | null } | null;
    }>;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load early settlement requests");
  }
  return { success: true, data: json.data ?? [] };
}

export async function listBorrowerManualPaymentRequests(loanId: string): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    status: string;
    amount: unknown;
    reference: string;
    createdAt: string;
  }>;
}> {
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/manual-payment-requests`, {
    credentials: "include",
  });
  const json = await parseJson<{
    success: boolean;
    data?: Array<{
      id: string;
      status: string;
      amount: unknown;
      reference: string;
      createdAt: string;
    }>;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load payment requests");
  }
  return { success: true, data: json.data ?? [] };
}

export async function getBorrowerLoanTimeline(
  loanId: string,
  params?: { cursor?: string; limit?: number }
): Promise<{
  success: boolean;
  data: BorrowerLoanTimelineEvent[];
  pagination?: { hasMore: boolean; nextCursor: string | null };
}> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  const res = await fetch(`${BASE}/loans/${encodeURIComponent(loanId)}/timeline${query ? `?${query}` : ""}`, {
    credentials: "include",
  });
  const json = await parseJson<{
    success: boolean;
    data?: BorrowerLoanTimelineEvent[];
    pagination?: { hasMore: boolean; nextCursor: string | null };
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Failed to load timeline");
  }
  return {
    success: true,
    data: json.data ?? [],
    pagination: json.pagination,
  };
}

export function borrowerDisbursementProofUrl(loanId: string): string {
  return `${BASE}/loans/${encodeURIComponent(loanId)}/disbursement-proof`;
}

export function borrowerStampCertificateUrl(loanId: string): string {
  return `${BASE}/loans/${encodeURIComponent(loanId)}/stamp-certificate`;
}

export function borrowerTransactionReceiptUrl(transactionId: string): string {
  return `${BASE}/schedules/transactions/${encodeURIComponent(transactionId)}/receipt`;
}

export function borrowerTransactionProofUrl(transactionId: string): string {
  return `${BASE}/schedules/transactions/${encodeURIComponent(transactionId)}/proof`;
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
