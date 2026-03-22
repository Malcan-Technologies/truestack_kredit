/**
 * Seed 500 loans for plan billing testing.
 * Reuses existing borrowers and products. Run: npx tsx scripts/seed-500-loans.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOANS_TO_CREATE = 500;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function main() {
  console.log(`\n🌱 Seeding ${LOANS_TO_CREATE} loans (load test)...\n`);

  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!tenant) {
    throw new Error("No active tenant found. Run db:seed first.");
  }

  const borrowers = await prisma.borrower.findMany({
    where: { tenantId: tenant.id },
    take: 10,
  });
  if (borrowers.length === 0) {
    throw new Error("No borrowers found. Run db:seed first.");
  }

  const product = await prisma.product.findFirst({
    where: { tenantId: tenant.id, isActive: true },
  });
  if (!product) {
    throw new Error("No product found. Run db:seed first.");
  }

  console.log(`✓ Using tenant: ${tenant.name}`);
  console.log(`✓ Reusing ${borrowers.length} borrowers`);
  console.log(`✓ Using product: ${product.name}\n`);

  const disbursementDate = new Date();
  disbursementDate.setMonth(disbursementDate.getMonth() - 2); // 2 months ago
  const principal = 5000;
  const interestRate = 18;
  const term = 12;
  const totalInterest = principal * (interestRate / 100) * (term / 12);
  const monthlyPayment = (principal + totalInterest) / term;
  const monthlyPrincipal = principal / term;
  const monthlyInterest = totalInterest / term;

  let created = 0;
  const batchSize = 50;

  for (let batch = 0; batch < Math.ceil(LOANS_TO_CREATE / batchSize); batch++) {
    const batchCount = Math.min(batchSize, LOANS_TO_CREATE - created);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < batchCount; i++) {
        const idx = created + i;
        const borrowerId = borrowers[idx % borrowers.length].id;
        const suffix = `bulk-${idx}`;

        const app = await tx.loanApplication.create({
          data: {
            tenantId: tenant.id,
            borrowerId,
            productId: product.id,
            amount: principal,
            term,
            status: "APPROVED",
            notes: `Bulk seed loan ${idx + 1} for plan billing test`,
          },
        });

        const loan = await tx.loan.create({
          data: {
            tenantId: tenant.id,
            borrowerId,
            productId: product.id,
            applicationId: app.id,
            principalAmount: principal,
            interestRate,
            term,
            status: "ACTIVE",
            disbursementDate,
          },
        });

        const scheduleVersion = await tx.loanScheduleVersion.create({
          data: {
            loanId: loan.id,
            version: 1,
            interestModel: "FLAT",
            inputs: {
              principal,
              interestRate,
              term,
              disbursementDate: disbursementDate.toISOString(),
            },
            outputsHash: `seed-bulk-${suffix}`,
          },
        });

        const repayments = Array.from({ length: term }, (_, j) => ({
          scheduleVersionId: scheduleVersion.id,
          dueDate: addMonths(disbursementDate, j + 1),
          principal: Math.round(monthlyPrincipal * 100) / 100,
          interest: Math.round(monthlyInterest * 100) / 100,
          totalDue: Math.round(monthlyPayment * 100) / 100,
          status: "PENDING" as const,
        }));

        await tx.loanRepayment.createMany({ data: repayments });
      }
    });

    created += batchCount;
    console.log(`  ✓ Created ${created}/${LOANS_TO_CREATE} loans`);
  }

  const totalLoans = await prisma.loan.count({ where: { tenantId: tenant.id } });
  console.log(`\n✅ Done! Tenant now has ${totalLoans} total loans.`);
  console.log(`   Plan billing: 500 loans = 1 block. You should see usage at 100%+ on the Plan page.\n`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
