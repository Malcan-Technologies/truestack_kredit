/**
 * Client to call TrueStack Admin usage API.
 * Kredit queries verification count and usage total for billing.
 */

import { config } from '../../lib/config.js';

const ENDPOINT = '/api/internal/kredit/usage';

export interface AdminUsageResponse {
  tenant_id: string;
  client_id?: string;
  period_start: string;
  period_end: string;
  verification_count: number;
  usage_credits: number;
  usage_amount_myr: number;
}

export async function fetchAdminUsage(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<AdminUsageResponse | null> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) return null;

  const secret = config.trueIdentity.kreditInternalSecret;
  if (!secret) return null;

  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);
  const url = `${baseUrl}${ENDPOINT}?tenant_id=${encodeURIComponent(tenantId)}&period_start=${encodeURIComponent(periodStartStr)}&period_end=${encodeURIComponent(periodEndStr)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as AdminUsageResponse;
  if (typeof data.verification_count !== 'number') return null;
  return data;
}
