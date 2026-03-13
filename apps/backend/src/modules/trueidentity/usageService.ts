/**
 * TrueIdentity usage aggregation for billing.
 * Records verification starts per tenant per day.
 * Uses MYT (Asia/Kuala_Lumpur) for day boundaries to align with subscription billing periods.
 */

import { prisma } from '../../lib/prisma.js';
import { safeMultiply } from '../../lib/math.js';

function startOfMytDayUtc(d: Date): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(d).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export async function recordVerificationStart(tenantId: string): Promise<void> {
  const today = startOfMytDayUtc(new Date());
  await prisma.trueIdentityUsageDaily.upsert({
    where: {
      tenantId_usageDate: { tenantId, usageDate: today },
    },
    create: { tenantId, usageDate: today, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export async function recordVerificationComplete(tenantId: string): Promise<void> {
  const today = startOfMytDayUtc(new Date());
  await prisma.trueIdentityUsageDaily.upsert({
    where: {
      tenantId_usageDate: { tenantId, usageDate: today },
    },
    create: { tenantId, usageDate: today, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export function computeUsageAmount(verificationCount: number): {
  usageAmountMyr: number;
  unitPriceMyr: number;
} {
  const unitPriceMyr = Number(process.env.TRUEIDENTITY_UNIT_PRICE_MYR || '4');
  const usageAmountMyr = safeMultiply(verificationCount, unitPriceMyr);
  return { usageAmountMyr, unitPriceMyr };
}

export async function getUsageForTenant(
  tenantId: string,
  fromDate?: Date,
  toDate?: Date,
  options?: { toDateExclusive?: boolean }
): Promise<{ date: string; count: number }[]> {
  // Use provided dates as-is when they are MYT-anchored billing boundaries; otherwise use MYT for defaults
  const from = fromDate ?? startOfMytDayUtc(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const to = toDate ?? startOfMytDayUtc(new Date());
  const upperBound = options?.toDateExclusive ? { lt: to } : { lte: to };

  const rows = await prisma.trueIdentityUsageDaily.findMany({
    where: {
      tenantId,
      usageDate: { gte: from, ...upperBound },
    },
    orderBy: { usageDate: 'asc' },
  });

  // Fetch paid usage for this period to subtract already-settled counts
  const paidRows = await prisma.trueIdentityUsagePaid.findMany({
    where: {
      tenantId,
      usageDate: { gte: from, ...upperBound },
    },
    orderBy: { usageDate: 'asc' },
  });

  // Build a map of paidCount per date
  const paidByDate = new Map<string, number>();
  for (const pr of paidRows) {
    const key = pr.usageDate.toISOString().slice(0, 10);
    paidByDate.set(key, (paidByDate.get(key) ?? 0) + pr.count);
  }

  return rows
    .map((r) => {
      const key = r.usageDate.toISOString().slice(0, 10);
      const paid = paidByDate.get(key) ?? 0;
      return {
        date: key,
        count: Math.max(0, r.count - paid),
      };
    })
    .filter((r) => r.count > 0);
}

/**
 * Record which usage days were settled by a paid invoice.
 * Called when a RENEWAL invoice is marked PAID.
 * Inserts one TrueIdentityUsagePaid row per usage day billed.
 */
export async function recordPaidUsage(params: {
  tenantId: string;
  invoiceId: string;
  paidAt: Date;
  usageRows: { date: string; count: number }[];
}): Promise<void> {
  const { tenantId, invoiceId, paidAt, usageRows } = params;
  if (usageRows.length === 0) return;

  await prisma.trueIdentityUsagePaid.createMany({
    data: usageRows.map((row) => ({
      tenantId,
      invoiceId,
      usageDate: new Date(row.date),
      count: row.count,
      paidAt,
    })),
    skipDuplicates: true,
  });
}
