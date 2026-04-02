import { fetchBorrowerMe } from "@borrower_pro/lib/borrower-auth-client";

export async function getBorrowerPostLoginDestination(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));

    try {
      const me = await fetchBorrowerMe();
      if (me.success) {
        return me.data.profileCount > 0 ? "/dashboard" : "/onboarding";
      }
    } catch {
      // Retry until the auth cookie is visible to the borrower proxy.
    }
  }

  return "/dashboard";
}
