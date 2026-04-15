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
const REPAYMENT_QUERY_BATCH_SIZE = 2000;

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
  if (normalized.length > 0) return normalized;

  const defaultNormalized = normalizeLatePaymentNoticeDays([...DEFAULT_LATE_PAYMENT_NOTICE_DAYS], maxLateDay);
  if (defaultNormalized.length > 0) return defaultNormalized;

  // Ensure short arrears periods (e.g. 1-2 days) still get at least one valid notice day.
  return maxLateDay >= 1 ? [maxLateDay] : [];
}

function buildLateNoticeType(daysAfterDue: number): string {
  return `LATE_${daysAfterDue}_DAYS`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
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

          // Step 1: Get latest schedule version per active loan for this tenant only.
          // Using distinct+orderBy avoids matching older schedule versions while keeping payload small.
          const latestScheduleVersions = await prisma.loanScheduleVersion.findMany({
            where: {
              loan: {
                tenantId,
                status: { in: ['ACTIVE', 'IN_ARREARS'] },
              },
            },
            orderBy: [{ loanId: 'asc' }, { version: 'desc' }],
            distinct: ['loanId'],
            select: {
              id: true,
              loanId: true,
            },
          });

          if (latestScheduleVersions.length === 0) return;

          const latestVersionLoanById = new Map(
            latestScheduleVersions.map((version) => [version.id, version.loanId])
          );

          // Step 2: Query only repayment rows that can trigger today to avoid scanning all loans.
          // Batch the IN-list for large tenants to keep query size bounded.
          const latestVersionIdBatches = chunkArray(
            latestScheduleVersions.map((version) => version.id),
            REPAYMENT_QUERY_BATCH_SIZE,
          );
          const triggeredNoticeTypesByLoanId = new Map<string, Set<string>>();
          for (const versionIdBatch of latestVersionIdBatches) {
            const triggeredRepayments = await prisma.loanRepayment.findMany({
              where: {
                scheduleVersionId: { in: versionIdBatch },
                status: { in: ['PENDING', 'PARTIAL'] },
                OR: dueDateFilters,
              },
              select: {
                scheduleVersionId: true,
                dueDate: true,
              },
            });

            for (const repayment of triggeredRepayments) {
              const loanId = latestVersionLoanById.get(repayment.scheduleVersionId);
              if (!loanId) continue;

              const dueDateKey = getMalaysiaDateString(repayment.dueDate);
              const matchedDaysAfterDue = dueDateMatchByDay.get(dueDateKey);
              if (typeof matchedDaysAfterDue !== 'number') continue;

              const noticeType = buildLateNoticeType(matchedDaysAfterDue);
              const existingTypes = triggeredNoticeTypesByLoanId.get(loanId) ?? new Set<string>();
              existingTypes.add(noticeType);
              triggeredNoticeTypesByLoanId.set(loanId, existingTypes);
            }
          }

          if (triggeredNoticeTypesByLoanId.size === 0) return;

          // Step 3: Fetch only candidate loans that have a trigger today, with latest schedule for consolidation.
          const loans = await prisma.loan.findMany({
            where: {
              tenantId,
              status: { in: ['ACTIVE', 'IN_ARREARS'] },
              id: { in: Array.from(triggeredNoticeTypesByLoanId.keys()) },
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
            noticeTypes: string[];
            overdueMilestones: Array<{ milestoneNumber: number; dueDate: Date; amount: number; daysOverdue: number }>;
          }> = [];

          for (const loan of loans) {
            const latestVersion = loan.scheduleVersions[0];
            if (!latestVersion) continue;
            const triggeredNoticeTypes = triggeredNoticeTypesByLoanId.get(loan.id);
            if (!triggeredNoticeTypes || triggeredNoticeTypes.size === 0) continue;

            const overdueMilestones: Array<{ milestoneNumber: number; dueDate: Date; amount: number; daysOverdue: number }> = [];

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
            }

            if (triggeredNoticeTypes.size === 0 || overdueMilestones.length === 0) continue;
            jobs.push({
              loanId: loan.id,
              noticeTypes: Array.from(triggeredNoticeTypes).sort(),
              overdueMilestones,
            });
          }

          await runWithConcurrency(jobs, NOTICE_SENDING_CONCURRENCY, async (job) => {
            const createdDispatchIds: string[] = [];
            let hasNewDispatch = false;

            for (const noticeType of job.noticeTypes) {
              try {
                const dispatch = await prisma.latePaymentNoticeDispatch.create({
                  data: {
                    tenantId,
                    loanId: job.loanId,
                    noticeType,
                    noticeDateMYT: noticeDayStart,
                  },
                });
                createdDispatchIds.push(dispatch.id);
                hasNewDispatch = true;
              } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                  continue;
                }
                throw error;
              }
            }

            if (!hasNewDispatch) return;

            try {
              await TrueSendService.sendLatePaymentNotice(tenantId, job.loanId, job.overdueMilestones);
              noticesSent++;
            } catch (error) {
              if (createdDispatchIds.length > 0) {
                await prisma.latePaymentNoticeDispatch.deleteMany({
                  where: { id: { in: createdDispatchIds } },
                }).catch(() => undefined);
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
