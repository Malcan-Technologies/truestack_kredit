import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  notificationSendMock,
  notifyBorrowerEventMock,
  getNotificationChannelStateMock,
  auditLogMock,
} = vi.hoisted(() => ({
  prismaMock: {
    loan: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    borrower: {
      findFirst: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
    },
    borrowerNotification: {
      findFirst: vi.fn(),
    },
  },
  notificationSendMock: vi.fn(),
  notifyBorrowerEventMock: vi.fn(),
  getNotificationChannelStateMock: vi.fn(),
  auditLogMock: vi.fn(),
}));

vi.mock('./prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('./attestationBookingService.js', () => ({
  expirePendingProposals: vi.fn(),
}));

vi.mock('../modules/notifications/service.js', () => ({
  NotificationService: {
    send: notificationSendMock,
  },
}));

vi.mock('../modules/notifications/orchestrator.js', () => ({
  NotificationOrchestrator: {
    notifyBorrowerEvent: notifyBorrowerEventMock,
  },
}));

vi.mock('../modules/notifications/settings.js', () => ({
  getNotificationChannelState: getNotificationChannelStateMock,
}));

vi.mock('../modules/compliance/auditService.js', () => ({
  AuditService: {
    log: auditLogMock,
  },
}));

import { processAttestationMeetingReminders } from './attestationCronProcessors.js';

describe('processAttestationMeetingReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('respects the email toggle while still delivering borrower reminders', async () => {
    prismaMock.loan.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        tenantId: 'tenant-1',
        borrowerId: 'borrower-1',
        attestationMeetingStartAt: new Date('2026-04-16T10:00:00.000Z'),
        attestationMeetingLink: 'https://meet.test/loan-1',
      },
    ]);
    prismaMock.borrower.findFirst.mockResolvedValue({ email: 'borrower@example.com' });
    getNotificationChannelStateMock.mockResolvedValue({
      email: false,
      in_app: true,
      push: false,
    });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue(null);

    const result = await processAttestationMeetingReminders();

    expect(result).toEqual({ sent: 1 });
    expect(notificationSendMock).not.toHaveBeenCalled();
    expect(notifyBorrowerEventMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.loan.update).toHaveBeenCalledWith({
      where: { id: 'loan-1' },
      data: { attestationMeetingReminder24hSentAt: expect.any(Date) },
    });
  });

  it('does not resend channels that were already delivered on a retry', async () => {
    prismaMock.loan.findMany.mockResolvedValue([
      {
        id: 'loan-2',
        tenantId: 'tenant-1',
        borrowerId: 'borrower-2',
        attestationMeetingStartAt: new Date('2026-04-16T10:00:00.000Z'),
        attestationMeetingLink: 'https://meet.test/loan-2',
      },
    ]);
    prismaMock.borrower.findFirst.mockResolvedValue({ email: 'borrower@example.com' });
    getNotificationChannelStateMock.mockResolvedValue({
      email: true,
      in_app: true,
      push: false,
    });
    prismaMock.notification.findFirst.mockResolvedValue({ id: 'existing-email' });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue({
      id: 'existing-borrower-notification',
    });

    const result = await processAttestationMeetingReminders();

    expect(result).toEqual({ sent: 1 });
    expect(notificationSendMock).not.toHaveBeenCalled();
    expect(notifyBorrowerEventMock).not.toHaveBeenCalled();
    expect(prismaMock.loan.update).toHaveBeenCalledWith({
      where: { id: 'loan-2' },
      data: { attestationMeetingReminder24hSentAt: expect.any(Date) },
    });
  });

  it('still sends borrower notifications when reminder email fails', async () => {
    prismaMock.loan.findMany.mockResolvedValue([
      {
        id: 'loan-3',
        tenantId: 'tenant-1',
        borrowerId: 'borrower-3',
        attestationMeetingStartAt: new Date('2026-04-16T10:00:00.000Z'),
        attestationMeetingLink: 'https://meet.test/loan-3',
      },
    ]);
    prismaMock.borrower.findFirst.mockResolvedValue({ email: 'borrower@example.com' });
    getNotificationChannelStateMock.mockResolvedValue({
      email: true,
      in_app: true,
      push: false,
    });
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.borrowerNotification.findFirst.mockResolvedValue(null);
    notificationSendMock.mockResolvedValue({ status: 'failed' });

    const result = await processAttestationMeetingReminders();

    expect(result).toEqual({ sent: 0 });
    expect(notificationSendMock).toHaveBeenCalledTimes(1);
    expect(notifyBorrowerEventMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.loan.update).not.toHaveBeenCalled();
  });
});
