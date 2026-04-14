import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCY_DECIMALS = 2;

export function safeRound(value: number, decimals: number = CURRENCY_DECIMALS): number {
  if (Number.isNaN(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function safeAdd(...values: number[]): number {
  const factor = 10 ** CURRENCY_DECIMALS;
  const sum = values.reduce((acc, value) => {
    const safeValue = Number.isNaN(value) ? 0 : value;
    return acc + Math.round(safeValue * factor);
  }, 0);
  return sum / factor;
}

export function safeSubtract(initial: number, ...values: number[]): number {
  const factor = 10 ** CURRENCY_DECIMALS;
  let result = Math.round((Number.isNaN(initial) ? 0 : initial) * factor);
  for (const value of values) {
    const safeValue = Number.isNaN(value) ? 0 : value;
    result -= Math.round(safeValue * factor);
  }
  return result / factor;
}

export function safeMultiply(
  a: number,
  b: number,
  decimals: number = CURRENCY_DECIMALS
): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return safeRound(a * b, decimals);
}

export function safeDivide(
  a: number,
  b: number,
  decimals: number = CURRENCY_DECIMALS
): number {
  if (Number.isNaN(a) || Number.isNaN(b) || b === 0) return 0;
  return safeRound(a / b, decimals);
}

export function toSafeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const numberValue = typeof value === "string" ? parseFloat(value) : value;
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

export function calculateFlatInterest(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  const rate = safeDivide(annualRate, 100, 8);
  const termYears = safeDivide(termMonths, 12, 8);
  return safeRound(safeMultiply(principal, safeMultiply(rate, termYears, 8), 8));
}

export function formatCurrency(amount: number | string): string {
  const numberValue = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(numberValue)) return "RM 0.00";

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue);
}
