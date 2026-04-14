import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { safeRound } from '../../lib/math.js';

async function supersedePendingOffers(tx: Prisma.TransactionClient, applicationId: string) {
  await tx.loanApplicationOffer.updateMany({
    where: { applicationId, status: 'PENDING' },
    data: { status: 'SUPERSEDED', resolvedAt: new Date() },
  });
}

export async function adminCounterOffer(params: {
  tenantId: string;
  applicationId: string;
  amount: number;
  term: number;
}): Promise<{ id: string }> {
  const { tenantId, applicationId, amount, term } = params;
  if (amount <= 0 || term <= 0) {
    throw new BadRequestError('Amount and term must be positive');
  }

  const app = await prisma.loanApplication.findFirst({
    where: { id: applicationId, tenantId },
  });
  if (!app) throw new NotFoundError('Application');
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
    throw new BadRequestError('Negotiation is only available for submitted applications');
  }

  return prisma.$transaction(async (tx) => {
    await supersedePendingOffers(tx, applicationId);
    const row = await tx.loanApplicationOffer.create({
      data: {
        tenantId,
        applicationId,
        amount: safeRound(amount, 2),
        term,
        fromParty: 'ADMIN',
        status: 'PENDING',
      },
    });
    return { id: row.id };
  });
}

export async function borrowerCounterOffer(params: {
  tenantId: string;
  borrowerId: string;
  applicationId: string;
  amount: number;
  term: number;
}): Promise<{ id: string }> {
  const { tenantId, borrowerId, applicationId, amount, term } = params;
  if (amount <= 0 || term <= 0) {
    throw new BadRequestError('Amount and term must be positive');
  }

  const app = await prisma.loanApplication.findFirst({
    where: { id: applicationId, tenantId, borrowerId },
  });
  if (!app) throw new NotFoundError('Application');
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
    throw new BadRequestError('Negotiation is only available for submitted applications');
  }

  return prisma.$transaction(async (tx) => {
    await supersedePendingOffers(tx, applicationId);
    const row = await tx.loanApplicationOffer.create({
      data: {
        tenantId,
        applicationId,
        amount: safeRound(amount, 2),
        term,
        fromParty: 'BORROWER',
        status: 'PENDING',
      },
    });
    return { id: row.id };
  });
}

export async function borrowerAcceptLatestOffer(params: {
  tenantId: string;
  borrowerId: string;
  applicationId: string;
}): Promise<{ offerId: string; amount: unknown; term: number }> {
  const { tenantId, borrowerId, applicationId } = params;

  const app = await prisma.loanApplication.findFirst({
    where: { id: applicationId, tenantId, borrowerId },
  });
  if (!app) throw new NotFoundError('Application');
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
    throw new BadRequestError('Cannot accept offer for this application');
  }

  const pending = await prisma.loanApplicationOffer.findFirst({
    where: { applicationId, status: 'PENDING', fromParty: 'ADMIN' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) {
    throw new BadRequestError('No pending lender offer to accept');
  }

  const snapshot = {
    offerId: pending.id,
    amount: pending.amount,
    term: pending.term,
  };

  await prisma.$transaction(async (tx) => {
    await tx.loanApplicationOffer.update({
      where: { id: pending.id },
      data: { status: 'ACCEPTED', resolvedAt: new Date() },
    });
    await tx.loanApplication.update({
      where: { id: applicationId },
      data: {
        amount: pending.amount,
        term: pending.term,
      },
    });
  });

  return snapshot;
}

export async function adminAcceptLatestOffer(params: {
  tenantId: string;
  applicationId: string;
}): Promise<void> {
  const { tenantId, applicationId } = params;

  const app = await prisma.loanApplication.findFirst({
    where: { id: applicationId, tenantId },
  });
  if (!app) throw new NotFoundError('Application');
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
    throw new BadRequestError('Cannot accept offer for this application');
  }

  const pending = await prisma.loanApplicationOffer.findFirst({
    where: { applicationId, status: 'PENDING', fromParty: 'BORROWER' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) {
    throw new BadRequestError('No pending borrower offer to accept');
  }

  await prisma.$transaction(async (tx) => {
    await tx.loanApplicationOffer.update({
      where: { id: pending.id },
      data: { status: 'ACCEPTED', resolvedAt: new Date() },
    });
    await tx.loanApplication.update({
      where: { id: applicationId },
      data: {
        amount: pending.amount,
        term: pending.term,
      },
    });
  });
}

export async function rejectPendingOffers(params: { tenantId: string; applicationId: string }): Promise<void> {
  const { tenantId, applicationId } = params;
  const app = await prisma.loanApplication.findFirst({
    where: { id: applicationId, tenantId },
  });
  if (!app) throw new NotFoundError('Application');

  await prisma.loanApplicationOffer.updateMany({
    where: { applicationId, status: 'PENDING' },
    data: { status: 'REJECTED', resolvedAt: new Date() },
  });
}

export async function assertNoPendingOffersForApproval(applicationId: string): Promise<void> {
  const n = await prisma.loanApplicationOffer.count({
    where: { applicationId, status: 'PENDING' },
  });
  if (n > 0) {
    throw new BadRequestError('Resolve or wait for negotiation: a counter-offer is still pending');
  }
}
