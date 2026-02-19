/**
 * TrueIdentity usage aggregation for billing.
 * Counts completed verifications per tenant per period.
 */

import { prisma } from '../../lib/prisma.js';

export async function getVerificationUsage(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const result = await prisma.trueIdentityUsageDaily.aggregate({
    where: {
      tenantId,
      usageDate: { gte: periodStart, lte: periodEnd },
    },
    _sum: { count: true },
  });
  return result._sum.count ?? 0;
}
