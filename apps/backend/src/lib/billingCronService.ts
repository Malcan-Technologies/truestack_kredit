import { nanoid } from 'nanoid';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { CORE_AMOUNT_CENTS } from './subscription.js';
import { generateInvoiceNumber } from './invoiceNumberService.js';
import { addMonthsClamped, safeAdd, safeMultiply, safeSubtract, toSafeNumber } from './math.js';
import { NotificationService } from '../modules/notifications/service.js';
import { fetchAdminUsage } from '../modules/trueidentity/adminUsageClient.js';
import { signRequestBody } from '../modules/trueidentity/signature.js';
import { computeUsageAmount, getUsageForTenant } from '../modules/trueidentity/usageService.js';

export type PaymentDecision = {
  id: string;
  request_id: string;
  tenant_id: string;
  status: 'approved' | 'rejected' | 'pending';
  billing_type?: 'first_subscription' | 'addon_purchase' | 'renewal' | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  amount_cents?: number;
  amount_myr?: number;
  requested_add_ons?: string[] | null;
  period_start?: string | null;
  period_end?: string | null;
  updated_at?: string | null;
};

function startOfMytDayUtc(date: Date): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toBillingType(value?: string | null): 'FIRST_SUBSCRIPTION' | 'ADDON_PURCHASE' | 'RENEWAL' {
  switch ((value ?? '').toLowerCase()) {
    case 'addon_purchase':
      return 'ADDON_PURCHASE';
    case 'renewal':
      return 'RENEWAL';
    default:
      return 'FIRST_SUBSCRIPTION';
  }
}

async function pullPaymentDecisions(since: Date): Promise<PaymentDecision[]> {
  const baseUrl = config.trueIdentity.adminBaseUrl?.replace(/\/$/, '') || '';
  const secret = config.trueIdentity.kreditWebhookSecret;
  if (!baseUrl || !secret) {
    return [];
  }

  const url = `${baseUrl}/api/webhooks/kredit/pull-decisions`;
  const rawBody = JSON.stringify({ since: since.toISOString() });
  const { signature, timestamp } = signRequestBody(rawBody, secret);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-kredit-signature': signature,
      'x-kredit-timestamp': timestamp,
    },
    body: rawBody,
  });
  if (!res.ok) {
    throw new Error(`Payment decision pull failed with status ${res.status}`);
  }
  const payload = await res.json() as { data?: PaymentDecision[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function applyApprovedDecision(decision: PaymentDecision): Promise<void> {
  const request = await prisma.subscriptionPaymentRequest.findUnique({
    where: { requestId: decision.request_id },
    include: {
      invoice: {
        include: {
          lineItems: true,
        },
      },
      tenant: {
        include: {
          members: {
            where: { role: 'OWNER' },
            include: { user: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!request) return;
  if (request.status === 'APPROVED') return;

  const approvedAt = decision.approved_at ? new Date(decision.approved_at) : new Date();
  const decisionBillingType = toBillingType(decision.billing_type);

  await prisma.$transaction(async (tx) => {
    const invoice = request.invoiceId
      ? await tx.invoice.findUnique({
          where: { id: request.invoiceId },
          include: { lineItems: true },
        })
      : null;

    if (invoice) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: approvedAt,
          lineItemsSnapshot: invoice.lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            amount: Number(item.amount),
            itemType: item.itemType,
          })),
        },
      });
    }

    const existingSub = await tx.subscription.findUnique({ where: { tenantId: request.tenantId } });
    const priorApprovedCount = await tx.subscriptionPaymentRequest.count({
      where: {
        tenantId: request.tenantId,
        status: 'APPROVED',
      },
    });
    // Prefer request/decision billing type when it's RENEWAL (e.g. overdue payment)
    // so we use the invoice period instead of approval date
    const requestedBillingType = toBillingType(request.billingType ?? decisionBillingType);
    const billingType =
      requestedBillingType === 'RENEWAL' || priorApprovedCount > 0
        ? requestedBillingType
        : 'FIRST_SUBSCRIPTION';
    const approvedAnchor = startOfMytDayUtc(approvedAt);

    // FIRST_SUBSCRIPTION: anchor strictly to admin approval date (MYT day boundary).
    // RENEWAL: continue from existing end if possible.
    // ADDON_PURCHASE: do not shift core subscription period.
    if (billingType !== 'ADDON_PURCHASE') {
      let periodStart: Date;
      let periodEnd: Date;

      if (
        billingType === 'RENEWAL' &&
        decision.period_start &&
        decision.period_end &&
        !Number.isNaN(new Date(decision.period_start).getTime()) &&
        !Number.isNaN(new Date(decision.period_end).getTime())
      ) {
        periodStart = new Date(decision.period_start);
        periodEnd = new Date(decision.period_end);
      } else {
        periodStart =
          billingType === 'FIRST_SUBSCRIPTION'
            ? approvedAnchor
            : existingSub
              ? existingSub.currentPeriodEnd
              : approvedAnchor;
        periodEnd = addMonthsClamped(periodStart, 1);
      }

      if (existingSub) {
        await tx.subscription.update({
          where: { tenantId: request.tenantId },
          data: {
            status: 'ACTIVE',
            autoRenew: true,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            gracePeriodEnd: null,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            tenantId: request.tenantId,
            plan: 'standard',
            status: 'ACTIVE',
            autoRenew: true,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        });
      }
    }

    await tx.tenant.update({
      where: { id: request.tenantId },
      data: {
        subscriptionStatus: 'PAID',
        subscribedAt: approvedAt,
        ...(billingType === 'FIRST_SUBSCRIPTION' ? { subscriptionAmount: request.amountCents } : {}),
      },
    });

    const normalizedAddOns = Array.isArray(request.requestedAddOns)
      ? request.requestedAddOns.filter((v): v is string => typeof v === 'string')
      : [];
    for (const addOnType of normalizedAddOns) {
      if (addOnType !== 'TRUESEND' && addOnType !== 'TRUEIDENTITY') continue;
      await tx.tenantAddOn.upsert({
        where: {
          tenantId_addOnType: {
            tenantId: request.tenantId,
            addOnType,
          },
        },
        create: {
          tenantId: request.tenantId,
          addOnType,
          status: 'ACTIVE',
          enabledAt: approvedAt,
        },
        update: {
          status: 'ACTIVE',
          enabledAt: approvedAt,
          cancelledAt: null,
        },
      });
    }

    await tx.subscriptionPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        approvedAt,
        rejectedAt: null,
        rejectionReason: null,
        decisionReceivedAt: approvedAt,
        decisionMetadata: decision as unknown as object,
      },
    });

    await tx.billingEvent.create({
      data: {
        tenantId: request.tenantId,
        eventType: billingType === 'RENEWAL' ? 'SUBSCRIPTION_RENEWED' : 'PAYMENT_RECEIVED',
        metadata: {
          requestId: request.requestId,
          billingType,
          approvedAt: approvedAt.toISOString(),
        },
      },
    });

    // Referral eligibility: only first approved subscription payment for a referred user.
    if (billingType === 'FIRST_SUBSCRIPTION') {
      const firstApprovedCount = await tx.subscriptionPaymentRequest.count({
        where: {
          tenantId: request.tenantId,
          status: 'APPROVED',
          billingType: 'FIRST_SUBSCRIPTION',
        },
      });
      if (firstApprovedCount <= 1) {
        const ownerMember = request.tenant.members[0];
        if (ownerMember?.userId) {
          await tx.referral.updateMany({
            where: {
              referredUserId: ownerMember.userId,
              isPaid: false,
            },
            data: {
              isEligible: true,
              eligibleAt: approvedAt,
            },
          });
        }
      }
    }
  });
}

export async function applyRejectedDecision(decision: PaymentDecision): Promise<void> {
  const request = await prisma.subscriptionPaymentRequest.findUnique({
    where: { requestId: decision.request_id },
  });
  if (!request) return;
  if (request.status === 'REJECTED') {
    const incomingReason = decision.rejection_reason?.trim() || null;
    const storedReason = request.rejectionReason?.trim() || null;
    const incomingRejectedAt = decision.rejected_at ? new Date(decision.rejected_at) : null;

    // Backfill reason/timestamp for already-rejected requests when the webhook/cron
    // arrives later with richer decision details.
    if (incomingReason && (!storedReason || !request.rejectedAt)) {
      await prisma.subscriptionPaymentRequest.update({
        where: { id: request.id },
        data: {
          rejectionReason: storedReason ?? incomingReason,
          rejectedAt: request.rejectedAt ?? incomingRejectedAt ?? new Date(),
          decisionReceivedAt: new Date(),
          decisionMetadata: decision as unknown as object,
        },
      });
    }
    return;
  }

  const rejectedAt = decision.rejected_at ? new Date(decision.rejected_at) : new Date();
  await prisma.$transaction(async (tx) => {
    await tx.subscriptionPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        rejectedAt,
        rejectionReason: decision.rejection_reason || 'Rejected by admin',
        decisionReceivedAt: rejectedAt,
        decisionMetadata: decision as unknown as object,
      },
    });

    if (request.invoiceId) {
      if (request.billingType === 'RENEWAL') {
        // Rejected proof should NOT force immediate overdue.
        // Keep the renewal invoice collectible during the 14-day due window,
        // and only mark overdue when dueAt has passed.
        const renewalInvoice = await tx.invoice.findUnique({
          where: { id: request.invoiceId },
          select: { dueAt: true },
        });
        const shouldBeOverdue = renewalInvoice
          ? renewalInvoice.dueAt < startOfMytDayUtc(rejectedAt)
          : false;

        await tx.invoice.updateMany({
          where: {
            id: request.invoiceId,
            status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
          },
          data: {
            status: shouldBeOverdue ? 'OVERDUE' : 'ISSUED',
          },
        });

        await tx.tenant.update({
          where: { id: request.tenantId },
          data: { subscriptionStatus: shouldBeOverdue ? 'OVERDUE' : 'PAID' },
        });
      } else {
        await tx.invoice.updateMany({
          where: {
            id: request.invoiceId,
            status: { in: ['ISSUED', 'PENDING_APPROVAL'] },
          },
          data: {
            status: 'REJECTED',
          },
        });
      }
    }
  });
}

async function generateRenewalInvoices(now: Date): Promise<number> {
  let created = 0;
  const truesendMonthly = Number(process.env.TRUESEND_MONTHLY_PRICE_MYR || '50');
  // Create renewal invoice on the expiry day (not the day after).
  // If period ends March 7 00:00 MYT, expiry day is March 6. Use start of tomorrow
  // so the cron running on March 6 creates the invoice for the user to pay.
  const startOfTomorrowMyt = startOfMytDayUtc(addDays(now, 1));
  const subs = await prisma.subscription.findMany({
    where: {
      autoRenew: true,
      status: 'ACTIVE',
      currentPeriodEnd: { lte: startOfTomorrowMyt },
    },
    include: {
      tenant: true,
    },
  });

  for (const sub of subs) {
    const existing = await prisma.invoice.findFirst({
      where: {
        tenantId: sub.tenantId,
        billingType: 'RENEWAL',
        periodStart: sub.currentPeriodEnd,
      },
    });
    if (existing) continue;

    const nextPeriodStart = sub.currentPeriodEnd;
    const nextPeriodEnd = addMonthsClamped(nextPeriodStart, 1);
    // Always renew from the core plan base price; add-ons and tax are added as separate line items.
    const baseAmount = CORE_AMOUNT_CENTS / 100;

    const [truesendAddOn, usageRows] = await Promise.all([
      prisma.tenantAddOn.findUnique({
        where: {
          tenantId_addOnType: {
            tenantId: sub.tenantId,
            addOnType: 'TRUESEND',
          },
        },
      }),
      getUsageForTenant(sub.tenantId, sub.currentPeriodStart, sub.currentPeriodEnd, { toDateExclusive: true }),
    ]);

    const truesendAmount = truesendAddOn?.status === 'ACTIVE' ? truesendMonthly : 0;
    const verificationCount = usageRows.reduce((sum, row) => sum + row.count, 0);
    const { usageAmountMyr: usageAmount, unitPriceMyr } = computeUsageAmount(verificationCount);
    const subtotal = safeAdd(baseAmount, truesendAmount, usageAmount);
    const sstAmount = safeMultiply(subtotal, 0.08);
    const totalAmount = safeAdd(subtotal, sstAmount);
    const invoiceMeta = await generateInvoiceNumber(sub.tenantId, sub.tenant.slug, now);

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId: sub.tenantId,
          invoiceNumber: invoiceMeta.invoiceNumber,
          sequenceNumber: invoiceMeta.sequence,
          amount: totalAmount,
          status: 'ISSUED',
          billingType: 'RENEWAL',
          periodStart: nextPeriodStart,
          periodEnd: nextPeriodEnd,
          issuedAt: nextPeriodStart, // Use expiration date, not cron run time
          dueAt: addDays(nextPeriodStart, 14),
        },
      });

      await tx.invoiceLineItem.createMany({
        data: [
          {
            invoiceId: invoice.id,
            itemType: 'SUBSCRIPTION',
            description: 'Subscription renewal',
            unitPrice: baseAmount,
            quantity: 1,
            amount: baseAmount,
          },
          ...(truesendAmount > 0
            ? [{
                invoiceId: invoice.id,
                itemType: 'ADDON',
                description: 'TrueSend add-on',
                unitPrice: truesendAmount,
                quantity: 1,
                amount: truesendAmount,
              }]
            : []),
          ...(usageAmount > 0
            ? [{
                invoiceId: invoice.id,
                itemType: 'USAGE',
                description: `TrueIdentity usage (${verificationCount} verifications)`,
                unitPrice: unitPriceMyr,
                quantity: verificationCount,
                amount: usageAmount,
              }]
            : []),
          {
            invoiceId: invoice.id,
            itemType: 'SST',
            description: 'SST (8%)',
            unitPrice: sstAmount,
            quantity: 1,
            amount: sstAmount,
          },
        ],
      });

      await tx.billingEvent.create({
        data: {
          tenantId: sub.tenantId,
          eventType: 'INVOICE_ISSUED',
          metadata: {
            billingType: 'RENEWAL',
            invoiceId: invoice.id,
          },
        },
      });
    });

    created++;
  }
  return created;
}

function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function reconcileUsageWithAdmin(now: Date): Promise<number> {
  let backfilled = 0;
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'GRACE_PERIOD', 'BLOCKED'] },
    },
    select: {
      tenantId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      tenant: {
        select: {
          addOns: {
            where: { addOnType: 'TRUEIDENTITY', status: 'ACTIVE' },
            select: { id: true },
          },
        },
      },
    },
  });

  for (const sub of subscriptions) {
    if (sub.tenant.addOns.length === 0) continue;

    const localRows = await getUsageForTenant(sub.tenantId, sub.currentPeriodStart, sub.currentPeriodEnd, { toDateExclusive: true });
    const localCount = localRows.reduce((sum, row) => sum + row.count, 0);

    let adminUsage: Awaited<ReturnType<typeof fetchAdminUsage>> = null;
    try {
      adminUsage = await fetchAdminUsage(sub.tenantId, sub.currentPeriodStart, sub.currentPeriodEnd);
    } catch {
      continue;
    }
    if (!adminUsage) continue;

    const adminCount = Math.max(0, adminUsage.verification_count);
    const periodStart = startOfDayUtc(sub.currentPeriodStart);
    const periodEnd = startOfDayUtc(sub.currentPeriodEnd);
    if (adminCount < localCount) {
      let excess = localCount - adminCount;
      const rowsToTrim = await prisma.trueIdentityUsageDaily.findMany({
        where: {
          tenantId: sub.tenantId,
          usageDate: { gte: periodStart, lt: periodEnd },
        },
        orderBy: { usageDate: 'desc' },
        select: {
          id: true,
          count: true,
        },
      });
      if (rowsToTrim.length === 0) continue;

      await prisma.$transaction(async (tx) => {
        for (const row of rowsToTrim) {
          if (excess <= 0) break;
          const deduction = Math.min(excess, row.count);
          const nextCount = row.count - deduction;
          excess -= deduction;

          if (nextCount <= 0) {
            await tx.trueIdentityUsageDaily.delete({ where: { id: row.id } });
          } else {
            await tx.trueIdentityUsageDaily.update({
              where: { id: row.id },
              data: { count: nextCount },
            });
          }
        }
      });
      continue;
    }
    if (adminCount === localCount) continue;

    const missing = adminCount - localCount;
    // Store backfill on the last day of the period so generateRenewalInvoices (which queries
    // [currentPeriodStart, currentPeriodEnd) exclusive) will include it. currentPeriodEnd is
    // the start of the next period, so last day = currentPeriodEnd - 1 day.
    const lastDayOfPeriod = addDays(sub.currentPeriodEnd, -1);
    const usageDate = startOfDayUtc(lastDayOfPeriod);
    await prisma.trueIdentityUsageDaily.upsert({
      where: {
        tenantId_usageDate: {
          tenantId: sub.tenantId,
          usageDate,
        },
      },
      create: {
        tenantId: sub.tenantId,
        usageDate,
        count: missing,
      },
      update: {
        count: { increment: missing },
      },
    });
    backfilled += missing;
  }

  return backfilled;
}

/**
 * Mark tenants overdue only when invoice dueAt has passed.
 * Invoices use dueAt = periodStart + 14 days, so tenants get a 14-day grace period
 * after the billing period ends before being marked OVERDUE.
 */
async function markOverdue(now: Date): Promise<number> {
  const overdueBefore = startOfMytDayUtc(now);

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PENDING_APPROVAL'] },
      // dueAt is stored as the start of the MYT due date, so an invoice becomes
      // overdue only once the next MYT day begins.
      dueAt: { lt: overdueBefore },
    },
    select: { id: true, tenantId: true },
  });
  if (overdueInvoices.length === 0) return 0;

  const tenantIds = [...new Set(overdueInvoices.map((inv) => inv.tenantId))];
  await prisma.$transaction([
    prisma.invoice.updateMany({
      where: { id: { in: overdueInvoices.map((inv) => inv.id) } },
      data: { status: 'OVERDUE' },
    }),
    prisma.tenant.updateMany({
      where: { id: { in: tenantIds } },
      data: { subscriptionStatus: 'OVERDUE' },
    }),
  ]);

  for (const tenantId of tenantIds) {
    await prisma.billingEvent.create({
      data: {
        tenantId,
        eventType: 'OVERDUE_MARKED',
        metadata: { markedAt: now.toISOString() },
      },
    });
  }

  return overdueInvoices.length;
}

/**
 * Safety reconciliation:
 * If a renewal invoice was marked OVERDUE before dueAt, restore it to ISSUED.
 * Also restore tenant subscription status to PAID when they have no truly overdue invoices.
 */
async function restorePreDueRenewals(now: Date): Promise<number> {
  const overdueBefore = startOfMytDayUtc(now);
  const premature = await prisma.invoice.findMany({
    where: {
      billingType: 'RENEWAL',
      status: 'OVERDUE',
      dueAt: { gte: overdueBefore },
    },
    select: { id: true, tenantId: true },
  });
  if (premature.length === 0) return 0;

  const invoiceIds = premature.map((inv) => inv.id);
  const tenantIds = [...new Set(premature.map((inv) => inv.tenantId))];

  await prisma.invoice.updateMany({
    where: { id: { in: invoiceIds } },
    data: { status: 'ISSUED' },
  });

  await prisma.tenant.updateMany({
    where: {
      id: { in: tenantIds },
      subscriptionStatus: 'OVERDUE',
      invoices: {
        none: {
          status: 'OVERDUE',
          dueAt: { lt: overdueBefore },
        },
      },
    },
    data: { subscriptionStatus: 'PAID' },
  });

  return invoiceIds.length;
}

async function sendExpiryReminders(now: Date): Promise<void> {
  const reminderDays = [7, 3, 1];
  for (const days of reminderDays) {
    const target = new Date(now);
    target.setUTCDate(target.getUTCDate() + days);
    const targetStart = startOfMytDayUtc(target);
    const targetEnd = new Date(targetStart);
    targetEnd.setUTCDate(targetEnd.getUTCDate() + 1);

    const expiringSubs = await prisma.subscription.findMany({
      where: {
        autoRenew: true,
        status: 'ACTIVE',
        currentPeriodEnd: {
          gte: targetStart,
          lt: targetEnd,
        },
      },
      include: {
        tenant: true,
      },
    });

    for (const sub of expiringSubs) {
      const existing = await prisma.notification.findFirst({
        where: {
          tenantId: sub.tenantId,
          type: 'email',
          subject: `Payment reminder - ${days} days remaining`,
          createdAt: { gte: sub.currentPeriodStart },
        },
      });
      if (existing) continue;
      await NotificationService.sendBillingReminder(sub.tenantId, days);
    }
  }
}

async function processCancellations(now: Date): Promise<void> {
  const cancellations = await prisma.subscription.findMany({
    where: {
      autoRenew: false,
      currentPeriodEnd: { lte: now },
      status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
    },
    select: { tenantId: true },
  });
  if (cancellations.length === 0) return;

  const tenantIds = cancellations.map((s) => s.tenantId);
  await prisma.$transaction([
    prisma.subscription.updateMany({
      where: { tenantId: { in: tenantIds } },
      data: { status: 'CANCELLED' },
    }),
    prisma.tenant.updateMany({
      where: { id: { in: tenantIds } },
      data: { subscriptionStatus: 'FREE' },
    }),
    prisma.tenantAddOn.updateMany({
      where: {
        tenantId: { in: tenantIds },
        status: 'ACTIVE',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
      },
    }),
  ]);
}

async function applyCreditNotes(): Promise<void> {
  const notes = await prisma.creditNote.findMany({
    where: {
      appliedToInvoiceId: null,
      isRefunded: false,
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const note of notes) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        tenantId: note.tenantId,
        status: { in: ['ISSUED', 'PENDING_APPROVAL', 'OVERDUE'] },
      },
      orderBy: { issuedAt: 'asc' },
    });
    if (!invoice) continue;

    const amount = toSafeNumber(note.amount);
    await prisma.$transaction(async (tx) => {
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          itemType: 'CREDIT_NOTE',
          description: `Credit note applied (${note.id})`,
          unitPrice: -amount,
          quantity: 1,
          amount: -amount,
        },
      });

      const newAmount = Math.max(0, safeSubtract(toSafeNumber(invoice.amount), amount));
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amount: newAmount },
      });

      await tx.creditNote.update({
        where: { id: note.id },
        data: { appliedToInvoiceId: invoice.id },
      });
    });
  }
}

export class BillingCronService {
  static async run(): Promise<void> {
    const startedAt = new Date();
    const runId = nanoid(12);
    const lockRows = await prisma.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_lock(hashtext('billing_daily')) AS acquired`
    );
    const lockAcquired = Boolean(lockRows?.[0]?.acquired);
    if (!lockAcquired) {
      return;
    }

    let tenantsProcessed = 0;
    let invoicesCreated = 0;
    let approvalsApplied = 0;
    const errors: Array<{ step: string; message: string }> = [];

    let runLogId: string | null = null;
    try {
      const runLog = await prisma.billingRunLog.create({
        data: {
          startedAt,
          status: 'RUNNING',
          errors: { runId },
        },
      });
      runLogId = runLog.id;

      const lastSuccess = await prisma.billingRunLog.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { completedAt: 'desc' },
      });
      const backfillFrom = lastSuccess?.completedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

      let decisions: PaymentDecision[] = [];
      try {
        decisions = await pullPaymentDecisions(backfillFrom);
      } catch (error) {
        errors.push({ step: 'pull_decisions', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      for (const decision of decisions) {
        try {
          if (decision.status === 'approved') {
            await applyApprovedDecision(decision);
            approvalsApplied++;
          } else if (decision.status === 'rejected') {
            await applyRejectedDecision(decision);
          }
        } catch (error) {
          errors.push({
            step: `apply_decision:${decision.request_id}`,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      try {
        await reconcileUsageWithAdmin(new Date());
      } catch (error) {
        errors.push({ step: 'reconcile_usage', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        invoicesCreated += await generateRenewalInvoices(new Date());
      } catch (error) {
        errors.push({ step: 'generate_renewals', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        await restorePreDueRenewals(new Date());
      } catch (error) {
        errors.push({ step: 'restore_pre_due', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        tenantsProcessed += await markOverdue(new Date());
      } catch (error) {
        errors.push({ step: 'mark_overdue', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        await sendExpiryReminders(new Date());
      } catch (error) {
        errors.push({ step: 'send_reminders', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        await processCancellations(new Date());
      } catch (error) {
        errors.push({ step: 'process_cancellations', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        await applyCreditNotes();
      } catch (error) {
        errors.push({ step: 'apply_credit_notes', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      await prisma.billingRunLog.update({
        where: { id: runLogId },
        data: {
          completedAt: new Date(),
          status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
          backfillFrom,
          tenantsProcessed,
          invoicesCreated,
          approvalsApplied,
          errors: errors.length > 0 ? (errors as unknown as object) : undefined,
        },
      });
    } catch (error) {
      if (runLogId) {
        await prisma.billingRunLog.update({
          where: { id: runLogId },
          data: {
            completedAt: new Date(),
            status: 'FAILED',
            errors: [
              ...errors,
              { step: 'fatal', message: error instanceof Error ? error.message : 'Unknown error' },
            ],
          },
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(hashtext('billing_daily'))`);
    }
  }
}
