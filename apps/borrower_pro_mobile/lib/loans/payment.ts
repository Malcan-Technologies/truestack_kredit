/**
 * Helpers for the borrower "Make payment" flow.
 *
 * Mirrors `apps/borrower_pro/components/loan-center/borrower-make-payment-page.tsx` so
 * web and mobile generate references and parse amounts identically.
 */

import { toAmountNumber } from '@/lib/loans/currency';

/**
 * Generate a deterministic-looking transfer reference borrowers paste into their
 * bank app's recipient reference / payment note field. Format:
 * `TSK-<loanPart>-<timestampPart>-<randomPart>`.
 */
export function generateTransferReference(loanId: string): string {
  const loanPart =
    loanId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'LOAN';
  const timestampPart = new Date().toISOString().replace(/\D/g, '').slice(-10);
  const randomPart =
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
      : Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TSK-${loanPart}-${timestampPart}-${randomPart}`;
}

/**
 * Display value for the custom amount field: en-MY style (comma thousands, dot
 * decimals, max 2 dp). Does not include a "RM" prefix — that is shown beside
 * the input.
 */
export function formatMalaysiaMoneyInput(raw: string): string {
  let s = raw.replace(/^\s*RM\s*/i, '').trim();
  s = s.replace(/[^\d.]/g, '');
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) {
    s = s.slice(0, dotIdx + 1) + s.slice(dotIdx + 1).replace(/\./g, '');
  }
  const parts = s.split('.');
  let intRaw = parts[0] ?? '';
  const decRaw = (parts[1] ?? '').slice(0, 2);

  if (intRaw === '' && decRaw === '') {
    return s === '.' ? '0.' : '';
  }
  if (intRaw === '' && decRaw !== '') {
    return '0.' + decRaw;
  }

  intRaw = intRaw.replace(/^0+(?=\d)/, '') || '0';
  const intNum = parseInt(intRaw, 10);
  if (!Number.isFinite(intNum)) return '';
  const intFormatted = intNum.toLocaleString('en-MY');

  if (parts.length > 1) {
    return intFormatted + '.' + decRaw;
  }
  return intFormatted;
}

/** Parse the formatted money input back into a positive decimal number. */
export function parseMoneyStringToNumber(value: string): number | null {
  const cleaned = value
    .replace(/,/g, '')
    .replace(/^\s*RM\s*/i, '')
    .trim();
  if (cleaned === '' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Outstanding balance on a single repayment row (web parity). */
export function getRepaymentBalance(repayment: {
  totalDue: unknown;
  allocations?: { amount: unknown }[];
}): number {
  const paid = (repayment.allocations ?? []).reduce(
    (sum, allocation) => sum + toAmountNumber(allocation.amount),
    0,
  );
  return Math.max(0, toAmountNumber(repayment.totalDue) - paid);
}

/**
 * Resolve the next payable instalment from a borrower schedule payload.
 * Returns `null` when the loan is fully paid / has no actionable instalment.
 */
export function findNextPayableInstalment(
  repayments: {
    status: string;
    dueDate: string;
    totalDue: unknown;
    allocations?: { amount: unknown }[];
  }[],
): { dueDate: string; balance: number } | null {
  const next = repayments.find((r) => {
    if (r.status === 'PAID' || r.status === 'CANCELLED') {
      return false;
    }
    return getRepaymentBalance(r) > 0;
  });
  if (!next) return null;
  return { dueDate: next.dueDate, balance: getRepaymentBalance(next) };
}
