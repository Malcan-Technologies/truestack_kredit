#!/usr/bin/env node
// Sets up `adb reverse` so Android emulators / USB devices can reach services
// on the host via `127.0.0.1` / `localhost` from inside the app:
//   - 8081: Metro
//   - 4001 / 3006: typical Pro backend + borrower web (Better Auth) from `.env.example`
//
// Without reverse, `localhost` in the emulator is the emulator itself, so
// sign-in / API calls fail with "Network request failed".
//
// Override ports: ADB_REVERSE_PORTS=8081,4001,3006
// WSL2 + Android Studio on Windows: same idea as Metro — host loopback must be forwarded.

const { spawnSync } = require('node:child_process');

const DEFAULT_PORTS = ['8081', '4001', '3006'];

function getPorts() {
  const raw = process.env.ADB_REVERSE_PORTS?.trim();
  if (!raw) {
    return DEFAULT_PORTS;
  }
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

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

function ensureReverse(serial, port) {
  const args = ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`];
  const result = run('adb', args);
  if (result.status === 0) {
    console.log(`[adb-reverse] ${serial}: tcp:${port} -> tcp:${port}`);
  } else {
    console.warn(
      `[adb-reverse] ${serial} tcp:${port}: failed (${result.stderr.trim() || result.stdout.trim() || 'unknown error'})`,
    );
  }
}

function main() {
  if (!hasAdb()) {
    console.warn('[adb-reverse] `adb` not found on PATH — skipping.');
    return;
  }

  const devices = listDevices();
  const ports = getPorts();

  if (devices.length === 0) {
    console.warn(
      `[adb-reverse] No Android devices/emulators detected. Start your emulator first, then re-run.`,
    );
    console.warn(
      `[adb-reverse] With an emulator running, these host ports are reversed: ${ports.join(', ')}`,
    );
    return;
  }

  for (const { serial } of devices) {
    for (const port of ports) {
      ensureReverse(serial, port);
    }
  }
}

main();
