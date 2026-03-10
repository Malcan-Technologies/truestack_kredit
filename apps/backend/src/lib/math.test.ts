import { describe, expect, it } from 'vitest';
import { addMonthsClamped } from './math.js';

describe('addMonthsClamped', () => {
  it('clamps January 31 to February 28 in non-leap years', () => {
    const result = addMonthsClamped(new Date(Date.UTC(2026, 0, 31)), 1);
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('clamps January 31 to February 29 in leap years', () => {
    const result = addMonthsClamped(new Date(Date.UTC(2024, 0, 31)), 1);
    expect(result.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('preserves end-of-month behavior across 30-day months', () => {
    const result = addMonthsClamped(new Date(Date.UTC(2026, 7, 31)), 1);
    expect(result.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});
