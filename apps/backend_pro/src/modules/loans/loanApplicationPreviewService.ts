import type { Product } from '@prisma/client';
import {
  toSafeNumber,
  safeMultiply,
  safeDivide,
  safeAdd,
  safeSubtract,
  calculateFlatInterest,
  calculateEMI,
} from '../../lib/math.js';

/**
 * Shared loan application preview math (fees, EMI/flat, net disbursement).
 * Used by staff preview route and borrower self-service preview.
 */
export function computeLoanApplicationPreview(product: Product, amount: number, term: number) {
  const loanAmount = amount;
  const interestRate = toSafeNumber(product.interestRate);

  const legalFeeValue = toSafeNumber(product.legalFeeValue);
  const stampingFeeValue = toSafeNumber(product.stampingFeeValue);

  const legalFee =
    product.legalFeeType === 'PERCENTAGE'
      ? safeMultiply(loanAmount, safeDivide(legalFeeValue, 100))
      : legalFeeValue;

  const stampingFee =
    product.stampingFeeType === 'PERCENTAGE'
      ? safeMultiply(loanAmount, safeDivide(stampingFeeValue, 100))
      : stampingFeeValue;

  const totalFees = safeAdd(legalFee, stampingFee);
  const netDisbursement = safeSubtract(loanAmount, totalFees);

  const interestModel = String(product.interestModel);

  let monthlyPayment: number;
  let totalInterest: number;
  let totalPayable: number;

  if (interestModel === 'FLAT' || interestModel === 'RULE_78') {
    totalInterest = calculateFlatInterest(loanAmount, interestRate, term);
    totalPayable = safeAdd(loanAmount, totalInterest);
    monthlyPayment = safeDivide(totalPayable, term);
  } else {
    monthlyPayment = calculateEMI(loanAmount, interestRate, term);
    totalPayable = safeMultiply(monthlyPayment, term);
    totalInterest = safeSubtract(totalPayable, loanAmount);
  }

  return {
    loanAmount,
    term,
    interestRate,
    interestModel: product.interestModel,
    legalFee,
    legalFeeType: product.legalFeeType,
    stampingFee,
    stampingFeeType: product.stampingFeeType,
    totalFees,
    netDisbursement,
    monthlyPayment,
    totalInterest,
    totalPayable,
  };
}
