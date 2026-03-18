import { cookies } from "next/headers";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3006";

export interface BorrowerMeResponse {
  success: boolean;
  data: {
    user: { id: string; email: string; name: string | null };
    profileCount: number;
    profiles: unknown[];
    activeBorrower: unknown | null;
    activeBorrowerId: string | null;
  };
}

export async function fetchBorrowerMeServer(): Promise<BorrowerMeResponse | null> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  try {
    const res = await fetch(`${BASE}/api/proxy/borrower-auth/me`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
