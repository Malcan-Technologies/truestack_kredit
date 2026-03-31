import type { BorrowerDetail, TruestackKycSessionRow, TruestackKycStatusData } from "./borrower-api-client";

/**
 * Matches backend `isIndividualIdentityLocked` — fully verified individual
 * (TrueStack KYC completed+approved and/or `documentVerified`), aligned with admin.
 */
export function isIndividualIdentityLocked(borrower: {
  borrowerType: string;
  documentVerified?: boolean;
  verificationStatus?: string | null;
  trueIdentityStatus?: string | null;
  trueIdentityResult?: string | null;
}): boolean {
  if (borrower.borrowerType !== "INDIVIDUAL") return false;
  if (borrower.verificationStatus === "FULLY_VERIFIED") return true;
  const truestackApproved =
    borrower.trueIdentityStatus === "completed" &&
    borrower.trueIdentityResult === "approved";
  return truestackApproved || borrower.documentVerified === true;
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

export function isBorrowerKycComplete(
  borrower: Pick<
    BorrowerDetail,
    | "borrowerType"
    | "documentVerified"
    | "verificationStatus"
    | "trueIdentityStatus"
    | "trueIdentityResult"
    | "directors"
  >,
  kycStatus?: Pick<TruestackKycStatusData, "sessions"> | null
): boolean {
  const sessions = kycStatus?.sessions ?? [];

  if (borrower.borrowerType === "INDIVIDUAL") {
    if (isIndividualIdentityLocked(borrower)) return true;
    return sessions.some((s) => !s.directorId && s.status === "completed" && s.result === "approved");
  }

  if (borrower.verificationStatus === "FULLY_VERIFIED") return true;
  if ((borrower.directors ?? []).length === 0) return false;

  return borrower.directors.every((director) =>
    sessions.some(
      (s) =>
        s.directorId === director.id &&
        s.status === "completed" &&
        s.result === "approved"
    )
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
