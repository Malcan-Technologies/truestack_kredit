import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { authenticateToken } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireRole.js';
import { nanoid } from 'nanoid';
import { AddOnService } from '../../lib/addOnService.js';
import { derivePlanName, CORE_AMOUNT_CENTS, CORE_PLUS_AMOUNT_CENTS } from '../../lib/subscription.js';
import { generateInvoiceNumber } from '../../lib/invoiceNumberService.js';
import { generateInvoicePdf } from '../../lib/invoicePdfService.js';
import { addMonthsClamped, safeAdd, safeDivide, safeMultiply, safeRound, toSafeNumber } from '../../lib/math.js';
import { notifySubscriptionPaymentRequested } from '../trueidentity/subscriptionPaymentRequestWebhook.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const recordPaymentSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const subscribeRequestSchema = z.object({
  plan: z.enum(['CORE', 'CORE_TRUESEND']).optional(),
  paymentReference: z.string().trim().min(3).max(120),
  requestAddOns: z.array(z.enum(['TRUESEND', 'TRUEIDENTITY'])).optional().default([]),
});

const addOnPurchaseSchema = z.object({
  addOnType: z.enum(['TRUESEND', 'TRUEIDENTITY']),
  paymentReference: z.string().trim().min(3).max(120),
});

const overduePaymentSchema = z.object({
  invoiceId: z.string(),
  paymentReference: z.string().trim().min(3).max(120),
});

const updateInvoiceAddonsSchema = z.object({
  invoiceId: z.string(),
  addTruesend: z.boolean().optional().default(false),
});

const refreshOverdueInvoiceSchema = z.object({
  invoiceId: z.string(),
});

const cancelSubscriptionSchema = z.object({
  immediate: z.boolean().optional().default(false),
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
        autoRenew: subscription.autoRenew,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        gracePeriodEnd: subscription.gracePeriodEnd,
        tenantSubscriptionStatus: tenant?.subscriptionStatus ?? "FREE",
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
        lineItems: true,
        subscriptionPaymentRequests: {
          orderBy: { requestedAt: 'desc' },
          select: { status: true, rejectionReason: true, rejectedAt: true },
        },
      },
    });

    res.json({
      success: true,
      data: invoices.map(inv => {
        const latestRequest = inv.subscriptionPaymentRequests[0];
        const rejectedRequest = inv.subscriptionPaymentRequests
          .filter((r) => r.status === 'REJECTED')
          .sort((a, b) => {
            const aTime = new Date(a.rejectedAt ?? 0).getTime();
            const bTime = new Date(b.rejectedAt ?? 0).getTime();
            return bTime - aTime;
          })[0];
        const requestToUse = (inv.status === 'REJECTED' && rejectedRequest) ? rejectedRequest : latestRequest;
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          status: inv.status,
          billingType: inv.billingType,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          issuedAt: inv.issuedAt,
          dueAt: inv.dueAt,
          paidAt: inv.paidAt,
          receipts: inv.receipts,
          latestPaymentRequestStatus: requestToUse?.status ?? latestRequest?.status ?? null,
          latestPaymentRequestRejectionReason: requestToUse?.rejectionReason ?? latestRequest?.rejectionReason ?? null,
          latestPaymentRequestRejectedAt: requestToUse?.rejectedAt ?? latestRequest?.rejectedAt ?? null,
          lineItems: inv.lineItems.map((li) => ({
            itemType: li.itemType,
            description: li.description,
            amount: Number(li.amount),
            quantity: li.quantity,
            unitPrice: Number(li.unitPrice),
          })),
        };
      }),
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
 * Download invoice PDF (generated on demand)
 * GET /api/billing/invoices/:invoiceId/download
 */
router.get('/invoices/:invoiceId/download', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: req.params.invoiceId,
        tenantId: req.tenantId,
      },
      include: {
        tenant: {
          select: {
            name: true,
            registrationNumber: true,
            businessAddress: true,
          },
        },
        lineItems: true,
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice');
    }

    if (invoice.status === 'CANCELLED' || invoice.status === 'REJECTED') {
      throw new BadRequestError(invoice.status === 'REJECTED' ? 'Cannot download rejected invoice' : 'Cannot download cancelled invoice');
    }

    const effectiveLineItems = invoice.status === 'PAID' && Array.isArray(invoice.lineItemsSnapshot)
      ? (invoice.lineItemsSnapshot as Array<{
          description: string;
          quantity?: number;
          unitPrice?: number;
          amount?: number;
          itemType?: string;
        }>)
      : invoice.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          amount: Number(item.amount),
          itemType: item.itemType,
        }));

    const sstAmountFromLineItems = safeRound(
      effectiveLineItems
        .filter((item) => item.itemType === 'SST' || item.description.toUpperCase().includes('SST'))
        .reduce((sum, item) => safeAdd(sum, toSafeNumber(item.amount)), 0)
    );
    const subtotal = safeRound(
      effectiveLineItems
        .filter((item) => !(item.itemType === 'SST' || item.description.toUpperCase().includes('SST')))
        .reduce((sum, item) => safeAdd(sum, toSafeNumber(item.amount)), 0)
    );
    const sstAmount = sstAmountFromLineItems > 0 ? sstAmountFromLineItems : safeMultiply(subtotal, SST_RATE);
    const total = safeAdd(subtotal, sstAmount);

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      subtotal,
      sstRate: SST_RATE,
      sstAmount,
      total,
      tenant: {
        name: invoice.tenant.name,
        registrationNumber: invoice.tenant.registrationNumber,
        businessAddress: invoice.tenant.businessAddress,
      },
      lineItems: effectiveLineItems.map((item) => ({
        description: item.description,
        quantity: toSafeNumber(item.quantity ?? 1),
        unitPrice: toSafeNumber(item.unitPrice ?? item.amount ?? 0),
        amount: toSafeNumber(item.amount ?? 0),
        itemType: item.itemType,
      })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
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

    if (invoice.status === 'CANCELLED' || invoice.status === 'REJECTED') {
      throw new BadRequestError(invoice.status === 'REJECTED' ? 'Invoice was rejected' : 'Invoice is cancelled');
    }

    const invoiceAmount = toSafeNumber(invoice.amount);
    const paymentAmount = safeRound(data.amount, 2);
    if (paymentAmount < invoiceAmount) {
      throw new BadRequestError(`Payment amount cannot be less than invoice total of RM ${invoiceAmount.toFixed(2)}`);
    }

    // Create receipt and update invoice in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create receipt
      const receipt = await tx.receipt.create({
        data: {
          tenantId: req.tenantId!,
          invoiceId: invoice.id,
          amount: paymentAmount,
          reference: data.reference,
        },
      });

      // Update invoice status
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          lineItemsSnapshot: (
            await tx.invoiceLineItem.findMany({
              where: { invoiceId: invoice.id },
              orderBy: { createdAt: 'asc' },
            })
          ).map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            amount: Number(item.amount),
            itemType: item.itemType,
          })),
        },
      });

      // Update subscription status if was in grace period or blocked
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: req.tenantId },
      });

      if (subscription && (subscription.status === 'GRACE_PERIOD' || subscription.status === 'BLOCKED')) {
        // Extend subscription period
        const newPeriodStart = new Date();
        const newPeriodEnd = addMonthsClamped(newPeriodStart, 1);

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
            amount: paymentAmount,
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

function getMytDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return { year, month, day };
}

function getMytCycleDates(now: Date) {
  const { year, month, day } = getMytDateParts(now);
  const periodStart = new Date(Date.UTC(year, month - 1, day));
  const periodEnd = addMonthsClamped(periodStart, 1);
  return { periodStart, periodEnd };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfMytDayUtc(date: Date): Date {
  const { year, month, day } = getMytDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function differenceInDays(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / msPerDay));
}

/** Format date as YYYY-MM-DD in Malaysia timezone (not UTC). */
function toDateOnly(value: Date): string {
  const { year, month, day } = getMytDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const SST_RATE = 0.08;

async function refreshRenewalInvoiceCharges(params: {
  tenantId: string;
  invoiceId: string;
  addTruesend?: boolean;
}): Promise<{ invoiceId: string; amount: number; updated: boolean }> {
  const { tenantId, invoiceId, addTruesend = false } = params;
  const truesendMonthlyMyr = Number(process.env.TRUESEND_MONTHLY_PRICE_MYR || '50');

  const [invoice, subscription, truesendAddOn] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
        billingType: 'RENEWAL',
        status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
      },
      include: { lineItems: true },
    }),
    prisma.subscription.findUnique({
      where: { tenantId },
      select: { currentPeriodStart: true },
    }),
    prisma.tenantAddOn.findUnique({
      where: { tenantId_addOnType: { tenantId, addOnType: 'TRUESEND' } },
      select: { status: true },
    }),
  ]);

  if (!invoice) {
    throw new BadRequestError('Renewal invoice not found');
  }
  if (!subscription) {
    throw new BadRequestError('Subscription not found');
  }

  const { getUsageForTenant, computeUsageAmount } = await import('../trueidentity/usageService.js');
  const usageEndExclusive = startOfMytDayUtc(addDays(new Date(), 1));
  // Bill usage against the unpaid renewal for the expired cycle:
  // include from the previous cycle start through "now" (MYT day boundary).
  const usageStart = subscription.currentPeriodStart;
  const usageTo = usageEndExclusive > usageStart ? usageEndExclusive : usageStart;
  const usageRows = await getUsageForTenant(tenantId, usageStart, usageTo, { toDateExclusive: true });
  const verificationCount = usageRows.reduce((sum, row) => sum + row.count, 0);
  const { usageAmountMyr, unitPriceMyr } = computeUsageAmount(verificationCount);
  const shouldIncludeTruesend = addTruesend || truesendAddOn?.status === 'ACTIVE';

  let updated = false;
  await prisma.$transaction(async (tx) => {
    let hasTruesend = invoice.lineItems.some(
      (li) => li.itemType === 'ADDON' && li.description?.toLowerCase().includes('truesend')
    );
    if (shouldIncludeTruesend && !hasTruesend) {
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          itemType: 'ADDON',
          description: 'TrueSend add-on',
          unitPrice: truesendMonthlyMyr,
          quantity: 1,
          amount: truesendMonthlyMyr,
        },
      });
      hasTruesend = true;
      updated = true;
    }

    const usageLines = invoice.lineItems.filter((li) => li.itemType === 'USAGE');
    const usageLine = usageLines[0];
    if (usageLines.length > 1) {
      await tx.invoiceLineItem.deleteMany({
        where: { id: { in: usageLines.slice(1).map((li) => li.id) } },
      });
      updated = true;
    }
    if (usageAmountMyr > 0) {
      const usageDescription = `TrueIdentity usage (${verificationCount} verifications)`;
      if (usageLine) {
        const currentAmount = toSafeNumber(usageLine.amount);
        const currentQuantity = usageLine.quantity ?? 0;
        const currentUnitPrice = toSafeNumber(usageLine.unitPrice);
        if (
          currentAmount !== usageAmountMyr ||
          currentQuantity !== verificationCount ||
          currentUnitPrice !== unitPriceMyr ||
          usageLine.description !== usageDescription
        ) {
          await tx.invoiceLineItem.update({
            where: { id: usageLine.id },
            data: {
              description: usageDescription,
              unitPrice: unitPriceMyr,
              quantity: verificationCount,
              amount: usageAmountMyr,
            },
          });
          updated = true;
        }
      } else {
        await tx.invoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            itemType: 'USAGE',
            description: usageDescription,
            unitPrice: unitPriceMyr,
            quantity: verificationCount,
            amount: usageAmountMyr,
          },
        });
        updated = true;
      }
    } else if (usageLine) {
      await tx.invoiceLineItem.delete({ where: { id: usageLine.id } });
      updated = true;
    }

    const updatedLineItems = await tx.invoiceLineItem.findMany({
      where: { invoiceId: invoice.id },
    });
    const subtotal = updatedLineItems
      .filter((li) => li.itemType !== 'SST')
      .reduce((sum, li) => safeAdd(sum, toSafeNumber(li.amount)), 0);
    const sstAmount = safeMultiply(subtotal, SST_RATE);
    const totalAmount = safeAdd(subtotal, sstAmount);

    const sstLine = updatedLineItems.find((li) => li.itemType === 'SST');
    if (sstLine) {
      if (toSafeNumber(sstLine.amount) !== sstAmount || toSafeNumber(sstLine.unitPrice) !== sstAmount) {
        await tx.invoiceLineItem.update({
          where: { id: sstLine.id },
          data: { unitPrice: sstAmount, amount: sstAmount },
        });
        updated = true;
      }
    } else {
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          itemType: 'SST',
          description: 'SST (8%)',
          unitPrice: sstAmount,
          quantity: 1,
          amount: sstAmount,
        },
      });
      updated = true;
    }

    if (toSafeNumber(invoice.amount) !== totalAmount) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amount: totalAmount },
      });
      updated = true;
    }
  });

  const latestInvoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    select: { id: true, amount: true },
  });
  return {
    invoiceId: latestInvoice.id,
    amount: toSafeNumber(latestInvoice.amount),
    updated,
  };
}

/** Compute add-on purchase amount: prorated for first-time, full price for re-subscribe. */
function computeAddOnPurchaseAmount(
  monthlyAmountMyr: number,
  periodStart: Date,
  periodEnd: Date,
  existingAddOn: { id: string } | null
): { proratedAmount: number; effectiveRemainingDays: number; totalDays: number; sstMyr: number; totalAmountMyr: number; isFirstTimeSubscription: boolean } {
  const totalDays = Math.max(1, differenceInDays(periodStart, periodEnd));
  const remainingDays = Math.max(0, differenceInDays(new Date(), periodEnd));
  const isFirstTimeSubscription = existingAddOn === null;
  const proratedAmount = isFirstTimeSubscription
    ? safeRound(safeMultiply(monthlyAmountMyr, safeDivide(remainingDays, totalDays, 8)))
    : monthlyAmountMyr;
  const effectiveRemainingDays = isFirstTimeSubscription ? remainingDays : totalDays;
  const sstMyr = safeMultiply(proratedAmount, SST_RATE);
  const totalAmountMyr = safeAdd(proratedAmount, sstMyr);
  return { proratedAmount, effectiveRemainingDays, totalDays, sstMyr, totalAmountMyr, isFirstTimeSubscription };
}

function serializeSubscriptionPaymentRequest(
  request: {
    requestId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    plan: string;
    amountCents: number;
    amountMyr: unknown;
    paymentReference: string;
    periodStart: Date;
    periodEnd: Date;
    requestedAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    webhookDelivered: boolean;
    webhookError: string | null;
  }
) {
  return {
    requestId: request.requestId,
    status: request.status,
    plan: request.plan,
    amountCents: request.amountCents,
    amountMyr: toSafeNumber(request.amountMyr),
    paymentReference: request.paymentReference,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    requestedAt: request.requestedAt,
    approvedAt: request.approvedAt,
    rejectedAt: request.rejectedAt,
    rejectionReason: request.rejectionReason,
    webhookDelivered: request.webhookDelivered,
    webhookError: request.webhookError,
  };
}

/**
 * Get latest subscription payment request for current tenant
 * GET /api/billing/subscription-payment-request/latest
 */
router.get('/subscription-payment-request/latest', async (req, res, next) => {
  try {
    const latest = await prisma.subscriptionPaymentRequest.findFirst({
      where: { tenantId: req.tenantId },
      orderBy: { requestedAt: 'desc' },
      select: {
        requestId: true,
        status: true,
        plan: true,
        amountCents: true,
        amountMyr: true,
        paymentReference: true,
        periodStart: true,
        periodEnd: true,
        requestedAt: true,
        approvedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        webhookDelivered: true,
        webhookError: true,
      },
    });

    res.json({
      success: true,
      data: latest ? serializeSubscriptionPaymentRequest(latest) : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Subscribe tenant (create pending payment request for admin approval)
 * POST /api/billing/subscribe
 * Body: { plan?: 'CORE' | 'CORE_TRUESEND', paymentReference: string, requestAddOns?: ('TRUESEND'|'TRUEIDENTITY')[] }
 */
router.post('/subscribe', async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new BadRequestError('No active tenant');
    }

    const parsed = subscribeRequestSchema.parse(req.body);
    const plan = parsed.plan === 'CORE_TRUESEND' ? 'CORE_TRUESEND' : 'CORE';
    const requestedAddOns = parsed.requestAddOns;
    const paymentReference = parsed.paymentReference;

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        subscriptionStatus: true,
        subscriptionAmount: true,
      },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    const subscriptionAmount = plan === 'CORE_TRUESEND' ? CORE_PLUS_AMOUNT_CENTS : CORE_AMOUNT_CENTS;
    const currentAmount = tenant.subscriptionAmount ?? CORE_AMOUNT_CENTS;
    const isUpgradeToCorePlus = plan === 'CORE_TRUESEND' && subscriptionAmount !== currentAmount;

    if (tenant.subscriptionStatus === 'PAID' && !isUpgradeToCorePlus) {
      throw new BadRequestError('Tenant is already subscribed');
    }
    if (tenant.subscriptionStatus === 'PAID' && currentAmount === CORE_PLUS_AMOUNT_CENTS && plan === 'CORE') {
      throw new BadRequestError('To downgrade from Core+, please contact support');
    }

    const existingPending = await prisma.subscriptionPaymentRequest.findFirst({
      where: {
        tenantId: req.tenantId,
        status: 'PENDING',
      },
      orderBy: { requestedAt: 'desc' },
      select: {
        requestId: true,
        status: true,
        plan: true,
        amountCents: true,
        amountMyr: true,
        paymentReference: true,
        periodStart: true,
        periodEnd: true,
        requestedAt: true,
        approvedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        webhookDelivered: true,
        webhookError: true,
      },
    });

    if (existingPending) {
      res.json({
        success: true,
        data: {
          pending: true,
          existing: true,
          request: serializeSubscriptionPaymentRequest(existingPending),
        },
      });
      return;
    }

    const requestedAt = new Date();
    const { periodStart, periodEnd } = getMytCycleDates(requestedAt);

    const requestId = `SPR-${nanoid(10).toUpperCase()}`;
    const subtotalMyr = safeDivide(subscriptionAmount, 100);
    const sstMyr = safeMultiply(subtotalMyr, SST_RATE);
    const totalMyr = safeAdd(subtotalMyr, sstMyr);
    const totalCents = Math.round(totalMyr * 100);
    const normalizedAddOns = [...new Set(requestedAddOns)].sort();
    const invoiceMeta = await generateInvoiceNumber(tenant.id, tenant.slug, requestedAt);
    const billingType =
      tenant.subscriptionStatus === 'PAID' || tenant.subscriptionStatus === 'OVERDUE'
        ? 'RENEWAL'
        : 'FIRST_SUBSCRIPTION';

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId: tenant.id,
          invoiceNumber: invoiceMeta.invoiceNumber,
          sequenceNumber: invoiceMeta.sequence,
          amount: totalMyr,
          status: 'PENDING_APPROVAL',
          billingType,
          periodStart,
          periodEnd,
          dueAt: addDays(requestedAt, 14),
        },
      });

      await tx.invoiceLineItem.createMany({
        data: [
          {
            invoiceId: invoice.id,
            itemType: 'SUBSCRIPTION',
            description: plan === 'CORE_TRUESEND' ? 'Core+ Subscription' : 'Core Subscription',
            quantity: 1,
            unitPrice: subtotalMyr,
            amount: subtotalMyr,
          },
          {
            invoiceId: invoice.id,
            itemType: 'SST',
            description: 'SST (8%)',
            quantity: 1,
            unitPrice: sstMyr,
            amount: sstMyr,
          },
        ],
      });

      const created = await tx.subscriptionPaymentRequest.create({
        data: {
          tenantId: tenant.id,
          invoiceId: invoice.id,
          requestId,
          plan,
          amountCents: totalCents,
          amountMyr: totalMyr,
          billingType,
          paymentReference,
          periodStart,
          periodEnd,
          lineItems: [
            {
              type: 'SUBSCRIPTION',
              description: plan === 'CORE_TRUESEND' ? 'Core+ Subscription' : 'Core Subscription',
              amountMyr: subtotalMyr,
            },
            {
              type: 'SST',
              description: 'SST (8%)',
              amountMyr: sstMyr,
            },
          ],
          requestedAddOns: normalizedAddOns,
          requestPayload: {
            source: 'kredit_subscription_payment_page',
            tenantSubscriptionStatus: tenant.subscriptionStatus,
            requestAddOns: normalizedAddOns,
          },
          webhookDelivered: false,
          webhookError: null,
        },
        select: {
          requestId: true,
          status: true,
          plan: true,
          amountCents: true,
          amountMyr: true,
          paymentReference: true,
          periodStart: true,
          periodEnd: true,
          requestedAt: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          webhookDelivered: true,
          webhookError: true,
        },
      });

      await tx.billingEvent.create({
        data: {
          tenantId: tenant.id,
          eventType: 'INVOICE_ISSUED',
          metadata: {
            invoiceId: invoice.id,
            requestId,
            billingType,
          },
        },
      });

      return created;
    });

    try {
      const webhookResult = await notifySubscriptionPaymentRequested({
        requestId: updated.requestId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        plan,
        amountCents: totalCents,
        amountMyr: totalMyr,
        billingType,
        paymentReference,
        periodStart: toDateOnly(periodStart),
        periodEnd: toDateOnly(periodEnd),
        requestedAt: requestedAt.toISOString(),
        requestedAddOns: normalizedAddOns,
        lineItems: [
          {
            type: 'SUBSCRIPTION',
            description: plan === 'CORE_TRUESEND' ? 'Core+ Subscription' : 'Core Subscription',
            amountMyr: subtotalMyr,
          },
          {
            type: 'SST',
            description: 'SST (8%)',
            amountMyr: sstMyr,
          },
        ],
      });
      if (!webhookResult.delivered) {
        throw new Error(
          webhookResult.error ??
          `Admin webhook failed (${webhookResult.statusCode ?? 'unknown status'})`
        );
      }

      await prisma.subscriptionPaymentRequest.update({
        where: { requestId: updated.requestId },
        data: { webhookDelivered: true, webhookError: null },
      });
      updated.webhookDelivered = true;
      updated.webhookError = null;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Unknown admin sync error';
      await prisma.subscriptionPaymentRequest.update({
        where: { requestId: updated.requestId },
        data: { webhookDelivered: false, webhookError: message },
      });
      updated.webhookDelivered = false;
      updated.webhookError = message;
      console.error('[Billing] Failed syncing subscription request to admin:', message);
    }

    res.json({
      success: true,
      data: {
        pending: true,
        existing: false,
        request: serializeSubscriptionPaymentRequest(updated),
      },
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
 */
router.get('/trueidentity-usage', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const { getUsageForTenant, computeUsageAmount } = await import('../trueidentity/usageService.js');

    const usage = await getUsageForTenant(tenantId, from, to, { toDateExclusive: true });
    const verificationCount = usage.reduce((sum, r) => sum + r.count, 0);
    const { usageAmountMyr } = computeUsageAmount(verificationCount);

    res.json({
      success: true,
      data: {
        source: 'local',
        usage,
        verificationCount,
        usageAmountMyr,
        periodStart: from?.toISOString(),
        periodEnd: to?.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Billing pricing configuration
 * GET /api/billing/pricing
 */
router.get('/pricing', async (_req, res, next) => {
  try {
    const truesendMonthlyMyr = Number(process.env.TRUESEND_MONTHLY_PRICE_MYR || '50');
    const trueidentityUnitMyr = Number(process.env.TRUEIDENTITY_UNIT_PRICE_MYR || '4');
    const trueidentityUnitCredits = Number(process.env.TRUEIDENTITY_UNIT_PRICE_CREDITS || '400');
    res.json({
      success: true,
      data: {
        coreAmountCents: CORE_AMOUNT_CENTS,
        corePlusAmountCents: CORE_PLUS_AMOUNT_CENTS,
        truesendMonthlyMyr,
        trueidentityUnitMyr,
        trueidentityUnitCredits,
        sstRate: SST_RATE,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Preview prorated add-on purchase (same logic as purchase, no side effects)
 * GET /api/billing/add-ons/purchase-preview?addOnType=TRUESEND
 */
router.get('/add-ons/purchase-preview', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const addOnType = req.query.addOnType as string | undefined;
    if (!addOnType || !['TRUESEND', 'TRUEIDENTITY'].includes(addOnType)) {
      throw new BadRequestError('addOnType must be TRUESEND or TRUEIDENTITY');
    }

    const [subscription, existingAddOn] = await Promise.all([
      prisma.subscription.findUnique({ where: { tenantId } }),
      prisma.tenantAddOn.findUnique({
        where: { tenantId_addOnType: { tenantId, addOnType } },
      }),
    ]);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionStatus: true },
    });
    if (!tenant || tenant.subscriptionStatus !== 'PAID' || !subscription) {
      return res.json({
        success: true,
        data: { addOnType, proratedAmountMyr: 0, remainingDays: 0, totalDays: 0, sstMyr: 0, totalAmountMyr: 0, freeActivation: true },
      });
    }
    if (existingAddOn?.status === 'ACTIVE') {
      return res.json({
        success: true,
        data: { addOnType, proratedAmountMyr: 0, remainingDays: 0, totalDays: 0, sstMyr: 0, totalAmountMyr: 0, alreadyActive: true },
      });
    }

    const monthlyAmountMyr = addOnType === 'TRUESEND'
      ? Number(process.env.TRUESEND_MONTHLY_PRICE_MYR || '50')
      : 0;

    const computed = computeAddOnPurchaseAmount(
      monthlyAmountMyr,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      existingAddOn
    );
    const amountCents = Math.round(computed.totalAmountMyr * 100);

    res.json({
      success: true,
      data: {
        addOnType,
        proratedAmountMyr: computed.proratedAmount,
        remainingDays: computed.effectiveRemainingDays,
        totalDays: computed.totalDays,
        sstMyr: computed.sstMyr,
        totalAmountMyr: computed.totalAmountMyr,
        monthlyAmountMyr,
        freeActivation: amountCents <= 0,
        isFirstTimeSubscription: computed.isFirstTimeSubscription,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Purchase add-on for active subscription (prorated)
 * POST /api/billing/add-ons/purchase
 */
router.post('/add-ons/purchase', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { addOnType, paymentReference } = addOnPurchaseSchema.parse(req.body);

    const [tenant, subscription, existingAddOn] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, name: true, subscriptionStatus: true },
      }),
      prisma.subscription.findUnique({
        where: { tenantId },
      }),
      prisma.tenantAddOn.findUnique({
        where: { tenantId_addOnType: { tenantId, addOnType } },
      }),
    ]);

    if (!tenant) throw new NotFoundError('Tenant');
    if (!subscription || tenant.subscriptionStatus !== 'PAID') {
      throw new BadRequestError('Active paid subscription is required');
    }
    if (existingAddOn?.status === 'ACTIVE') {
      throw new BadRequestError(`${addOnType} is already active`);
    }

    const monthlyAmountMyr = addOnType === 'TRUESEND'
      ? Number(process.env.TRUESEND_MONTHLY_PRICE_MYR || '50')
      : 0;

    const computed = computeAddOnPurchaseAmount(
      monthlyAmountMyr,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      existingAddOn
    );
    const { proratedAmount, effectiveRemainingDays, totalDays, sstMyr, totalAmountMyr, isFirstTimeSubscription } = computed;
    const amountCents = Math.round(totalAmountMyr * 100);
    const now = new Date();

    if (amountCents <= 0) {
      const updated = await prisma.tenantAddOn.upsert({
        where: { tenantId_addOnType: { tenantId, addOnType } },
        create: {
          tenantId,
          addOnType,
          status: 'ACTIVE',
        },
        update: {
          status: 'ACTIVE',
          enabledAt: now,
          cancelledAt: null,
        },
      });

      return res.json({
        success: true,
        data: {
          activated: true,
          addOnType: updated.addOnType,
          status: updated.status,
          amountMyr: 0,
        },
      });
    }

    const requestId = `SPR-${nanoid(10).toUpperCase()}`;
    const invoiceMeta = await generateInvoiceNumber(tenantId, tenant.slug, now);

    const request = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          invoiceNumber: invoiceMeta.invoiceNumber,
          sequenceNumber: invoiceMeta.sequence,
          amount: totalAmountMyr,
          status: 'PENDING_APPROVAL',
          billingType: 'ADDON_PURCHASE',
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          dueAt: addDays(now, 14),
        },
      });

      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          itemType: isFirstTimeSubscription ? 'PRORATION' : 'ADDON',
          description: isFirstTimeSubscription
            ? `${addOnType} Add-on Prorated (${effectiveRemainingDays}/${totalDays} days)`
            : `${addOnType} add-on`,
          quantity: 1,
          unitPrice: proratedAmount,
          amount: proratedAmount,
        },
      });
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          itemType: 'SST',
          description: 'SST (8%)',
          quantity: 1,
          unitPrice: sstMyr,
          amount: sstMyr,
        },
      });

      return tx.subscriptionPaymentRequest.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          requestId,
          plan: 'CORE',
          amountCents,
          amountMyr: totalAmountMyr,
          billingType: 'ADDON_PURCHASE',
          paymentReference,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          requestedAddOns: [addOnType],
          lineItems: [
            {
              type: isFirstTimeSubscription ? 'PRORATION' : 'ADDON',
              addOnType,
              amountMyr: proratedAmount,
              remainingDays: effectiveRemainingDays,
              totalDays,
            },
            {
              type: 'SST',
              description: 'SST (8%)',
              amountMyr: sstMyr,
            },
          ],
          webhookDelivered: false,
        },
        select: {
          requestId: true,
          status: true,
          plan: true,
          amountCents: true,
          amountMyr: true,
          paymentReference: true,
          periodStart: true,
          periodEnd: true,
          requestedAt: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          webhookDelivered: true,
          webhookError: true,
        },
      });
    });

    try {
      const webhookResult = await notifySubscriptionPaymentRequested({
        requestId: request.requestId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        plan: 'CORE',
        amountCents,
        amountMyr: totalAmountMyr,
        billingType: 'ADDON_PURCHASE',
        paymentReference,
        periodStart: toDateOnly(subscription.currentPeriodStart),
        periodEnd: toDateOnly(subscription.currentPeriodEnd),
        requestedAt: request.requestedAt.toISOString(),
        requestedAddOns: [addOnType],
        lineItems: [
          {
            type: isFirstTimeSubscription ? 'PRORATION' : 'ADDON',
            addOnType,
            amountMyr: proratedAmount,
            remainingDays: effectiveRemainingDays,
            totalDays,
          },
          {
            type: 'SST',
            description: 'SST (8%)',
            amountMyr: sstMyr,
          },
        ],
      });
      if (!webhookResult.delivered) {
        throw new Error(
          webhookResult.error ??
          `Admin webhook failed (${webhookResult.statusCode ?? 'unknown status'})`
        );
      }

      await prisma.subscriptionPaymentRequest.update({
        where: { requestId: request.requestId },
        data: { webhookDelivered: true, webhookError: null },
      });
      request.webhookDelivered = true;
      request.webhookError = null;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Unknown admin sync error';
      await prisma.subscriptionPaymentRequest.update({
        where: { requestId: request.requestId },
        data: { webhookDelivered: false, webhookError: message },
      });
      request.webhookDelivered = false;
      request.webhookError = message;
      console.error('[Billing] Failed syncing add-on request to admin:', message);
    }

    res.json({
      success: true,
      data: {
        pending: true,
        request: serializeSubscriptionPaymentRequest(request),
        proration: {
          monthlyAmountMyr,
          remainingDays: effectiveRemainingDays,
          totalDays,
          amountMyr: proratedAmount,
          sstMyr,
          totalAmountMyr,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update a renewal invoice to add TrueSend add-on when user selects it on the subscription page.
 * Used when the invoice was created without TrueSend (e.g. tenant didn't have it when expired).
 * POST /api/billing/overdue/update-invoice-addons
 */
router.post('/overdue/update-invoice-addons', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { invoiceId, addTruesend } = updateInvoiceAddonsSchema.parse(req.body);
    const refreshed = await refreshRenewalInvoiceCharges({
      tenantId,
      invoiceId,
      addTruesend,
    });

    res.json({
      success: true,
      data: { updated: refreshed.updated, invoiceId: refreshed.invoiceId, amount: refreshed.amount },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Refresh an unpaid renewal invoice charges (usage/add-ons/tax) without submitting payment.
 * POST /api/billing/overdue/refresh-invoice
 */
router.post('/overdue/refresh-invoice', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { invoiceId } = refreshOverdueInvoiceSchema.parse(req.body);
    const refreshed = await refreshRenewalInvoiceCharges({
      tenantId,
      invoiceId,
    });
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: refreshed.invoiceId,
        tenantId,
        billingType: 'RENEWAL',
      },
      include: { lineItems: true },
    });
    if (!invoice) {
      throw new BadRequestError('Renewal invoice not found');
    }

    res.json({
      success: true,
      data: {
        updated: refreshed.updated,
        invoice: {
          id: invoice.id,
          amount: toSafeNumber(invoice.amount),
          status: invoice.status,
          dueAt: invoice.dueAt,
          lineItems: invoice.lineItems.map((li) => ({
            itemType: li.itemType,
            description: li.description,
            amount: toSafeNumber(li.amount),
            quantity: li.quantity,
            unitPrice: toSafeNumber(li.unitPrice),
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Submit payment proof for a renewal invoice (payment due or overdue).
 * Accepts ISSUED, PENDING_APPROVAL, or OVERDUE renewal invoices.
 * POST /api/billing/overdue/submit-payment
 */
router.post('/overdue/submit-payment', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { invoiceId, paymentReference } = overduePaymentSchema.parse(req.body);

    const [tenant] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, name: true, subscriptionStatus: true },
      }),
    ]);
    const refreshed = await refreshRenewalInvoiceCharges({
      tenantId,
      invoiceId,
      addTruesend: false,
    });
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: refreshed.invoiceId,
        tenantId,
        billingType: 'RENEWAL',
        status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
      },
      include: { lineItems: true },
    });

    if (!tenant) throw new NotFoundError('Tenant');
    if (!invoice) throw new BadRequestError('Renewal invoice not found');

    const existingPending = await prisma.subscriptionPaymentRequest.findFirst({
      where: {
        tenantId,
        invoiceId: invoice.id,
        status: 'PENDING',
      },
      orderBy: { requestedAt: 'desc' },
      select: {
        requestId: true,
        status: true,
        plan: true,
        amountCents: true,
        amountMyr: true,
        paymentReference: true,
        periodStart: true,
        periodEnd: true,
        requestedAt: true,
        approvedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        webhookDelivered: true,
        webhookError: true,
      },
    });

    if (existingPending) {
      return res.json({
        success: true,
        data: {
          pending: true,
          existing: true,
          request: serializeSubscriptionPaymentRequest(existingPending),
        },
      });
    }

    const requestId = `SPR-${nanoid(10).toUpperCase()}`;
    const amountMyr = toSafeNumber(invoice.amount);
    const amountCents = Math.round(amountMyr * 100);
    const lineItems = invoice.lineItems.map((item) => ({
      type: item.itemType,
      description: item.description,
      amountMyr: toSafeNumber(item.amount),
      quantity: item.quantity,
      unitPrice: toSafeNumber(item.unitPrice),
    }));

    const request = await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PENDING_APPROVAL' },
      });

      return tx.subscriptionPaymentRequest.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          requestId,
          plan: 'CORE',
          amountCents,
          amountMyr,
          billingType: 'RENEWAL',
          paymentReference,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          requestedAddOns: [],
          lineItems,
          requestPayload: {
            source: 'kredit_overdue_payment_page',
            invoiceId: invoice.id,
          },
          webhookDelivered: false,
          webhookError: null,
        },
        select: {
          requestId: true,
          status: true,
          plan: true,
          amountCents: true,
          amountMyr: true,
          paymentReference: true,
          periodStart: true,
          periodEnd: true,
          requestedAt: true,
          approvedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          webhookDelivered: true,
          webhookError: true,
        },
      });
    });

    try {
      const webhookResult = await notifySubscriptionPaymentRequested({
        requestId: request.requestId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        plan: 'CORE',
        amountCents,
        amountMyr,
        billingType: 'RENEWAL',
        paymentReference,
        periodStart: toDateOnly(invoice.periodStart),
        periodEnd: toDateOnly(invoice.periodEnd),
        requestedAt: request.requestedAt.toISOString(),
        requestedAddOns: [],
        lineItems,
      });
      if (!webhookResult.delivered) {
        throw new Error(
          webhookResult.error ??
          `Admin webhook failed (${webhookResult.statusCode ?? 'unknown status'})`
        );
      }

      await prisma.subscriptionPaymentRequest.update({
        where: { requestId: request.requestId },
        data: { webhookDelivered: true, webhookError: null },
      });
      request.webhookDelivered = true;
      request.webhookError = null;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Unknown admin sync error';
      await prisma.subscriptionPaymentRequest.update({
        where: { requestId: request.requestId },
        data: { webhookDelivered: false, webhookError: message },
      });
      request.webhookDelivered = false;
      request.webhookError = message;
      console.error('[Billing] Failed syncing overdue request to admin:', message);
    }

    res.json({
      success: true,
      data: {
        pending: true,
        existing: false,
        request: serializeSubscriptionPaymentRequest(request),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Cancel subscription at period end (non-renewal)
 * POST /api/billing/cancel
 */
router.post('/cancel', requireAdmin, async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { immediate } = cancelSubscriptionSchema.parse(req.body ?? {});
    const now = new Date();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, subscriptionStatus: true },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
    });
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    if (immediate) {
      if (tenant.subscriptionStatus !== 'OVERDUE') {
        throw new BadRequestError('Immediate cancellation is only allowed for overdue tenants');
      }

      const nextChargeableDay = new Date(subscription.currentPeriodEnd);
      nextChargeableDay.setUTCDate(nextChargeableDay.getUTCDate() + 1);

      const [trueIdentityUsageRows, trueSendUsageCount, renewalInvoices] = await Promise.all([
        prisma.trueIdentityUsageDaily.findMany({
          where: {
            tenantId,
            usageDate: { gte: nextChargeableDay },
          },
          select: { count: true },
        }),
        prisma.emailLog.count({
          where: {
            tenantId,
            sentAt: { gte: nextChargeableDay },
          },
        }),
        prisma.invoice.findMany({
          where: {
            tenantId,
            billingType: 'RENEWAL',
            status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
          },
          select: { id: true },
        }),
      ]);

      const trueIdentityUsageCount = trueIdentityUsageRows.reduce((sum, row) => sum + row.count, 0);
      const trueIdentityUnitMyr = Number(process.env.TRUEIDENTITY_UNIT_PRICE_MYR || '4');
      const trueIdentityUsageAmountMyr = safeMultiply(trueIdentityUsageCount, trueIdentityUnitMyr);

      if (trueIdentityUsageCount > 0 || trueSendUsageCount > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cannot cancel subscription: post-expiry usage detected. Please settle the usage charges first.',
          data: {
            chargeFromDate: nextChargeableDay.toISOString(),
            trueIdentityUsageCount,
            trueIdentityUsageAmountMyr,
            trueSendUsageCount,
          },
        });
      }

      const renewalInvoiceIds = renewalInvoices.map((inv) => inv.id);

      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { tenantId },
          data: {
            status: 'CANCELLED',
            autoRenew: false,
            currentPeriodEnd: now,
            gracePeriodEnd: null,
          },
        });

        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            subscriptionStatus: 'FREE',
            subscriptionAmount: null,
            subscribedAt: null,
          },
        });

        await tx.tenantAddOn.updateMany({
          where: {
            tenantId,
            OR: [
              { status: 'ACTIVE' },
              { status: 'CANCELLED', cancelledAt: { gt: now } },
            ],
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
          },
        });

        if (renewalInvoiceIds.length > 0) {
          await tx.invoice.updateMany({
            where: { id: { in: renewalInvoiceIds } },
            data: { status: 'CANCELLED' },
          });

          await tx.subscriptionPaymentRequest.updateMany({
            where: {
              tenantId,
              invoiceId: { in: renewalInvoiceIds },
              status: 'PENDING',
            },
            data: {
              status: 'REJECTED',
              rejectedAt: now,
              rejectionReason: 'Cancelled by tenant before payment (no post-expiry usage)',
            },
          });
        }

        await tx.billingEvent.create({
          data: {
            tenantId,
            eventType: 'CANCELLATION_PROCESSED',
            metadata: {
              immediate: true,
              reason: 'overdue_cancel_without_post_expiry_usage',
              cancelledAt: now.toISOString(),
            },
          },
        });
      });

      return res.json({
        success: true,
        data: {
          immediate: true,
          autoRenew: false,
          currentPeriodEnd: now,
          subscriptionStatus: 'FREE',
        },
      });
    }

    const updated = await prisma.subscription.update({
      where: { tenantId },
      data: { autoRenew: false },
    });

    await prisma.billingEvent.create({
      data: {
        tenantId,
        eventType: 'CANCELLATION_PROCESSED',
        metadata: {
          autoRenew: false,
          currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
        },
      },
    });

    res.json({
      success: true,
      data: {
        autoRenew: updated.autoRenew,
        currentPeriodEnd: updated.currentPeriodEnd,
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
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      select: { currentPeriodEnd: true },
    });
    const cancelEffectiveAt = subscription?.currentPeriodEnd ?? new Date();

    if (existing) {
      // Toggle: ACTIVE -> CANCELLED, anything else -> ACTIVE
      const newStatus = existing.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE';
      const isCancellingTrueSend = addOnType === 'TRUESEND' && newStatus === 'CANCELLED';

      await prisma.$transaction(async (tx) => {
        await tx.tenantAddOn.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            ...(newStatus === 'ACTIVE'
              ? { enabledAt: new Date(), cancelledAt: null }
              : { cancelledAt: cancelEffectiveAt }),
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
      res.json({
        success: true,
        data: {
          addOnType: updated.addOnType,
          status: updated.status,
          cancelledAt: updated.cancelledAt,
          effectiveUntil: newStatus === 'CANCELLED' ? cancelEffectiveAt : null,
        },
      });
    } else {
      // Create new subscription
      const created = await prisma.tenantAddOn.create({
        data: {
          tenantId,
          addOnType,
          status: 'ACTIVE',
        },
      });

      res.json({
        success: true,
        data: {
          addOnType: created.addOnType,
          status: created.status,
          cancelledAt: created.cancelledAt,
          effectiveUntil: null,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
