import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

/**
 * Server-side fetch to backend for metadata generation.
 * Forwards cookies from the incoming request for tenant-scoped API calls.
 */
async function fetchWithCookies<T>(path: string): Promise<T | null> {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await fetch(`${BACKEND_URL}/api/${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? data?.data : data;
  } catch {
    return null;
  }
}

export type BorrowerForMetadata = {
  name: string;
  companyName?: string | null;
  borrowerType?: string;
};

/** Display name for metadata: company name for CORPORATE, else individual name */
export function getBorrowerDisplayName(b: BorrowerForMetadata | null | undefined): string | null {
  if (!b) return null;
  if (b.borrowerType === "CORPORATE" && b.companyName) return b.companyName;
  return b.name || null;
}

export async function getBorrowerForMetadata(id: string): Promise<BorrowerForMetadata | null> {
  const data = await fetchWithCookies<BorrowerForMetadata>(`borrowers/${id}`);
  return data;
}

export async function getLoanForMetadata(
  loanId: string
): Promise<{ id: string; borrower?: BorrowerForMetadata } | null> {
  const data = await fetchWithCookies<{ id: string; borrower?: BorrowerForMetadata }>(`loans/${loanId}`);
  return data;
}

export async function getApplicationForMetadata(
  id: string
): Promise<{ id: string; borrower?: BorrowerForMetadata; loan?: { id: string } } | null> {
  const data = await fetchWithCookies<{
    id: string;
    borrower?: BorrowerForMetadata;
    loan?: { id: string };
  }>(`loans/applications/${id}`);
  return data;
}

export async function getProductForMetadata(id: string): Promise<{ name: string } | null> {
  const data = await fetchWithCookies<{ name: string }>(`products/${id}`);
  return data;
}
