import { Prisma } from '@prisma/client';

export const MAX_RECEIPT_NUMBER_RETRIES = 3;

export async function generateReceiptNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  paymentDate: Date
): Promise<string> {
  const dateStr = paymentDate.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `RCP-${dateStr}`;

  const existingCount = await tx.paymentTransaction.count({
    where: {
      tenantId,
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
