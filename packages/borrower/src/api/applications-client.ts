import type {
  BorrowerProduct,
  LoanPreviewData,
  LoanApplicationDetail,
  ApplicationDocumentRow,
} from "../types/application";
import type { FetchFn } from "./shared";
import { parseJson } from "./shared";

export function createApplicationsApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function fetchBorrowerProducts(): Promise<{
    success: boolean;
    data: BorrowerProduct[];
  }> {
    const res = await fetchFn(`${baseUrl}/products`);
    const json = await parseJson<{ success: boolean; data?: BorrowerProduct[]; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load products");
    }
    return { success: true, data: json.data ?? [] };
  }

  async function previewBorrowerApplication(body: {
    productId: string;
    amount: number;
    term: number;
  }): Promise<{ success: boolean; data: LoanPreviewData }> {
    const res = await fetchFn(`${baseUrl}/applications/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await parseJson<{ success: boolean; data?: LoanPreviewData; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Preview failed");
    }
    return json as { success: boolean; data: LoanPreviewData };
  }

  async function createBorrowerApplication(body: {
    productId: string;
    amount: number;
    term: number;
    notes?: string;
    collateralType?: string;
    collateralValue?: number;
  }): Promise<{ success: boolean; data: LoanApplicationDetail }> {
    const res = await fetchFn(`${baseUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await parseJson<{
      success: boolean;
      data?: LoanApplicationDetail;
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to create application");
    }
    return json as { success: boolean; data: LoanApplicationDetail };
  }

  async function updateBorrowerApplication(
    applicationId: string,
    body: {
      productId?: string;
      amount?: number;
      term?: number;
      notes?: string | null;
      collateralType?: string | null;
      collateralValue?: number | null;
    }
  ): Promise<{ success: boolean; data: LoanApplicationDetail }> {
    const res = await fetchFn(`${baseUrl}/applications/${encodeURIComponent(applicationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await parseJson<{
      success: boolean;
      data?: LoanApplicationDetail;
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to update application");
    }
    return json as { success: boolean; data: LoanApplicationDetail };
  }

  async function getBorrowerApplication(
    applicationId: string
  ): Promise<{ success: boolean; data: LoanApplicationDetail }> {
    const res = await fetchFn(
      `${baseUrl}/applications/${encodeURIComponent(applicationId)}`
    );
    const json = await parseJson<{
      success: boolean;
      data?: LoanApplicationDetail;
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to load application");
    }
    return json as { success: boolean; data: LoanApplicationDetail };
  }

  async function listBorrowerApplications(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    success: boolean;
    data: LoanApplicationDetail[];
    pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    const parts: string[] = [];
    if (params?.status) parts.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.page) parts.push(`page=${params.page}`);
    if (params?.pageSize) parts.push(`pageSize=${params.pageSize}`);
    const q = parts.length ? `?${parts.join("&")}` : "";
    const res = await fetchFn(`${baseUrl}/applications${q}`);
    const json = await parseJson<{
      success: boolean;
      data?: LoanApplicationDetail[];
      pagination?: { total: number; page: number; pageSize: number; totalPages: number };
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to list applications");
    }
    return json as {
      success: boolean;
      data: LoanApplicationDetail[];
      pagination?: { total: number; page: number; pageSize: number; totalPages: number };
    };
  }

  async function submitBorrowerApplication(
    applicationId: string
  ): Promise<{ success: boolean; data: { id: string; status: string } }> {
    const res = await fetchFn(
      `${baseUrl}/applications/${encodeURIComponent(applicationId)}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const json = await parseJson<{
      success: boolean;
      data?: { id: string; status: string };
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Submit failed");
    }
    return json as { success: boolean; data: { id: string; status: string } };
  }

  async function uploadApplicationDocument(
    applicationId: string,
    formData: FormData
  ): Promise<{
    success: boolean;
    data: ApplicationDocumentRow;
    applicationStatus?: string;
    message?: string;
  }> {
    const res = await fetchFn(
      `${baseUrl}/applications/${encodeURIComponent(applicationId)}/documents`,
      {
        method: "POST",
        body: formData,
      }
    );
    const json = await parseJson<{
      success: boolean;
      data?: ApplicationDocumentRow;
      applicationStatus?: string;
      message?: string;
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Upload failed");
    }
    return json as {
      success: boolean;
      data: ApplicationDocumentRow;
      applicationStatus?: string;
      message?: string;
    };
  }

  async function deleteApplicationDocument(
    applicationId: string,
    documentId: string
  ): Promise<{ success: boolean }> {
    const res = await fetchFn(
      `${baseUrl}/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
    const json = await parseJson<{ success: boolean; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Delete failed");
    }
    return json;
  }

  async function postBorrowerCounterOffer(
    applicationId: string,
    body: { amount: number; term: number }
  ): Promise<{ success: boolean; data: unknown }> {
    const res = await fetchFn(`${baseUrl}/applications/${encodeURIComponent(applicationId)}/counter-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await parseJson<{ success: boolean; data?: unknown; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Counter-offer failed");
    }
    return { success: true, data: json.data ?? json };
  }

  async function postBorrowerAcceptOffer(
    applicationId: string
  ): Promise<{ success: boolean; data: LoanApplicationDetail }> {
    const res = await fetchFn(`${baseUrl}/applications/${encodeURIComponent(applicationId)}/accept-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await parseJson<{ success: boolean; data?: LoanApplicationDetail; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Accept failed");
    }
    return { success: true, data: json.data! };
  }

  async function postBorrowerRejectOffers(applicationId: string): Promise<{ success: boolean }> {
    const res = await fetchFn(`${baseUrl}/applications/${encodeURIComponent(applicationId)}/reject-offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await parseJson<{ success: boolean; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Reject failed");
    }
    return json;
  }

  return {
    fetchBorrowerProducts,
    previewBorrowerApplication,
    createBorrowerApplication,
    updateBorrowerApplication,
    getBorrowerApplication,
    listBorrowerApplications,
    submitBorrowerApplication,
    uploadApplicationDocument,
    deleteApplicationDocument,
    postBorrowerCounterOffer,
    postBorrowerAcceptOffer,
    postBorrowerRejectOffers,
  };
}
