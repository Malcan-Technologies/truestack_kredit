import { PrismaClient, TenantType } from '@prisma/client';
// @ts-ignore - better-auth crypto module
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

function getTenantType(value: string | undefined): TenantType {
  return value === 'PPG' ? TenantType.PPG : TenantType.PPW;
}

/**
 * Production seed:
 * - Creates/updates only ONE demo tenant (Pro license)
 * - Does not create borrowers, loans, products, or applications
 */
async function main() {
  console.log('Seeding production baseline data...');

  const now = new Date();
  const tenantSlug = process.env.PRO_TENANT_SLUG || 'demo-company';
  const tenantName = process.env.PRO_TENANT_NAME || 'Demo Company Sdn Bhd';
  const tenantType = getTenantType(process.env.PRO_TENANT_TYPE);
  const tenantLicenseNumber = process.env.PRO_TENANT_LICENSE_NUMBER || 'PPW/KL/2024/001';
  const tenantRegistrationNumber = process.env.PRO_TENANT_REGISTRATION_NUMBER || '202401012345';
  const tenantEmail = process.env.PRO_TENANT_EMAIL || 'info@demo-company.com';
  const tenantContactNumber = process.env.PRO_TENANT_CONTACT_NUMBER || '+60312345678';
  const tenantBusinessAddress =
    process.env.PRO_TENANT_BUSINESS_ADDRESS || '123 Jalan Demo, 50000 Kuala Lumpur';
  const ownerEmail = process.env.PRO_SEED_OWNER_EMAIL || process.env.PROD_DEMO_OWNER_EMAIL || 'admin@demo.com';
  const ownerName = process.env.PRO_SEED_OWNER_NAME || process.env.PROD_DEMO_OWNER_NAME || 'Demo Owner';
  const ownerPassword = 'Demo@123';
  const passwordHash = await hashPassword(ownerPassword);

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      name: tenantName,
      type: tenantType,
      licenseNumber: tenantLicenseNumber,
      registrationNumber: tenantRegistrationNumber,
      email: tenantEmail,
      contactNumber: tenantContactNumber,
      businessAddress: tenantBusinessAddress,
      status: 'ACTIVE',
      proLicenseActivatedAt: now,
    },
    create: {
      name: tenantName,
      slug: tenantSlug,
      type: tenantType,
      licenseNumber: tenantLicenseNumber,
      registrationNumber: tenantRegistrationNumber,
      email: tenantEmail,
      contactNumber: tenantContactNumber,
      businessAddress: tenantBusinessAddress,
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
