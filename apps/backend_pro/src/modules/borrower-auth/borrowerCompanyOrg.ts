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

export async function createBorrowerCompanyOrgAndLink(params: {
  borrowerId: string;
  ownerUserId: string;
  tenantId: string;
  displayName: string;
}) {
  const slug = `co-${params.borrowerId}`;
  const org = await prisma.organization.create({
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
  await prisma.borrowerOrganizationLink.create({
    data: {
      borrowerId: params.borrowerId,
      organizationId: org.id,
      tenantId: params.tenantId,
    },
  });
  return org;
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
