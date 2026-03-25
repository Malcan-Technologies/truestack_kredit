import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminAcceptBorrowerProposal, adminRejectProposal } from './attestationBookingService.js';
import { prisma } from './prisma.js';
import { NotificationService } from '../modules/notifications/service.js';

vi.mock('./prisma.js', () => ({
  prisma: {
    loan: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    borrower: {
      findFirst: vi.fn().mockResolvedValue({ email: 'b@example.com' }),
    },
  },
}));

vi.mock('../modules/notifications/service.js', () => ({
  NotificationService: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./googleMeetCalendar.js', () => ({
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
  createGoogleMeetEvent: vi.fn(),
  isGoogleMeetConfigured: vi.fn(() => true),
}));

const findFirst = vi.mocked(prisma.loan.findFirst);
const update = vi.mocked(prisma.loan.update);
const borrowerFindFirst = vi.mocked(prisma.borrower.findFirst);
const send = vi.mocked(NotificationService.send);

describe('adminAcceptBorrowerProposal (manual)', () => {
  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
    borrowerFindFirst.mockReset();
    borrowerFindFirst.mockResolvedValue({ email: 'b@example.com' } as never);
    send.mockReset();
  });

  it('persists manual URL, notes, MEETING_SCHEDULED, and emails borrower', async () => {
    const start = new Date('2026-06-01T02:00:00.000Z');
    const end = new Date('2026-06-01T03:00:00.000Z');
    findFirst.mockResolvedValue({
      id: 'loan_manual',
      tenantId: 'tenant_1',
      status: 'PENDING_DISBURSEMENT',
      borrowerId: 'borrower_1',
      attestationStatus: 'SLOT_PROPOSED',
      attestationProposalStartAt: start,
      attestationProposalEndAt: end,
      attestationGoogleCalendarEventId: null,
      borrower: { email: 'b@example.com', name: 'Borrower' },
      product: { name: 'Test Product' },
    } as never);

    update.mockResolvedValue({ id: 'loan_manual' } as never);

    const { meetLink } = await adminAcceptBorrowerProposal({
      loanId: 'loan_manual',
      tenantId: 'tenant_1',
      memberId: 'member_1',
      mode: 'manual',
      manualMeetingUrl: 'https://meet.example.com/abc',
      manualMeetingNotes: 'Use PIN 9999',
    });

    expect(meetLink).toBe('https://meet.example.com/abc');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'loan_manual' },
      data: expect.objectContaining({
        attestationStatus: 'MEETING_SCHEDULED',
        attestationMeetingLink: 'https://meet.example.com/abc',
        attestationMeetingNotes: 'Use PIN 9999',
        attestationGoogleCalendarEventId: null,
      }),
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'b@example.com',
        subject: expect.stringContaining('confirmed'),
      })
    );
  });
});

describe('adminRejectProposal', () => {
  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
    borrowerFindFirst.mockReset();
    borrowerFindFirst.mockResolvedValue({ email: 'b@example.com' } as never);
    send.mockReset();
  });

  it('cancels loan and sets PROPOSAL_REJECTED_BY_LENDER', async () => {
    findFirst.mockResolvedValue({
      id: 'loan_rej',
      tenantId: 'tenant_1',
      borrowerId: 'borrower_1',
      attestationStatus: 'SLOT_PROPOSED',
      attestationGoogleCalendarEventId: null,
    } as never);

    update.mockResolvedValue({ id: 'loan_rej', status: 'CANCELLED' } as never);

    await adminRejectProposal({ loanId: 'loan_rej', tenantId: 'tenant_1' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'loan_rej' },
      data: expect.objectContaining({
        status: 'CANCELLED',
        attestationCancellationReason: 'PROPOSAL_REJECTED_BY_LENDER',
        attestationMeetingLink: null,
        attestationMeetingNotes: null,
      }),
    });
    expect(send).toHaveBeenCalled();
  });
});
