/**
 * TrueKredit Pro: no SaaS subscription / invoice APIs.
 * Exposes GET /add-ons so the admin UI can show licensed modules (TrueSend, TrueIdentity, …)
 * and email stats without a separate add-on purchase flow.
 */

import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { AddOnService } from '../../lib/addOnService.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireActiveSubscription } from '../../middleware/billingGuard.js';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

/**
 * Add-on flags + TrueSend email stats (matches legacy SaaS response shape).
 * GET /api/billing/add-ons
 */
router.get('/add-ons', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    const activeTypes = await AddOnService.getActiveAddOns(tenantId);
    const addOns = activeTypes.map((addOnType) => ({ addOnType, status: 'ACTIVE' as const }));

    const [emailTotal, emailDelivered, emailFailed, emailPending] = await Promise.all([
      prisma.emailLog.count({ where: { tenantId } }),
      prisma.emailLog.count({ where: { tenantId, status: 'delivered' } }),
      prisma.emailLog.count({
        where: { tenantId, status: { in: ['failed', 'bounced', 'complained'] } },
      }),
      prisma.emailLog.count({
        where: { tenantId, status: { in: ['pending', 'sent', 'delayed'] } },
      }),
    ]);

    const verificationCount = await prisma.borrower.count({
      where: { tenantId, documentVerified: true },
    });

    res.json({
      success: true,
      data: {
        addOns,
        emailStats: {
          total: emailTotal,
          delivered: emailDelivered,
          failed: emailFailed,
          pending: emailPending,
        },
        verificationStats: { total: verificationCount },
      },
    });
  } catch (error) {
    next(error);
  }
});

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
