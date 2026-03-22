/**
 * TrueKredit Pro does not expose SaaS subscription / invoice APIs.
 * This module remains as a stub so legacy imports (`refreshRenewalInvoiceCharges`) resolve.
 */

import { Router } from 'express';

const router = Router();

router.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Billing is not available in TrueKredit Pro (licensed product; no subscription invoicing).',
  });
});

export default router;

/** No-op: renewal invoices do not exist in Pro. */
export async function refreshRenewalInvoiceCharges(_params: {
  tenantId: string;
  invoiceId: string;
}): Promise<void> {
  // Intentionally empty
}
