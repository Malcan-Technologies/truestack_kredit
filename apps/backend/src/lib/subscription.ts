/** Core = RM 499, Core+ = RM 549 (Core + TrueSend) */
export const CORE_AMOUNT_CENTS = 49900;
export const CORE_PLUS_AMOUNT_CENTS = 54900;

/**
 * Derive display plan name from tenant subscription state and TrueSend add-on.
 * Used by billing subscription API and tenant current API for consistent plan display.
 */
export function derivePlanName(
  tenant: { subscriptionStatus: string; subscriptionAmount: number | null },
  truesendActive: boolean
): "Core" | "Core+" {
  if (tenant.subscriptionStatus !== "PAID") return "Core";
  if (
    tenant.subscriptionAmount === CORE_PLUS_AMOUNT_CENTS ||
    truesendActive
  ) {
    return "Core+";
  }
  return "Core";
}
