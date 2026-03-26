/**
 * TrueIdentity usage aggregation. Pro has no invoice settlement against usage (no TrueIdentityUsagePaid).
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

  return rows
    .map((r) => ({
      date: r.usageDate.toISOString().slice(0, 10),
      count: r.count,
    }))
    .filter((r) => r.count > 0);
}

/** Legacy hook for invoice settlement; no-op in Pro. */
export async function recordPaidUsage(_params: {
  tenantId: string;
  invoiceId: string;
  paidAt: Date;
  usageRows: { date: string; count: number }[];
}): Promise<void> {
  // Intentionally empty
}
