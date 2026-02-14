import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from './prisma.js';
import { BadRequestError, ConflictError } from './errors.js';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

type IdempotencyStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface BeginIdempotencyResult {
  replay: boolean;
  recordId: string;
  responseStatus?: number;
  responseBody?: unknown;
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForHash);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, normalizeForHash(nested)]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function getIdempotencyKeyFromHeaders(headers: Record<string, unknown>): string {
  const value = headers[IDEMPOTENCY_KEY_HEADER];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('Missing required Idempotency-Key header');
  }
  return value.trim();
}

function buildRequestHash(payload: unknown): string {
  const canonical = JSON.stringify(normalizeForHash(payload));
  return createHash('sha256').update(canonical).digest('hex');
}

export async function beginPaymentIdempotency(params: {
  tenantId: string;
  endpoint: string;
  idempotencyKey: string;
  requestPayload: unknown;
}): Promise<BeginIdempotencyResult> {
  const requestHash = buildRequestHash(params.requestPayload);

  try {
    const record = await prisma.paymentIdempotency.create({
      data: {
        tenantId: params.tenantId,
        endpoint: params.endpoint,
        idempotencyKey: params.idempotencyKey,
        requestHash,
        status: 'PROCESSING',
      },
    });

    return {
      replay: false,
      recordId: record.id,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
  }

  const existing = await prisma.paymentIdempotency.findUnique({
    where: {
      tenantId_endpoint_idempotencyKey: {
        tenantId: params.tenantId,
        endpoint: params.endpoint,
        idempotencyKey: params.idempotencyKey,
      },
    },
  });

  if (!existing) {
    throw new ConflictError('Unable to resolve idempotency state. Please retry.');
  }

  if (existing.requestHash !== requestHash) {
    throw new BadRequestError('Idempotency-Key was already used with a different request payload');
  }

  const status = existing.status as IdempotencyStatus;
  if (status === 'COMPLETED') {
    return {
      replay: true,
      recordId: existing.id,
      responseStatus: existing.responseStatus ?? 200,
      responseBody: existing.responseBody,
    };
  }

  if (status === 'PROCESSING') {
    throw new ConflictError('A request with this Idempotency-Key is already being processed');
  }

  const reset = await prisma.paymentIdempotency.update({
    where: { id: existing.id },
    data: {
      status: 'PROCESSING',
      errorMessage: null,
      responseStatus: null,
      responseBody: Prisma.JsonNull,
    },
  });

  return {
    replay: false,
    recordId: reset.id,
  };
}

export async function completePaymentIdempotency(
  recordId: string,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  await prisma.paymentIdempotency.update({
    where: { id: recordId },
    data: {
      status: 'COMPLETED',
      responseStatus: statusCode,
      responseBody: responseBody as Prisma.InputJsonValue,
      errorMessage: null,
    },
  });
}

export async function failPaymentIdempotency(recordId: string, errorMessage: string): Promise<void> {
  await prisma.paymentIdempotency.update({
    where: { id: recordId },
    data: {
      status: 'FAILED',
      errorMessage: errorMessage.slice(0, 500),
    },
  });
}
