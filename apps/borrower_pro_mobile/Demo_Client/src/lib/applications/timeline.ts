/**
 * Application timeline helpers — translate raw audit-log events into the
 * `ActivityTimelineEvent` shape consumed by `ActivityTimelineCard`.
 *
 * Mirrors `applicationTimelineLabel` / `applicationActorLabel` in
 * `apps/borrower_pro/components/application-detail/borrower-application-detail.tsx`,
 * but emits ready-to-render rows so the screen stays declarative.
 */

import type React from 'react';

export interface RawApplicationTimelineEvent {
  id: string;
  action: string;
  previousData: unknown;
  newData: unknown;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Application created',
  UPDATE: 'Application updated',
  SUBMIT: 'Application submitted',
  APPROVE: 'Application approved',
  REJECT: 'Application rejected',
  RETURN_TO_DRAFT: 'Returned for amendments',
  DOCUMENT_UPLOAD: 'Document uploaded',
  DOCUMENT_DELETE: 'Document deleted',
  BORROWER_CREATE_APPLICATION: 'Application created',
  BORROWER_UPDATE_APPLICATION: 'Application updated',
  BORROWER_SUBMIT_APPLICATION: 'Application submitted',
  BORROWER_APPLICATION_DOCUMENT_UPLOAD: 'Document uploaded',
  BORROWER_APPLICATION_DOCUMENT_DELETE: 'Document removed',
  BORROWER_APPLICATION_STATUS_CHANGE: 'Status updated',
  BORROWER_WITHDRAW_APPLICATION: 'Application withdrawn',
  APPLICATION_COUNTER_OFFER: 'Counter offer from lender',
  APPLICATION_ACCEPT_BORROWER_OFFER: 'Borrower offer accepted',
  APPLICATION_REJECT_OFFERS: 'Negotiation offers rejected',
  BORROWER_COUNTER_OFFER: 'Counter offer sent',
  BORROWER_ACCEPT_LENDER_OFFER: 'Lender offer accepted',
  BORROWER_REJECT_OFFERS: 'Pending offers declined',
};

export function applicationTimelineLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function applicationTimelineActorLabel(
  event: RawApplicationTimelineEvent,
): string | null {
  if (event.user?.name ?? event.user?.email)
    return event.user?.name ?? event.user?.email ?? null;
  if (event.action.startsWith('BORROWER_')) return 'You';
  if (
    event.action.startsWith('APPLICATION_') ||
    event.action === 'APPROVE' ||
    event.action === 'REJECT' ||
    event.action === 'RETURN_TO_DRAFT'
  )
    return 'Lender';
  return null;
}

/**
 * Pick a relevant snippet of fields to surface in the inset detail block.
 * Returns a list of `{ label, value }` pairs — callers wrap them in
 * `<ThemedText>`s so styling stays in the screen layer.
 */
export interface TimelineDetailItem {
  /** When set, shown as `<bold>label</bold>: value`. */
  label?: string;
  value: string;
  emphasis?: boolean;
}

export function applicationTimelineDetailItems(
  event: RawApplicationTimelineEvent,
): TimelineDetailItem[] {
  const nd =
    event.newData && typeof event.newData === 'object'
      ? (event.newData as Record<string, unknown>)
      : null;
  const prev =
    event.previousData && typeof event.previousData === 'object'
      ? (event.previousData as Record<string, unknown>)
      : null;

  if (
    (event.action === 'DOCUMENT_UPLOAD' ||
      event.action === 'BORROWER_APPLICATION_DOCUMENT_UPLOAD') &&
    nd
  ) {
    return [
      {
        label: 'Uploaded',
        value: String(nd.originalName ?? nd.filename ?? '—'),
        emphasis: true,
      },
    ];
  }

  if (
    event.action === 'DOCUMENT_DELETE' ||
    event.action === 'BORROWER_APPLICATION_DOCUMENT_DELETE'
  ) {
    const src = prev ?? nd;
    return [
      {
        label: 'Removed',
        value: String(src?.originalName ?? src?.filename ?? '—'),
        emphasis: true,
      },
    ];
  }

  if (
    (event.action === 'BORROWER_APPLICATION_STATUS_CHANGE' ||
      event.action === 'APPROVE' ||
      event.action === 'REJECT' ||
      event.action === 'RETURN_TO_DRAFT') &&
    nd
  ) {
    const items: TimelineDetailItem[] = [];
    items.push({
      value: prev?.status
        ? `${String(prev.status).replace(/_/g, ' ')} → ${String(nd.status ?? '').replace(/_/g, ' ')}`
        : String(nd.status ?? '').replace(/_/g, ' '),
    });
    if (nd.reason ?? nd.notes) {
      items.push({ value: String(nd.reason ?? nd.notes) });
    }
    return items;
  }

  if (
    (event.action === 'APPLICATION_COUNTER_OFFER' ||
      event.action === 'BORROWER_COUNTER_OFFER') &&
    nd
  ) {
    const items: TimelineDetailItem[] = [];
    if (nd.amount != null) {
      items.push({
        label: 'Amount',
        value: String(nd.amount),
        emphasis: true,
      });
    }
    if (nd.term != null) {
      items.push({
        label: 'Term',
        value: `${String(nd.term)} months`,
        emphasis: true,
      });
    }
    return items;
  }

  return [];
}

/**
 * Convenience: produce the ready-to-render `detail` React node by feeding
 * the items through a caller-supplied renderer. Keeping the renderer in the
 * screen avoids importing RN components from this lib file (so it stays
 * tree-shakeable + testable).
 */
export function renderApplicationTimelineDetail(
  event: RawApplicationTimelineEvent,
  renderItems: (items: TimelineDetailItem[]) => React.ReactNode,
): React.ReactNode {
  const items = applicationTimelineDetailItems(event);
  if (items.length === 0) return null;
  return renderItems(items);
}
