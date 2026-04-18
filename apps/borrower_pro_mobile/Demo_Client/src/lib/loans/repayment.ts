/**
 * Schedule / repayment helpers for the loan detail page.
 */

import type { BorrowerStatusTone } from '@/lib/loans/status-label';

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
