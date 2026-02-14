export const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get start of MYT day represented in UTC.
 * Example: 2026-02-08 10:00 MYT -> 2026-02-07T16:00:00.000Z
 */
export function getMalaysiaStartOfDay(date: Date = new Date()): Date {
  const mytTime = new Date(date.getTime() + MYT_OFFSET_MS);
  const mytStart = new Date(Date.UTC(
    mytTime.getUTCFullYear(),
    mytTime.getUTCMonth(),
    mytTime.getUTCDate()
  ));
  return new Date(mytStart.getTime() - MYT_OFFSET_MS);
}

export function getMalaysiaEndOfDay(date: Date = new Date()): Date {
  return new Date(getMalaysiaStartOfDay(date).getTime() + ONE_DAY_MS);
}

export function getMalaysiaDateString(date: Date = new Date()): string {
  const mytTime = new Date(date.getTime() + MYT_OFFSET_MS);
  return mytTime.toISOString().split('T')[0];
}

export function addMalaysiaDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * ONE_DAY_MS));
}

export function getMalaysiaDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let current = getMalaysiaStartOfDay(startDate);
  const end = getMalaysiaStartOfDay(endDate);

  while (current.getTime() <= end.getTime()) {
    dates.push(new Date(current));
    current = new Date(current.getTime() + ONE_DAY_MS);
  }

  return dates;
}

/**
 * Calculate overdue days using MYT day boundaries.
 * Returns 0 if not overdue.
 */
export function calculateDaysOverdueMalaysia(dueDate: Date, asOfDate: Date = new Date()): number {
  const dueDayStart = getMalaysiaStartOfDay(dueDate);
  const asOfDayStart = getMalaysiaStartOfDay(asOfDate);
  const days = Math.floor((asOfDayStart.getTime() - dueDayStart.getTime()) / ONE_DAY_MS);
  return Math.max(0, days);
}
