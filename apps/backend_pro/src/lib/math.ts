/**
 * Safe Math Utilities
 * 
 * JavaScript floating-point arithmetic can cause precision issues
 * (e.g., 0.1 + 0.2 = 0.30000000000000004). These utilities ensure
 * accurate calculations for financial operations like loan schedules,
 * interest calculations, and payment allocations.
 */

/**
 * Default decimal places for currency calculations
 */
export const CURRENCY_DECIMALS = 2;

/**
 * Safely round a number to specified decimal places
 * Uses Math.round with factor multiplication to avoid floating-point errors
 */
export function safeRound(value: number, decimals: number = CURRENCY_DECIMALS): number {
  if (isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Safely add multiple numbers
 * Converts to integers, adds, then converts back to avoid precision loss
 */
export function safeAdd(...values: number[]): number {
  const factor = Math.pow(10, CURRENCY_DECIMALS);
  const sum = values.reduce((acc, val) => {
    const safeVal = isNaN(val) ? 0 : val;
    return acc + Math.round(safeVal * factor);
  }, 0);
  return sum / factor;
}

/**
 * Safely subtract numbers (a - b - c - ...)
 */
export function safeSubtract(initial: number, ...values: number[]): number {
  const factor = Math.pow(10, CURRENCY_DECIMALS);
  let result = Math.round((isNaN(initial) ? 0 : initial) * factor);
  for (const val of values) {
    const safeVal = isNaN(val) ? 0 : val;
    result -= Math.round(safeVal * factor);
  }
  return result / factor;
}

/**
 * Safely multiply two numbers
 */
export function safeMultiply(a: number, b: number, decimals: number = CURRENCY_DECIMALS): number {
  if (isNaN(a) || isNaN(b)) return 0;
  return safeRound(a * b, decimals);
}

/**
 * Safely divide two numbers
 * Returns 0 if divisor is 0 to prevent Infinity
 */
export function safeDivide(a: number, b: number, decimals: number = CURRENCY_DECIMALS): number {
  if (isNaN(a) || isNaN(b) || b === 0) return 0;
  return safeRound(a / b, decimals);
}

/**
 * Calculate percentage: (part / total) * 100
 * Returns 0 if total is 0
 */
export function safePercentage(part: number, total: number, decimals: number = 1): number {
  if (isNaN(part) || isNaN(total) || total === 0) return 0;
  return safeRound((part / total) * 100, decimals);
}

/**
 * Convert a Prisma Decimal, string, or number to a safe number
 * Prisma returns Decimal types for numeric columns
 */
export function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  
  // Handle Prisma Decimal (has toNumber method)
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Calculate monthly interest rate from annual rate
 * @param annualRate - Annual interest rate as percentage (e.g., 18 for 18%)
 */
export function monthlyInterestRate(annualRate: number): number {
  return safeDivide(annualRate, 12 * 100, 8); // Higher precision for rate
}

/**
 * Add months to a date with end-of-month clamping.
 * Example: Jan 31 + 1 month => Feb 28/29.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const source = new Date(date);
  const dayOfMonth = source.getUTCDate();
  source.setUTCMonth(source.getUTCMonth() + months);

  if (source.getUTCDate() !== dayOfMonth) {
    source.setUTCDate(0);
  }

  return source;
}

/**
 * Calculate flat interest for a loan
 * Interest = Principal × Rate × Term / 12
 */
export function calculateFlatInterest(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  const rate = annualRate / 100;
  return safeRound(principal * rate * (termMonths / 12));
}

/**
 * Calculate daily late fee rate from annual late payment rate
 * @param annualRate - Annual late payment rate as percentage (e.g., 8 for 8%)
 * @returns Daily rate as a decimal (e.g., 0.00021918 for 8% p.a.)
 */
export function dailyLateFeeRate(annualRate: number): number {
  return safeDivide(annualRate, 365 * 100, 8);
}

/**
 * Calculate daily late fee amount
 * @param outstandingAmount - The amount in arrears
 * @param annualRate - Annual late payment rate as percentage
 * @returns Daily fee amount rounded to 2 decimal places
 */
export function calculateDailyLateFee(outstandingAmount: number, annualRate: number): number {
  const rate = dailyLateFeeRate(annualRate);
  return safeRound(safeMultiply(outstandingAmount, rate, 8));
}

/**
 * Calculate EMI (Equated Monthly Installment) for declining balance
 * EMI = P × r × (1 + r)^n / ((1 + r)^n - 1)
 */
export function calculateEMI(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  if (annualRate === 0) {
    return safeRound(safeDivide(principal, termMonths));
  }
  
  const r = monthlyInterestRate(annualRate);
  const n = termMonths;
  const factor = Math.pow(1 + r, n);
  
  return safeRound((principal * r * factor) / (factor - 1));
}
