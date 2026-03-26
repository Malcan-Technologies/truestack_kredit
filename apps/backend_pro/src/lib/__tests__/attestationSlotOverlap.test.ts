import { describe, it, expect } from 'vitest';

/** Same rule as attestationAvailability: [aStart,aEnd) vs [bStart,bEnd) */
function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

describe('attestation slot overlap (60m on 30m grid)', () => {
  it('overlaps when second window starts inside first', () => {
    const a0 = new Date('2026-03-26T01:00:00.000Z');
    const a1 = new Date('2026-03-26T02:00:00.000Z');
    const b0 = new Date('2026-03-26T01:30:00.000Z');
    const b1 = new Date('2026-03-26T02:30:00.000Z');
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(true);
  });

  it('does not overlap when adjacent back-to-back', () => {
    const a0 = new Date('2026-03-26T01:00:00.000Z');
    const a1 = new Date('2026-03-26T02:00:00.000Z');
    const b0 = new Date('2026-03-26T02:00:00.000Z');
    const b1 = new Date('2026-03-26T03:00:00.000Z');
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(false);
  });

  it('overlaps identical interval', () => {
    const a0 = new Date('2026-03-26T01:00:00.000Z');
    const a1 = new Date('2026-03-26T02:00:00.000Z');
    expect(intervalsOverlap(a0, a1, a0, a1)).toBe(true);
  });
});
