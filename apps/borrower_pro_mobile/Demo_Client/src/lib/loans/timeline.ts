/**
 * Borrower-facing loan timeline helpers — label/icon mapping plus change diffing for
 * the loan detail "Activity" section. Mirrors web `borrower-loan-servicing-panel.tsx`
 * (`borrowerTimelineActionInfo`, `borrowerTimelineActorLabel`, `getAuditChanges`).
 */

import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

import { formatRm, toAmountNumber } from '@/lib/loans/currency';
import { formatDateTime } from '@/lib/format/date';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export interface TimelineActionInfo {
  label: string;
  icon: MaterialIconName;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function borrowerTimelineActionInfo(action: string): TimelineActionInfo {
  switch (action) {
    case 'CREATE':
      return { label: 'Loan created', icon: 'check-circle' };
    case 'DISBURSE':
      return { label: 'Loan disbursed', icon: 'payments' };
    case 'BORROWER_MANUAL_PAYMENT_REQUEST_CREATED':
      return { label: 'Manual payment submitted', icon: 'credit-card' };
    case 'BORROWER_MANUAL_PAYMENT_APPROVED':
      return { label: 'Manual payment approved', icon: 'check-circle' };
    case 'BORROWER_MANUAL_PAYMENT_REJECTED':
      return { label: 'Manual payment rejected', icon: 'cancel' };
    case 'BORROWER_ATTESTATION_MEETING_REQUESTED':
      return { label: 'Attestation meeting requested', icon: 'event' };
    case 'BORROWER_ATTESTATION_RESTARTED':
      return { label: 'Attestation restarted', icon: 'schedule' };
    case 'BORROWER_EARLY_SETTLEMENT_REQUEST_CREATED':
      return { label: 'Early settlement request submitted', icon: 'percent' };
    case 'BORROWER_EARLY_SETTLEMENT_APPROVED':
      return { label: 'Early settlement approved', icon: 'check-circle' };
    case 'BORROWER_EARLY_SETTLEMENT_REJECTED':
      return { label: 'Early settlement request declined', icon: 'cancel' };
    case 'RECORD_PAYMENT':
      return { label: 'Payment recorded', icon: 'credit-card' };
    case 'BORROWER_ATTESTATION_SLOT_PROPOSED':
      return { label: 'Attestation slot proposed', icon: 'event' };
    case 'ADMIN_ATTESTATION_PROPOSAL_ACCEPTED':
      return { label: 'Attestation slot accepted', icon: 'event' };
    case 'BORROWER_ATTESTATION_COMPLETE':
      return { label: 'Attestation completed', icon: 'check-circle' };
    case 'BORROWER_UPLOAD_AGREEMENT':
    case 'UPLOAD_AGREEMENT':
      return { label: 'Signed agreement uploaded', icon: 'description' };
    case 'UPLOAD_DISBURSEMENT_PROOF':
      return { label: 'Proof of disbursement uploaded', icon: 'description' };
    case 'UPLOAD_STAMP_CERTIFICATE':
      return { label: 'Stamp certificate uploaded', icon: 'shield' };
    case 'STATUS_UPDATE':
      return { label: 'Loan status updated', icon: 'schedule' };
    case 'LATE_FEE_ACCRUAL':
      return { label: 'Late fees charged', icon: 'warning' };
    case 'DEFAULT_READY':
      return { label: 'Default threshold reached', icon: 'warning' };
    case 'EARLY_SETTLEMENT':
      return { label: 'Early settlement recorded', icon: 'payments' };
    case 'EXPORT':
      return { label: 'Document exported', icon: 'description' };
    case 'COMPLETE':
      return { label: 'Loan completed', icon: 'check-circle' };
    case 'MARK_DEFAULT':
      return { label: 'Loan marked default', icon: 'cancel' };
    case 'BORROWER_DIGITAL_SIGN_AGREEMENT':
      return { label: 'Agreement digitally signed', icon: 'verified-user' };
    case 'SIGNED_AGREEMENT_EMAILED':
      return { label: 'Signed agreement emailed', icon: 'task' };
    case 'SIGNED_AGREEMENT_EMAIL_FAILED':
      return { label: 'Agreement email failed', icon: 'task' };
    case 'INTERNAL_SIGN_COMPANY_REP':
      return { label: 'Company rep signed', icon: 'verified-user' };
    case 'INTERNAL_SIGN_WITNESS':
      return { label: 'Witness signed', icon: 'verified-user' };
    default:
      return { label: humanize(action), icon: 'schedule' };
  }
}

export function borrowerTimelineActorLabel(event: {
  action: string;
  user: { id: string; email: string; name: string | null } | null;
}): string | null {
  if (event.user?.name || event.user?.email) {
    return event.user.name || event.user.email;
  }
  if (
    event.action === 'BORROWER_MANUAL_PAYMENT_APPROVED' ||
    event.action === 'BORROWER_MANUAL_PAYMENT_REJECTED'
  ) {
    return 'Admin';
  }
  if (event.action.startsWith('BORROWER_')) return 'You';
  if (event.action.startsWith('ADMIN_')) return 'Admin';

  const adminInitiatedActions = [
    'DISBURSE',
    'STATUS_UPDATE',
    'RECORD_PAYMENT',
    'LATE_FEE_ACCRUAL',
    'EARLY_SETTLEMENT',
    'UPLOAD_DISBURSEMENT_PROOF',
    'UPLOAD_STAMP_CERTIFICATE',
    'UPLOAD_AGREEMENT',
    'EXPORT',
    'COMPLETE',
    'MARK_DEFAULT',
    'INTERNAL_SIGN_COMPANY_REP',
    'INTERNAL_SIGN_WITNESS',
    'SIGNED_AGREEMENT_EMAILED',
    'SIGNED_AGREEMENT_EMAIL_FAILED',
  ];

  if (adminInitiatedActions.includes(event.action)) return 'Admin';
  if (event.user) return 'Admin';
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  reason: 'Reason',
  amount: 'Amount',
  totalAmount: 'Amount',
  totalDue: 'Total due',
  totalPaid: 'Total paid',
  totalFeeCharged: 'Late fee charged',
  totalLateFees: 'Late fees',
  totalLateFeesPaid: 'Late fees paid',
  lateFee: 'Late fee',
  discountAmount: 'Discount',
  settlementAmount: 'Settlement amount',
  receiptNumber: 'Receipt number',
  reference: 'Reference',
  filename: 'File',
  originalName: 'File',
  agreementDate: 'Agreement date',
  documentType: 'Document type',
  repaymentsAffected: 'Repayments affected',
  cancelledRepayments: 'Cancelled repayments',
  paymentDate: 'Payment date',
  disbursementDate: 'Disbursement date',
  borrowerName: 'Borrower',
  borrowerIc: 'Borrower IC',
  attestationStatus: 'Attestation status',
  proposalStartAt: 'Proposed start',
  proposalEndAt: 'Proposed end',
  meetingStartAt: 'Meeting start',
  meetingEndAt: 'Meeting end',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanize(key);
}

export function formatAuditValue(value: unknown, key: string): string {
  if (value == null) return '(empty)';
  if (typeof value === 'number') {
    if (
      Number.isFinite(value) &&
      /(amount|fee|paid|due|value|discount|settlement|principal|interest|total)/i.test(key)
    ) {
      return formatRm(value);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (
      /date|at/i.test(key) ||
      /^\d{4}-\d{2}-\d{2}T/.test(value) ||
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      const formatted = formatDateTime(value);
      if (formatted && formatted !== '—') return formatted;
    }
    if (key === 'status' || key.endsWith('Status') || key === 'documentType') {
      return humanize(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    return value
      .map((item) => (typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)))
      .join('; ');
  }
  return JSON.stringify(value);
}

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

export function getAuditChanges(
  previousData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): AuditChange[] {
  if (!previousData || !newData) return [];
  const keys = Array.from(new Set([...Object.keys(previousData), ...Object.keys(newData)]));
  return keys
    .filter((key) => JSON.stringify(previousData[key]) !== JSON.stringify(newData[key]))
    .map((key) => ({
      field: fieldLabel(key),
      from: formatAuditValue(previousData[key], key),
      to: formatAuditValue(newData[key], key),
    }));
}

export interface ManualPaymentSummary {
  amount: number | null;
  reference: string;
  rejectReason: string;
}

export function extractManualPaymentSummary(event: {
  action: string;
  newData: Record<string, unknown> | null;
}): ManualPaymentSummary {
  const nd = event.newData;
  const isManualPaymentLifecycle =
    event.action === 'BORROWER_MANUAL_PAYMENT_REQUEST_CREATED' ||
    event.action === 'BORROWER_MANUAL_PAYMENT_APPROVED' ||
    event.action === 'BORROWER_MANUAL_PAYMENT_REJECTED';
  const isRecordPayment = event.action === 'RECORD_PAYMENT';

  let amount: number | null = null;
  let reference = '';
  if (isManualPaymentLifecycle && nd) {
    amount = toAmountNumber(nd.amount ?? 0);
    reference = String(nd.reference ?? '').trim();
  } else if (isRecordPayment && nd) {
    amount = toAmountNumber(nd.totalAmount ?? nd.amount ?? 0);
    reference = String(nd.reference ?? '').trim();
  }

  const rejectReason =
    event.action === 'BORROWER_MANUAL_PAYMENT_REJECTED' && nd?.reason != null
      ? String(nd.reason).trim()
      : '';

  return { amount, reference, rejectReason };
}
