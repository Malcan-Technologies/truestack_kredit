import { PrismaClient } from '@prisma/client';
// @ts-ignore - better-auth crypto module
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

/**
 * Production seed:
 * - Creates/updates only ONE demo tenant (Pro license)
 * - Does not create borrowers, loans, products, or applications
 */
async function main() {
  console.log('Seeding production baseline data...');

  const now = new Date();
  const ownerEmail = process.env.PROD_DEMO_OWNER_EMAIL || 'admin@demo.com';
  const ownerName = process.env.PROD_DEMO_OWNER_NAME || 'Demo Owner';
  const ownerPassword = 'Demo@123';
  const passwordHash = await hashPassword(ownerPassword);

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
      proLicenseActivatedAt: now,
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
      proLicenseActivatedAt: now,
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

  const updatedCredentialAccounts = await prisma.account.updateMany({
    where: {
      userId: owner.id,
      providerId: 'credential',
    },
    data: {
      accountId: owner.id,
      password: passwordHash,
    },
  });

  if (updatedCredentialAccounts.count === 0) {
    await prisma.account.create({
      data: {
        userId: owner.id,
        accountId: owner.id,
        providerId: 'credential',
        password: passwordHash,
      },
    });
  }

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
  console.log(`Credential account: ${updatedCredentialAccounts.count > 0 ? 'updated' : 'created'}`);
  console.log('Owner password: Demo@123 (starter password - change after first login)');
  console.log(`Pro license activated: ${tenant.proLicenseActivatedAt.toISOString()}`);
}

main()
  .catch((error) => {
    console.error('Production seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
