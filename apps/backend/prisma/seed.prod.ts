import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Production seed:
 * - Creates/updates only ONE demo tenant
 * - Creates/updates the tenant subscription with long validity
 * - Does not create borrowers, loans, products, or applications
 */
async function main() {
  console.log('Seeding production baseline data...');

  const now = new Date();
  const longValidityEnd = new Date('2099-12-31T23:59:59.000Z');
  const ownerEmail = process.env.PROD_DEMO_OWNER_EMAIL || 'admin@demo.com';
  const ownerName = process.env.PROD_DEMO_OWNER_NAME || 'Demo Owner';

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {
      name: 'Demo Company Sdn Bhd',
      type: 'PPW',
      licenseNumber: 'PPW/KL/2024/001',
      registrationNumber: '202401012345',
      email: 'info@demo-company.com',
      contactNumber: '+60312345678',
      businessAddress: '123 Jalan Demo, 50000 Kuala Lumpur',
      status: 'ACTIVE',
      subscriptionStatus: 'PAID',
      subscriptionAmount: 49900,
      subscribedAt: now,
    },
    create: {
      name: 'Demo Company Sdn Bhd',
      slug: 'demo-company',
      type: 'PPW',
      licenseNumber: 'PPW/KL/2024/001',
      registrationNumber: '202401012345',
      email: 'info@demo-company.com',
      contactNumber: '+60312345678',
      businessAddress: '123 Jalan Demo, 50000 Kuala Lumpur',
      status: 'ACTIVE',
      subscriptionStatus: 'PAID',
      subscriptionAmount: 49900,
      subscribedAt: now,
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      plan: 'enterprise',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: longValidityEnd,
      gracePeriodEnd: null,
    },
    create: {
      tenantId: tenant.id,
      plan: 'enterprise',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: longValidityEnd,
      gracePeriodEnd: null,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      name: ownerName,
      emailVerified: true,
      isActive: true,
    },
    create: {
      email: ownerEmail,
      name: ownerName,
      emailVerified: true,
      isActive: true,
    },
  });

  await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: owner.id,
        tenantId: tenant.id,
      },
    },
    update: {
      role: 'OWNER',
      isActive: true,
    },
    create: {
      userId: owner.id,
      tenantId: tenant.id,
      role: 'OWNER',
      isActive: true,
    },
  });

  console.log('Production seed completed.');
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Owner: ${owner.email} (${owner.name || 'Owner'})`);
  console.log(`Subscription: enterprise, valid until ${longValidityEnd.toISOString()}`);
}

main()
  .catch((error) => {
    console.error('Production seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
