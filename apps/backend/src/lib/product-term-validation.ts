import { BadRequestError } from './errors.js';

export function parseAllowedTermsJson(raw: unknown): number[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is number => typeof x === 'number' && Number.isInteger(x));
}

type ProductTermFields = {
  minTerm: number;
  maxTerm: number;
  termInterval: number;
  allowedTerms: unknown;
};

/**
 * Validates loan term against product min/max, optional explicit `allowedTerms`,
 * or min/max stepping via `termInterval`.
 */
export function assertTermAllowedForProduct(product: ProductTermFields, term: number): void {
  if (term < product.minTerm || term > product.maxTerm) {
    throw new BadRequestError(
      `Term must be between ${product.minTerm} and ${product.maxTerm} months`
    );
  }

  const allowed = parseAllowedTermsJson(product.allowedTerms);
  if (allowed.length > 0) {
    const sorted = [...new Set(allowed)].sort((a, b) => a - b);
    if (!sorted.includes(term)) {
      throw new BadRequestError(`Term must be one of: ${sorted.join(', ')} months`);
    }
    return;
  }

  const interval = product.termInterval > 0 ? product.termInterval : 1;
  const delta = term - product.minTerm;
  if (delta % interval !== 0) {
    throw new BadRequestError(
      `Term must increase in steps of ${interval} month(s) from ${product.minTerm} (e.g. ${product.minTerm}, ${product.minTerm + interval}, … up to ${product.maxTerm})`
    );
  }
}
