/**
 * Schedule / repayment helpers for the loan detail page.
 */

import type { MaterialIcons } from '@expo/vector-icons';

import type { StatusBadgeTone } from '@/components/status-badge';

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

export function repaymentStatusTone(status: string, isOverdue: boolean): StatusBadgeTone {
  const upper = status.toUpperCase();

  if (upper === 'CANCELLED') return 'neutral';
  if (isOverdue && upper !== 'PAID') return 'error';

  switch (upper) {
    case 'PAID':
      return 'success';
    case 'OVERDUE':
      return 'error';
    case 'PARTIAL':
      return 'warning';
    case 'PENDING':
      return 'neutral';
    default: {
      if (
        upper.includes('ARREARS') ||
        upper.includes('DEFAULT') ||
        upper.includes('DELINQUENT') ||
        upper.includes('LATE') ||
        upper.includes('MISSED')
      ) {
        return 'error';
      }
      return 'warning';
    }
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
 * MaterialIcons name for the repayment row badge. Colour comes from `MetaBadge` `tone`.
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
