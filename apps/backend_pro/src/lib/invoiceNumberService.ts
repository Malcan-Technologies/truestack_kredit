import { prisma } from './prisma.js';

function sanitizeSlug(input: string): string {
  const compact = input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return compact.slice(0, 24) || 'TENANT';
}

function toYearMonthUTC(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * Deterministic format: INV-{TENANT_SLUG}-{YYYYMM}-{SEQ}
 */
export async function generateInvoiceNumber(tenantId: string, tenantSlug: string, now = new Date()): Promise<{
  invoiceNumber: string;
  yearMonth: string;
  sequence: number;
}> {
  const yearMonth = toYearMonthUTC(now);
  const slug = sanitizeSlug(tenantSlug);

  const sequenceRow = await prisma.invoiceSequence.upsert({
    where: {
      tenantId_yearMonth: {
        tenantId,
        yearMonth,
      },
    },
    create: {
      tenantId,
      yearMonth,
      lastSeq: 1,
    },
    update: {
      lastSeq: { increment: 1 },
    },
    select: {
      lastSeq: true,
    },
  });

  const sequence = sequenceRow.lastSeq;
  const seqString = String(sequence).padStart(4, '0');
  return {
    invoiceNumber: `INV-${slug}-${yearMonth}-${seqString}`,
    yearMonth,
    sequence,
  };
}
