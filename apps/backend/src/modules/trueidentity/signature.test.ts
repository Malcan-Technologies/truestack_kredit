/**
 * Unit tests for TrueIdentity HMAC signing and verification.
 * Run with: npx tsx src/modules/trueidentity/signature.test.ts
 */

import { signRequestBody, verifyCallbackSignature } from './signature.js';

const SECRET = 'test-secret-at-least-32-characters-long';

function runTests() {
  let passed = 0;
  let failed = 0;

  function ok(cond: boolean, name: string) {
    if (cond) {
      passed++;
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      console.error(`  ✗ ${name}`);
    }
  }

  console.log('\n--- TrueIdentity Signature Tests ---\n');

  // Sign produces valid format
  const body = JSON.stringify({ tenantId: 't1', borrowerId: 'b1' });
  const { signature, timestamp } = signRequestBody(body, SECRET);
  ok(signature.startsWith('HMAC-SHA256 '), 'signature has HMAC-SHA256 prefix');
  ok(signature.length > 20, 'signature has content');
  ok(/^\d+$/.test(timestamp), 'timestamp is numeric');

  // Verify accepts valid signature
  const valid = verifyCallbackSignature(body, signature, SECRET, timestamp, 60_000);
  ok(valid, 'verify accepts valid signature');

  // Verify rejects wrong secret
  const invalidSecret = verifyCallbackSignature(body, signature, 'wrong-secret', timestamp, 60_000);
  ok(!invalidSecret, 'verify rejects wrong secret');

  // Verify rejects tampered body
  const tampered = verifyCallbackSignature(body + 'x', signature, SECRET, timestamp, 60_000);
  ok(!tampered, 'verify rejects tampered body');

  // Verify rejects invalid signature format
  const badFormat = verifyCallbackSignature(body, 'invalid', SECRET, undefined, 60_000);
  ok(!badFormat, 'verify rejects invalid signature format');

  // Verify rejects expired timestamp
  const oldTs = String(Date.now() - 400_000);
  const { signature: sig2 } = signRequestBody(body, SECRET);
  const expired = verifyCallbackSignature(body, sig2, SECRET, oldTs, 60_000);
  ok(!expired, 'verify rejects expired timestamp');

  console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
