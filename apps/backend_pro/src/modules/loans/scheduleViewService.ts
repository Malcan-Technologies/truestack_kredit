import type { InterestModel, RepaymentStatus } from '@prisma/client';
import { toSafeNumber, safeAdd, safeRound, safeSubtract } from '../../lib/math.js';
import { generateSchedule } from '../schedules/service.js';

type ScheduleModel = InterestModel | 'RULE_78';

type AllocationLike = {
  id: string;
  amount: unknown;
  allocatedAt: Date;
};

type RepaymentLike = {
  id: string;
  status: RepaymentStatus;
  principal: unknown;
  interest: unknown;
  totalDue: unknown;
  allocations: AllocationLike[];
};

type ScheduleVersionLike = {
  id: string;
  interestModel: ScheduleModel;
  repayments: RepaymentLike[];
};

type ProductLike = {
  interestModel: ScheduleModel;
};

export interface InternalScheduleLoanInput {
  id: string;
  principalAmount: unknown;
  interestRate: unknown;
  actualInterestRate: unknown;
  term: number;
  actualTerm: number | null;
  disbursementDate: Date | null;
  agreementDate: Date | null;
  createdAt: Date;
  product: ProductLike;
  scheduleVersions: ScheduleVersionLike[];
}

export interface InternalScheduleRepaymentView {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  principal: number;
  interest: number;
  totalDue: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
}

export interface InternalScheduleView {
  interestModel: ScheduleModel;
  interestRate: number;
  term: number;
  baseDate: Date;
  totalInterest: number;
  totalPayable: number;
  totalPaid: number;
  totalRemaining: number;
  repayments: InternalScheduleRepaymentView[];
}

export function supportsInternalScheduleView(interestModel: ScheduleModel): boolean {
  return interestModel === 'FLAT' || interestModel === 'RULE_78';
}

export function hasInternalScheduleView(loan: Pick<InternalScheduleLoanInput, 'interestRate' | 'actualInterestRate' | 'term' | 'actualTerm'>): boolean {
  const standardRate = toSafeNumber(loan.interestRate);
  const alternateRate = loan.actualInterestRate == null ? standardRate : toSafeNumber(loan.actualInterestRate);
  const alternateTerm = loan.actualTerm ?? loan.term;

  return (
    (loan.actualTerm != null || loan.actualInterestRate != null) &&
    (alternateTerm !== loan.term || Math.abs(alternateRate - standardRate) > 0.001)
  );
}

export function buildInternalScheduleView(loan: InternalScheduleLoanInput): InternalScheduleView | null {
  if (!hasInternalScheduleView(loan)) {
    return null;
  }

  const currentSchedule = loan.scheduleVersions[0];
  if (!currentSchedule) {
    return null;
  }

  const interestModel = currentSchedule.interestModel ?? loan.product.interestModel;
  if (!supportsInternalScheduleView(interestModel)) {
    return null;
  }
  const principal = toSafeNumber(loan.principalAmount);
  const interestRate = loan.actualInterestRate == null
    ? toSafeNumber(loan.interestRate)
    : toSafeNumber(loan.actualInterestRate);
  const term = loan.actualTerm ?? loan.term;
  const baseDate = loan.disbursementDate ?? loan.agreementDate ?? loan.createdAt;

  const scheduleOutput = generateSchedule({
    principal,
    interestRate,
    term,
    disbursementDate: baseDate,
    interestModel,
  });

  const allocationStream = currentSchedule.repayments
    .flatMap((repayment) => repayment.allocations)
    .map((allocation) => ({
      id: allocation.id,
      allocatedAt: allocation.allocatedAt,
      amount: Math.max(0, toSafeNumber(allocation.amount)),
    }))
    .filter((allocation) => allocation.amount > 0.01)
    .sort((a, b) => {
      const byDate = a.allocatedAt.getTime() - b.allocatedAt.getTime();
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });

  const repayments: InternalScheduleRepaymentView[] = scheduleOutput.repayments.map((repayment, index) => ({
    id: `${loan.id}-internal-${index + 1}`,
    installmentNumber: index + 1,
    dueDate: repayment.dueDate,
    principal: safeRound(repayment.principal),
    interest: safeRound(repayment.interest),
    totalDue: safeRound(repayment.totalDue),
    paidAmount: 0,
    remainingAmount: safeRound(repayment.totalDue),
    status: 'PENDING',
  }));

  let repaymentCursor = 0;

  for (const allocation of allocationStream) {
    let remainingAllocation = allocation.amount;

    while (remainingAllocation > 0.01 && repaymentCursor < repayments.length) {
      const currentRepayment = repayments[repaymentCursor];
      const outstanding = Math.max(0, safeSubtract(currentRepayment.totalDue, currentRepayment.paidAmount));

      if (outstanding <= 0.01) {
        repaymentCursor++;
        continue;
      }

      const appliedAmount = Math.min(remainingAllocation, outstanding);
      currentRepayment.paidAmount = safeRound(safeAdd(currentRepayment.paidAmount, appliedAmount));
      currentRepayment.remainingAmount = safeRound(Math.max(0, safeSubtract(currentRepayment.totalDue, currentRepayment.paidAmount)));
      remainingAllocation = safeRound(Math.max(0, safeSubtract(remainingAllocation, appliedAmount)));

      if (currentRepayment.remainingAmount <= 0.01) {
        currentRepayment.status = 'PAID';
        repaymentCursor++;
      } else if (currentRepayment.paidAmount > 0.01) {
        currentRepayment.status = 'PARTIAL';
      }
    }
  }

  for (const repayment of repayments) {
    if (repayment.remainingAmount <= 0.01) {
      repayment.status = 'PAID';
      repayment.remainingAmount = 0;
    } else if (repayment.paidAmount > 0.01) {
      repayment.status = 'PARTIAL';
    }
  }

  const totalPaid = repayments.reduce((sum, repayment) => safeAdd(sum, repayment.paidAmount), 0);
  const totalRemaining = repayments.reduce((sum, repayment) => safeAdd(sum, repayment.remainingAmount), 0);

  return {
    interestModel,
    interestRate,
    term,
    baseDate,
    totalInterest: safeRound(scheduleOutput.totalInterest),
    totalPayable: safeRound(scheduleOutput.totalPayable),
    totalPaid: safeRound(totalPaid),
    totalRemaining: safeRound(totalRemaining),
    repayments,
  };
}
