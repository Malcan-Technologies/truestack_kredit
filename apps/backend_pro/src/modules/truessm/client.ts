/**
 * TrueSSM (Malaysian registry) HTTP client.
 *
 * Wraps the public TrueStack TrueSSM API documented in
 * apps/admin_pro/docs/TRUESSM_API.md. The API uses a Bearer key and is
 * configured via TRUESTACK_SSM_API_BASE_URL + TRUESTACK_SSM_API_KEY.
 *
 * Every billable pull should be invoked with a stable Idempotency-Key per
 * logical report request so retries do not double-bill.
 */

import { config } from '../../lib/config.js';
import { AppError } from '../../lib/errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/** Acknowledgement block returned by every successful billable pull. */
export interface SsmAcknowledgement {
  usage_id?: string;
  usage_type?: string;
  acknowledged_at?: string;
  billed_credits?: number;
  request_id?: string | null;
  idempotent?: boolean;
}

export interface SsmCompanyProfileResponse {
  data: Record<string, unknown> & {
    getCompProfile?: Record<string, unknown> & {
      clientRefNo?: string;
      requestRefNo?: string;
      successCode?: string;
      errorMsg?: string;
      rocCompanyInfo?: Record<string, unknown> & {
        companyName?: string;
        companyNo?: string;
      };
    };
  };
  acknowledgement: SsmAcknowledgement;
}

/**
 * Structured error for the documented TrueSSM error codes. Keeps the
 * acknowledgement around when present (failed document pulls are billed).
 */
export class SsmApiError extends AppError {
  constructor(
    statusCode: number,
    public errorCode: string,
    message: string,
    public acknowledgement?: SsmAcknowledgement,
    public extra?: Record<string, unknown>,
  ) {
    super(statusCode, message, errorCode);
    this.name = 'SsmApiError';
  }
}

interface CallSsmOptions {
  path: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Internal POST helper. Centralises auth, error mapping, and timeout. The
 * TrueSSM API always responds with JSON; this helper throws an SsmApiError
 * for non-2xx responses so callers can surface user-friendly copy.
 */
async function callSsm<T>({ path, body, idempotencyKey, signal }: CallSsmOptions): Promise<T> {
  const { apiBaseUrl, apiKey } = config.truessm;
  if (!apiBaseUrl) {
    throw new AppError(502, 'TRUESTACK_SSM_API_BASE_URL is not configured', 'PROVIDER_NOT_CONFIGURED');
  }
  if (!apiKey) {
    throw new AppError(502, 'TRUESTACK_SSM_API_KEY is not configured', 'PROVIDER_NOT_CONFIGURED');
  }

  const url = `${apiBaseUrl}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  // Propagate caller cancellation to the inner controller.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new SsmApiError(
      502,
      isAbort ? 'REGISTRY_UNAVAILABLE' : 'REGISTRY_UNAVAILABLE',
      isAbort ? 'Registry request timed out' : 'Failed to reach TrueSSM registry',
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new SsmApiError(502, 'REGISTRY_ERROR', `Invalid JSON from TrueSSM (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const errorCode =
      typeof payload.error === 'string' && payload.error.length > 0
        ? payload.error
        : `HTTP_${res.status}`;
    const message =
      typeof payload.message === 'string' && payload.message.length > 0
        ? payload.message
        : `TrueSSM request failed (${errorCode})`;
    const acknowledgement = (payload.acknowledgement as SsmAcknowledgement | undefined) ?? undefined;
    const { error: _err, message: _msg, acknowledgement: _ack, ...extra } = payload;
    void _err;
    void _msg;
    void _ack;
    throw new SsmApiError(res.status, errorCode, message, acknowledgement, extra);
  }

  return payload as T;
}

export interface PullCompanyProfileInput {
  regNo: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}

/**
 * Pull a ROC company profile. Costs 154 credits on default template pricing.
 * Free entity validation runs server-side at TrueStack; ENTITY_NOT_FOUND and
 * ENTITY_TYPE_MISMATCH are returned without billing.
 */
export async function pullCompanyProfile(
  input: PullCompanyProfileInput,
): Promise<SsmCompanyProfileResponse> {
  return callSsm<SsmCompanyProfileResponse>({
    path: '/api/v1/ssm/reports/company-profile',
    body: { regNo: input.regNo },
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
}
