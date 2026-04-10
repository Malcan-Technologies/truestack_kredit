import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export const OPEN_INVITE_EMAIL_DOMAIN = 'borrower-invite.invalid';
export const OPEN_INVITE_PREFIX = 'open-link-';

export function isOpenInviteEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.startsWith(OPEN_INVITE_PREFIX) && e.endsWith(`@${OPEN_INVITE_EMAIL_DOMAIN}`);
}

export function syntheticOpenInviteEmail(token: string): string {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return `${OPEN_INVITE_PREFIX}${safe}@${OPEN_INVITE_EMAIL_DOMAIN}`;
}

export function orgDisplayNameFromBorrower(borrower: {
  companyName?: string | null;
  name: string;
}): string {
  return (borrower.companyName?.trim() || borrower.name?.trim() || 'Company').slice(0, 200);
}

async function createBorrowerCompanyOrgAndLinkWithClient(
  prismaClient: Prisma.TransactionClient,
  params: {
    borrowerId: string;
    ownerUserId: string;
    tenantId: string;
    displayName: string;
  }
) {
  const slug = `co-${params.borrowerId}`;
  const org = await prismaClient.organization.create({
    data: {
      name: params.displayName,
      slug,
      metadata: JSON.stringify({ borrowerId: params.borrowerId }),
      members: {
        create: {
          userId: params.ownerUserId,
          role: 'owner',
        },
      },
    },
  });
  await prismaClient.borrowerOrganizationLink.create({
    data: {
      borrowerId: params.borrowerId,
      organizationId: org.id,
      tenantId: params.tenantId,
    },
  });
  return org;
}

export async function createBorrowerCompanyOrgAndLink(params: {
  borrowerId: string;
  ownerUserId: string;
  tenantId: string;
  displayName: string;
  prismaClient?: Prisma.TransactionClient;
}) {
  if (params.prismaClient) {
    return createBorrowerCompanyOrgAndLinkWithClient(params.prismaClient, params);
  }

  return prisma.$transaction((tx) =>
    createBorrowerCompanyOrgAndLinkWithClient(tx, params)
  );
}

/**
 * If a CORPORATE borrower has profile links but no BorrowerOrganizationLink (pre-feature rows),
 * create Organization + Member rows + link in one transaction. Idempotent if link already exists.
 * Matches backfill rules: earliest linked user → owner, others → member.
 */
export async function lazyEnsureBorrowerCompanyOrganization(borrowerId: string): Promise<{
  organizationId: string | null;
  repaired: boolean;
}> {
  const existing = await prisma.borrowerOrganizationLink.findUnique({
    where: { borrowerId },
    select: { organizationId: true },
  });
  if (existing) {
    return { organizationId: existing.organizationId, repaired: false };
  }

  const borrower = await prisma.borrower.findFirst({
    where: { id: borrowerId, borrowerType: 'CORPORATE' },
    select: { id: true, tenantId: true, companyName: true, name: true },
  });
  if (!borrower) {
    return { organizationId: null, repaired: false };
  }

  const rawLinks = await prisma.borrowerProfileLink.findMany({
    where: { borrowerId },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const firstByUser = new Map<string, Date>();
  for (const l of rawLinks) {
    if (!firstByUser.has(l.userId)) firstByUser.set(l.userId, l.createdAt);
  }
  const userIdsOrdered = [...firstByUser.entries()]
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([uid]) => uid);

  if (userIdsOrdered.length === 0) {
    return { organizationId: null, repaired: false };
  }

  const displayName = orgDisplayNameFromBorrower(borrower);
  const slug = `co-${borrower.id}`;
  const ownerUserId = userIdsOrdered[0];
  const rest = userIdsOrdered.slice(1);

  try {
    await prisma.$transaction(async (tx) => {
      const stillMissing = await tx.borrowerOrganizationLink.findUnique({ where: { borrowerId } });
      if (stillMissing) return;

      const org = await tx.organization.create({
        data: {
          name: displayName,
          slug,
          metadata: JSON.stringify({ borrowerId: borrower.id }),
          members: {
            create: [
              { userId: ownerUserId, role: 'owner' },
              ...rest.map((userId) => ({ userId, role: 'member' as const })),
            ],
          },
        },
      });
      await tx.borrowerOrganizationLink.create({
        data: {
          borrowerId: borrower.id,
          organizationId: org.id,
          tenantId: borrower.tenantId,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const afterRace = await prisma.borrowerOrganizationLink.findUnique({
        where: { borrowerId },
        select: { organizationId: true },
      });
      if (afterRace) {
        return { organizationId: afterRace.organizationId, repaired: true };
      }
    }
    throw e;
  }

  const bol = await prisma.borrowerOrganizationLink.findUnique({
    where: { borrowerId },
    select: { organizationId: true },
  });
  return {
    organizationId: bol?.organizationId ?? null,
    repaired: Boolean(bol),
  };
}

export async function resolveOrgIdForBorrower(borrowerId: string): Promise<string | null> {
  const link = await prisma.borrowerOrganizationLink.findUnique({
    where: { borrowerId },
    select: { organizationId: true },
  });
  return link?.organizationId ?? null;
}

export async function getOrgRoleForBorrower(
  userId: string,
  borrowerId: string
): Promise<string | null> {
  const link = await prisma.borrowerOrganizationLink.findUnique({ where: { borrowerId } });
  if (!link) return null;
  const member = await prisma.member.findFirst({
    where: { organizationId: link.organizationId, userId },
  });
  return member?.role ?? null;
}

export function roleIncludes(role: string | null, ...allowed: string[]): boolean {
  if (!role) return false;
  const parts = role.split(',').map((r) => r.trim()).filter(Boolean);
  return allowed.some((a) => parts.includes(a));
}

export function canManageCompanyProfile(role: string | null): boolean {
  return roleIncludes(role, 'owner', 'admin');
}

export function canManageCompanyMembers(role: string | null): boolean {
  return roleIncludes(role, 'owner', 'admin');
}
