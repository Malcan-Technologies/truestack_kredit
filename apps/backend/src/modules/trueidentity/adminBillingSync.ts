/**
 * Sync tenant billing period to admin after TrueIdentity usage.
 * Ensures admin's tenant_billing_period is updated immediately for real-time display.
 */

import { config } from '../../lib/config.js';
import { signRequestBody } from './signature.js';

const ENDPOINT = '/api/internal/kredit/sync-tenant-billing';

export async function syncTenantBillingToAdmin(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<boolean> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    console.warn('[AdminBillingSync] Admin base URL not configured, skipping sync');
    return false;
  }

  const secret = config.trueIdentity.kreditInternalSecret;
  if (!secret) {
    console.warn('[AdminBillingSync] Kredit internal secret not configured, skipping sync');
    return false;
  }

  const url = `${baseUrl}${ENDPOINT}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[AdminBillingSync] Failed to sync tenant ${tenantId}: ${res.status} ${text}`);
      return false;
    }

    const data = (await res.json()) as { verification_count?: number };
    console.log(`[AdminBillingSync] Synced tenant ${tenantId}: ${data.verification_count ?? 0} verifications`);
    return true;
  } catch (error) {
    console.error(`[AdminBillingSync] Error syncing tenant ${tenantId}:`, error);
    return false;
  }
}
