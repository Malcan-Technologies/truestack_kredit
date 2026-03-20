import type { BorrowerDetail, TruestackKycSessionRow } from "./borrower-api-client";

/** Matches backend `isIndividualIdentityLocked` (cached verificationStatus or derived). */
export function isIndividualIdentityLocked(borrower: {
  borrowerType: string;
  verificationStatus?: string | null;
  documentVerified: boolean;
  trueIdentityStatus?: string | null;
  trueIdentityResult?: string | null;
}): boolean {
  if (borrower.borrowerType !== "INDIVIDUAL") return false;
  if (borrower.verificationStatus?.trim() === "FULLY_VERIFIED") return true;
  const tiOk =
    borrower.trueIdentityStatus === "completed" &&
    borrower.trueIdentityResult === "approved";
  return tiOk || borrower.documentVerified;
}

export function isCorporateIdentityDocumentLocked(
  borrower: Pick<BorrowerDetail, "borrowerType" | "verificationStatus">,
  sessions: TruestackKycSessionRow[]
): boolean {
  if (borrower.borrowerType !== "CORPORATE") return false;
  if (borrower.verificationStatus === "FULLY_VERIFIED") return true;
  return sessions.some(
    (s) =>
      Boolean(s.directorId) &&
      s.status === "completed" &&
      s.result === "approved"
  );
}

const INDIVIDUAL_LOCKED_CATEGORIES = new Set([
  "IC_FRONT",
  "IC_BACK",
  "SELFIE_LIVENESS",
  "PASSPORT",
]);

const CORPORATE_LOCKED_CATEGORIES = new Set([
  "DIRECTOR_IC_FRONT",
  "DIRECTOR_IC_BACK",
  "SELFIE_LIVENESS",
]);

export function isIdentityDocumentCategoryLocked(
  borrowerType: "INDIVIDUAL" | "CORPORATE",
  category: string,
  individualLocked: boolean,
  corporateLocked: boolean
): boolean {
  if (borrowerType === "INDIVIDUAL") {
    return individualLocked && INDIVIDUAL_LOCKED_CATEGORIES.has(category);
  }
  return corporateLocked && CORPORATE_LOCKED_CATEGORIES.has(category);
}
