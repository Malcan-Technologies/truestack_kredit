/**
 * Schedule / repayment helpers for the loan detail page.
 */

import type { MaterialIcons } from '@expo/vector-icons';

import type { BorrowerStatusTone } from '@/lib/loans/status-label';

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

export interface RepaymentRow {
  id: string;
  dueDate: string;
  principal?: unknown;
  interest?: unknown;
  totalDue: unknown;
  status: string;
  lateFeeAccrued?: unknown;
  lateFeesPaid?: unknown;
  allocations?: {
    id?: string;
    amount: unknown;
    allocatedAt?: string;
    transaction?: {
      id: string;
      receiptPath?: string | null;
      proofPath?: string | null;
    } | null;
  }[];
}

export interface SchedulePayload {
  schedule: {
    repayments: RepaymentRow[];
  } | null;
  summary?: {
    totalOutstanding?: unknown;
    totalPaid?: unknown;
    overdueCount?: number;
  };
}

export function repaymentStatusTone(status: string, isOverdue: boolean): BorrowerStatusTone {
  if (isOverdue && status !== 'PAID') return 'error';
  switch (status) {
    case 'PAID':
      return 'success';
    case 'OVERDUE':
      return 'error';
    case 'PARTIAL':
      return 'warning';
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function repaymentStatusLabel(status: string, isOverdue: boolean): string {
  if (isOverdue && status !== 'PAID' && status !== 'CANCELLED') return 'Overdue';
  return status
    .split('_')
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ');
}

/**
 * MaterialIcons name to render alongside the status label inside a neutral
 * `MetaBadge`. Icons stay glyph-only (no semantic colour) — colour is uniform
 * `textSecondary`. Picks intuitive glyphs for at-a-glance recognition.
 */
export function repaymentStatusIcon(
  status: string,
  isOverdue: boolean,
): MaterialIconName {
  if (isOverdue && status !== 'PAID' && status !== 'CANCELLED') {
    return 'error-outline';
  }
  switch (status) {
    case 'PAID':
      return 'check-circle';
    case 'OVERDUE':
      return 'error-outline';
    case 'PARTIAL':
      return 'pie-chart';
    case 'CANCELLED':
      return 'block';
    default:
      // PENDING, SCHEDULED, etc.
      return 'schedule';
  }
}
