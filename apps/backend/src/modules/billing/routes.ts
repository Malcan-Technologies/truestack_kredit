import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { nanoid } from 'nanoid';
import { config } from '../../lib/config.js';
import { AddOnService } from '../../lib/addOnService.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const recordPaymentSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

/**
 * Get subscription status
 * GET /api/billing/subscription
 */
router.get('/subscription', async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId },
    });

    if (!subscription) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        gracePeriodEnd: subscription.gracePeriodEnd,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List invoices
 * GET /api/billing/invoices
 */
router.get('/invoices', async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { issuedAt: 'desc' },
      include: {
        receipts: true,
      },
    });

    res.json({
      success: true,
      data: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        status: inv.status,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        paidAt: inv.paidAt,
        receipts: inv.receipts,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single invoice
 * GET /api/billing/invoices/:invoiceId
 */
router.get('/invoices/:invoiceId', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: req.params.invoiceId,
        tenantId: req.tenantId,
      },
      include: {
        receipts: true,
        tenant: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice');
    }

    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Record a payment (manual payment recording)
 * POST /api/billing/payments
 */
router.post('/payments', requireAdmin, async (req, res, next) => {
  try {
    const data = recordPaymentSchema.parse(req.body);

    // Get the invoice
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: data.invoiceId,
        tenantId: req.tenantId,
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already paid');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BadRequestError('Invoice is cancelled');
    }

    // Create receipt and update invoice in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create receipt
      const receipt = await tx.receipt.create({
        data: {
          tenantId: req.tenantId!,
          invoiceId: invoice.id,
          amount: data.amount,
          reference: data.reference,
        },
      });

      // Update invoice status
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // Update subscription status if was in grace period or blocked
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: req.tenantId },
      });

      if (subscription && (subscription.status === 'GRACE_PERIOD' || subscription.status === 'BLOCKED')) {
        // Extend subscription period
        const newPeriodStart = new Date();
        const newPeriodEnd = new Date(newPeriodStart);
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

        await tx.subscription.update({
          where: { tenantId: req.tenantId },
          data: {
            status: 'ACTIVE',
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
            gracePeriodEnd: null,
          },
        });

        // Record billing event
        await tx.billingEvent.create({
          data: {
            tenantId: req.tenantId!,
            eventType: 'ACCESS_RESTORED',
            metadata: {
              invoiceId: invoice.id,
              receiptId: receipt.id,
            },
          },
        });
      }

      // Record payment event
      await tx.billingEvent.create({
        data: {
          tenantId: req.tenantId!,
          eventType: 'PAYMENT_RECEIVED',
          metadata: {
            invoiceId: invoice.id,
            receiptId: receipt.id,
            amount: data.amount,
          },
        },
      });

      return { receipt, invoice: updatedInvoice };
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get billing events/history
 * GET /api/billing/events
 */
router.get('/events', async (req, res, next) => {
  try {
    const events = await prisma.billingEvent.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Subscribe tenant (upgrade from FREE to PAID)
 * POST /api/billing/subscribe
 */
router.post('/subscribe', async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new BadRequestError('No active tenant');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { subscriptionStatus: true },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    if (tenant.subscriptionStatus === 'PAID') {
      throw new BadRequestError('Tenant is already subscribed');
    }

    // Update tenant subscription status
    const updated = await prisma.tenant.update({
      where: { id: req.tenantId },
      data: {
        subscriptionStatus: 'PAID',
        subscriptionAmount: 49900, // RM 499 in cents
        subscribedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        subscriptionStatus: updated.subscriptionStatus,
        subscriptionAmount: updated.subscriptionAmount,
        subscribedAt: updated.subscribedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Generate invoice for current period (admin utility)
 * POST /api/billing/invoices/generate
 */
router.post('/invoices/generate', requireAdmin, async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.tenantId },
    });

    if (!subscription) {
      throw new BadRequestError('No subscription found');
    }

    // Check if there's already an unpaid invoice for current period
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        tenantId: req.tenantId,
        periodStart: subscription.currentPeriodStart,
        status: { in: ['DRAFT', 'ISSUED'] },
      },
    });

    if (existingInvoice) {
      throw new BadRequestError('Invoice already exists for this period');
    }

    // Generate invoice number
    const invoiceNumber = `INV-${req.tenantId!.slice(0, 6).toUpperCase()}-${nanoid(6).toUpperCase()}`;

    // Create invoice (amount would come from plan pricing in production)
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: req.tenantId!,
        invoiceNumber,
        amount: 299.00, // Default plan price
        status: 'ISSUED',
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        dueAt: subscription.currentPeriodEnd,
      },
    });

    // Record billing event
    await prisma.billingEvent.create({
      data: {
        tenantId: req.tenantId!,
        eventType: 'INVOICE_ISSUED',
        metadata: {
          invoiceId: invoice.id,
          amount: invoice.amount,
        },
      },
    });

    res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Add-ons
// ============================================

/**
 * Get tenant's add-on statuses and email stats
 * GET /api/billing/add-ons
 */
router.get('/add-ons', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;

    // Get all add-ons for this tenant
    const addOns = await AddOnService.getAllAddOns(tenantId);

    // All-time email stats (always returned for TrueSend card)
    const [emailTotal, emailDelivered, emailFailed, emailPending] = await Promise.all([
      prisma.emailLog.count({ where: { tenantId } }),
      prisma.emailLog.count({ where: { tenantId, status: 'delivered' } }),
      prisma.emailLog.count({ where: { tenantId, status: { in: ['failed', 'bounced', 'complained'] } } }),
      prisma.emailLog.count({ where: { tenantId, status: { in: ['pending', 'sent', 'delayed'] } } }),
    ]);
    const emailStats = { total: emailTotal, delivered: emailDelivered, failed: emailFailed, pending: emailPending };

    // All-time verification stats (always returned for TrueIdentity card)
    const verificationCount = await prisma.borrower.count({
      where: { tenantId, documentVerified: true },
    });
    const verificationStats = { total: verificationCount };

    res.json({
      success: true,
      data: {
        addOns: addOns.map(a => ({
          addOnType: a.addOnType,
          status: a.status,
          enabledAt: a.enabledAt,
        })),
        emailStats,
        verificationStats,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Toggle an add-on subscription (subscribe / cancel)
 * POST /api/billing/add-ons/toggle
 *
 * For development/testing — in production this would go through a payment gateway.
 */
router.post('/add-ons/toggle', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { addOnType } = req.body as { addOnType: string };

    if (!addOnType || !['TRUESEND', 'TRUEIDENTITY'].includes(addOnType)) {
      return res.status(400).json({ success: false, error: 'Invalid addOnType' });
    }

    // Check if add-on record already exists
    const existing = await prisma.tenantAddOn.findUnique({
      where: { tenantId_addOnType: { tenantId, addOnType } },
    });

    if (existing) {
      // Toggle: ACTIVE -> CANCELLED, anything else -> ACTIVE
      const newStatus = existing.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE';
      const updated = await prisma.tenantAddOn.update({
        where: { id: existing.id },
        data: {
          status: newStatus,
          ...(newStatus === 'ACTIVE' ? { enabledAt: new Date(), cancelledAt: null } : { cancelledAt: new Date() }),
        },
      });

      res.json({ success: true, data: { addOnType: updated.addOnType, status: updated.status } });
    } else {
      // Create new subscription
      const created = await prisma.tenantAddOn.create({
        data: {
          tenantId,
          addOnType,
          status: 'ACTIVE',
        },
      });

      res.json({ success: true, data: { addOnType: created.addOnType, status: created.status } });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
