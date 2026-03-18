import { getFile } from './storage.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB

function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((entry) => {
    const normalized = entry.toLowerCase();
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1); // .example.com
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === normalized;
  });
}

function getAllowedHosts(): string[] {
  return (process.env.ALLOWED_LOGO_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

function validateRemoteLogoUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid logo URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Logo URL must use http or https');
  }

  const forbiddenHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (forbiddenHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('Logo URL host is not allowed');
  }

  const allowlist = getAllowedHosts();
  if (allowlist.length === 0) {
    throw new Error('Remote logo fetch is disabled. Set ALLOWED_LOGO_HOSTS to enable.');
  }

  if (!hostMatchesAllowlist(parsed.hostname, allowlist)) {
    throw new Error(`Logo host "${parsed.hostname}" is not in ALLOWED_LOGO_HOSTS`);
  }

  return parsed;
}

function localUploadPathFromUrl(urlPath: string): string | null {
  if (urlPath.startsWith('/api/uploads/')) {
    return urlPath.replace('/api/uploads/', '');
  }
  if (urlPath.startsWith('/uploads/')) {
    return urlPath.replace('/uploads/', '');
  }
  return null;
}

export async function fetchLogoBuffer(url: string, uploadDir: string): Promise<Buffer> {
  void uploadDir;

  const relative = localUploadPathFromUrl(url);
  if (relative !== null || url.startsWith('s3://')) {
    const fileBuffer = await getFile(url);
    if (!fileBuffer) {
      throw new Error(`Logo file not found: ${url}`);
    }
    return fileBuffer;
  }

  const validatedUrl = validateRemoteLogoUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(validatedUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error',
    });

    if (!response.ok) {
      throw new Error(`Logo fetch failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Invalid logo content type: ${contentType || 'unknown'}`);
    }

    if (!response.body) {
      throw new Error('Logo response body is empty');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > DEFAULT_MAX_BYTES) {
        throw new Error(`Logo file too large (max ${DEFAULT_MAX_BYTES} bytes)`);
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  } finally {
    clearTimeout(timeout);
  }
}
