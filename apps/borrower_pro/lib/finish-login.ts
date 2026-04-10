import {
  consumePendingAcceptInvitationPath,
  fetchBorrowerMe,
} from "@borrower_pro/lib/borrower-auth-client";

/** Same-origin safe path only (for open redirects after sign-in). */
export function normalizeAuthReturnTo(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

function isInviteRecoveryRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = new URLSearchParams(window.location.search);
    return search.get("inviteRecovery") === "1";
  } catch {
    return false;
  }
}

export async function getBorrowerPostLoginDestination(
  returnTo?: string | null
): Promise<string> {
  const fromQuery = normalizeAuthReturnTo(returnTo);
  if (fromQuery) return fromQuery;

  const pendingInvite = consumePendingAcceptInvitationPath({
    allowLocalFallback: isInviteRecoveryRequested(),
  });
  if (pendingInvite) return pendingInvite;

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
