import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { 
  format, 
  formatDistanceToNow, 
  parseISO,
  isValid,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";

// ============================================
// Safe Math Utilities
// ============================================
// JavaScript floating-point arithmetic can cause precision issues
// (e.g., 0.1 + 0.2 = 0.30000000000000004). These utilities ensure
// accurate calculations for financial operations.

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
 * Convert a string or number to a safe number
 * Returns 0 for invalid inputs
 */
export function toSafeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? 0 : num;
}

// ============================================
// Tailwind Utilities
// ============================================

/**
 * Malaysia timezone (GMT+8)
 */
export const MALAYSIA_TIMEZONE = "Asia/Kuala_Lumpur";

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a date to Malaysia timezone (GMT+8)
 * Database stores UTC, this converts to local display time
 */
export function toMalaysiaTime(date: Date | string): Date {
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return new Date();
  return toZonedTime(d, MALAYSIA_TIMEZONE);
}

/**
 * Format currency (MYR) with proper formatting
 * Examples: RM 1,234.56, RM 10,000.00
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "RM 0.00";
  
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format currency in compact/abbreviated form
 * Examples: RM500, RM10k, RM1.5M, RM2B
 */
export function formatCompactCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "RM0";

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    const val = abs / 1_000_000_000;
    return `${sign}RM${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    return `${sign}RM${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    return `${sign}RM${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}k`;
  }
  return `${sign}RM${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2)}`;
}

/**
 * Format number with commas (no currency symbol)
 * Examples: 1,234.56, 10,000.00
 */
export function formatNumber(amount: number | string, decimals: number = 2): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  
  return new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format date in Malaysia timezone
 * Example: 30 Jan 2026
 */
export function formatDate(date: Date | string): string {
  const malaysiaDate = toMalaysiaTime(date);
  return format(malaysiaDate, "d MMM yyyy");
}

/**
 * Format date and time in Malaysia timezone
 * Example: 30 Jan 2026, 2:30 PM
 */
export function formatDateTime(date: Date | string): string {
  const malaysiaDate = toMalaysiaTime(date);
  return format(malaysiaDate, "d MMM yyyy, h:mm a");
}

/**
 * Format time only in Malaysia timezone
 * Example: 2:30 PM
 */
export function formatTime(date: Date | string): string {
  const malaysiaDate = toMalaysiaTime(date);
  return format(malaysiaDate, "h:mm a");
}

/**
 * Format relative time (e.g., "5 minutes ago", "2 hours ago")
 * Converts UTC to Malaysia time before calculating
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "Unknown";
  
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format date for display with relative time for recent dates
 * - Less than 24 hours: "5 minutes ago", "2 hours ago"
 * - Older: "30 Jan 2026, 2:30 PM"
 */
export function formatSmartDateTime(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "Unknown";
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  // Use relative time for last 24 hours
  if (diffHours < 24 && diffHours >= 0) {
    return formatDistanceToNow(d, { addSuffix: true });
  }
  
  // Use full date/time for older dates
  return formatDateTime(date);
}

/**
 * Format date for forms (YYYY-MM-DD)
 */
export function formatDateForInput(date: Date | string): string {
  const malaysiaDate = toMalaysiaTime(date);
  return format(malaysiaDate, "yyyy-MM-dd");
}

/**
 * Parse a date string and return a Date object
 */
export function parseDate(dateString: string): Date | null {
  try {
    const parsed = parseISO(dateString);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
