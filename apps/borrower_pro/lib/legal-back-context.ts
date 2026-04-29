/**
 * Remembers whether the user opened a legal page from the public site or from the signed-in app.
 * Used only for UX; the legal back link still requires a real session to point at `/dashboard`.
 */
export const LEGAL_BACK_STORAGE_KEY = "borrower_pro_legal_back_source" as const;

export type LegalBackSource = "landing" | "app";

export function setLegalBackSource(source: LegalBackSource): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LEGAL_BACK_STORAGE_KEY, source);
  } catch {
    /* quota / private mode */
  }
}

export function peekLegalBackSource(): LegalBackSource | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(LEGAL_BACK_STORAGE_KEY);
    if (v === "landing" || v === "app") return v;
  } catch {
    /* ignore */
  }
  return null;
}
