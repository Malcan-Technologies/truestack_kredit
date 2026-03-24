/**
 * Borrower-scoped loan application API (proxied to backend_pro /api/borrower-auth).
 */

import type {
  BorrowerProduct,
  LoanPreviewData,
  LoanApplicationDetail,
  ApplicationDocumentRow,
} from "./application-form-types";

const BASE = "/api/proxy/borrower-auth";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || "Invalid response");
  }
}

export async function fetchBorrowerProducts(): Promise<{
  success: boolean;
  data: BorrowerProduct[];
}> {
  const res = await fetch(`${BASE}/products`, { credentials: "include" });
  const json = await parseJson<{ success: boolean; data?: BorrowerProduct[]; error?: string }>(
    res
  );
  if (!res.ok) {
    throw new Error(json.error || "Failed to load products");
  }
  return { success: true, data: json.data ?? [] };
}

export async function previewBorrowerApplication(body: {
  productId: string;
  amount: number;
  term: number;
}): Promise<{ success: boolean; data: LoanPreviewData }> {
  const res = await fetch(`${BASE}/applications/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await parseJson<{ success: boolean; data?: LoanPreviewData; error?: string }>(
    res
  );
  if (!res.ok) {
    throw new Error(json.error || "Preview failed");
  }
  return json as { success: boolean; data: LoanPreviewData };
}

export async function createBorrowerApplication(body: {
  productId: string;
  amount: number;
  term: number;
  notes?: string;
  collateralType?: string;
  collateralValue?: number;
}): Promise<{ success: boolean; data: LoanApplicationDetail }> {
  const res = await fetch(`${BASE}/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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

export async function updateBorrowerApplication(
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
  const res = await fetch(`${BASE}/applications/${encodeURIComponent(applicationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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

export async function getBorrowerApplication(
  applicationId: string
): Promise<{ success: boolean; data: LoanApplicationDetail }> {
  const res = await fetch(
    `${BASE}/applications/${encodeURIComponent(applicationId)}`,
    { credentials: "include" }
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

export async function listBorrowerApplications(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  success: boolean;
  data: LoanApplicationDetail[];
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
}> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const q = search.toString();
  const res = await fetch(`${BASE}/applications${q ? `?${q}` : ""}`, {
    credentials: "include",
  });
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

export async function submitBorrowerApplication(
  applicationId: string
): Promise<{ success: boolean; data: { id: string; status: string } }> {
  const res = await fetch(
    `${BASE}/applications/${encodeURIComponent(applicationId)}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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

export async function uploadApplicationDocument(
  applicationId: string,
  formData: FormData
): Promise<{ success: boolean; data: ApplicationDocumentRow }> {
  const res = await fetch(
    `${BASE}/applications/${encodeURIComponent(applicationId)}/documents`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    }
  );
  const json = await parseJson<{
    success: boolean;
    data?: ApplicationDocumentRow;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Upload failed");
  }
  return json as { success: boolean; data: ApplicationDocumentRow };
}

export async function deleteApplicationDocument(
  applicationId: string,
  documentId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${BASE}/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE", credentials: "include" }
  );
  const json = await parseJson<{ success: boolean; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Delete failed");
  }
  return json;
}
