import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { nanoid } from 'nanoid';
import { config } from '../../lib/config.js';
import { AddOnService } from '../../lib/addOnService.js';
import { derivePlanName, CORE_AMOUNT_CENTS, CORE_PLUS_AMOUNT_CENTS } from '../../lib/subscription.js';

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
    const [subscription, tenant, truesendAddOn] = await Promise.all([
      prisma.subscription.findUnique({ where: { tenantId: req.tenantId } }),
      prisma.tenant.findUnique({
        where: { id: req.tenantId },
        select: { subscriptionStatus: true, subscriptionAmount: true },
      }),
      prisma.tenantAddOn.findUnique({
        where: { tenantId_addOnType: { tenantId: req.tenantId!, addOnType: 'TRUESEND' } },
        select: { status: true },
      }),
    ]);

    if (!subscription) {
      return res.json({
        success: true,
        data: null,
      });
    }

    const truesendActive = truesendAddOn?.status === 'ACTIVE';
    const plan = tenant ? derivePlanName(tenant, truesendActive) : 'Core';

    res.json({
      success: true,
      data: {
        id: subscription.id,
        plan,
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

const CORE_TRUESEND_AMOUNT_CENTS = CORE_PLUS_AMOUNT_CENTS;

/**
 * Subscribe tenant (upgrade from FREE to PAID)
 * POST /api/billing/subscribe
 * Body: { plan?: 'CORE' | 'CORE_TRUESEND' } — defaults to CORE
 */
router.post('/subscribe', async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new BadRequestError('No active tenant');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { subscriptionStatus: true, subscriptionAmount: true },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    const plan = (req.body as { plan?: string })?.plan === 'CORE_TRUESEND' ? 'CORE_TRUESEND' : 'CORE';
    const subscriptionAmount = plan === 'CORE_TRUESEND' ? CORE_TRUESEND_AMOUNT_CENTS : CORE_AMOUNT_CENTS;

    const currentAmount = tenant.subscriptionAmount ?? CORE_AMOUNT_CENTS;
    const isUpgradeToCorePlus = plan === 'CORE_TRUESEND' && subscriptionAmount !== currentAmount;

    if (tenant.subscriptionStatus === 'PAID' && !isUpgradeToCorePlus) {
      throw new BadRequestError('Tenant is already subscribed');
    }
    if (tenant.subscriptionStatus === 'PAID' && currentAmount === CORE_TRUESEND_AMOUNT_CENTS && plan === 'CORE') {
      throw new BadRequestError('To downgrade from Core+, please contact support');
    }

    // Update tenant subscription status and optionally enable TrueSend
    const isNewSubscription = tenant.subscriptionStatus === 'FREE';
    const [updated] = await prisma.$transaction([
      prisma.tenant.update({
        where: { id: req.tenantId },
        data: {
          subscriptionStatus: 'PAID',
          subscriptionAmount,
          ...(isNewSubscription ? { subscribedAt: new Date() } : {}),
        },
      }),
      ...(plan === 'CORE_TRUESEND'
        ? [
            prisma.tenantAddOn.upsert({
              where: {
                tenantId_addOnType: { tenantId: req.tenantId!, addOnType: 'TRUESEND' },
              },
              create: {
                tenantId: req.tenantId!,
                addOnType: 'TRUESEND',
                status: 'ACTIVE',
              },
              update: { status: 'ACTIVE', enabledAt: new Date(), cancelledAt: null },
            }),
          ]
        : []),
    ]);

    if (isNewSubscription) {
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: req.tenantId },
        select: { trueIdentityTenantSyncedAt: true, slug: true, name: true, email: true, contactNumber: true, registrationNumber: true },
      });
      if (tenantRecord && !tenantRecord.trueIdentityTenantSyncedAt) {
        const baseUrl = config.trueIdentity.kreditBaseUrl?.replace(/\/$/, '') || '';
        if (config.nodeEnv === 'production' && (!baseUrl || baseUrl.includes('localhost'))) {
          console.error('[Billing] Cannot notify tenant-created: webhook URL not configured for production');
        } else {
          const webhookUrl = baseUrl ? `${baseUrl}/api/webhooks/trueidentity` : undefined;
          const { notifyTenantCreated } = await import('../trueidentity/tenantCreatedWebhook.js');
          const sent = await notifyTenantCreated({
            tenantId: req.tenantId!,
            tenantSlug: tenantRecord.slug,
            tenantName: tenantRecord.name,
            contactEmail: tenantRecord.email ?? undefined,
            contactPhone: tenantRecord.contactNumber ?? undefined,
            companyRegistration: tenantRecord.registrationNumber ?? undefined,
            webhookUrl,
          });
          if (sent) {
            await prisma.tenant.update({
              where: { id: req.tenantId },
              data: { trueIdentityTenantSyncedAt: new Date() },
            });
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        subscriptionStatus: updated.subscriptionStatus,
        subscriptionAmount: updated.subscriptionAmount,
        subscribedAt: updated.subscribedAt,
        plan,
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
 * Get TrueIdentity usage for billing
 * GET /api/billing/trueidentity-usage
 *
 * Tries Admin usage API first; falls back to local aggregation if Admin is unavailable.
 */
router.get('/trueidentity-usage', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const { getUsageForTenant } = await import('../trueidentity/usageService.js');
    const { fetchAdminUsage } = await import('../trueidentity/adminUsageClient.js');

    const fromDate = from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const toDate = to ?? new Date();

    let adminUsage: Awaited<ReturnType<typeof fetchAdminUsage>> = null;
    try {
      adminUsage = await fetchAdminUsage(tenantId, fromDate, toDate);
    } catch {
      // Admin API unavailable; fall through to local
    }

    if (adminUsage) {
      return res.json({
        success: true,
        data: {
          source: 'admin',
          verificationCount: adminUsage.verification_count,
          usageCredits: adminUsage.usage_credits,
          usageAmountMyr: adminUsage.usage_amount_myr,
          periodStart: adminUsage.period_start,
          periodEnd: adminUsage.period_end,
          clientId: adminUsage.client_id,
        },
      });
    }

    const usage = await getUsageForTenant(tenantId, from, to);
    const verificationCount = usage.reduce((sum, r) => sum + r.count, 0);

    res.json({
      success: true,
      data: {
        source: 'local',
        usage,
        verificationCount,
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

    if (!addOnType || !['TRUESEND', 'TRUEIDENTITY', 'BORROWER_PERFORMANCE'].includes(addOnType)) {
      return res.status(400).json({ success: false, error: 'Invalid addOnType' });
    }

    // Check if add-on record already exists
    const existing = await prisma.tenantAddOn.findUnique({
      where: { tenantId_addOnType: { tenantId, addOnType } },
    });

    if (existing) {
      // Toggle: ACTIVE -> CANCELLED, anything else -> ACTIVE
      const newStatus = existing.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE';
      const isCancellingTrueSend = addOnType === 'TRUESEND' && newStatus === 'CANCELLED';

      await prisma.$transaction(async (tx) => {
        await tx.tenantAddOn.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            ...(newStatus === 'ACTIVE' ? { enabledAt: new Date(), cancelledAt: null } : { cancelledAt: new Date() }),
          },
        });

        // When cancelling TrueSend, revert plan from Core+ to Core
        if (isCancellingTrueSend) {
          await tx.tenant.updateMany({
            where: {
              id: tenantId,
              subscriptionAmount: CORE_PLUS_AMOUNT_CENTS,
            },
            data: { subscriptionAmount: CORE_AMOUNT_CENTS },
          });
        }
      });

      const updated = await prisma.tenantAddOn.findUniqueOrThrow({
        where: { id: existing.id },
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
