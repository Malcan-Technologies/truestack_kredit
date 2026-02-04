import type { InterestModel } from '@prisma/client';

export interface ScheduleParams {
  principal: number;
  interestRate: number; // Annual rate as percentage (e.g., 12.5 for 12.5%)
  term: number; // In months
  disbursementDate: Date;
  interestModel: InterestModel;
}

export interface RepaymentScheduleItem {
  dueDate: Date;
  principal: number;
  interest: number;
  totalDue: number;
  balance: number;
}

export interface ScheduleOutput {
  repayments: RepaymentScheduleItem[];
  totalInterest: number;
  totalPayable: number;
}

/**
 * Generate repayment schedule based on interest model
 */
export function generateSchedule(params: ScheduleParams): ScheduleOutput {
  switch (params.interestModel) {
    case 'FLAT':
      return calculateFlatInterest(params);
    case 'DECLINING_BALANCE':
      return calculateDecliningBalance(params);
    case 'EFFECTIVE_RATE':
      return calculateEffectiveRate(params);
    default:
      throw new Error(`Unknown interest model: ${params.interestModel}`);
  }
}

/**
 * Flat interest calculation
 * Interest = Principal × Rate × Term / 12
 * Each payment = (Principal + Total Interest) / Term
 */
function calculateFlatInterest(params: ScheduleParams): ScheduleOutput {
  const { principal, interestRate, term, disbursementDate } = params;
  
  const annualRate = interestRate / 100;
  const totalInterest = principal * annualRate * (term / 12);
  const totalPayable = principal + totalInterest;
  const monthlyPayment = totalPayable / term;
  const monthlyPrincipal = principal / term;
  const monthlyInterest = totalInterest / term;

  const repayments: RepaymentScheduleItem[] = [];
  let balance = principal;

  for (let i = 1; i <= term; i++) {
    const dueDate = new Date(disbursementDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    balance = Math.max(0, balance - monthlyPrincipal);

    repayments.push({
      dueDate,
      principal: round(monthlyPrincipal),
      interest: round(monthlyInterest),
      totalDue: round(monthlyPayment),
      balance: round(balance),
    });
  }

  // Adjust last payment for rounding differences
  const totalCalculated = repayments.reduce((sum, r) => sum + r.totalDue, 0);
  if (Math.abs(totalCalculated - totalPayable) > 0.01) {
    const diff = totalPayable - totalCalculated;
    repayments[repayments.length - 1].totalDue = round(repayments[repayments.length - 1].totalDue + diff);
  }

  return {
    repayments,
    totalInterest: round(totalInterest),
    totalPayable: round(totalPayable),
  };
}

/**
 * Declining balance (reducing balance) calculation
 * Interest is calculated on outstanding balance each month
 */
function calculateDecliningBalance(params: ScheduleParams): ScheduleOutput {
  const { principal, interestRate, term, disbursementDate } = params;
  
  const monthlyRate = interestRate / 100 / 12;
  
  // EMI formula: P × r × (1+r)^n / ((1+r)^n - 1)
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, term) / 
              (Math.pow(1 + monthlyRate, term) - 1);

  const repayments: RepaymentScheduleItem[] = [];
  let balance = principal;
  let totalInterest = 0;

  for (let i = 1; i <= term; i++) {
    const dueDate = new Date(disbursementDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    const interest = balance * monthlyRate;
    const principalPayment = emi - interest;
    balance = Math.max(0, balance - principalPayment);
    totalInterest += interest;

    repayments.push({
      dueDate,
      principal: round(principalPayment),
      interest: round(interest),
      totalDue: round(emi),
      balance: round(balance),
    });
  }

  // Adjust last payment for remaining balance
  if (repayments.length > 0 && balance !== 0) {
    const lastPayment = repayments[repayments.length - 1];
    lastPayment.principal = round(lastPayment.principal + balance);
    lastPayment.totalDue = round(lastPayment.principal + lastPayment.interest);
    lastPayment.balance = 0;
  }

  return {
    repayments,
    totalInterest: round(totalInterest),
    totalPayable: round(principal + totalInterest),
  };
}

/**
 * Effective rate calculation (similar to declining balance but uses effective annual rate)
 */
function calculateEffectiveRate(params: ScheduleParams): ScheduleOutput {
  // For now, use the same calculation as declining balance
  // In practice, this might involve different rate conversion
  return calculateDecliningBalance(params);
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Preview schedule without saving
 */
export function previewSchedule(params: ScheduleParams): ScheduleOutput & { params: ScheduleParams } {
  const schedule = generateSchedule(params);
  return {
    ...schedule,
    params,
  };
}
