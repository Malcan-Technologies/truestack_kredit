import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { Request } from 'express';

export async function resolveProTenant() {
  if (config.proTenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: config.proTenantId } });
    if (t) return t;
  }
  let t = await prisma.tenant.findFirst({ where: { slug: config.proTenantSlug } });
  if (!t) {
    t = await prisma.tenant.create({
      data: {
        name: 'Borrower Pro',
        slug: config.proTenantSlug,
        type: 'PPW',
      },
    });
  }
  return t;
}

type BorrowerReq = Request & {
  borrowerUser?: {
    userId: string;
    activeBorrowerId?: string | null;
    sessionToken?: string | null;
    sessionId?: string;
  };
};

/** Ensure active borrower exists and user has link. Returns { borrowerId, tenant }. */
export async function requireActiveBorrower(req: BorrowerReq) {
  const tenant = await resolveProTenant();
  let activeBorrowerId = req.borrowerUser?.activeBorrowerId ?? null;

  if (!activeBorrowerId) {
    const firstLink = await prisma.borrowerProfileLink.findFirst({
      where: {
        userId: req.borrowerUser!.userId,
        tenantId: tenant.id,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!firstLink) {
      throw new BadRequestError('No active borrower profile. Please complete onboarding first.');
    }

    activeBorrowerId = firstLink.borrowerId;
    req.borrowerUser!.activeBorrowerId = activeBorrowerId;

    const sessionToken = req.borrowerUser?.sessionToken;
    const sessionId = req.borrowerUser?.sessionId;
    if (sessionToken) {
      const updated = await prisma.session.updateMany({
        where: { userId: req.borrowerUser!.userId, token: sessionToken },
        data: { activeBorrowerId },
      });
      if (updated.count === 0 && sessionId) {
        await prisma.session.update({
          where: { id: sessionId },
          data: { activeBorrowerId },
        });
      }
    } else if (sessionId) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { activeBorrowerId },
      });
    }
  }

  const link = await prisma.borrowerProfileLink.findFirst({
    where: {
      userId: req.borrowerUser!.userId,
      borrowerId: activeBorrowerId,
      tenantId: tenant.id,
    },
  });
  if (!link) {
    throw new NotFoundError('Borrower profile not found or not linked to you');
  }
  return { borrowerId: activeBorrowerId, tenant };
}
