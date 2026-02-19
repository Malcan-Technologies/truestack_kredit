/**
 * Tests for TrueIdentity webhook idempotency key derivation.
 * The idempotency key must be deterministic for the same payload so duplicate
 * webhook deliveries are detected and skipped.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

function buildIdempotencyKey(payload: {
  event?: string;
  session_id?: string;
  ref_id?: string;
  timestamp?: string;
}): string {
  const sessionId = payload.session_id ?? '';
  const event = payload.event ?? '';
  const ts = payload.timestamp ?? '';
  const refId = payload.ref_id ?? '';
  const input = `${event}:${sessionId}:${refId}:${ts}`;
  return createHash('sha256').update(input).digest('hex');
}

describe('webhook idempotency', () => {
  it('same payload produces same idempotency key', () => {
    const payload = {
      event: 'kyc.session.completed',
      session_id: 'sess_abc123',
      ref_id: 'borrower_xyz',
      timestamp: '2026-02-19T10:00:00.000Z',
    };
    const key1 = buildIdempotencyKey(payload);
    const key2 = buildIdempotencyKey(payload);
    expect(key1).toBe(key2);
  });

  it('different event produces different key', () => {
    const base = { session_id: 'sess_abc', ref_id: 'b1', timestamp: '2026-02-19T10:00:00Z' };
    const key1 = buildIdempotencyKey({ ...base, event: 'kyc.session.started' });
    const key2 = buildIdempotencyKey({ ...base, event: 'kyc.session.completed' });
    expect(key1).not.toBe(key2);
  });

  it('different session_id produces different key', () => {
    const base = { event: 'kyc.session.completed', ref_id: 'b1', timestamp: '2026-02-19T10:00:00Z' };
    const key1 = buildIdempotencyKey({ ...base, session_id: 'sess_1' });
    const key2 = buildIdempotencyKey({ ...base, session_id: 'sess_2' });
    expect(key1).not.toBe(key2);
  });

  it('key is 64 character hex string', () => {
    const key = buildIdempotencyKey({
      event: 'kyc.session.completed',
      session_id: 'sess_abc',
      timestamp: '2026-02-19T10:00:00Z',
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
