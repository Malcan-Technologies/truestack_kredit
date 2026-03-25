import type { AttestationCancellationReason } from '@prisma/client';
import type { Loan } from '@prisma/client';
import { prisma } from './prisma.js';
import {
  MAX_BORROWER_ATTESTATION_PROPOSALS,
  PROPOSAL_DEADLINE_MS,
  SLOT_DURATION_MINUTES,
} from './attestationConstants.js';
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
  if (loan.status !== 'PENDING_DISBURSEMENT') throw new Error('INVALID_LOAN_STATUS');
  if (loan.attestationCompletedAt) throw new Error('ATTESTATION_ALREADY_COMPLETE');
  if (!['MEETING_REQUESTED', 'PROPOSAL_EXPIRED'].includes(loan.attestationStatus)) {
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

  const deadline = new Date(Date.now() + PROPOSAL_DEADLINE_MS);

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'SLOT_PROPOSED',
      attestationProposalStartAt: params.startAt,
      attestationProposalEndAt: endAt,
      attestationProposalDeadlineAt: deadline,
      attestationProposalSource: 'BORROWER',
      attestationBorrowerProposalCount: { increment: 1 },
    },
  });

  await notifyTenantAdminsEmail({
    tenantId: params.tenantId,
    subject: 'Attestation: borrower proposed a meeting slot',
    body: `Loan ${params.loanId.slice(0, 8)} — borrower selected a slot. Respond within 12 hours in TrueKredit Pro → Attestation Meetings.`,
  });

  return updated as Loan;
}

export async function adminAcceptBorrowerProposal(params: {
  loanId: string;
  tenantId: string;
  memberId: string;
}): Promise<{ loan: unknown; meetLink: string }> {
  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId },
    include: {
      borrower: { select: { email: true, name: true } },
      product: { select: { name: true } },
    },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (loan.status !== 'PENDING_DISBURSEMENT') throw new Error('INVALID_LOAN_STATUS');
  if (loan.attestationStatus !== 'SLOT_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');
  if (!loan.attestationProposalStartAt || !loan.attestationProposalEndAt) throw new Error('NO_PROPOSAL');

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
}): Promise<unknown> {
  if (params.endAt <= params.startAt) throw new Error('INVALID_RANGE');

  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (loan.status !== 'PENDING_DISBURSEMENT') throw new Error('INVALID_LOAN_STATUS');
  if (loan.attestationStatus !== 'SLOT_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');

  await assertSlotStillFree({
    tenantId: params.tenantId,
    loanId: params.loanId,
    startAt: params.startAt,
    endAt: params.endAt,
  });

  const deadline = new Date(Date.now() + PROPOSAL_DEADLINE_MS);

  const updated = await prisma.loan.update({
    where: { id: params.loanId },
    data: {
      attestationStatus: 'COUNTER_PROPOSED',
      attestationProposalStartAt: params.startAt,
      attestationProposalEndAt: params.endAt,
      attestationProposalDeadlineAt: deadline,
      attestationProposalSource: 'ADMIN_COUNTER',
      attestationAssignedMemberId: params.memberId,
    },
  });

  await notifyBorrowerEmail({
    tenantId: params.tenantId,
    borrowerId: loan.borrowerId,
    subject: 'Alternative attestation meeting time proposed',
    body: `Your lender proposed a different meeting time. Please accept or decline in your borrower portal within 12 hours.`,
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

export async function adminRejectProposal(params: {
  loanId: string;
  tenantId: string;
}): Promise<unknown> {
  const loan = await prisma.loan.findFirst({
    where: { id: params.loanId, tenantId: params.tenantId },
  });
  if (!loan) throw new Error('NOT_FOUND');
  if (loan.attestationStatus !== 'SLOT_PROPOSED') throw new Error('INVALID_ATTESTATION_STATE');

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

  await notifyBorrowerEmail({
    tenantId: params.tenantId,
    borrowerId: loan.borrowerId,
    subject: 'Attestation meeting slot update',
    body: `Your proposed meeting time was not accepted. Please choose another slot in the borrower portal.`,
  });

  return updated;
}

export async function expirePendingProposals(): Promise<{ expired: number }> {
  const now = new Date();
  const pending = await prisma.loan.findMany({
    where: {
      status: 'PENDING_DISBURSEMENT',
      attestationStatus: { in: ['SLOT_PROPOSED', 'COUNTER_PROPOSED'] },
      attestationProposalDeadlineAt: { lt: now },
    },
    select: { id: true, tenantId: true, borrowerId: true, attestationStatus: true },
  });

  let expired = 0;
  for (const p of pending) {
    await prisma.loan.update({
      where: { id: p.id },
      data: {
        attestationStatus: 'PROPOSAL_EXPIRED',
        attestationProposalStartAt: null,
        attestationProposalEndAt: null,
        attestationProposalDeadlineAt: null,
        attestationProposalSource: null,
      },
    });
    await notifyBorrowerEmail({
      tenantId: p.tenantId,
      borrowerId: p.borrowerId,
      subject: 'Attestation meeting proposal expired',
      body: `Your meeting time proposal expired (no response within 12 hours). Please choose a new slot in the borrower portal.`,
    });
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
  if (loan.status !== 'PENDING_DISBURSEMENT') throw new Error('INVALID_LOAN_STATUS');

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
      attestationGoogleCalendarEventId: null,
    },
  });
}
