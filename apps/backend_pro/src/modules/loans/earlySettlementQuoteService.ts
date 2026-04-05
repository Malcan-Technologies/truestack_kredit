import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { toSafeNumber, safeMultiply, safeDivide, safeAdd, safeSubtract, safeRound } from '../../lib/math.js';
import { getMalaysiaStartOfDay } from '../../lib/malaysiaTime.js';

export type SettlementEvaluationRepayment = {
  dueDate: Date;
  principal: unknown;
  interest: unknown;
  lateFeeAccrued: unknown;
  lateFeesPaid: unknown;
  allocations: Array<{ amount: unknown; lateFee?: unknown | null }>;
};

export function evaluateSettlementOutstanding(
  repayment: SettlementEvaluationRepayment
): { remainingPrincipal: number; remainingInterest: number; outstandingLateFees: number } {
  const principalDue = toSafeNumber(repayment.principal);
  const interestDue = toSafeNumber(repayment.interest);
  const principalInterestDue = safeAdd(principalDue, interestDue);

  const principalInterestPaid = Math.min(
    principalInterestDue,
    Math.max(
      0,
      repayment.allocations.reduce((sum, allocation) => safeAdd(sum, toSafeNumber(allocation.amount)), 0)
    )
  );

  const interestPaid = Math.min(interestDue, principalInterestPaid);
  const principalPaid = Math.min(principalDue, Math.max(0, safeSubtract(principalInterestPaid, interestPaid)));

  const remainingInterest = Math.max(0, safeSubtract(interestDue, interestPaid));
  const remainingPrincipal = Math.max(0, safeSubtract(principalDue, principalPaid));
  const outstandingLateFees = Math.max(
    0,
    safeSubtract(toSafeNumber(repayment.lateFeeAccrued), toSafeNumber(repayment.lateFeesPaid))
  );

  return {
    remainingPrincipal,
    remainingInterest,
    outstandingLateFees,
  };
}

/**
 * Same response shape as GET /api/loans/:loanId/early-settlement/quote
 */
export async function getEarlySettlementQuoteForLoan(
  tenantId: string,
  loanId: string
): Promise<{ success: true; data: Record<string, unknown> }> {
  const loan = await prisma.loan.findFirst({
    where: {
      id: loanId,
      tenantId,
    },
    include: {
      product: true,
      scheduleVersions: {
        orderBy: { version: 'desc' },
        take: 1,
        include: {
          repayments: {
            orderBy: { dueDate: 'asc' },
            include: { allocations: true },
          },
        },
      },
    },
  });

  if (!loan) {
    throw new NotFoundError('Loan');
  }

  if (loan.status !== 'ACTIVE' && loan.status !== 'IN_ARREARS') {
    throw new BadRequestError('Early settlement is only available for active or in-arrears loans');
  }

  const product = loan.product;
  if (!product.earlySettlementEnabled) {
    return {
      success: true,
      data: {
        eligible: false,
        reason: 'Early settlement is not enabled for this product',
      },
    };
  }

  const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowMYT = new Date(Date.now() + MYT_OFFSET_MS);

  const lockInMonths = product.earlySettlementLockInMonths;
  let lockInEndDate: Date | null = null;
  if (lockInMonths > 0 && loan.disbursementDate) {
    const disbursementMYT = new Date(new Date(loan.disbursementDate).getTime() + MYT_OFFSET_MS);
    const lockInEndMYT = new Date(
      Date.UTC(
        disbursementMYT.getUTCFullYear(),
        disbursementMYT.getUTCMonth() + lockInMonths,
        disbursementMYT.getUTCDate()
      )
    );
    lockInEndDate = new Date(lockInEndMYT.getTime() - MYT_OFFSET_MS);

    const todayMYTDate = `${nowMYT.getUTCFullYear()}-${String(nowMYT.getUTCMonth() + 1).padStart(2, '0')}-${String(nowMYT.getUTCDate()).padStart(2, '0')}`;
    const lockInMYTDate = `${lockInEndMYT.getUTCFullYear()}-${String(lockInEndMYT.getUTCMonth() + 1).padStart(2, '0')}-${String(lockInEndMYT.getUTCDate()).padStart(2, '0')}`;

    if (todayMYTDate < lockInMYTDate) {
      return {
        success: true,
        data: {
          eligible: false,
          reason: `Loan is in lock-in period until ${lockInMYTDate}`,
          lockInEndDate: lockInEndDate.toISOString(),
        },
      };
    }
  }

  const currentSchedule = loan.scheduleVersions[0];
  if (!currentSchedule) {
    throw new BadRequestError('No active schedule found for this loan');
  }

  const today = getMalaysiaStartOfDay(new Date());

  let remainingPrincipal = 0;
  let remainingInterest = 0;
  let remainingFutureInterest = 0;
  let outstandingLateFees = 0;

  const unpaidRepayments = currentSchedule.repayments.filter(
    r => r.status === 'PENDING' || r.status === 'PARTIAL' || r.status === 'OVERDUE'
  );

  for (const repayment of unpaidRepayments) {
    const {
      remainingPrincipal: repaymentRemainingPrincipal,
      remainingInterest: repaymentRemainingInterest,
      outstandingLateFees: repaymentOutstandingLateFees,
    } = evaluateSettlementOutstanding(repayment);

    remainingPrincipal = safeAdd(remainingPrincipal, repaymentRemainingPrincipal);
    remainingInterest = safeAdd(remainingInterest, repaymentRemainingInterest);
    outstandingLateFees = safeAdd(outstandingLateFees, repaymentOutstandingLateFees);

    const dueDate = getMalaysiaStartOfDay(repayment.dueDate);
    if (dueDate >= today) {
      remainingFutureInterest = safeAdd(remainingFutureInterest, repaymentRemainingInterest);
    }
  }

  remainingPrincipal = safeRound(remainingPrincipal);
  remainingInterest = safeRound(remainingInterest);
  remainingFutureInterest = safeRound(remainingFutureInterest);
  outstandingLateFees = safeRound(outstandingLateFees);

  const discountType = product.earlySettlementDiscountType;
  const discountValue = toSafeNumber(product.earlySettlementDiscountValue);
  let discountAmount = 0;

  if (discountType === 'PERCENTAGE') {
    discountAmount = safeRound(safeMultiply(remainingFutureInterest, safeDivide(discountValue, 100)));
  } else {
    discountAmount = safeRound(Math.min(discountValue, remainingFutureInterest));
  }

  const totalWithoutLateFees = safeRound(safeSubtract(safeAdd(remainingPrincipal, remainingInterest), discountAmount));
  const totalSettlement = safeRound(safeAdd(totalWithoutLateFees, outstandingLateFees));
  const totalSavings = discountAmount;

  return {
    success: true,
    data: {
      eligible: true,
      remainingPrincipal,
      remainingInterest,
      remainingFutureInterest,
      discountType,
      discountValue,
      discountAmount,
      outstandingLateFees,
      totalWithoutLateFees,
      totalSettlement,
      totalSavings,
      lockInEndDate: lockInEndDate?.toISOString() || null,
      unpaidInstallments: unpaidRepayments.length,
    },
  };
}
