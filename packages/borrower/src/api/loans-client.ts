import type {
  BorrowerLoanDetail,
  BorrowerLoanListItem,
  BorrowerLoanMetrics,
  BorrowerLoanTimelineEvent,
  LoanCenterOverview,
  RecordBorrowerPaymentBody,
  LenderBankInfo,
} from "../types/loan";
import type { LoanApplicationDetail } from "../types/application";
import type { FetchFn } from "./shared";
import { parseJson } from "./shared";

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---- URL helpers (standalone, no fetch needed) ----

export function borrowerLoanGenerateAgreementUrl(baseUrl: string, loanId: string, agreementDate?: string): string {
  const qs = agreementDate ? `?agreementDate=${encodeURIComponent(agreementDate)}` : "";
  return `${baseUrl}/loans/${encodeURIComponent(loanId)}/generate-agreement${qs}`;
}

export function borrowerLoanViewSignedAgreementUrl(baseUrl: string, loanId: string): string {
  return `${baseUrl}/loans/${encodeURIComponent(loanId)}/agreement`;
}

export function borrowerDisbursementProofUrl(baseUrl: string, loanId: string): string {
  return `${baseUrl}/loans/${encodeURIComponent(loanId)}/disbursement-proof`;
}

export function borrowerStampCertificateUrl(baseUrl: string, loanId: string): string {
  return `${baseUrl}/loans/${encodeURIComponent(loanId)}/stamp-certificate`;
}

export function borrowerTransactionReceiptUrl(baseUrl: string, transactionId: string): string {
  return `${baseUrl}/schedules/transactions/${encodeURIComponent(transactionId)}/receipt`;
}

export function borrowerTransactionProofUrl(baseUrl: string, transactionId: string): string {
  return `${baseUrl}/schedules/transactions/${encodeURIComponent(transactionId)}/proof`;
}

// ---- Factory ----

export function createLoansApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function fetchLoanCenterOverview(): Promise<{
    success: boolean;
    data: LoanCenterOverview;
  }> {
    const res = await fetchFn(`${baseUrl}/loan-center/overview`);
    const json = await parseJson<{ success: boolean; data?: LoanCenterOverview; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load overview");
    }
    return { success: true, data: json.data! };
  }

  async function listBorrowerLoans(params?: {
    tab?: "active" | "discharged" | "pending_disbursement";
    page?: number;
    pageSize?: number;
  }): Promise<{
    success: boolean;
    data: BorrowerLoanListItem[];
    pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const parts: string[] = [];
    if (params?.tab) parts.push(`tab=${encodeURIComponent(params.tab)}`);
    if (params?.page) parts.push(`page=${params.page}`);
    if (params?.pageSize) parts.push(`pageSize=${params.pageSize}`);
    const q = parts.length ? `?${parts.join("&")}` : "";
    const res = await fetchFn(`${baseUrl}/loans${q}`);
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

  async function getBorrowerLoan(loanId: string): Promise<{ success: boolean; data: BorrowerLoanDetail }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}`);
    const json = await parseJson<{ success: boolean; data?: BorrowerLoanDetail; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load loan");
    }
    return { success: true, data: json.data! };
  }

  async function getBorrowerLoanSchedule(loanId: string): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/schedule`);
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load schedule");
    }
    return { success: true, data: json.data };
  }

  async function getBorrowerLoanMetrics(loanId: string): Promise<{
    success: boolean;
    data: BorrowerLoanMetrics;
  }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/metrics`);
    const json = await parseJson<{ success: boolean; data?: BorrowerLoanMetrics; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load metrics");
    }
    return { success: true, data: json.data! };
  }

  async function listBorrowerLoanPayments(loanId: string): Promise<{ success: boolean; data: unknown[] }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/payments`);
    const json = await parseJson<{ success: boolean; data?: unknown[]; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load payments");
    }
    return { success: true, data: json.data ?? [] };
  }

  async function recordBorrowerLoanPayment(
    loanId: string,
    body: RecordBorrowerPaymentBody
  ): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": randomIdempotencyKey(),
      },
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

  async function postAttestationVideoComplete(
    loanId: string,
    body: { watchedPercent: number }
  ): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/video-complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not record video completion");
    }
    return { success: true, data: json.data };
  }

  async function postAttestationProceedToSigning(loanId: string): Promise<{
    success: boolean;
    data: unknown;
  }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/proceed-to-signing`,
      { method: "POST" }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not continue to signing");
    }
    return { success: true, data: json.data };
  }

  async function postAttestationRequestMeeting(loanId: string): Promise<{
    success: boolean;
    data: unknown;
  }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/request-meeting`,
      { method: "POST" }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not request meeting");
    }
    return { success: true, data: json.data };
  }

  async function postAttestationRestart(loanId: string): Promise<{
    success: boolean;
    data: unknown;
  }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/restart`, {
      method: "POST",
    });
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not restart attestation");
    }
    return { success: true, data: json.data };
  }

  async function getAttestationAvailability(loanId: string): Promise<{
    success: boolean;
    data: { slots: Array<{ startAt: string; endAt: string }>; source: string };
  }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/availability`
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

  async function postAttestationProposeSlot(
    loanId: string,
    body: { startAt: string }
  ): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/propose-slot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not propose slot");
    }
    return { success: true, data: json.data };
  }

  async function postAttestationAcceptCounter(loanId: string): Promise<{
    success: boolean;
    data: { loan: unknown; meetLink: string };
  }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/accept-counter`,
      { method: "POST" }
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

  async function postAttestationDeclineCounter(loanId: string): Promise<{
    success: boolean;
    data: unknown;
  }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/decline-counter`,
      { method: "POST" }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not decline");
    }
    return { success: true, data: json.data };
  }

  async function postAttestationCancelLoan(
    loanId: string,
    body: { reason: "WITHDRAWN" | "REJECTED_AFTER_ATTESTATION" }
  ): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/cancel-loan`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not cancel loan");
    }
    return { success: true, data: json.data };
  }

  async function postAttestationCompleteMeeting(loanId: string): Promise<{
    success: boolean;
    data: unknown;
  }> {
    const res = await fetchFn(
      `${baseUrl}/loans/${encodeURIComponent(loanId)}/attestation/complete-meeting`,
      { method: "POST" }
    );
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not complete meeting");
    }
    return { success: true, data: json.data };
  }

  async function uploadBorrowerSignedAgreement(
    loanId: string,
    file: Blob,
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
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/agreement`, {
      method: "POST",
      body: fd,
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

  async function createBorrowerManualPaymentRequest(
    loanId: string,
    formData: FormData
  ): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/manual-payment-requests`, {
      method: "POST",
      body: formData,
    });
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Could not submit payment");
    }
    return { success: true, data: json.data ?? json };
  }

  async function listBorrowerManualPaymentRequests(loanId: string): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      status: string;
      amount: unknown;
      reference: string;
      createdAt: string;
    }>;
  }> {
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/manual-payment-requests`);
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

  async function getBorrowerLoanTimeline(
    loanId: string,
    params?: { cursor?: string; limit?: number }
  ): Promise<{
    success: boolean;
    data: BorrowerLoanTimelineEvent[];
    pagination?: { hasMore: boolean; nextCursor: string | null };
  }> {
    const parts: string[] = [];
    if (params?.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
    if (params?.limit) parts.push(`limit=${params.limit}`);
    const query = parts.length ? `?${parts.join("&")}` : "";
    const res = await fetchFn(`${baseUrl}/loans/${encodeURIComponent(loanId)}/timeline${query}`);
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

  async function getBorrowerApplicationTimeline(
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
    const parts: string[] = [];
    if (params?.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
    if (params?.limit) parts.push(`limit=${params.limit}`);
    const q = parts.length ? `?${parts.join("&")}` : "";
    const res = await fetchFn(
      `${baseUrl}/applications/${encodeURIComponent(applicationId)}/timeline${q}`
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

  async function withdrawBorrowerApplication(applicationId: string): Promise<{
    success: boolean;
    data: LoanApplicationDetail;
  }> {
    const res = await fetchFn(
      `${baseUrl}/applications/${encodeURIComponent(applicationId)}/withdraw`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const json = await parseJson<{ success: boolean; data?: LoanApplicationDetail; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Withdraw failed");
    }
    return { success: true, data: json.data! };
  }

  async function fetchBorrowerLender(): Promise<LenderBankInfo> {
    const res = await fetchFn(`${baseUrl}/lender`);
    const json = await parseJson<{ success: boolean; data?: LenderBankInfo; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load lender details");
    }
    if (!json.data) {
      throw new Error("No lender data");
    }
    return json.data;
  }

  return {
    fetchLoanCenterOverview,
    listBorrowerLoans,
    getBorrowerLoan,
    getBorrowerLoanSchedule,
    getBorrowerLoanMetrics,
    listBorrowerLoanPayments,
    recordBorrowerLoanPayment,
    postAttestationVideoComplete,
    postAttestationProceedToSigning,
    postAttestationRequestMeeting,
    postAttestationRestart,
    getAttestationAvailability,
    postAttestationProposeSlot,
    postAttestationAcceptCounter,
    postAttestationDeclineCounter,
    postAttestationCancelLoan,
    postAttestationCompleteMeeting,
    uploadBorrowerSignedAgreement,
    createBorrowerManualPaymentRequest,
    listBorrowerManualPaymentRequests,
    getBorrowerLoanTimeline,
    getBorrowerApplicationTimeline,
    withdrawBorrowerApplication,
    fetchBorrowerLender,
  };
}
