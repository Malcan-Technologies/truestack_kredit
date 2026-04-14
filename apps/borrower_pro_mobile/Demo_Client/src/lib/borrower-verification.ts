import type { BorrowerDetail, BorrowerDirector, TruestackKycSessionRow } from '@kredit/borrower';

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
