#!/usr/bin/env node
/**
 * Prints `android:apk-key-hash:<base64>` for Better Auth passkey `origin` (borrower-auth).
 * Default: Android debug keystore. Pass path + alias for release keystore.
 *
 *   node scripts/print-android-apk-key-hash.cjs [path-to.keystore] [alias]
 *
 * Set on backend_pro:
 *   BETTER_AUTH_PASSKEY_ANDROID_APK_KEY_HASHES=<base64>[,<second-key>...]
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const keystore = process.argv[2] || path.join(os.homedir(), '.android', 'debug.keystore');
const alias = process.argv[3] || 'androiddebugkey';
const storepass = process.env.ANDROID_KEYSTORE_PASSWORD || 'android';
const keypass = process.env.ANDROID_KEY_PASSWORD || storepass;

let out;
try {
  out = execSync(
    `keytool -list -v -keystore "${keystore}" -alias ${alias} -storepass ${storepass} -keypass ${keypass}`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
} catch (err) {
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}

const m = out.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
if (!m) {
  console.error('Could not parse SHA256 from keytool output.');
  process.exit(1);
}

const hex = m[1].replace(/:/g, '');
const buf = Buffer.from(hex, 'hex');
const b64 = buf.toString('base64');
const token = `android:apk-key-hash:${b64}`;

console.log(token);
console.log('');
console.log('backend_pro .env (comma-separate multiple signing keys):');
console.log(`BETTER_AUTH_PASSKEY_ANDROID_APK_KEY_HASHES=${b64}`);
