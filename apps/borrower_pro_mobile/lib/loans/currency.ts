/**
 * RM currency formatter for loan-center screens.
 *
 * Web parity: always show two decimal places (e.g. `RM 1,234.50`).
 */

export function toAmountNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatRm(value: unknown): string {
  const n = toAmountNumber(value);
  return `RM ${n.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
