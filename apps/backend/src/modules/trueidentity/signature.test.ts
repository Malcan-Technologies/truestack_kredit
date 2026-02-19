import { describe, it, expect } from 'vitest';
import { signRequestBody, verifyCallbackSignature } from './signature.js';

describe('signature', () => {
  const secret = 'test-secret-at-least-32-chars-long';

  describe('signRequestBody', () => {
    it('returns signature and timestamp', () => {
      const body = JSON.stringify({ foo: 'bar' });
      const { signature, timestamp } = signRequestBody(body, secret);
      expect(signature).toMatch(/^HMAC-SHA256 /);
      expect(signature.length).toBeGreaterThan(20);
      expect(timestamp).toMatch(/^\d+$/);
    });

    it('produces different signatures for different bodies', () => {
      const { signature: s1 } = signRequestBody('{"a":1}', secret);
      const { signature: s2 } = signRequestBody('{"a":2}', secret);
      expect(s1).not.toBe(s2);
    });

    it('produces same signature for same body and secret', () => {
      const body = '{"same":"body"}';
      const { signature: s1 } = signRequestBody(body, secret);
      const { signature: s2 } = signRequestBody(body, secret);
      expect(s1).toBe(s2);
    });
  });

  describe('verifyCallbackSignature', () => {
    it('accepts valid signature', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature(body, signature, secret);
      expect(valid).toBe(true);
    });

    it('rejects invalid signature', () => {
      const body = '{"event":"kyc.session.completed"}';
      const valid = verifyCallbackSignature(body, 'HMAC-SHA256 invalid', secret);
      expect(valid).toBe(false);
    });

    it('rejects tampered body', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature('{"event":"kyc.session.started"}', signature, secret);
      expect(valid).toBe(false);
    });

    it('rejects wrong secret', () => {
      const body = '{"event":"kyc.session.completed"}';
      const { signature } = signRequestBody(body, secret);
      const valid = verifyCallbackSignature(body, signature, 'wrong-secret');
      expect(valid).toBe(false);
    });

    it('rejects missing signature header', () => {
      const valid = verifyCallbackSignature('{}', undefined, secret);
      expect(valid).toBe(false);
    });

    it('rejects invalid prefix', () => {
      const valid = verifyCallbackSignature('{}', 'Bearer xyz', secret);
      expect(valid).toBe(false);
    });
  });
});
