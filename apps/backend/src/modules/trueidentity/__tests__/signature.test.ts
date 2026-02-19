import { describe, it, expect } from 'vitest';
import { signRequestBody, verifyCallbackSignature } from '../signature.js';

describe('signature', () => {
  const secret = 'test-secret-at-least-32-characters-long';

  describe('signRequestBody', () => {
    it('produces signature with HMAC-SHA256 prefix', () => {
      const { signature } = signRequestBody('{"foo":"bar"}', secret);
      expect(signature).toMatch(/^HMAC-SHA256 /);
      expect(signature.length).toBeGreaterThan(20);
    });

    it('produces valid base64 signature', () => {
      const { signature } = signRequestBody('{"foo":"bar"}', secret);
      const b64 = signature.replace('HMAC-SHA256 ', '');
      expect(() => Buffer.from(b64, 'base64')).not.toThrow();
    });

    it('produces timestamp string', () => {
      const { timestamp } = signRequestBody('{"foo":"bar"}', secret);
      expect(timestamp).toMatch(/^\d+$/);
      expect(parseInt(timestamp, 10)).toBeGreaterThan(0);
    });

    it('same input produces same signature', () => {
      const body = '{"tenant_id":"t1","borrower_id":"b1"}';
      const a = signRequestBody(body, secret);
      const b = signRequestBody(body, secret);
      expect(a.signature).toBe(b.signature);
    });

    it('different input produces different signature', () => {
      const a = signRequestBody('{"a":1}', secret);
      const b = signRequestBody('{"a":2}', secret);
      expect(a.signature).not.toBe(b.signature);
    });
  });

  describe('verifyCallbackSignature', () => {
    it('accepts valid signature', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature, timestamp } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature(body, signature, secret, timestamp, 300_000);
      expect(valid).toBe(true);
    });

    it('rejects invalid signature', () => {
      const body = '{"event":"kyc.session.completed"}';
      const valid = verifyCallbackSignature(body, 'HMAC-SHA256 invalidbase64!!!', secret, undefined, 300_000);
      expect(valid).toBe(false);
    });

    it('rejects tampered body', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature('{"event":"kyc.session.started"}', signature, secret, undefined, 300_000);
      expect(valid).toBe(false);
    });

    it('rejects wrong secret', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature(body, signature, 'wrong-secret', undefined, 300_000);
      expect(valid).toBe(false);
    });

    it('rejects empty signature', () => {
      const valid = verifyCallbackSignature('{}', undefined, secret, undefined, 300_000);
      expect(valid).toBe(false);
    });

    it('rejects malformed signature header', () => {
      const valid = verifyCallbackSignature('{}', 'Bearer xyz', secret, undefined, 300_000);
      expect(valid).toBe(false);
    });

    it('accepts valid signature without timestamp (no replay check)', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature(body, signature, secret, undefined, 300_000);
      expect(valid).toBe(true);
    });

    it('rejects expired timestamp', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const oldTimestamp = String(Date.now() - 400_000);
      const valid = verifyCallbackSignature(body, signature, secret, oldTimestamp, 300_000);
      expect(valid).toBe(false);
    });
  });
});
