/**
 * Late Fee Processor
 * 
 * Processes daily late fee accrual for overdue loan repayments.
 * Runs via cron job at 12:30 AM MYT or manual admin trigger.
 * 
 * Key features:
 * - PostgreSQL advisory lock to prevent concurrent runs
 * - BACKFILL: Charges all missed days since the repayment's due date (or last accrual),
 *   so if the cron job misses days, they are caught up on the next run.
 * - Per-repayment daily fee accrual with DB-level uniqueness constraint
 *   (@@unique([repaymentId, accrualDate])) prevents double-charging.
 * - Late fees accrue on ACTIVE, IN_ARREARS, and DEFAULTED loans.
 * - Amount in arrears = outstanding principal + interest (NOT including late fees themselves).
 * - After a partial payment, subsequent daily fees use the reduced outstanding amount
 *   as of that day (we use the current outstanding for all backfilled days for simplicity,
 *   since the outstanding at time of processing is the correct amount for charging going forward,
 *   and already-charged days are skipped via the unique constraint).
 * - Arrears period detection with automatic letter generation
 * - Default period detection (marks ready, does NOT auto-default)
 * - Full audit trail integration
 */

import { prisma } from './prisma.js';
import { toSafeNumber, safeRound, safeAdd, safeSubtract, dailyLateFeeRate, calculateDailyLateFee } from './math.js';
import { generateArrearsLetter } from './letterService.js';
import { AuditService } from '../modules/compliance/auditService.js';

// Advisory lock ID for late fee processing
const LATE_FEE_LOCK_ID = 789012345;

// Malaysia timezone offset (UTC+8)
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

// One day in milliseconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get the start of a Malaysia business day in UTC.
 * e.g., if it's 2026-02-08 00:30 MYT → returns 2026-02-07T16:00:00.000Z (start of Feb 8 MYT in UTC)
 */
function getMalaysiaStartOfDay(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  // Convert to Malaysia time
  const mytTime = new Date(d.getTime() + MYT_OFFSET_MS);
  // Get the start of that day in MYT
  const mytStartOfDay = new Date(
    Date.UTC(mytTime.getUTCFullYear(), mytTime.getUTCMonth(), mytTime.getUTCDate())
  );
  // Convert back to UTC
  return new Date(mytStartOfDay.getTime() - MYT_OFFSET_MS);
}

/**
 * Get end of Malaysia business day in UTC
 */
function getMalaysiaEndOfDay(date?: Date): Date {
  const start = getMalaysiaStartOfDay(date);
  return new Date(start.getTime() + ONE_DAY_MS);
}

/**
 * Calculate days overdue from due date to a specific date (Malaysia time).
 * Returns 0 if not yet overdue.
 */
function calculateDaysOverdue(dueDate: Date, asOfDate?: Date): number {
  const refDate = asOfDate || new Date();
  const dueDateStart = new Date(Date.UTC(
    dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()
  ));
  const todayStart = getMalaysiaStartOfDay(refDate);
  // Add MYT offset back since dueDate is stored at UTC midnight
  const diffMs = todayStart.getTime() + MYT_OFFSET_MS - dueDateStart.getTime();
  const days = Math.floor(diffMs / ONE_DAY_MS);
  return Math.max(0, days);
}

/**
 * Get all dates from startDate to endDate (inclusive) as Malaysia day starts in UTC.
 * Used for backfilling missed days.
 */
function getDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let current = new Date(startDate);
  while (current.getTime() <= endDate.getTime()) {
    dates.push(new Date(current));
    current = new Date(current.getTime() + ONE_DAY_MS);
  }
  return dates;
}

// ============================================
// Processing Result Types
// ============================================

export interface ProcessingResult {
  success: boolean;
  trigger: 'CRON' | 'MANUAL';
  loansProcessed: number;
  feesCalculated: number;
  totalFeeAmount: number;
  arrearsLettersGenerated: number;
  defaultReadyLoans: number;
  processingTimeMs: number;
  skippedReason?: string;
  errors: string[];
  details: LoanProcessingDetail[];
}

interface LoanProcessingDetail {
  loanId: string;
  borrowerName: string;
  repaymentsCharged: number;
  totalFee: number;
  daysBackfilled: number;
  statusChange?: string;
  letterGenerated?: string;
}

// ============================================
// Late Fee Processor
// ============================================

export class LateFeeProcessor {
  /**
   * Main entry point for late fee processing.
   * Called by cron job or admin manual trigger.
   * 
   * This processor backfills ALL missed days. For each overdue repayment:
   * 1. Determines the first chargeable day (day after due date)
   * 2. For each day from first chargeable day to today:
   *    - Attempts to create a LateFeeEntry
   *    - Unique constraint (repaymentId, accrualDate) prevents double-charging
   *    - Already-charged days silently skip via P2002 catch
   * 3. Uses current outstanding amount for fee calculation
   *    (a conservative approach - see module docs for rationale)
   */
  static async processLateFees(trigger: 'CRON' | 'MANUAL', tenantId?: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const details: LoanProcessingDetail[] = [];
    let loansProcessed = 0;
    let feesCalculated = 0;
    let totalFeeAmount = 0;
    let arrearsLettersGenerated = 0;
    let defaultReadyLoans = 0;

    try {
      // 1. Acquire advisory lock to prevent concurrent runs
      const lockResult = await prisma.$queryRawUnsafe<{ locked: boolean }[]>(
        `SELECT pg_try_advisory_lock(${LATE_FEE_LOCK_ID}) as locked`
      );
      
      if (!lockResult[0]?.locked) {
        return {
          success: false,
          trigger,
          loansProcessed: 0,
          feesCalculated: 0,
          totalFeeAmount: 0,
          arrearsLettersGenerated: 0,
          defaultReadyLoans: 0,
          processingTimeMs: Date.now() - startTime,
          skippedReason: 'Late fee processing already in progress (advisory lock held)',
          errors: [],
          details: [],
        };
      }

      try {
        // 2. Today's date boundary (Malaysia business day)
        const todayStart = getMalaysiaStartOfDay();

        // 3. Query overdue repayments (scoped to tenant if provided, else all)
        // Include ACTIVE, IN_ARREARS, and DEFAULTED loans - late fees continue to accrue
        const overdueRepayments = await prisma.loanRepayment.findMany({
          where: {
            status: { in: ['PENDING', 'PARTIAL'] },
            dueDate: { lt: todayStart },
            scheduleVersion: {
              loan: {
                status: { in: ['ACTIVE', 'IN_ARREARS', 'DEFAULTED'] },
                ...(tenantId ? { tenantId } : {}),
              },
            },
          },
          include: {
            allocations: true,
            lateFeeEntries: {
              orderBy: { accrualDate: 'desc' },
              take: 1, // Get the most recent entry to know where we left off
            },
            scheduleVersion: {
              include: {
                loan: {
                  include: {
                    product: true,
                    borrower: true,
                    tenant: true,
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
                },
              },
            },
          },
        });

        // 4. Group by loan
        const loanMap = new Map<string, typeof overdueRepayments>();
        for (const rep of overdueRepayments) {
          const loanId = rep.scheduleVersion.loan.id;
          if (!loanMap.has(loanId)) {
            loanMap.set(loanId, []);
          }
          loanMap.get(loanId)!.push(rep);
        }

        // 5. Process each loan
        for (const [loanId, repayments] of loanMap) {
          try {
            const loan = repayments[0].scheduleVersion.loan;
            const product = loan.product;
            const latePaymentRate = toSafeNumber(product.latePaymentRate);
            
            if (latePaymentRate <= 0) continue; // No late fee configured

            const rate = dailyLateFeeRate(latePaymentRate);

            let loanTotalFee = 0;
            let loanFeesCount = 0;
            let loanDaysBackfilled = 0;

            // Find the repayment number for each overdue repayment
            const currentSchedule = loan.scheduleVersions[0];
            const allRepayments = currentSchedule?.repayments || [];

            for (const repayment of repayments) {
              try {
                // Calculate outstanding = totalDue - amount paid (principal + interest only)
                const totalDue = toSafeNumber(repayment.totalDue);
                const amountPaid = repayment.allocations.reduce(
                  (sum, a) => safeAdd(sum, toSafeNumber(a.amount)),
                  0
                );
                const outstanding = safeSubtract(totalDue, amountPaid);

                if (outstanding <= 0.01) continue; // Effectively paid

                // Calculate the daily fee based on current outstanding
                const dailyFee = calculateDailyLateFee(outstanding, latePaymentRate);
                if (dailyFee <= 0) continue;

                // Determine the range of days to charge:
                // - Start: day after due date (first overdue day) represented as MYT start-of-day in UTC
                // - End: today (MYT start-of-day in UTC)
                const dueDateMidnight = new Date(Date.UTC(
                  repayment.dueDate.getUTCFullYear(),
                  repayment.dueDate.getUTCMonth(),
                  repayment.dueDate.getUTCDate()
                ));
                // First chargeable day: the day after due date, as MYT start-of-day in UTC
                // Due date itself is not overdue; the day after is day 1 overdue
                const firstChargeableDay = getMalaysiaStartOfDay(
                  new Date(dueDateMidnight.getTime() + ONE_DAY_MS)
                );

                // If we've already charged some days, start from the day after the last charged day
                let startDate: Date;
                if (repayment.lateFeeEntries.length > 0) {
                  const lastAccrualDate = repayment.lateFeeEntries[0].accrualDate;
                  startDate = new Date(getMalaysiaStartOfDay(lastAccrualDate).getTime() + ONE_DAY_MS);
                } else {
                  startDate = firstChargeableDay;
                }

                // Don't charge beyond today
                if (startDate.getTime() > todayStart.getTime()) continue;

                // Get all dates to charge
                const datesToCharge = getDateRange(startDate, todayStart);

                let repaymentFeeTotal = 0;

                for (const accrualDate of datesToCharge) {
                  const daysOverdue = calculateDaysOverdue(repayment.dueDate, 
                    new Date(accrualDate.getTime() + MYT_OFFSET_MS) // Convert back for calculation
                  );
                  if (daysOverdue <= 0) continue;

                  try {
                    await prisma.lateFeeEntry.create({
                      data: {
                        tenantId: loan.tenantId,
                        loanId: loan.id,
                        repaymentId: repayment.id,
                        accrualDate,
                        daysOverdue,
                        outstandingAmount: outstanding,
                        dailyRate: rate,
                        feeAmount: dailyFee,
                      },
                    });

                    repaymentFeeTotal = safeAdd(repaymentFeeTotal, dailyFee);
                    loanFeesCount++;
                    loanDaysBackfilled++;
                  } catch (err: unknown) {
                    // P2002 = unique constraint violation → already charged this day, skip
                    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
                      continue;
                    }
                    throw err;
                  }
                }

                // Update LoanRepayment.lateFeeAccrued with the total new fees
                if (repaymentFeeTotal > 0) {
                  await prisma.loanRepayment.update({
                    where: { id: repayment.id },
                    data: {
                      lateFeeAccrued: safeAdd(toSafeNumber(repayment.lateFeeAccrued), repaymentFeeTotal),
                    },
                  });
                }

                loanTotalFee = safeAdd(loanTotalFee, repaymentFeeTotal);
              } catch (repErr) {
                errors.push(`Repayment ${repayment.id}: ${repErr instanceof Error ? repErr.message : 'Unknown error'}`);
              }
            }

            // Update Loan.totalLateFees
            if (loanTotalFee > 0) {
              await prisma.loan.update({
                where: { id: loanId },
                data: {
                  totalLateFees: safeAdd(toSafeNumber(loan.totalLateFees), loanTotalFee),
                },
              });
            }

            feesCalculated += loanFeesCount;
            totalFeeAmount = safeAdd(totalFeeAmount, loanTotalFee);

            // 5d. Check arrears period
            const oldestOverdueDays = repayments.reduce(
              (max, r) => Math.max(max, calculateDaysOverdue(r.dueDate)),
              0
            );
            const arrearsPeriod = product.arrearsPeriod;
            const defaultPeriod = product.defaultPeriod;

            let statusChange: string | undefined;
            let letterGenerated: string | undefined;

            if (oldestOverdueDays >= arrearsPeriod && loan.status === 'ACTIVE') {
              // Transition to IN_ARREARS
              await prisma.loan.update({
                where: { id: loanId },
                data: {
                  status: 'IN_ARREARS',
                  arrearsStartDate: new Date(),
                },
              });

              statusChange = 'ACTIVE → IN_ARREARS';

              // Generate arrears letter
              try {
                // Re-read repayments from DB to get the actual updated lateFeeAccrued values
                const freshRepayments = await prisma.loanRepayment.findMany({
                  where: { id: { in: repayments.map(r => r.id) } },
                  include: { allocations: true },
                });

                const overdueDetails = freshRepayments.map(r => {
                  const repIdx = allRepayments.findIndex(ar => ar.id === r.id);
                  const totalDue = toSafeNumber(r.totalDue);
                  const paid = r.allocations.reduce((s, a) => safeAdd(s, toSafeNumber(a.amount)), 0);
                  return {
                    repaymentNumber: repIdx + 1,
                    dueDate: r.dueDate,
                    totalDue,
                    amountPaid: paid,
                    outstanding: safeSubtract(totalDue, paid),
                    lateFeeAccrued: toSafeNumber(r.lateFeeAccrued),
                    daysOverdue: calculateDaysOverdue(r.dueDate),
                  };
                });

                const totalOutstanding = overdueDetails.reduce((s, r) => safeAdd(s, r.outstanding), 0);
                const totalLateFees = overdueDetails.reduce((s, r) => safeAdd(s, r.lateFeeAccrued), 0);

                const borrower = loan.borrower;
                // Use the updated total (original + newly accrued from this run)
                const updatedLoanTotalLateFees = safeAdd(toSafeNumber(loan.totalLateFees), loanTotalFee);
                const letterPath = await generateArrearsLetter({
                  loan: {
                    id: loan.id,
                    principalAmount: loan.principalAmount,
                    interestRate: loan.interestRate,
                    term: loan.term,
                    disbursementDate: loan.disbursementDate,
                    totalLateFees: updatedLoanTotalLateFees,
                  },
                  borrower: {
                    displayName: borrower.borrowerType === 'CORPORATE' && borrower.companyName
                      ? borrower.companyName
                      : borrower.name,
                    identificationNumber: borrower.icNumber,
                    address: borrower.address,
                  },
                  tenant: {
                    name: loan.tenant.name,
                    registrationNumber: loan.tenant.registrationNumber,
                    licenseNumber: loan.tenant.licenseNumber,
                    businessAddress: loan.tenant.businessAddress,
                    contactNumber: loan.tenant.contactNumber,
                    email: loan.tenant.email,
                    logoUrl: loan.tenant.logoUrl,
                  },
                  overdueRepayments: overdueDetails,
                  totalOutstanding,
                  totalLateFees,
                  arrearsPeriod,
                });

                await prisma.loan.update({
                  where: { id: loanId },
                  data: { arrearsLetterPath: letterPath },
                });

                letterGenerated = letterPath;
                arrearsLettersGenerated++;

                // Audit log: arrears letter generated (auto)
                await AuditService.log({
                  tenantId: loan.tenantId,
                  action: 'GENERATE_ARREARS_LETTER',
                  entityType: 'Loan',
                  entityId: loanId,
                  newData: {
                    arrearsLetterPath: letterPath,
                    trigger: trigger === 'CRON' ? 'auto' : 'manual_late_fee_run',
                  },
                });
              } catch (letterErr) {
                errors.push(`Arrears letter for loan ${loanId}: ${letterErr instanceof Error ? letterErr.message : 'Unknown error'}`);
              }

              // Audit log: status change to arrears
              await AuditService.log({
                tenantId: loan.tenantId,
                action: 'STATUS_UPDATE',
                entityType: 'Loan',
                entityId: loanId,
                previousData: { status: 'ACTIVE' },
                newData: {
                  status: 'IN_ARREARS',
                  arrearsStartDate: new Date().toISOString(),
                  daysOverdue: oldestOverdueDays,
                  arrearsPeriod,
                  trigger,
                },
              });
            }

            // 5e. Check default period
            if (oldestOverdueDays >= defaultPeriod && !loan.readyForDefault) {
              await prisma.loan.update({
                where: { id: loanId },
                data: {
                  readyForDefault: true,
                  defaultReadyDate: new Date(),
                },
              });
              defaultReadyLoans++;

              // Audit log: default ready
              await AuditService.log({
                tenantId: loan.tenantId,
                action: 'DEFAULT_READY',
                entityType: 'Loan',
                entityId: loanId,
                newData: {
                  readyForDefault: true,
                  defaultReadyDate: new Date().toISOString(),
                  daysOverdue: oldestOverdueDays,
                  defaultPeriod,
                  trigger,
                },
              });
            }

            loansProcessed++;
            details.push({
              loanId,
              borrowerName: loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
                ? loan.borrower.companyName
                : loan.borrower.name,
              repaymentsCharged: loanFeesCount,
              totalFee: loanTotalFee,
              daysBackfilled: loanDaysBackfilled,
              statusChange,
              letterGenerated,
            });

            // Audit log: late fee accrual per loan
            if (loanTotalFee > 0) {
              await AuditService.log({
                tenantId: loan.tenantId,
                action: 'LATE_FEE_ACCRUAL',
                entityType: 'Loan',
                entityId: loanId,
                newData: {
                  totalFeeCharged: loanTotalFee,
                  repaymentsAffected: loanFeesCount,
                  daysBackfilled: loanDaysBackfilled,
                  accrualDate: todayStart.toISOString(),
                  trigger,
                },
              });
            }
          } catch (loanErr) {
            errors.push(`Loan ${loanId}: ${loanErr instanceof Error ? loanErr.message : 'Unknown error'}`);
          }
        }

        // 6. Write processing log
        await prisma.lateFeeProcessingLog.create({
          data: {
            tenantId: tenantId || null,
            trigger,
            status: errors.length > 0 ? 'FAILED' : 'SUCCESS',
            loansProcessed,
            feesCalculated,
            totalFeeAmount,
            arrearsLetters: arrearsLettersGenerated,
            processingTimeMs: Date.now() - startTime,
            errorMessage: errors.length > 0 ? errors.join('; ') : null,
            metadata: {
              defaultReadyLoans,
              detailCount: details.length,
            },
          },
        });

        return {
          success: errors.length === 0,
          trigger,
          loansProcessed,
          feesCalculated,
          totalFeeAmount,
          arrearsLettersGenerated,
          defaultReadyLoans,
          processingTimeMs: Date.now() - startTime,
          errors,
          details,
        };
      } finally {
        // 7. Release advisory lock
        await prisma.$queryRawUnsafe(
          `SELECT pg_advisory_unlock(${LATE_FEE_LOCK_ID})`
        );
      }
    } catch (err) {
      // Log failure
      try {
        await prisma.lateFeeProcessingLog.create({
          data: {
            tenantId: tenantId || null,
            trigger,
            status: 'FAILED',
            loansProcessed,
            feesCalculated,
            totalFeeAmount,
            processingTimeMs: Date.now() - startTime,
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
          },
        });
      } catch {
        // Best-effort log
      }

      return {
        success: false,
        trigger,
        loansProcessed,
        feesCalculated,
        totalFeeAmount,
        arrearsLettersGenerated,
        defaultReadyLoans,
        processingTimeMs: Date.now() - startTime,
        errors: [err instanceof Error ? err.message : 'Unknown error'],
        details,
      };
    }
  }

  /**
   * Check if late fees have already been processed today.
   * Note: With backfill logic, running multiple times is safe (unique constraint prevents
   * double-charging), but we still track runs for admin visibility.
   */
  static async hasProcessedToday(tenantId?: string): Promise<{ processed: boolean; lastRun?: Date; trigger?: string }> {
    const todayStart = getMalaysiaStartOfDay();
    const todayEnd = getMalaysiaEndOfDay();

    const log = await prisma.lateFeeProcessingLog.findFirst({
      where: {
        processedAt: { gte: todayStart, lt: todayEnd },
        status: 'SUCCESS',
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: { processedAt: 'desc' },
    });

    return {
      processed: !!log,
      lastRun: log?.processedAt,
      trigger: log?.trigger,
    };
  }

  /**
   * Get the latest processing status
   */
  static async getProcessingStatus(tenantId?: string): Promise<{
    lastRun: Date | null;
    lastTrigger: string | null;
    lastStatus: string | null;
    processedToday: boolean;
    loansReadyForDefault: number;
    loansInArrears: number;
    loansReadyToComplete: number;
  }> {
    const tenantFilter = tenantId ? { tenantId } : {};
    const loanTenantFilter = tenantId ? { tenantId } : {};

    const [lastLog, todayCheck, defaultCount, arrearsCount, readyToCompleteLoans] = await Promise.all([
      prisma.lateFeeProcessingLog.findFirst({
        where: tenantFilter,
        orderBy: { processedAt: 'desc' },
      }),
      this.hasProcessedToday(tenantId),
      prisma.loan.count({
        where: { ...loanTenantFilter, readyForDefault: true, status: { not: 'DEFAULTED' } },
      }),
      prisma.loan.count({
        where: { ...loanTenantFilter, status: 'IN_ARREARS' },
      }),
      // Count loans where all repayments are PAID but loan status is still ACTIVE/IN_ARREARS
      prisma.loan.findMany({
        where: {
          ...loanTenantFilter,
          status: { in: ['ACTIVE', 'IN_ARREARS'] },
        },
        select: {
          id: true,
          scheduleVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              repayments: {
                select: { status: true },
              },
            },
          },
        },
      }),
    ]);

    // Count loans where every repayment in the latest schedule version is PAID
    const readyToCompleteCount = readyToCompleteLoans.filter(loan => {
      const schedule = loan.scheduleVersions[0];
      if (!schedule || schedule.repayments.length === 0) return false;
      return schedule.repayments.every(r => r.status === 'PAID' || r.status === 'CANCELLED');
    }).length;

    return {
      lastRun: lastLog?.processedAt || null,
      lastTrigger: lastLog?.trigger || null,
      lastStatus: lastLog?.status || null,
      processedToday: todayCheck.processed,
      loansReadyForDefault: defaultCount,
      loansInArrears: arrearsCount,
      loansReadyToComplete: readyToCompleteCount,
    };
  }

  /**
   * Get recent processing logs
   */
  static async getRecentLogs(limit = 20, tenantId?: string) {
    return prisma.lateFeeProcessingLog.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { processedAt: 'desc' },
      take: limit,
    });
  }
}
