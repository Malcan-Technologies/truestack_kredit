/**
 * Payment Reminder Processor (TrueSend)
 *
 * Runs daily at 9:00 AM MYT via cron.
 * Sends payment reminders 3 days and 1 day before each milestone due date
 * for tenants that have the TrueSend add-on active.
 */

import { prisma } from './prisma.js';
import { AddOnService } from './addOnService.js';
import { TrueSendService } from '../modules/notifications/trueSendService.js';
import { toSafeNumber } from './math.js';

export class PaymentReminderProcessor {
  /**
   * Process payment reminders for all tenants with TrueSend active.
   * Called by the daily cron at 9:00 AM MYT.
   */
  static async processReminders(): Promise<{
    tenantsChecked: number;
    remindersSent: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let tenantsChecked = 0;
    let remindersSent = 0;

    try {
      // Find all tenants with active TrueSend add-on
      const trueSendAddOns = await prisma.tenantAddOn.findMany({
        where: {
          addOnType: 'TRUESEND',
          status: 'ACTIVE',
        },
        select: { tenantId: true },
      });

      for (const { tenantId } of trueSendAddOns) {
        try {
          // Verify add-on is truly active (subscription check too)
          const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
          if (!isActive) continue;

          tenantsChecked++;

          // Get today and target dates in Malaysia timezone
          // Calculate dates for 3-day and 1-day reminders
          const now = new Date();
          const malaysiaOffset = 8 * 60 * 60 * 1000;
          const malaysiaToday = new Date(now.getTime() + malaysiaOffset);
          const todayStr = malaysiaToday.toISOString().split('T')[0];

          // Target dates: 3 days from now and 1 day from now (Malaysia time)
          const threeDaysFromNow = new Date(malaysiaToday);
          threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
          const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

          const oneDayFromNow = new Date(malaysiaToday);
          oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
          const oneDayStr = oneDayFromNow.toISOString().split('T')[0];

          // Find active/in-arrears loans for this tenant with upcoming PENDING repayments
          const loans = await prisma.loan.findMany({
            where: {
              tenantId,
              status: { in: ['ACTIVE', 'IN_ARREARS'] },
            },
            include: {
              borrower: { select: { id: true, email: true, name: true } },
              scheduleVersions: {
                orderBy: { version: 'desc' },
                take: 1,
                include: {
                  repayments: {
                    where: {
                      status: 'PENDING',
                    },
                    orderBy: { dueDate: 'asc' },
                  },
                },
              },
            },
          });

          for (const loan of loans) {
            if (!loan.borrower.email) continue;

            const latestVersion = loan.scheduleVersions[0];
            if (!latestVersion) continue;

            for (let i = 0; i < latestVersion.repayments.length; i++) {
              const repayment = latestVersion.repayments[i];
              const dueDateMYT = new Date(repayment.dueDate.getTime() + malaysiaOffset);
              const dueDateStr = dueDateMYT.toISOString().split('T')[0];

              let daysUntilDue: number | null = null;

              if (dueDateStr === threeDaysStr) {
                daysUntilDue = 3;
              } else if (dueDateStr === oneDayStr) {
                daysUntilDue = 1;
              }

              if (daysUntilDue === null) continue;

              // Check if we already sent a reminder for this repayment + this day
              const alreadySent = await prisma.emailLog.findFirst({
                where: {
                  tenantId,
                  loanId: loan.id,
                  emailType: 'PAYMENT_REMINDER',
                  createdAt: {
                    gte: new Date(`${todayStr}T00:00:00Z`),
                  },
                  subject: { contains: dueDateStr },
                },
              });

              if (alreadySent) continue;

              // Calculate milestone number (1-based index across all repayments)
              const milestoneNumber = i + 1;
              const amount = toSafeNumber(repayment.totalDue);

              try {
                await TrueSendService.sendPaymentReminder(
                  tenantId,
                  loan.id,
                  repayment.dueDate,
                  amount,
                  milestoneNumber,
                  daysUntilDue
                );
                remindersSent++;
              } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                errors.push(`Loan ${loan.id}: ${msg}`);
              }
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Tenant ${tenantId}: ${msg}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Global: ${msg}`);
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[PaymentReminder] Complete: ${tenantsChecked} tenants, ${remindersSent} reminders sent, ${errors.length} errors, ${processingTimeMs}ms`
    );

    return { tenantsChecked, remindersSent, errors };
  }
}
