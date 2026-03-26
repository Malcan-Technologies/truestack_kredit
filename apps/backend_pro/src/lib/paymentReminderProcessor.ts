/**
 * Payment Reminder Processor (TrueSend)
 *
 * Runs daily at 9:00 AM MYT via cron.
 * Sends payment reminders on tenant-configured days before due date
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
const DEFAULT_PAYMENT_REMINDER_DAYS = [3, 1, 0] as const;
const MAX_PAYMENT_REMINDER_DAY = 30;
const MAX_REMINDER_FREQUENCY_COUNT = 3;

function dedupeDays(days: number[]): number[] {
  return [...new Set(days)];
}

function normalizePaymentReminderDays(days: number[]): number[] {
  return dedupeDays(days)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= MAX_PAYMENT_REMINDER_DAY)
    .sort((a, b) => b - a)
    .slice(0, MAX_REMINDER_FREQUENCY_COUNT);
}

function readPaymentReminderDays(settings: unknown): number[] {
  const raw = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
  const rawDays = Array.isArray(raw.paymentReminderDays) ? raw.paymentReminderDays : DEFAULT_PAYMENT_REMINDER_DAYS;
  const normalized = normalizePaymentReminderDays(rawDays as number[]);
  return normalized.length > 0 ? normalized : [...DEFAULT_PAYMENT_REMINDER_DAYS];
}

function buildReminderType(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'DUE_ON_DAY';
  // Keep legacy singular form for idempotent de-dup compatibility.
  if (daysUntilDue === 1) return 'DUE_IN_1_DAY';
  return `DUE_IN_${daysUntilDue}_DAYS`;
}

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
      const reminderDayStart = getMalaysiaStartOfDay(new Date());

      // Pro: TrueSend is included for all active tenants; settings live on Tenant.truesendSettings
      const trueSendTenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          truesendSettings: true,
        },
      });

      await runWithConcurrency(trueSendTenants, TENANT_PROCESSING_CONCURRENCY, async ({ id: tenantId, truesendSettings }) => {
        const settings = truesendSettings;
        try {
          // Verify add-on is truly active (subscription check too)
          const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
          if (!isActive) return;

          tenantsChecked++;
          const reminderDays = readPaymentReminderDays(settings);
          const reminderDateMatches = new Map<string, { daysUntilDue: number; reminderType: string }>();
          const dueDateFilters = reminderDays.map((daysUntilDue) => {
            const targetStart = addMalaysiaDays(reminderDayStart, daysUntilDue);
            const targetEnd = addMalaysiaDays(targetStart, 1);
            reminderDateMatches.set(getMalaysiaDateString(targetStart), {
              daysUntilDue,
              reminderType: buildReminderType(daysUntilDue),
            });
            return { dueDate: { gte: targetStart, lt: targetEnd } };
          });

          if (dueDateFilters.length === 0) return;

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
                      OR: dueDateFilters,
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
                      OR: dueDateFilters,
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
            reminderType: string;
          }> = [];

          for (const loan of loans) {
            if (!loan.borrower.email) continue;

            const latestVersion = loan.scheduleVersions[0];
            if (!latestVersion) continue;

            for (let i = 0; i < latestVersion.repayments.length; i++) {
              const repayment = latestVersion.repayments[i];
              const dueDateStr = getMalaysiaDateString(repayment.dueDate);
              const reminderMatch = reminderDateMatches.get(dueDateStr);
              if (!reminderMatch) continue;
              reminderJobs.push({
                loan,
                repayment,
                milestoneNumber: i + 1,
                daysUntilDue: reminderMatch.daysUntilDue,
                reminderType: reminderMatch.reminderType,
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
