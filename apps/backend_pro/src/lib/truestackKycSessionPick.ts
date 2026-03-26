/**
 * After "Retry KYC", a new pending session is created while an older row may
 * already be completed+approved. Status APIs must not only look at the newest
 * row by createdAt — prefer any successful completion (latest by updatedAt).
 */
export type TruestackKycSessionPickable = {
  status: string;
  result: string | null;
  updatedAt: Date;
  createdAt: Date;
};

export function pickBestTruestackKycSession<T extends TruestackKycSessionPickable>(
  sessions: T[]
): T | undefined {
  if (sessions.length === 0) return undefined;
  const approved = sessions.filter((s) => s.status === 'completed' && s.result === 'approved');
  if (approved.length > 0) {
    return approved.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  }
  return [...sessions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}
