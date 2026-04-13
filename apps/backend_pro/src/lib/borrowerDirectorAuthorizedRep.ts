import { BadRequestError } from './errors.js';

/**
 * Ensures exactly one corporate director is the authorized representative (KYC + agreement signatory).
 * If none marked, defaults to index 0.
 */
export function normalizeCorporateDirectorFlags<T extends { isAuthorizedRepresentative?: boolean }>(
  directors: T[],
): (T & { isAuthorizedRepresentative: boolean })[] {
  if (directors.length === 0) {
    return [];
  }
  const trueIndices = directors
    .map((d, i) => (d.isAuthorizedRepresentative === true ? i : -1))
    .filter((i) => i >= 0);
  if (trueIndices.length > 1) {
    throw new BadRequestError('Exactly one director must be the authorized representative');
  }
  const repIndex = trueIndices.length === 1 ? trueIndices[0]! : 0;
  return directors.map((d, i) => ({
    ...d,
    isAuthorizedRepresentative: i === repIndex,
  })) as (T & { isAuthorizedRepresentative: boolean })[];
}
