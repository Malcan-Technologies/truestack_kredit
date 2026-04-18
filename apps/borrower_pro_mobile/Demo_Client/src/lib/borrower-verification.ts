import type {
  BorrowerDetail,
  BorrowerDirector,
  TruestackKycSessionRow,
  TruestackKycStatusData,
} from '@kredit/borrower';

export function getCorporateDirectorsForKyc(
  directors: BorrowerDirector[] | undefined | null,
): BorrowerDirector[] {
  const list = directors ?? [];
  const marked = list.filter((director) => director.isAuthorizedRepresentative === true);
  if (marked.length > 0) {
    return marked;
  }

  return list.length > 0 ? [list[0]] : [];
}

export function isIndividualIdentityLocked(
  borrower: Pick<
    BorrowerDetail,
    | 'borrowerType'
    | 'documentVerified'
    | 'verificationStatus'
    | 'trueIdentityStatus'
    | 'trueIdentityResult'
  >,
): boolean {
  if (borrower.borrowerType !== 'INDIVIDUAL') {
    return false;
  }

  if (borrower.verificationStatus === 'FULLY_VERIFIED') {
    return true;
  }

  return (
    (borrower.trueIdentityStatus === 'completed' && borrower.trueIdentityResult === 'approved') ||
    borrower.documentVerified === true
  );
}

export function isSessionApproved(
  session: Pick<TruestackKycSessionRow, 'status' | 'result'> | null | undefined,
): boolean {
  return session?.status === 'completed' && session.result === 'approved';
}

export function pickLatestKycSession<T extends Pick<TruestackKycSessionRow, 'createdAt' | 'updatedAt'>>(
  sessions: T[],
): T | undefined {
  if (sessions.length === 0) {
    return undefined;
  }

  return [...sessions].sort((left, right) => {
    const leftKey = left.createdAt ?? left.updatedAt ?? '';
    const rightKey = right.createdAt ?? right.updatedAt ?? '';
    return rightKey.localeCompare(leftKey);
  })[0];
}

/**
 * Mirror of `apps/borrower_pro/lib/borrower-verification.ts#isBorrowerKycComplete`.
 * Used by loan center logic to decide whether the borrower needs to finish e-KYC before
 * disbursement.
 */
export function isBorrowerKycComplete(
  borrower: Pick<
    BorrowerDetail,
    | 'borrowerType'
    | 'documentVerified'
    | 'verificationStatus'
    | 'trueIdentityStatus'
    | 'trueIdentityResult'
    | 'directors'
  >,
  kycStatus?: Pick<TruestackKycStatusData, 'sessions'> | null,
): boolean {
  const sessions = kycStatus?.sessions ?? [];

  if (borrower.borrowerType === 'INDIVIDUAL') {
    if (isIndividualIdentityLocked(borrower)) return true;
    const latestIndividualSession = pickLatestKycSession(sessions.filter((s) => !s.directorId));
    return isSessionApproved(latestIndividualSession);
  }

  if (borrower.verificationStatus === 'FULLY_VERIFIED') return true;
  const kycDirectors = getCorporateDirectorsForKyc(borrower.directors);
  if (kycDirectors.length === 0) return false;

  return kycDirectors.every((director) => {
    const latestDirectorSession = pickLatestKycSession(
      sessions.filter((s) => s.directorId === director.id),
    );
    return isSessionApproved(latestDirectorSession);
  });
}
