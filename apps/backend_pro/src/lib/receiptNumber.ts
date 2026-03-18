import { Prisma } from '@prisma/client';
import { getMalaysiaDateString } from './malaysiaTime.js';

export const MAX_RECEIPT_NUMBER_RETRIES = 10;

export async function generateReceiptNumber(
  tx: Prisma.TransactionClient,
  paymentDate: Date
): Promise<string> {
  const dateStr = getMalaysiaDateString(paymentDate).replace(/-/g, '');
  const prefix = `RCP-${dateStr}`;

  // Serialize receipt generation per day-prefix to avoid high-contention collisions.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix})::bigint)`;

  const existingCount = await tx.paymentTransaction.count({
    where: {
      receiptNumber: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(existingCount + 1).padStart(3, '0')}`;
}

function isReceiptNumberUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const target = (error.meta as { target?: string[] | string } | undefined)?.target;
  if (!target) {
    return true;
  }

  if (Array.isArray(target)) {
    return target.includes('receiptNumber');
  }

  return target.includes('receiptNumber');
}

export async function withReceiptNumberRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RECEIPT_NUMBER_RETRIES
): Promise<T> {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempts += 1;
      if (!isReceiptNumberUniqueConstraintError(error) || attempts >= maxRetries) {
        throw error;
      }
    }
  }

  throw new Error('Failed to generate unique receipt number after retries');
}
