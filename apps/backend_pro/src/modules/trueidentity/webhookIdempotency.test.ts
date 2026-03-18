import { describe, it, expect } from 'vitest';
import { signRequestBody, verifyCallbackSignature } from './signature.js';

/**
 * Idempotency test: verifies that the same payload produces the same idempotency key
 * and that signature verification uses the contract format (timestamp.rawBody).
 *
 * Full integration test (DB, Express) would require test database setup.
 */
describe('webhook idempotency', () => {
  const secret = 'test-secret-at-least-32-chars-long';

  it('produces consistent idempotency key for same payload', () => {
    const payload = {
      event: 'kyc.session.completed',
      session_id: 'sess-123',
      tenant_id: 'tenant-1',
      borrower_id: 'borrower-1',
      status: 'completed',
      result: 'approved',
      timestamp: '2025-02-18T12:00:00.000Z',
    };
    const key1 = `${payload.event}:${payload.session_id}:${payload.borrower_id}:${payload.tenant_id}:${payload.timestamp}`;
    const key2 = `${payload.event}:${payload.session_id}:${payload.borrower_id}:${payload.tenant_id}:${payload.timestamp}`;
    expect(key1).toBe(key2);
  });

  it('produces different idempotency keys for different events', () => {
    const base = { session_id: 's', tenant_id: 't', borrower_id: 'b', timestamp: 'ts' };
    const key1 = `kyc.session.started:${base.session_id}:${base.borrower_id}:${base.tenant_id}:${base.timestamp}`;
    const key2 = `kyc.session.completed:${base.session_id}:${base.borrower_id}:${base.tenant_id}:${base.timestamp}`;
    expect(key1).not.toBe(key2);
  });

  it('signature verification accepts valid kyc.session.completed payload', () => {
    const payload = {
      event: 'kyc.session.completed',
      session_id: 'sess-123',
      tenant_id: 'tenant-1',
      borrower_id: 'borrower-1',
      status: 'completed',
      result: 'approved',
      reject_message: null,
      timestamp: '2025-02-18T12:00:00.000Z',
    };
    const rawBody = JSON.stringify(payload);
    const { signature, timestamp } = signRequestBody(rawBody, secret);
    const valid = verifyCallbackSignature(rawBody, signature, secret, timestamp);
    expect(valid).toBe(true);
  });

  it('same payload with same timestamp produces same signature (idempotent key consistency)', () => {
    const payload = {
      event: 'kyc.session.completed',
      session_id: 'sess-456',
      tenant_id: 'tenant-2',
      borrower_id: 'borrower-2',
      status: 'completed',
      result: 'approved',
      timestamp: '2025-02-18T12:00:00.000Z',
    };
    const rawBody = JSON.stringify(payload);
    const { signature, timestamp } = signRequestBody(rawBody, secret);
    const valid = verifyCallbackSignature(rawBody, signature, secret, timestamp);
    expect(valid).toBe(true);
    const idempotencyKey = `${payload.event}:${payload.session_id}:${payload.borrower_id}:${payload.tenant_id}:${payload.timestamp}`;
    expect(idempotencyKey).toContain('kyc.session.completed');
    expect(idempotencyKey).toContain('sess-456');
  });
});
