import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { toSafeNumber } from '../../lib/math.js';
import { handleRecordLoanSpilloverPayment } from './recordLoanSpilloverPayment.js';
import { AuditService } from '../compliance/auditService.js';
import type { IncomingHttpHeaders } from 'http';

type SpilloverSuccessBody = {
  success: boolean;
  data?: { transaction?: { id: string } };
};

function extractTransactionId(body: unknown): string | undefined {
  const b = body as SpilloverSuccessBody;
  return b?.data?.transaction?.id;
}

/**
 * Admin approves a pending borrower manual payment: allocate to schedule and link transaction.
 */
export async function approveBorrowerManualPaymentRequest(params: {
  tenantId: string;
  requestId: string;
  memberId: string | null;
  ip: string | undefined;
  headers: IncomingHttpHeaders;
}): Promise<{ success: true; data: unknown }> {
  const { tenantId, requestId, memberId, ip, headers } = params;

  const reqRow = await prisma.borrowerManualPaymentRequest.findFirst({
    where: { id: requestId, tenantId },
    include: { loan: true },
  });

  if (!reqRow) {
    throw new NotFoundError('Payment request');
  }
  if (reqRow.status === 'APPROVED' && reqRow.paymentTransactionId) {
    const tx = await prisma.paymentTransaction.findFirst({
      where: { id: reqRow.paymentTransactionId, tenantId },
      include: { allocations: true },
    });
    return {
      success: true,
      data: {
        transaction: tx,
        manualPaymentRequestId: requestId,
        idempotentReplay: true,
      },
    };
  }
  if (reqRow.status !== 'PENDING') {
    throw new BadRequestError('This payment request is not pending approval');
  }

  const amount = toSafeNumber(reqRow.amount);
  if (amount <= 0) {
    throw new BadRequestError('Invalid amount on payment request');
  }

  const result = await handleRecordLoanSpilloverPayment({
    tenantId,
    loanId: reqRow.loanId,
    body: {
      loanId: reqRow.loanId,
      amount,
      reference: reqRow.reference,
      notes: 'Borrower manual payment (approved)',
      applyLateFee: true,
    },
    memberId,
    ip,
    headers,
    idempotencyEndpoint: `POST:/api/schedules/manual-payment-requests/${requestId}/approve`,
    idempotencyKey: `manual-payment-approve:${requestId}`,
  });

  const body = result.body;
  const txId = extractTransactionId(body);
  if (!txId) {
    throw new BadRequestError('Payment recording did not return a transaction');
  }

  await prisma.borrowerManualPaymentRequest.updateMany({
    where: { id: requestId, tenantId, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      paymentTransactionId: txId,
      reviewedAt: new Date(),
      reviewedByMemberId: memberId,
    },
  });

  await AuditService.log({
    tenantId,
    memberId: memberId ?? undefined,
    action: 'BORROWER_MANUAL_PAYMENT_APPROVED',
    entityType: 'Loan',
    entityId: reqRow.loanId,
    newData: {
      requestId,
      amount,
      reference: reqRow.reference,
      paymentTransactionId: txId,
    },
    ipAddress: ip,
  });

  const base = body as Record<string, unknown>;
  const innerData = base.data && typeof base.data === 'object' ? (base.data as Record<string, unknown>) : {};
  return {
    success: true,
    ...base,
    data: {
      ...innerData,
      manualPaymentRequestId: requestId,
    },
  };
}

export async function rejectBorrowerManualPaymentRequest(params: {
  tenantId: string;
  requestId: string;
  memberId: string | null;
  reason?: string;
  ip?: string;
}): Promise<void> {
  const { tenantId, requestId, memberId, reason, ip } = params;

  const reqRow = await prisma.borrowerManualPaymentRequest.findFirst({
    where: { id: requestId, tenantId },
  });

  if (!reqRow) {
    throw new NotFoundError('Payment request');
  }
  if (reqRow.status !== 'PENDING') {
    throw new BadRequestError('This payment request is not pending approval');
  }

  const rejectionReason = reason?.trim() || 'Rejected';

  await prisma.borrowerManualPaymentRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      rejectionReason,
      reviewedAt: new Date(),
      reviewedByMemberId: memberId,
    },
  });

  await AuditService.log({
    tenantId,
    memberId: memberId ?? undefined,
    action: 'BORROWER_MANUAL_PAYMENT_REJECTED',
    entityType: 'Loan',
    entityId: reqRow.loanId,
    newData: {
      requestId,
      amount: toSafeNumber(reqRow.amount),
      reference: reqRow.reference,
      reason: rejectionReason,
    },
    ipAddress: ip,
  });
}
