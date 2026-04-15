import { prisma } from './prisma.js';
import { expirePendingProposals } from './attestationBookingService.js';
import { NotificationService } from '../modules/notifications/service.js';
import { NotificationOrchestrator } from '../modules/notifications/orchestrator.js';
import { getNotificationChannelState } from '../modules/notifications/settings.js';
import { AuditService } from '../modules/compliance/auditService.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * Expire attestation slot proposals when the proposed meeting start time passes without lender confirmation.
 */
export async function processAttestationProposalExpiry(): Promise<{ expired: number }> {
  const result = await expirePendingProposals();
  if (result.expired > 0) {
    console.log(`[CRON] Attestation proposals expired: ${result.expired}`);
  }
  return result;
}

/**
 * Send 24h reminder emails for upcoming attestation meetings.
 */
export async function processAttestationMeetingReminders(): Promise<{ sent: number }> {
  const now = new Date();
  /** Meetings starting in ~24h (±1h window so hourly cron does not miss). */
  const windowLo = new Date(now.getTime() + 23 * ONE_HOUR_MS);
  const windowHi = new Date(now.getTime() + 25 * ONE_HOUR_MS);
  const channelStateByTenant = new Map<
    string,
    Awaited<ReturnType<typeof getNotificationChannelState>>
  >();

  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['PENDING_ATTESTATION', 'PENDING_DISBURSEMENT'] },
      attestationStatus: 'MEETING_SCHEDULED',
      attestationMeetingStartAt: { gte: windowLo, lte: windowHi },
      attestationMeetingReminder24hSentAt: null,
      attestationMeetingLink: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      borrowerId: true,
      attestationMeetingStartAt: true,
      attestationMeetingLink: true,
    },
  });

  let sent = 0;
  for (const loan of loans) {
    const b = await prisma.borrower.findFirst({
      where: { id: loan.borrowerId, tenantId: loan.tenantId },
      select: { email: true },
    });

    let channelState = channelStateByTenant.get(loan.tenantId);
    if (!channelState) {
      channelState = await getNotificationChannelState(
        loan.tenantId,
        'attestation_meeting_reminder',
      );
      channelStateByTenant.set(loan.tenantId, channelState);
    }

    const subject = 'Reminder: attestation meeting in 24 hours';
    const body = `Your attestation meeting is scheduled at ${
      loan.attestationMeetingStartAt?.toISOString() ?? ''
    }. Join: ${loan.attestationMeetingLink}`;

    try {
      let emailProcessed = !channelState.email || !b?.email;
      if (!emailProcessed && b?.email) {
        const existingEmail = await prisma.notification.findFirst({
          where: {
            tenantId: loan.tenantId,
            type: 'email',
            recipient: b.email,
            subject,
            body,
            status: 'sent',
          },
          select: { id: true },
        });

        if (existingEmail) {
          emailProcessed = true;
        } else {
          const emailNotification = await NotificationService.send({
            tenantId: loan.tenantId,
            type: 'email',
            recipient: b.email,
            subject,
            body,
          });
          emailProcessed = emailNotification.status === 'sent';
        }
      }

      let borrowerNotificationProcessed = !channelState.in_app && !channelState.push;
      if (!borrowerNotificationProcessed) {
        const existingBorrowerNotification = await prisma.borrowerNotification.findFirst({
          where: {
            tenantId: loan.tenantId,
            borrowerId: loan.borrowerId,
            notificationKey: 'attestation_meeting_reminder',
            sourceType: 'LOAN',
            sourceId: loan.id,
          },
          select: { id: true },
        });

        if (existingBorrowerNotification) {
          borrowerNotificationProcessed = true;
        } else {
          await NotificationOrchestrator.notifyBorrowerEvent({
            tenantId: loan.tenantId,
            borrowerId: loan.borrowerId,
            notificationKey: 'attestation_meeting_reminder',
            category: 'loan_lifecycle',
            title: 'Attestation meeting reminder',
            body: 'Your attestation meeting starts in about 24 hours.',
            deepLink: `/loans/${loan.id}`,
            sourceType: 'LOAN',
            sourceId: loan.id,
            metadata: {
              meetingStartAt: loan.attestationMeetingStartAt?.toISOString() ?? null,
              meetingLink: loan.attestationMeetingLink,
            },
          });
          borrowerNotificationProcessed = true;
        }
      }

      if (!emailProcessed || !borrowerNotificationProcessed) {
        continue;
      }

      await prisma.loan.update({
        where: { id: loan.id },
        data: { attestationMeetingReminder24hSentAt: new Date() },
      });
      await AuditService.log({
        tenantId: loan.tenantId,
        action: 'ATTESTATION_MEETING_24H_REMINDER',
        entityType: 'Loan',
        entityId: loan.id,
        newData: { sentAt: new Date().toISOString() },
      });
      sent += 1;
    } catch (e) {
      console.error(`[AttestationReminder] loan ${loan.id}`, e);
    }
  }

  return { sent };
}
