/** Legacy price constants (SaaS); retained only where referenced by stubs or docs. */
export const CORE_AMOUNT_CENTS = 49900;
export const CORE_PLUS_AMOUNT_CENTS = 54900;

/**
 * TrueKredit Pro is a single licensed product with full feature access.
 */
export function derivePlanName(
  _tenant?: { subscriptionStatus?: string; subscriptionAmount?: number | null },
  _truesendActive?: boolean
): 'Pro' {
  return 'Pro';
}
