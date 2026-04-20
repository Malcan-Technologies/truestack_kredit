#!/usr/bin/env node
// Ensures `adb reverse tcp:8081 tcp:8081` is in place so Android emulators /
// USB-tethered devices can reach a Metro bundler running on the host machine
// via `127.0.0.1:8081`. This is required when the host is a WSL2 distro and
// Android Studio runs on Windows, because the WSL LAN IP is not reachable
// from the emulator and Windows does not always forward localhost:8081 into
// WSL. See the comments in `.env` for more context.

const { spawnSync } = require('node:child_process');

const PORT = '8081';

function run(bin, args) {
  const result = spawnSync(bin, args, { encoding: 'utf8' });
  return {
    status: typeof result.status === 'number' ? result.status : -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function hasAdb() {
  const probe = run('adb', ['version']);
  return probe.status === 0;
}

function listDevices() {
  const { stdout } = run('adb', ['devices']);
  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.state === 'device');
}

function ensureReverse(serial) {
  const args = ['-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`];
  const result = run('adb', args);
  if (result.status === 0) {
    console.log(`[adb-reverse] ${serial}: tcp:${PORT} -> tcp:${PORT}`);
  } else {
    console.warn(
      `[adb-reverse] ${serial}: failed (${result.stderr.trim() || result.stdout.trim() || 'unknown error'})`,
    );
  }
}

function main() {
  if (!hasAdb()) {
    console.warn('[adb-reverse] `adb` not found on PATH — skipping.');
    return;
  }

  const devices = listDevices();
  if (devices.length === 0) {
    console.warn(
      `[adb-reverse] No Android devices/emulators detected. Start your emulator first, then re-run — Metro will still be reachable at http://127.0.0.1:${PORT} once you do.`,
    );
    return;
  }

  for (const { serial } of devices) {
    ensureReverse(serial);
  }
}

main();
