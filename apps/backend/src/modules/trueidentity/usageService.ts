/**
 * TrueIdentity usage aggregation for billing.
 * Records verification starts per tenant per day.
 */

import { prisma } from '../../lib/prisma.js';

function startOfDayUtc(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export async function recordVerificationStart(tenantId: string): Promise<void> {
  const today = startOfDayUtc(new Date());
  await prisma.trueIdentityUsageDaily.upsert({
    where: {
      tenantId_usageDate: { tenantId, usageDate: today },
    },
    create: { tenantId, usageDate: today, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export async function getUsageForTenant(
  tenantId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<{ date: string; count: number }[]> {
  const from = fromDate ? startOfDayUtc(fromDate) : startOfDayUtc(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const to = toDate ? startOfDayUtc(toDate) : startOfDayUtc(new Date());

  const rows = await prisma.trueIdentityUsageDaily.findMany({
    where: {
      tenantId,
      usageDate: { gte: from, lte: to },
    },
    orderBy: { usageDate: 'asc' },
  });

  return rows.map((r) => ({
    date: r.usageDate.toISOString().slice(0, 10),
    count: r.count,
  }));
}
