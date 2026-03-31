import type { AttestationCancellationReason } from '@prisma/client';
import type { Loan } from '@prisma/client';
import { prisma } from './prisma.js';
import { isPreDisbursementLoanStatus } from './loanStatusHelpers.js';
import { MAX_BORROWER_ATTESTATION_PROPOSALS, SLOT_DURATION_MINUTES } from './attestationConstants.js';
import { collectBlockingIntervals } from './attestationAvailability.js';
import { createGoogleMeetEvent, deleteCalendarEvent, isGoogleMeetConfigured } from './googleMeetCalendar.js';
import { NotificationService } from '../modules/notifications/service.js';

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

async function assertSlotStillFree(params: {
  tenantId: string;
  loanId: string;
  startAt: Date;
  endAt: Date;
}): Promise<void> {
  const { busy } = await collectBlockingIntervals({
    tenantId: params.tenantId,
    excludeLoanId: params.loanId,
    timeMin: new Date(params.startAt.getTime() - 60 * 60 * 1000),
    timeMax: new Date(params.endAt.getTime() + 60 * 60 * 1000),
  });
  for (const b of busy) {
    if (intervalsOverlap(params.startAt, params.endAt, b.start, b.end)) {
      throw new Error('SLOT_NO_LONGER_AVAILABLE');
    }
  }
}

async function notifyBorrowerEmail(params: {
  tenantId: string;
  borrowerId: string;
  subject: string;
  body: string;
}): Promise<void> {
  const b = await prisma.borrower.findFirst({
    where: { id: params.borrowerId, tenantId: params.tenantId },
    select: { email: true },
  });
  if (!b?.email) return;
  await NotificationService.send({
    tenantId: params.tenantId,
    type: 'email',
    recipient: b.email,
    subject: params.subject,
    body: params.body,
  });
}

async function notifyTenantAdminsEmail(params: {
  tenantId: string;
  subject: string;
  body: string;
}): Promise<void> {
  const members = await prisma.tenantMember.findMany({
    where: { tenantId: params.tenantId, isActive: true },
    include: { user: { select: { email: true } } },
    take: 20,
  });
  for (const m of members) {
    if (!m.user.email) continue;
    await NotificationService.send({
      tenantId: params.tenantId,
      type: 'email',
      recipient: m.user.email,
      subject: params.subject,
      body: params.body,
    });
  }
}

export async function proposeBorrowerSlot(params: {
  loanId: string;
  tenantId: string;
  borrowerId: string;
  startAt: Date;
}): Promise<Loan> {
  const endAt = addMinutes(params.startAt, SLOT_DURATION_MINUTES);

  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId, borrowerId: params.borrowerId },
    include: { product: { select: { name: true } } },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (!isPreDisbursementLoanStatus(loan.status)) throw new Error('INVALID_LOAN_STATUS');
  if (loan.attestationCompletedAt) throw new Error('ATTESTATION_ALREADY_COMPLETE');
  if (loan.attestationStatus !== 'MEETING_REQUESTED') {
    throw new Error('INVALID_ATTESTATION_STATE');
  }
  if (loan.attestationBorrowerProposalCount >= MAX_BORROWER_ATTESTATION_PROPOSALS) {
    throw new Error('MAX_PROPOSALS_REACHED');
  }

  await assertSlotStillFree({
    tenantId: params.tenantId,
    loanId: params.loanId,
    startAt: params.startAt,
    endAt,
  });

  /** Admin must confirm before this slot starts; if still pending at start time, proposal is cleared (loan stays active). */
  const respondBy = params.startAt;

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'SLOT_PROPOSED',
      attestationProposalStartAt: params.startAt,
      attestationProposalEndAt: endAt,
      attestationProposalDeadlineAt: respondBy,
      attestationProposalSource: 'BORROWER',
      attestationBorrowerProposalCount: { increment: 1 },
    },
  });

  await notifyTenantAdminsEmail({
    tenantId: params.tenantId,
    subject: 'Attestation: borrower proposed a meeting slot',
    body: `Loan ${params.loanId.slice(0, 8)} — borrower selected a slot. Confirm before the slot starts in TrueKredit Pro → Attestation Meetings.`,
  });

  return updated as Loan;
}

export async function adminAcceptBorrowerProposal(params: {
  loanId: string;
  tenantId: string;
  memberId: string;
  mode?: 'google' | 'manual';
  manualMeetingUrl?: string;
  manualMeetingNotes?: string;
}): Promise<{ loan: unknown; meetLink: string }> {
  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId },
    include: {
      borrower: { select: { email: true, name: true } },
      product: { select: { name: true } },
    },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (!isPreDisbursementLoanStatus(loan.status)) throw new Error('INVALID_LOAN_STATUS');
  if (loan.attestationStatus !== 'SLOT_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');
  if (!loan.attestationProposalStartAt || !loan.attestationProposalEndAt) throw new Error('NO_PROPOSAL');

  const mode = params.mode ?? 'google';

  if (mode === 'manual') {
    const url = params.manualMeetingUrl?.trim();
    if (!url) throw new Error('MANUAL_MEETING_URL_REQUIRED');
    const notes = params.manualMeetingNotes?.trim() || null;
    const updated = await prisma.loan.update({
      where: { id: params.loanId },
      data: {
        attestationStatus: 'MEETING_SCHEDULED',
        attestationMeetingScheduledAt: new Date(),
        attestationMeetingStartAt: loan.attestationProposalStartAt,
        attestationMeetingEndAt: loan.attestationProposalEndAt,
        attestationMeetingLink: url,
        attestationMeetingNotes: notes,
        attestationGoogleCalendarEventId: null,
        attestationProposalStartAt: null,
        attestationProposalEndAt: null,
        attestationProposalDeadlineAt: null,
        attestationProposalSource: null,
        attestationAssignedMemberId: params.memberId,
      },
    });
    await notifyBorrowerEmail({
      tenantId: params.tenantId,
      borrowerId: loan.borrowerId,
      subject: 'Your attestation meeting is confirmed',
      body:
        `Your meeting is scheduled.\n\nJoin link: ${url}` +
        (notes ? `\n\nNotes: ${notes}` : ''),
    });
    return { loan: updated, meetLink: url };
  }

  if (!isGoogleMeetConfigured()) {
    throw new Error('GOOGLE_CALENDAR_NOT_CONFIGURED');
  }

  const meet = await createGoogleMeetEvent({
    summary: `Loan attestation — ${loan.product?.name ?? 'Loan'} (${loan.id.slice(0, 8)})`,
    description: `Borrower attestation meeting. Loan ID: ${loan.id}`,
    startAt: loan.attestationProposalStartAt,
    endAt: loan.attestationProposalEndAt,
    attendeeEmail: loan.borrower.email || undefined,
  });

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'MEETING_SCHEDULED',
      attestationMeetingScheduledAt: new Date(),
      attestationMeetingStartAt: meet.startAt,
      attestationMeetingEndAt: meet.endAt,
      attestationMeetingLink: meet.meetLink,
      attestationMeetingNotes: null,
      attestationGoogleCalendarEventId: meet.eventId,
      attestationProposalStartAt: null,
      attestationProposalEndAt: null,
      attestationProposalDeadlineAt: null,
      attestationProposalSource: null,
      attestationAssignedMemberId: params.memberId,
    },
  });

  await notifyBorrowerEmail({
    tenantId: params.tenantId,
    borrowerId: loan.borrowerId,
    subject: 'Your attestation meeting is confirmed',
    body: `Your meeting is scheduled. Join link: ${meet.meetLink}`,
  });

  return { loan: updated, meetLink: meet.meetLink };
}

export async function adminCounterProposal(params: {
  loanId: string;
  tenantId: string;
  memberId: string;
  startAt: Date;
  endAt: Date;
  mode: 'google' | 'manual';
  manualMeetingUrl?: string;
  manualMeetingNotes?: string;
}): Promise<unknown> {
  if (params.endAt <= params.startAt) throw new Error('INVALID_RANGE');

  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId },
    include: {
      borrower: { select: { email: true } },
      product: { select: { name: true } },
    },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (!isPreDisbursementLoanStatus(loan.status)) throw new Error('INVALID_LOAN_STATUS');
  if (loan.attestationStatus !== 'SLOT_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');

  await assertSlotStillFree({
    tenantId: params.tenantId,
    loanId: params.loanId,
    startAt: params.startAt,
    endAt: params.endAt,
  });

  if (params.mode === 'manual') {
    const url = params.manualMeetingUrl?.trim();
    if (!url) throw new Error('MANUAL_MEETING_URL_REQUIRED');
    const notes = params.manualMeetingNotes?.trim() || null;
    const updated = await prisma.loan.update({
      where: { id: params.loanId },
      data: {
        attestationStatus: 'MEETING_SCHEDULED',
        attestationMeetingScheduledAt: new Date(),
        attestationMeetingStartAt: params.startAt,
        attestationMeetingEndAt: params.endAt,
        attestationMeetingLink: url,
        attestationMeetingNotes: notes,
        attestationGoogleCalendarEventId: null,
        attestationProposalStartAt: null,
        attestationProposalEndAt: null,
        attestationProposalDeadlineAt: null,
        attestationProposalSource: null,
        attestationAssignedMemberId: params.memberId,
      },
    });
    await notifyBorrowerEmail({
      tenantId: params.tenantId,
      borrowerId: loan.borrowerId,
      subject: 'Your attestation meeting is scheduled',
      body:
        `Your lender scheduled a meeting.\n\nJoin link: ${url}` +
        (notes ? `\n\nNotes: ${notes}` : ''),
    });
    return updated;
  }

  if (!isGoogleMeetConfigured()) {
    throw new Error('GOOGLE_CALENDAR_NOT_CONFIGURED');
  }

  const meet = await createGoogleMeetEvent({
    summary: `Loan attestation — ${loan.product?.name ?? 'Loan'} (${loan.id.slice(0, 8)})`,
    description: `Borrower attestation meeting. Loan ID: ${loan.id}`,
    startAt: params.startAt,
    endAt: params.endAt,
    attendeeEmail: loan.borrower.email || undefined,
  });

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'MEETING_SCHEDULED',
      attestationMeetingScheduledAt: new Date(),
      attestationMeetingStartAt: meet.startAt,
      attestationMeetingEndAt: meet.endAt,
      attestationMeetingLink: meet.meetLink,
      attestationMeetingNotes: null,
      attestationGoogleCalendarEventId: meet.eventId,
      attestationProposalStartAt: null,
      attestationProposalEndAt: null,
      attestationProposalDeadlineAt: null,
      attestationProposalSource: null,
      attestationAssignedMemberId: params.memberId,
    },
  });

  await notifyBorrowerEmail({
    tenantId: params.tenantId,
    borrowerId: loan.borrowerId,
    subject: 'Your attestation meeting is scheduled',
    body: `Your lender scheduled a meeting. Join link: ${meet.meetLink}`,
  });

  return updated;
}

export async function borrowerAcceptCounter(params: {
  loanId: string;
  tenantId: string;
  borrowerId: string;
}): Promise<{ loan: unknown; meetLink: string }> {
  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId, borrowerId: params.borrowerId },
    include: {
      borrower: { select: { email: true } },
      product: { select: { name: true } },
    },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (loan.attestationStatus !== 'COUNTER_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');
  if (!loan.attestationProposalStartAt || !loan.attestationProposalEndAt) throw new Error('NO_PROPOSAL');
  if (!isGoogleMeetConfigured()) throw new Error('GOOGLE_CALENDAR_NOT_CONFIGURED');

  const meet = await createGoogleMeetEvent({
    summary: `Loan attestation — ${loan.product?.name ?? 'Loan'} (${loan.id.slice(0, 8)})`,
    description: `Borrower attestation meeting. Loan ID: ${loan.id}`,
    startAt: loan.attestationProposalStartAt,
    endAt: loan.attestationProposalEndAt,
    attendeeEmail: loan.borrower.email || undefined,
  });

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'MEETING_SCHEDULED',
      attestationMeetingScheduledAt: new Date(),
      attestationMeetingStartAt: meet.startAt,
      attestationMeetingEndAt: meet.endAt,
      attestationMeetingLink: meet.meetLink,
      attestationMeetingNotes: null,
      attestationGoogleCalendarEventId: meet.eventId,
      attestationProposalStartAt: null,
      attestationProposalEndAt: null,
      attestationProposalDeadlineAt: null,
      attestationProposalSource: null,
    },
  });

  await notifyBorrowerEmail({
    tenantId: params.tenantId,
    borrowerId: loan.borrowerId,
    subject: 'Your attestation meeting is confirmed',
    body: `Your meeting is scheduled. Join link: ${meet.meetLink}`,
  });

  return { loan: updated, meetLink: meet.meetLink };
}

export async function borrowerDeclineCounter(params: {
  loanId: string;
  tenantId: string;
  borrowerId: string;
}): Promise<unknown> {
  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId, borrowerId: params.borrowerId },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (loan.attestationStatus !== 'COUNTER_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'MEETING_REQUESTED',
      attestationProposalStartAt: null,
      attestationProposalEndAt: null,
      attestationProposalDeadlineAt: null,
      attestationProposalSource: null,
    },
  });

  await notifyTenantAdminsEmail({
    tenantId: params.tenantId,
    subject: 'Attestation: borrower declined counter-proposal',
    body: `Loan ${params.loanId.slice(0, 8)} — borrower declined the proposed time (COUNTER_DECLINED). They can pick a new slot.`,
  });

  return updated;
}

const STALE_PROPOSAL_EXPIRY_EMAIL = {
  subject: 'Your attestation meeting proposal expired',
  body:
    'The proposed meeting time passed without confirmation from your lender. Your loan is still active. Please open Borrower Pro and choose a new meeting time for attestation.',
} as const;

async function applyStaleProposalExpiry(loan: {
  id: string;
  tenantId: string;
  borrowerId: string;
}): Promise<void> {
  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      attestationStatus: 'MEETING_REQUESTED',
      attestationProposalStartAt: null,
      attestationProposalEndAt: null,
      attestationProposalDeadlineAt: null,
      attestationProposalSource: null,
      attestationBorrowerProposalCount: 0,
    },
  });
  await notifyBorrowerEmail({
    tenantId: loan.tenantId,
    borrowerId: loan.borrowerId,
    subject: STALE_PROPOSAL_EXPIRY_EMAIL.subject,
    body: STALE_PROPOSAL_EXPIRY_EMAIL.body,
  });
}

/**
 * When the proposed slot start time is reached and the lender still has not accepted/countered,
 * clear the proposal so the borrower can pick a new slot. Does not cancel the loan.
 */
export async function expireStaleAttestationProposalForLoan(params: {
  loanId: string;
  tenantId: string;
  borrowerId?: string;
}): Promise<void> {
  const now = new Date();
  const loan = await prisma.loan.findFirst({
    where: {
      id: params.loanId,
      tenantId: params.tenantId,
      ...(params.borrowerId ? { borrowerId: params.borrowerId } : {}),
      status: { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
      attestationCompletedAt: null,
      attestationStatus: { in: ['SLOT_PROPOSED', 'COUNTER_PROPOSED'] },
      attestationProposalStartAt: { lte: now },
    },
    select: { id: true, tenantId: true, borrowerId: true },
  });
  if (!loan) return;
  await applyStaleProposalExpiry(loan);
}

export async function expirePendingProposals(params?: { tenantId?: string }): Promise<{ expired: number }> {
  const now = new Date();
  const pending = await prisma.loan.findMany({
    where: {
      ...(params?.tenantId ? { tenantId: params.tenantId } : {}),
      status: { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
      attestationCompletedAt: null,
      attestationStatus: { in: ['SLOT_PROPOSED', 'COUNTER_PROPOSED'] },
      attestationProposalStartAt: { lte: now },
    },
    select: { id: true, tenantId: true, borrowerId: true },
  });

  let expired = 0;
  for (const p of pending) {
    await applyStaleProposalExpiry(p);
    expired += 1;
  }

  return { expired };
}

export async function cancelLoanFromBorrower(params: {
  loanId: string;
  tenantId: string;
  borrowerId: string;
  userId: string;
  reason: AttestationCancellationReason;
}): Promise<unknown> {
  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId, borrowerId: params.borrowerId },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (!isPreDisbursementLoanStatus(loan.status)) throw new Error('INVALID_LOAN_STATUS');

  if (loan.attestationGoogleCalendarEventId) {
    try {
      await deleteCalendarEvent(loan.attestationGoogleCalendarEventId);
    } catch (e) {
      console.warn('[attestation] delete calendar on cancel', e);
    }
  }

  return prisma.loan.update({
    where: { id: params.loanId },
    data: {
      status: 'CANCELLED',
      attestationCancellationReason: params.reason,
      attestationCancelledAt: new Date(),
      attestationCancelledByUserId: params.userId,
      attestationProposalStartAt: null,
      attestationProposalEndAt: null,
      attestationProposalDeadlineAt: null,
      attestationProposalSource: null,
      attestationMeetingLink: null,
      attestationMeetingNotes: null,
      attestationGoogleCalendarEventId: null,
    },
  });
}
