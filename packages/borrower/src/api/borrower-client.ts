import type {
  BorrowerDetail,
  BorrowerDocument,
  UpdateBorrowerPayload,
  TruestackKycSessionRow,
  TruestackKycStatusData,
} from "../types/borrower";
import type { FetchFn } from "./shared";
import { parseJson } from "./shared";

export function createBorrowerApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function fetchBorrower(): Promise<{
    success: boolean;
    data: BorrowerDetail;
  }> {
    const res = await fetchFn(baseUrl + "/borrower");
    const json = await parseJson<{ success: boolean; data: BorrowerDetail; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to fetch borrower");
    }
    return { success: json.success, data: json.data };
  }

  async function updateBorrower(
    payload: UpdateBorrowerPayload
  ): Promise<{ success: boolean; data: BorrowerDetail }> {
    const res = await fetchFn(baseUrl + "/borrower", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJson<{ success: boolean; data: BorrowerDetail; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to update borrower");
    }
    return { success: json.success, data: json.data };
  }

  async function fetchBorrowerDocuments(): Promise<{
    success: boolean;
    data: BorrowerDocument[];
  }> {
    const res = await fetchFn(baseUrl + "/borrower/documents");
    const json = await parseJson<{ success: boolean; data: BorrowerDocument[]; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to fetch documents");
    }
    return { success: json.success, data: json.data };
  }

  async function uploadBorrowerDocument(
    formData: FormData
  ): Promise<{ success: boolean; data: BorrowerDocument }> {
    const res = await fetchFn(baseUrl + "/borrower/documents", {
      method: "POST",
      body: formData,
    });
    const json = await parseJson<{ success: boolean; data: BorrowerDocument; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to upload document");
    }
    return { success: json.success, data: json.data };
  }

  async function deleteBorrowerDocument(
    documentId: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetchFn(baseUrl + "/borrower/documents/" + documentId, {
      method: "DELETE",
    });
    const json = await parseJson<{ success: boolean; message: string; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to delete document");
    }
    return { success: json.success, message: json.message };
  }

  async function startTruestackKycSession(body?: {
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
    const res = await fetchFn(baseUrl + "/kyc/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  async function getTruestackKycStatus(): Promise<{
    success: boolean;
    data: TruestackKycStatusData;
  }> {
    const res = await fetchFn(baseUrl + "/kyc/status");
    const json = await parseJson<{ success: boolean; data: TruestackKycStatusData; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to fetch KYC status");
    }
    return { success: json.success, data: json.data };
  }

  async function refreshTruestackKycSession(
    externalSessionId: string
  ): Promise<{ success: boolean; data: Record<string, unknown> }> {
    const res = await fetchFn(baseUrl + "/kyc/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  return {
    fetchBorrower,
    updateBorrower,
    fetchBorrowerDocuments,
    uploadBorrowerDocument,
    deleteBorrowerDocument,
    startTruestackKycSession,
    getTruestackKycStatus,
    refreshTruestackKycSession,
  };
}
