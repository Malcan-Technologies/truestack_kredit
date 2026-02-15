/**
 * Payment Reminder Processor (TrueSend)
 *
 * Runs daily at 9:00 AM MYT via cron.
 * Sends payment reminders 3 days and 1 day before each milestone due date
 * for tenants that have the TrueSend add-on active.
 */

import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';
import { AddOnService } from './addOnService.js';
import { TrueSendService } from '../modules/notifications/trueSendService.js';
import { toSafeNumber } from './math.js';
import { addMalaysiaDays, getMalaysiaDateString, getMalaysiaStartOfDay } from './malaysiaTime.js';

const TENANT_PROCESSING_CONCURRENCY = 5;
const REMINDER_SENDING_CONCURRENCY = 10;

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor++;
      await worker(items[index]);
    }
  });

  await Promise.all(runners);
}

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
      // Calculate deterministic MYT windows and target dates once per run
      const reminderDayStart = getMalaysiaStartOfDay(new Date());
      const threeDaysTarget = addMalaysiaDays(reminderDayStart, 3);
      const oneDayTarget = addMalaysiaDays(reminderDayStart, 1);
      const threeDaysEnd = addMalaysiaDays(threeDaysTarget, 1);
      const oneDayEnd = addMalaysiaDays(oneDayTarget, 1);
      const threeDaysStr = getMalaysiaDateString(threeDaysTarget);
      const oneDayStr = getMalaysiaDateString(oneDayTarget);

      // Find all tenants with active TrueSend add-on
      const trueSendAddOns = await prisma.tenantAddOn.findMany({
        where: {
          addOnType: 'TRUESEND',
          status: 'ACTIVE',
        },
        select: { tenantId: true },
      });

      await runWithConcurrency(trueSendAddOns, TENANT_PROCESSING_CONCURRENCY, async ({ tenantId }) => {
        try {
          // Verify add-on is truly active (subscription check too)
          const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
          if (!isActive) return;

          tenantsChecked++;

          // Find active/in-arrears loans for this tenant with relevant upcoming repayments
          const loans = await prisma.loan.findMany({
            where: {
              tenantId,
              status: { in: ['ACTIVE', 'IN_ARREARS'] },
              scheduleVersions: {
                some: {
                  repayments: {
                    some: {
                      status: { in: ['PENDING', 'PARTIAL'] },
                      OR: [
                        { dueDate: { gte: threeDaysTarget, lt: threeDaysEnd } },
                        { dueDate: { gte: oneDayTarget, lt: oneDayEnd } },
                      ],
                    },
                  },
                },
              },
            },
            include: {
              borrower: { select: { id: true, email: true, name: true } },
              tenant: {
                select: {
                  name: true,
                  logoUrl: true,
                  registrationNumber: true,
                  email: true,
                  contactNumber: true,
                  businessAddress: true,
                },
              },
              scheduleVersions: {
                orderBy: { version: 'desc' },
                take: 1,
                include: {
                  repayments: {
                    where: {
                      status: { in: ['PENDING', 'PARTIAL'] },
                      OR: [
                        { dueDate: { gte: threeDaysTarget, lt: threeDaysEnd } },
                        { dueDate: { gte: oneDayTarget, lt: oneDayEnd } },
                      ],
                    },
                    orderBy: { dueDate: 'asc' },
                  },
                },
              },
            },
          });

          const reminderJobs: Array<{
            loan: (typeof loans)[number];
            repayment: (typeof loans)[number]['scheduleVersions'][number]['repayments'][number];
            milestoneNumber: number;
            daysUntilDue: number;
            reminderType: 'DUE_IN_3_DAYS' | 'DUE_IN_1_DAY';
          }> = [];

          for (const loan of loans) {
            if (!loan.borrower.email) continue;

            const latestVersion = loan.scheduleVersions[0];
            if (!latestVersion) continue;

            for (let i = 0; i < latestVersion.repayments.length; i++) {
              const repayment = latestVersion.repayments[i];
              const dueDateStr = getMalaysiaDateString(repayment.dueDate);

              let daysUntilDue: number | null = null;
              let reminderType: 'DUE_IN_3_DAYS' | 'DUE_IN_1_DAY' | null = null;

              if (dueDateStr === threeDaysStr) {
                daysUntilDue = 3;
                reminderType = 'DUE_IN_3_DAYS';
              } else if (dueDateStr === oneDayStr) {
                daysUntilDue = 1;
                reminderType = 'DUE_IN_1_DAY';
              }

              if (daysUntilDue === null || reminderType === null) continue;
              reminderJobs.push({
                loan,
                repayment,
                milestoneNumber: i + 1,
                daysUntilDue,
                reminderType,
              });
            }
          }

          await runWithConcurrency(reminderJobs, REMINDER_SENDING_CONCURRENCY, async (job) => {
            const { loan, repayment, milestoneNumber, daysUntilDue, reminderType } = job;
            // Deterministic de-dup guard with DB-level uniqueness
            let dispatchId: string | null = null;
            try {
              const dispatch = await prisma.paymentReminderDispatch.create({
                data: {
                  tenantId,
                  loanId: loan.id,
                  repaymentId: repayment.id,
                  reminderType,
                  reminderDateMYT: reminderDayStart,
                },
              });
              dispatchId = dispatch.id;
            } catch (error) {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return;
              }
              throw error;
            }

            const amount = toSafeNumber(repayment.totalDue);

            try {
              await TrueSendService.sendPaymentReminderWithContext({
                tenantId,
                loanId: loan.id,
                borrowerId: loan.borrower.id,
                recipientEmail: loan.borrower.email!,
                recipientName: loan.borrower.name,
                tenant: loan.tenant,
                dueDate: repayment.dueDate,
                amount,
                milestoneNumber,
                daysUntilDue,
              });
              remindersSent++;
            } catch (error) {
              if (dispatchId) {
                await prisma.paymentReminderDispatch.delete({ where: { id: dispatchId } }).catch(() => undefined);
              }
              const msg = error instanceof Error ? error.message : 'Unknown error';
              errors.push(`Loan ${loan.id}: ${msg}`);
            }
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Tenant ${tenantId}: ${msg}`);
        }
      });
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
