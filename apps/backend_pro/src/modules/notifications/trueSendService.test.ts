import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  getNotificationChannelStateMock,
  notifyBorrowerEventMock,
  fetchMock,
  hasActiveAddOnMock,
} = vi.hoisted(() => ({
  prismaMock: {
    emailLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    borrowerNotification: {
      findFirst: vi.fn(),
    },
    loan: {
      findFirst: vi.fn(),
    },
  },
  getNotificationChannelStateMock: vi.fn(),
  notifyBorrowerEventMock: vi.fn(),
  fetchMock: vi.fn(),
  hasActiveAddOnMock: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    storage: {
      type: 'local',
    },
    notifications: {
      resendApiKey: 'test-resend-key',
      whatsapp: {},
    },
    email: {
      fromName: 'TrueKredit',
      fromAddress: 'no-reply@example.com',
    },
  },
}));

vi.mock('../../lib/storage.js', () => ({
  getFile: vi.fn(),
}));

vi.mock('../../lib/addOnService.js', () => ({
  AddOnService: {
    hasActiveAddOn: hasActiveAddOnMock,
  },
}));

vi.mock('./settings.js', () => ({
  getNotificationChannelState: getNotificationChannelStateMock,
}));

vi.mock('./orchestrator.js', () => ({
  NotificationOrchestrator: {
    notifyBorrowerEvent: notifyBorrowerEventMock,
  },
}));

import { TrueSendService } from './trueSendService.js';

describe('TrueSendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    hasActiveAddOnMock.mockResolvedValue(true);
    prismaMock.emailLog.create.mockResolvedValue({ id: 'email-log-1' });
    prismaMock.emailLog.update.mockResolvedValue(undefined);
  });

  it('still fans out borrower notifications when email delivery fails', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: true,
      in_app: true,
      push: false,
    });
    prismaMock.emailLog.findFirst.mockResolvedValue(null);
    prismaMock.borrowerNotification.findFirst.mockResolvedValue(null);
    notifyBorrowerEventMock.mockResolvedValue({ id: 'notification-1' });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('service unavailable'),
    });

    await expect(
      TrueSendService.sendPaymentReminderWithContext({
        tenantId: 'tenant-1',
        loanId: 'loan-1',
        borrowerId: 'borrower-1',
        recipientEmail: 'borrower@example.com',
        recipientName: 'Borrower',
        tenant: { name: 'Tenant One' },
        dueDate: new Date('2026-04-20T00:00:00.000Z'),
        amount: 150,
        milestoneNumber: 2,
        daysUntilDue: 1,
      })
    ).rejects.toThrow('TrueSend failed to deliver email for payment reminder on loan loan-1');

    expect(prismaMock.emailLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'email-log-1' },
      data: expect.objectContaining({
        status: 'failed',
      }),
    });
    expect(notifyBorrowerEventMock).toHaveBeenCalledTimes(1);
  });

  it('still fans out borrower notifications when email is disabled', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: false,
      in_app: true,
      push: false,
    });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue(null);
    notifyBorrowerEventMock.mockResolvedValue({ id: 'notification-1' });

    const result = await TrueSendService.sendPaymentReminderWithContext({
      tenantId: 'tenant-1',
      loanId: 'loan-1',
      borrowerId: 'borrower-1',
      recipientEmail: 'borrower@example.com',
      recipientName: 'Borrower',
      tenant: { name: 'Tenant One' },
      dueDate: new Date('2026-04-20T00:00:00.000Z'),
      amount: 150,
      milestoneNumber: 2,
      daysUntilDue: 1,
    });

    expect(result).toBe(false);
    expect(prismaMock.emailLog.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.emailLog.create).not.toHaveBeenCalled();
    expect(notifyBorrowerEventMock).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate email and borrower notification retries', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: true,
      in_app: true,
      push: false,
    });
    prismaMock.emailLog.findFirst.mockResolvedValue({ id: 'email-log-1' });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue({
      id: 'borrower-notification-1',
    });

    const result = await TrueSendService.sendPaymentReminderWithContext({
      tenantId: 'tenant-1',
      loanId: 'loan-1',
      borrowerId: 'borrower-1',
      recipientEmail: 'borrower@example.com',
      recipientName: 'Borrower',
      tenant: { name: 'Tenant One' },
      dueDate: new Date('2026-04-20T00:00:00.000Z'),
      amount: 150,
      milestoneNumber: 2,
      daysUntilDue: 1,
    });

    expect(result).toBe(true);
    expect(prismaMock.emailLog.create).not.toHaveBeenCalled();
    expect(notifyBorrowerEventMock).not.toHaveBeenCalled();
  });

  it('limits recurring email dedupe to recent sends only', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: true,
      in_app: false,
      push: false,
    });
    prismaMock.emailLog.findFirst.mockResolvedValue({ id: 'email-log-1' });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue({
      id: 'borrower-notification-1',
    });

    await TrueSendService.sendPaymentReminderWithContext({
      tenantId: 'tenant-1',
      loanId: 'loan-1',
      borrowerId: 'borrower-1',
      recipientEmail: 'borrower@example.com',
      recipientName: 'Borrower',
      tenant: { name: 'Tenant One' },
      dueDate: new Date('2026-04-20T00:00:00.000Z'),
      amount: 150,
      milestoneNumber: 2,
      daysUntilDue: 1,
    });

    expect(prismaMock.emailLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailType: 'PAYMENT_REMINDER',
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it('limits recurring borrower-notification dedupe to recent late notices only', async () => {
    getNotificationChannelStateMock.mockResolvedValue({
      email: false,
      in_app: true,
      push: false,
    });
    prismaMock.loan.findFirst.mockResolvedValue({
      id: 'loan-1',
      borrowerId: 'borrower-1',
      borrower: {
        id: 'borrower-1',
        name: 'Borrower',
        email: 'borrower@example.com',
      },
      tenant: {
        name: 'Tenant One',
      },
    });
    prismaMock.borrowerNotification.findFirst.mockResolvedValue({ id: 'borrower-notification-1' });

    const result = await TrueSendService.sendLatePaymentNotice('tenant-1', 'loan-1', [
      {
        milestoneNumber: 1,
        dueDate: new Date('2026-04-01T00:00:00.000Z'),
        amount: 150,
        daysOverdue: 7,
      },
    ]);

    expect(result).toBe(false);
    expect(prismaMock.borrowerNotification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notificationKey: 'late_payment_notice',
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      })
    );
    expect(notifyBorrowerEventMock).not.toHaveBeenCalled();
  });
});
