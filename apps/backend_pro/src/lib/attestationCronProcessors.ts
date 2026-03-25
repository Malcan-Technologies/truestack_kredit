import { prisma } from './prisma.js';
import { expirePendingProposals } from './attestationBookingService.js';
import { NotificationService } from '../modules/notifications/service.js';
import { AuditService } from '../modules/compliance/auditService.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * Expire attestation slot proposals after deadline (12h).
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

  const loans = await prisma.loan.findMany({
    where: {
      status: 'PENDING_DISBURSEMENT',
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
    if (!b?.email) continue;

    try {
      await NotificationService.send({
        tenantId: loan.tenantId,
        type: 'email',
        recipient: b.email,
        subject: 'Reminder: attestation meeting in 24 hours',
        body: `Your attestation meeting is scheduled at ${loan.attestationMeetingStartAt?.toISOString() ?? ''}. Join: ${loan.attestationMeetingLink}`,
      });
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
