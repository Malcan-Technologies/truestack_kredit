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
 * - Backfilled days use per-day outstanding snapshots, so historical fees reflect
 *   payment timing correctly and avoid under/over charging.
 * - Arrears period detection with automatic letter generation
 * - Default period detection (marks ready, does NOT auto-default)
 * - Full audit trail integration
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { toSafeNumber, safeRound, safeAdd, safeSubtract, dailyLateFeeRate, calculateDailyLateFee } from './math.js';
import { generateArrearsLetter } from './letterService.js';
import { AuditService } from '../modules/compliance/auditService.js';
import { TrueSendService } from '../modules/notifications/trueSendService.js';
import { ONE_DAY_MS, calculateDaysOverdueMalaysia, getMalaysiaEndOfDay, getMalaysiaStartOfDay } from './malaysiaTime.js';
import { recalculateBorrowerPerformanceProjection } from '../modules/borrowers/performanceProjectionService.js';

// Advisory lock ID for late fee processing
const LATE_FEE_LOCK_ID = 789012345;
const LOAN_PROCESSING_CONCURRENCY = 8;

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
   *    - Existing accrual days are filtered out before insertion
   * 3. Uses per-day outstanding snapshots for each accrual date
   *    so backfilled fee entries remain date-accurate.
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
        // We only accrue completed days, so end at previous MYT day start.
        const todayStart = getMalaysiaStartOfDay();
        const accrualEndDay = new Date(todayStart.getTime() - ONE_DAY_MS);

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
          select: {
            id: true,
            dueDate: true,
            scheduleVersion: {
              select: {
                loanId: true,
              },
            },
          },
        });

        // 4. Group by loan
        const loanMap = new Map<string, typeof overdueRepayments>();
        for (const rep of overdueRepayments) {
          const loanId = rep.scheduleVersion.loanId;
          if (!loanMap.has(loanId)) {
            loanMap.set(loanId, []);
          }
          loanMap.get(loanId)!.push(rep);
        }

        // 5. Process each loan with bounded concurrency
        const loanEntries = Array.from(loanMap.entries());
        await runWithConcurrency(loanEntries, LOAN_PROCESSING_CONCURRENCY, async ([loanId, repayments]) => {
          try {
            const loan = await prisma.loan.findUnique({
              where: { id: loanId },
              include: {
                product: true,
                borrower: true,
                tenant: true,
              },
            });
            if (!loan) return;

            const product = loan.product;
            const latePaymentRate = toSafeNumber(product.latePaymentRate);
            
            if (latePaymentRate <= 0) return; // No late fee configured

            const rate = dailyLateFeeRate(latePaymentRate);

            let loanTotalFee = 0;
            let loanFeesCount = 0;
            let loanDaysBackfilled = 0;

            for (const repayment of repayments) {
              try {
                const repaymentResult = await prisma.$transaction(async (tx) => {
                  // Keep lock order consistent with payment routes to reduce deadlock risk.
                  await tx.$executeRaw`SELECT 1 FROM "Loan" WHERE id = ${loan.id} FOR UPDATE`;
                  await tx.$executeRaw`SELECT 1 FROM "LoanRepayment" WHERE id = ${repayment.id} FOR UPDATE`;

                  const lockedRepayment = await tx.loanRepayment.findUnique({
                    where: { id: repayment.id },
                    include: {
                      allocations: {
                        orderBy: { allocatedAt: 'asc' },
                      },
                      lateFeeEntries: {
                        orderBy: { accrualDate: 'desc' },
                        take: 1,
                      },
                    },
                  });
                  if (!lockedRepayment) {
                    return {
                      repaymentFeeTotal: 0,
                      repaymentFeesCount: 0,
                      repaymentDaysBackfilled: 0,
                    };
                  }

                  const totalDue = toSafeNumber(lockedRepayment.totalDue);
                  const firstChargeableDay = new Date(getMalaysiaStartOfDay(lockedRepayment.dueDate).getTime() + ONE_DAY_MS);
                  const lastAccrualDate = lockedRepayment.lateFeeEntries[0]?.accrualDate;
                  const startDate = lastAccrualDate
                    ? new Date(getMalaysiaStartOfDay(lastAccrualDate).getTime() + ONE_DAY_MS)
                    : firstChargeableDay;
                  if (startDate.getTime() > accrualEndDay.getTime()) {
                    return {
                      repaymentFeeTotal: 0,
                      repaymentFeesCount: 0,
                      repaymentDaysBackfilled: 0,
                    };
                  }

                  let repaymentFeeTotal = 0;
                  let repaymentFeesCount = 0;
                  let repaymentDaysBackfilled = 0;
                  let allocationCursor = 0;
                  let paidBeforeAccrual = 0;
                  const feeEntries: Array<{
                    tenantId: string;
                    loanId: string;
                    repaymentId: string;
                    accrualDate: Date;
                    daysOverdue: number;
                    outstandingAmount: number;
                    dailyRate: number;
                    feeAmount: number;
                  }> = [];

                  for (
                    let accrualCursor = new Date(startDate);
                    accrualCursor.getTime() <= accrualEndDay.getTime();
                    accrualCursor = new Date(accrualCursor.getTime() + ONE_DAY_MS)
                  ) {
                    const accrualDate = new Date(accrualCursor);
                    while (
                      allocationCursor < lockedRepayment.allocations.length &&
                      new Date(lockedRepayment.allocations[allocationCursor].allocatedAt).getTime() < accrualDate.getTime()
                    ) {
                      paidBeforeAccrual = safeAdd(
                        paidBeforeAccrual,
                        toSafeNumber(lockedRepayment.allocations[allocationCursor].amount)
                      );
                      allocationCursor++;
                    }

                    const outstandingForDay = safeSubtract(totalDue, paidBeforeAccrual);
                    if (outstandingForDay <= 0.01) continue;

                    const dailyFee = calculateDailyLateFee(outstandingForDay, latePaymentRate);
                    if (dailyFee <= 0) continue;

                    const daysOverdue = calculateDaysOverdueMalaysia(lockedRepayment.dueDate, accrualDate);
                    if (daysOverdue <= 0) continue;

                    feeEntries.push({
                      tenantId: loan.tenantId,
                      loanId: loan.id,
                      repaymentId: lockedRepayment.id,
                      accrualDate,
                      daysOverdue,
                      outstandingAmount: outstandingForDay,
                      dailyRate: rate,
                      feeAmount: dailyFee,
                    });

                  }

                  if (feeEntries.length > 0) {
                    const existingEntries = await tx.lateFeeEntry.findMany({
                      where: {
                        repaymentId: lockedRepayment.id,
                        accrualDate: {
                          gte: feeEntries[0].accrualDate,
                          lte: feeEntries[feeEntries.length - 1].accrualDate,
                        },
                      },
                      select: {
                        accrualDate: true,
                      },
                    });
                    const existingDateKeys = new Set(
                      existingEntries.map((entry) => getMalaysiaStartOfDay(entry.accrualDate).toISOString())
                    );
                    const entriesToInsert = feeEntries.filter(
                      (entry) => !existingDateKeys.has(getMalaysiaStartOfDay(entry.accrualDate).toISOString())
                    );

                    if (entriesToInsert.length > 0) {
                      try {
                        await tx.lateFeeEntry.createMany({
                          data: entriesToInsert,
                        });
                        repaymentFeeTotal = entriesToInsert.reduce(
                          (sum, entry) => safeAdd(sum, entry.feeAmount),
                          0
                        );
                        repaymentFeesCount = entriesToInsert.length;
                        repaymentDaysBackfilled = entriesToInsert.length;
                      } catch (error) {
                        // Rare race fallback: insert entries one-by-one and count only successful writes.
                        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
                          throw error;
                        }

                        repaymentFeeTotal = 0;
                        repaymentFeesCount = 0;
                        repaymentDaysBackfilled = 0;

                        for (const entry of entriesToInsert) {
                          try {
                            await tx.lateFeeEntry.create({ data: entry });
                            repaymentFeeTotal = safeAdd(repaymentFeeTotal, entry.feeAmount);
                            repaymentFeesCount++;
                            repaymentDaysBackfilled++;
                          } catch (entryError) {
                            if (
                              entryError instanceof Prisma.PrismaClientKnownRequestError &&
                              entryError.code === 'P2002'
                            ) {
                              continue;
                            }
                            throw entryError;
                          }
                        }
                      }
                    }
                  }

                  if (repaymentFeeTotal > 0) {
                    await tx.loanRepayment.update({
                      where: { id: lockedRepayment.id },
                      data: {
                        lateFeeAccrued: { increment: repaymentFeeTotal },
                      },
                    });

                    await tx.loan.update({
                      where: { id: loan.id },
                      data: {
                        totalLateFees: { increment: repaymentFeeTotal },
                      },
                    });
                  }

                  return {
                    repaymentFeeTotal,
                    repaymentFeesCount,
                    repaymentDaysBackfilled,
                  };
                });

                loanTotalFee = safeAdd(loanTotalFee, repaymentResult.repaymentFeeTotal);
                loanFeesCount += repaymentResult.repaymentFeesCount;
                loanDaysBackfilled += repaymentResult.repaymentDaysBackfilled;
              } catch (repErr) {
                errors.push(`Repayment ${repayment.id}: ${repErr instanceof Error ? repErr.message : 'Unknown error'}`);
              }
            }

            feesCalculated += loanFeesCount;
            totalFeeAmount = safeAdd(totalFeeAmount, loanTotalFee);

            // 5d. Check arrears/default periods using fresh repayment state.
            // This avoids stale decisions if payments were recorded during processing.
            const freshOverdueRepayments = await prisma.loanRepayment.findMany({
              where: {
                scheduleVersion: { loanId },
                status: { in: ['PENDING', 'PARTIAL'] },
                dueDate: { lt: todayStart },
              },
              select: { dueDate: true },
            });
            const oldestOverdueDays = freshOverdueRepayments.reduce(
              (max, r) => Math.max(max, calculateDaysOverdueMalaysia(r.dueDate)),
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
                const latestSchedule = await prisma.loanScheduleVersion.findFirst({
                  where: { loanId },
                  orderBy: { version: 'desc' },
                  include: {
                    repayments: {
                      orderBy: { dueDate: 'asc' },
                    },
                  },
                });
                const allRepayments = latestSchedule?.repayments || [];

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
                    daysOverdue: calculateDaysOverdueMalaysia(r.dueDate),
                  };
                });

                const totalOutstanding = overdueDetails.reduce((s, r) => safeAdd(s, r.outstanding), 0);
                const totalLateFees = overdueDetails.reduce((s, r) => safeAdd(s, r.lateFeeAccrued), 0);

                const borrower = loan.borrower;
                // Use a fresh aggregate in case other flows updated totals during this run.
                const latestLoanTotals = await prisma.loan.findUnique({
                  where: { id: loanId },
                  select: { totalLateFees: true },
                });
                const updatedLoanTotalLateFees = toSafeNumber(
                  latestLoanTotals?.totalLateFees ?? safeAdd(toSafeNumber(loan.totalLateFees), loanTotalFee)
                );
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

                // TrueSend: send arrears notice email with letter attached
                try {
                  await TrueSendService.sendArrearsNotice(loan.tenantId, loanId, letterPath);
                } catch (emailErr) {
                  // Don't fail the main flow if email fails
                  console.error(`[LateFeeProcessor] TrueSend arrears email failed for loan ${loanId}:`, emailErr);
                }
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

              try {
                await recalculateBorrowerPerformanceProjection(loan.tenantId, loan.borrowerId);
              } catch (projectionError) {
                errors.push(`Borrower projection refresh for loan ${loanId}: ${projectionError instanceof Error ? projectionError.message : 'Unknown error'}`);
              }
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

              try {
                await recalculateBorrowerPerformanceProjection(loan.tenantId, loan.borrowerId);
              } catch (projectionError) {
                errors.push(`Borrower projection refresh for loan ${loanId}: ${projectionError instanceof Error ? projectionError.message : 'Unknown error'}`);
              }
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
                  accrualDate: accrualEndDay.toISOString(),
                  trigger,
                },
              });
            }
          } catch (loanErr) {
            errors.push(`Loan ${loanId}: ${loanErr instanceof Error ? loanErr.message : 'Unknown error'}`);
          }
        });

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
