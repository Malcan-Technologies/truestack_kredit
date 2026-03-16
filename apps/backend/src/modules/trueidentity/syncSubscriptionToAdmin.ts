/**
 * Sync subscription amount to Admin after usage or billing reconciliation.
 * Ensures Admin's tenants page displays the correct amount from Kredit.
 */

import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { refreshRenewalInvoiceCharges } from '../billing/routes.js';

const ENDPOINT = '/api/internal/kredit/sync-tenant-subscription';

export async function syncSubscriptionAmountToAdmin(tenantId: string): Promise<boolean> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    console.warn('[SyncSubscriptionToAdmin] Admin base URL not configured, skipping sync');
    return false;
  }

  const secret = config.trueIdentity.kreditInternalSecret;
  if (!secret) {
    console.warn('[SyncSubscriptionToAdmin] Kredit internal secret not configured, skipping sync');
    return false;
  }

  const unpaidInvoice = await prisma.invoice.findFirst({
    where: {
      tenantId,
      billingType: 'RENEWAL',
      status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
    },
    orderBy: { issuedAt: 'desc' },
    include: { lineItems: true },
  });

  if (!unpaidInvoice) {
    return true;
  }

  try {
    await refreshRenewalInvoiceCharges({
      tenantId,
      invoiceId: unpaidInvoice.id,
    });
  } catch (error) {
    console.error(`[SyncSubscriptionToAdmin] Failed to refresh invoice ${unpaidInvoice.id}:`, error);
    return false;
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: unpaidInvoice.id },
    include: { lineItems: true },
  });

  if (!invoice) {
    return false;
  }

  const amountMyr = Number(invoice.amount);
  const lineItems = invoice.lineItems.map((li) => ({
    description: li.description ?? '',
    amount: Number(li.amount),
  }));

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
        amount_myr: amountMyr,
        status: invoice.status,
        period_start: invoice.periodStart.toISOString(),
        period_end: invoice.periodEnd.toISOString(),
        line_items: lineItems,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[SyncSubscriptionToAdmin] Failed to sync tenant ${tenantId}: ${res.status} ${text}`);
      return false;
    }

    console.log(`[SyncSubscriptionToAdmin] Synced tenant ${tenantId}: RM ${amountMyr.toFixed(2)}`);
    return true;
  } catch (error) {
    console.error(`[SyncSubscriptionToAdmin] Error syncing tenant ${tenantId}:`, error);
    return false;
  }
}
