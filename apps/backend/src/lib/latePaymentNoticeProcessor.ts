/**
 * Late Payment Notice Processor (TrueSend)
 *
 * Runs daily and sends consolidated late payment notices based on
 * tenant-configured day offsets after due date.
 */

import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';
import { AddOnService } from './addOnService.js';
import { TrueSendService } from '../modules/notifications/trueSendService.js';
import { toSafeNumber } from './math.js';
import { addMalaysiaDays, calculateDaysOverdueMalaysia, getMalaysiaDateString, getMalaysiaStartOfDay } from './malaysiaTime.js';

const TENANT_PROCESSING_CONCURRENCY = 5;
const NOTICE_SENDING_CONCURRENCY = 10;
const DEFAULT_LATE_PAYMENT_NOTICE_DAYS = [3, 7, 10] as const;
const DEFAULT_ARREARS_PERIOD = 14;
const MAX_REMINDER_FREQUENCY_COUNT = 3;

function dedupeDays(days: number[]): number[] {
  return [...new Set(days)];
}

function normalizeLatePaymentNoticeDays(days: number[], maxLateDay: number): number[] {
  return dedupeDays(days)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= maxLateDay)
    .sort((a, b) => a - b)
    .slice(0, MAX_REMINDER_FREQUENCY_COUNT);
}

function readLatePaymentNoticeDays(settings: unknown, maxLateDay: number): number[] {
  const raw = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
  const rawDays = Array.isArray(raw.latePaymentNoticeDays) ? raw.latePaymentNoticeDays : DEFAULT_LATE_PAYMENT_NOTICE_DAYS;
  const normalized = normalizeLatePaymentNoticeDays(rawDays as number[], maxLateDay);
  const defaultNormalized = normalizeLatePaymentNoticeDays([...DEFAULT_LATE_PAYMENT_NOTICE_DAYS], maxLateDay);
  return normalized.length > 0 ? normalized : defaultNormalized;
}

function buildLateNoticeType(daysAfterDue: number): string {
  return `LATE_${daysAfterDue}_DAYS`;
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

export class LatePaymentNoticeProcessor {
  static async processNotices(): Promise<{
    tenantsChecked: number;
    noticesSent: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let tenantsChecked = 0;
    let noticesSent = 0;

    try {
      const noticeDayStart = getMalaysiaStartOfDay(new Date());

      const trueSendAddOns = await prisma.tenantAddOn.findMany({
        where: {
          addOnType: 'TRUESEND',
          status: 'ACTIVE',
        },
        select: {
          tenantId: true,
          settings: true,
        },
      });

      await runWithConcurrency(trueSendAddOns, TENANT_PROCESSING_CONCURRENCY, async ({ tenantId, settings }) => {
        try {
          const isActive = await AddOnService.hasActiveAddOn(tenantId, 'TRUESEND');
          if (!isActive) return;

          const periods = await prisma.product.aggregate({
            where: { tenantId, isActive: true },
            _min: { arrearsPeriod: true },
          });
          const arrearsPeriod = periods._min.arrearsPeriod ?? DEFAULT_ARREARS_PERIOD;
          const lateNoticeDays = readLatePaymentNoticeDays(settings, arrearsPeriod);
          if (lateNoticeDays.length === 0) return;

          tenantsChecked++;

          const dueDateMatchByDay = new Map<string, number>();
          const dueDateFilters = lateNoticeDays.map((daysAfterDue) => {
            const targetStart = addMalaysiaDays(noticeDayStart, -daysAfterDue);
            const targetEnd = addMalaysiaDays(targetStart, 1);
            dueDateMatchByDay.set(getMalaysiaDateString(targetStart), daysAfterDue);
            return { dueDate: { gte: targetStart, lt: targetEnd } };
          });

          const loans = await prisma.loan.findMany({
            where: {
              tenantId,
              status: { in: ['ACTIVE', 'IN_ARREARS'] },
            },
            include: {
              borrower: { select: { id: true, email: true } },
              scheduleVersions: {
                orderBy: { version: 'desc' },
                take: 1,
                include: {
                  repayments: {
                    orderBy: { dueDate: 'asc' },
                  },
                },
              },
            },
          });

          const jobs: Array<{
            loanId: string;
            noticeType: string;
            overdueMilestones: Array<{ milestoneNumber: number; dueDate: Date; amount: number; daysOverdue: number }>;
          }> = [];

          for (const loan of loans) {
            if (!loan.borrower.email) continue;
            const latestVersion = loan.scheduleVersions[0];
            if (!latestVersion) continue;

            const overdueMilestones: Array<{ milestoneNumber: number; dueDate: Date; amount: number; daysOverdue: number }> = [];
            const triggeredNoticeTypes = new Set<string>();

            for (let i = 0; i < latestVersion.repayments.length; i++) {
              const repayment = latestVersion.repayments[i];
              if (repayment.status !== 'PENDING' && repayment.status !== 'PARTIAL') continue;
              if (repayment.dueDate >= noticeDayStart) continue;

              overdueMilestones.push({
                milestoneNumber: i + 1,
                dueDate: repayment.dueDate,
                amount: toSafeNumber(repayment.totalDue),
                daysOverdue: calculateDaysOverdueMalaysia(repayment.dueDate, noticeDayStart),
              });

              const dueDateKey = getMalaysiaDateString(repayment.dueDate);
              const matchedDaysAfterDue = dueDateMatchByDay.get(dueDateKey);
              if (typeof matchedDaysAfterDue === 'number') {
                triggeredNoticeTypes.add(buildLateNoticeType(matchedDaysAfterDue));
              }
            }

            if (triggeredNoticeTypes.size === 0 || overdueMilestones.length === 0) continue;
            for (const noticeType of triggeredNoticeTypes) {
              jobs.push({
                loanId: loan.id,
                noticeType,
                overdueMilestones,
              });
            }
          }

          await runWithConcurrency(jobs, NOTICE_SENDING_CONCURRENCY, async (job) => {
            let dispatchId: string | null = null;
            try {
              const dispatch = await prisma.latePaymentNoticeDispatch.create({
                data: {
                  tenantId,
                  loanId: job.loanId,
                  noticeType: job.noticeType,
                  noticeDateMYT: noticeDayStart,
                },
              });
              dispatchId = dispatch.id;
            } catch (error) {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return;
              }
              throw error;
            }

            try {
              await TrueSendService.sendLatePaymentNotice(tenantId, job.loanId, job.overdueMilestones);
              noticesSent++;
            } catch (error) {
              if (dispatchId) {
                await prisma.latePaymentNoticeDispatch.delete({ where: { id: dispatchId } }).catch(() => undefined);
              }
              const msg = error instanceof Error ? error.message : 'Unknown error';
              errors.push(`Loan ${job.loanId}: ${msg}`);
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
      `[LatePaymentNotice] Complete: ${tenantsChecked} tenants, ${noticesSent} notices sent, ${errors.length} errors, ${processingTimeMs}ms`
    );

    return { tenantsChecked, noticesSent, errors };
  }
}
