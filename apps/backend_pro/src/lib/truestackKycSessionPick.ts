/**
 * Pick the current session for display.
 *
 * Redo / retry creates a brand new session row while older approved rows stay
 * in history. Once a new attempt exists, the UI must reflect that latest
 * attempt instead of staying stuck on the historical approved result.
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
  return [...sessions].sort((a, b) => {
    const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}
