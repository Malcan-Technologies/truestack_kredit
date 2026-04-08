/**
 * One-off backfill: create Better Auth Organization + BorrowerOrganizationLink for every
 * CORPORATE borrower that is missing a link, and seed Member rows from existing BorrowerProfileLink.
 *
 * Owner rule: user with the earliest BorrowerProfileLink for that borrower (by createdAt).
 * Other linked users become "member".
 *
 * Run (from repo root): `npm run db:backfill:borrower-orgs -w @kredit/backend_pro`
 * Requires DATABASE_URL and a migrated schema (organization, member, invitation, borrowerOrganizationLink).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function orgDisplayName(companyName: string | null, name: string): string {
  return (companyName?.trim() || name.trim() || "Company").slice(0, 200);
}

async function main() {
  const corporates = await prisma.borrower.findMany({
    where: { borrowerType: "CORPORATE" },
    select: { id: true, tenantId: true, companyName: true, name: true },
  });

  let created = 0;
  let skippedExisting = 0;
  let skippedNoLinks = 0;
  const errors: Array<{ borrowerId: string; message: string }> = [];

  for (const b of corporates) {
    const existing = await prisma.borrowerOrganizationLink.findUnique({
      where: { borrowerId: b.id },
    });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const links = await prisma.borrowerProfileLink.findMany({
      where: { borrowerId: b.id },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (links.length === 0) {
      skippedNoLinks += 1;
      console.warn(`[backfill] borrower ${b.id} has no profile links; skipping org creation`);
      continue;
    }

    /** Earliest link per user */
    const firstByUser = new Map<string, Date>();
    for (const l of links) {
      if (!firstByUser.has(l.userId)) firstByUser.set(l.userId, l.createdAt);
    }
    const userIdsOrdered = [...firstByUser.entries()]
      .sort((a, b) => a[1].getTime() - b[1].getTime())
      .map(([userId]) => userId);

    const ownerUserId = userIdsOrdered[0];
    const rest = userIdsOrdered.slice(1);

    const displayName = orgDisplayName(b.companyName, b.name);
    const slug = `co-${b.id}`;

    try {
      await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: displayName,
            slug,
            metadata: JSON.stringify({ borrowerId: b.id }),
            members: {
              create: [
                { userId: ownerUserId, role: "owner" },
                ...rest.map((userId) => ({ userId, role: "member" as const })),
              ],
            },
          },
        });
        await tx.borrowerOrganizationLink.create({
          data: {
            borrowerId: b.id,
            organizationId: org.id,
            tenantId: b.tenantId,
          },
        });
      });
      created += 1;
      console.log(`[backfill] borrower ${b.id} -> org linked (${slug})`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ borrowerId: b.id, message });
      console.error(`[backfill] borrower ${b.id} failed:`, message);
    }
  }

  console.log(
    JSON.stringify(
      {
        corporates: corporates.length,
        created,
        skippedExisting,
        skippedNoLinks,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
