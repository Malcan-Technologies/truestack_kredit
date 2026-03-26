/**
 * TrueKredit Pro has no SaaS invoices; Admin subscription sync is not used.
 */

export async function syncSubscriptionAmountToAdmin(_tenantId: string): Promise<boolean> {
  return true;
}
