/**
 * TrueIdentity usage aggregation for billing.
 * Verifications are counted when webhook receives kyc.session.completed with result=approved.
 * RM 4 per verification (usage charge).
 */

import { prisma } from '../../lib/prisma.js';

const VERIFICATION_FEE_CENTS = 400; // RM 4.00

export interface UsagePeriodResult {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  count: number;
  amountCents: number;
}

/**
 * Get verification count for a tenant within a date range (inclusive).
 * Uses TrueIdentityUsageDaily aggregated records.
 */
export async function getVerificationUsage(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UsagePeriodResult> {
  const start = new Date(periodStart);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(periodEnd);
  end.setUTCHours(23, 59, 59, 999);

  const records = await prisma.trueIdentityUsageDaily.findMany({
    where: {
      tenantId,
      usageDate: {
        gte: start,
        lte: end,
      },
    },
  });

  const count = records.reduce((sum, r) => sum + r.count, 0);
  const amountCents = count * VERIFICATION_FEE_CENTS;

  return {
    tenantId,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    count,
    amountCents,
  };
}
