import type { IncomingHttpHeaders } from 'http';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { confirmEarlySettlement } from '../loans/earlySettlementConfirmService.js';
import { AuditService } from '../compliance/auditService.js';

export async function approveBorrowerEarlySettlementRequest(params: {
  tenantId: string;
  requestId: string;
  memberId: string | null;
  ip?: string;
  headers: IncomingHttpHeaders;
  waiveLateFees?: boolean;
  adminNotes?: string;
  paymentDate?: string;
  reference?: string;
}): Promise<{ httpStatus: number; body: unknown }> {
  const { tenantId, requestId, memberId, ip, headers } = params;

  const reqRow = await prisma.borrowerEarlySettlementRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      loan: { select: { id: true, status: true } },
    },
  });

  if (!reqRow) {
    throw new NotFoundError('Early settlement request');
  }

  if (reqRow.status === 'APPROVED' && reqRow.paymentTransactionId) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        data: {
          idempotentReplay: true,
          requestId,
          paymentTransactionId: reqRow.paymentTransactionId,
        },
      },
    };
  }

  if (reqRow.status !== 'PENDING') {
    throw new BadRequestError('This early settlement request is not pending approval');
  }

  const noteParts: string[] = [];
  noteParts.push(`[Borrower early settlement request ${requestId}]`);
  if (reqRow.borrowerNote?.trim()) {
    noteParts.push(`Borrower: ${reqRow.borrowerNote.trim()}`);
  }
  if (params.adminNotes?.trim()) {
    noteParts.push(`Admin: ${params.adminNotes.trim()}`);
  }
  const mergedNotes = noteParts.join('\n');

  const mergedReference = params.reference?.trim() || reqRow.reference?.trim() || undefined;

  const { httpStatus, body } = await confirmEarlySettlement({
    tenantId,
    memberId: memberId ?? undefined,
    loanId: reqRow.loanId,
    ip,
    headers,
    body: {
      paymentDate: params.paymentDate,
      reference: mergedReference,
      notes: mergedNotes,
      waiveLateFees: params.waiveLateFees ?? false,
    },
    idempotencyEndpoint: `POST:/api/schedules/early-settlement-requests/${requestId}/approve`,
    idempotencyKey: `early-settlement-req-approve:${requestId}`,
  });

  const payload = body as { success?: boolean; data?: { transactionId?: string } };
  if (httpStatus >= 400 || !payload?.success) {
    throw new BadRequestError('Early settlement execution failed');
  }

  const txId = payload.data?.transactionId;

  await prisma.borrowerEarlySettlementRequest.update({
    where: { id: requestId },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedByMemberId: memberId ?? undefined,
      paymentTransactionId: txId ?? undefined,
    },
  });

  await AuditService.log({
    tenantId,
    memberId: memberId ?? undefined,
    action: 'BORROWER_EARLY_SETTLEMENT_APPROVED',
    entityType: 'Loan',
    entityId: reqRow.loanId,
    newData: { requestId, paymentTransactionId: txId },
    ipAddress: ip,
  });

  return { httpStatus, body };
}

export async function rejectBorrowerEarlySettlementRequest(params: {
  tenantId: string;
  requestId: string;
  memberId: string | null;
  reason?: string;
  ip?: string;
}): Promise<void> {
  const { tenantId, requestId, memberId, reason, ip } = params;

  const reqRow = await prisma.borrowerEarlySettlementRequest.findFirst({
    where: { id: requestId, tenantId },
  });

  if (!reqRow) {
    throw new NotFoundError('Early settlement request');
  }

  if (reqRow.status !== 'PENDING') {
    throw new BadRequestError('This early settlement request is not pending approval');
  }

  const rejectionReason = reason?.trim() || 'Rejected';

  await prisma.borrowerEarlySettlementRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      rejectionReason,
      reviewedAt: new Date(),
      reviewedByMemberId: memberId ?? undefined,
    },
  });

  await AuditService.log({
    tenantId,
    memberId: memberId ?? undefined,
    action: 'BORROWER_EARLY_SETTLEMENT_REJECTED',
    entityType: 'Loan',
    entityId: reqRow.loanId,
    newData: { requestId, reason: rejectionReason },
    ipAddress: ip,
  });
}
