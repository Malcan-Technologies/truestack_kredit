import { PrismaClient } from '@prisma/client';
// @ts-ignore - better-auth crypto module
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

// Default required documents template
const DEFAULT_REQUIRED_DOCUMENTS = [
  { key: 'IC_FRONT', label: 'IC Front', required: true },
  { key: 'IC_BACK', label: 'IC Back', required: true },
  { key: 'PAYSLIP', label: 'Payslip (last 3 months)', required: true },
  { key: 'BANK_STATEMENT', label: 'Bank Statement', required: false },
  { key: 'EMPLOYMENT_LETTER', label: 'Employment Letter', required: false },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo tenant (PPW - Money Lender)
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company Sdn Bhd',
      slug: 'demo-company',
      type: 'PPW', // Pemberi Pinjam Wang (Money Lender)
      licenseNumber: 'PPW/KL/2024/001',
      registrationNumber: '202401012345',
      email: 'info@demo-company.com',
      contactNumber: '+60312345678',
      businessAddress: '123 Jalan Demo, 50000 Kuala Lumpur',
      status: 'ACTIVE',
    },
  });

  console.log('✓ Created tenant:', tenant.name);

  // Create a second demo tenant for testing multi-tenant (also PPW for now)
  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'acme-lending' },
    update: {},
    create: {
      name: 'ACME Lending Sdn Bhd',
      slug: 'acme-lending',
      type: 'PPW', // Pemberi Pinjam Wang (Money Lender) - PPG support coming later
      licenseNumber: 'PPW/SEL/2024/042',
      registrationNumber: '202401054321',
      email: 'info@acme-lending.com',
      contactNumber: '+60387654321',
      businessAddress: '456 Jalan ACME, 40000 Shah Alam',
      status: 'ACTIVE',
    },
  });

  console.log('✓ Created tenant:', tenant2.name);

  // Hash password using Better Auth's scrypt (same as login verification)
  const passwordHash = await hashPassword('Demo@123');
  
  // Check if user already exists
  let owner = await prisma.user.findUnique({
    where: { email: 'admin@demo.com' },
  });

  if (!owner) {
    owner = await prisma.user.create({
      data: {
        email: 'admin@demo.com',
        emailVerified: true,
        name: 'Demo Admin',
        isActive: true,
      },
    });

    // Create credential account for the user (Better Auth stores password here)
    await prisma.account.create({
      data: {
        userId: owner.id,
        accountId: owner.id,
        providerId: 'credential',
        password: passwordHash,
      },
    });
  }

  console.log('✓ Created user:', owner.email);

  // Create membership for owner in first tenant
  const membership = await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: owner.id,
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      userId: owner.id,
      tenantId: tenant.id,
      role: 'OWNER',
      isActive: true,
    },
  });

  console.log('✓ Created membership: OWNER in', tenant.name);

  // Also add this user as ADMIN in the second tenant (to test multi-tenant)
  await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: owner.id,
        tenantId: tenant2.id,
      },
    },
    update: {},
    create: {
      userId: owner.id,
      tenantId: tenant2.id,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✓ Created membership: ADMIN in', tenant2.name);

  // Create subscriptions for both tenants (30-day trial)
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      plan: 'trial',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant2.id },
    update: {},
    create: {
      tenantId: tenant2.id,
      plan: 'trial',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  console.log('✓ Created subscriptions');

  // Corporate required documents template
  const CORPORATE_REQUIRED_DOCUMENTS = [
    { key: 'SSM_CERT', label: 'SSM Certificate', required: true },
    { key: 'FORM_9', label: 'Form 9 (Company Constitution)', required: true },
    { key: 'FORM_24', label: 'Form 24 (Directors Info)', required: true },
    { key: 'FORM_49', label: 'Form 49 (Company Secretary)', required: true },
    { key: 'BANK_STATEMENT', label: 'Company Bank Statement (3 months)', required: true },
    { key: 'FINANCIAL_STATEMENT', label: 'Latest Financial Statement', required: false },
  ];

  // Create demo products for first tenant with fee configuration
  const flatProduct = await prisma.product.upsert({
    where: {
      id: 'demo-flat-product',
    },
    update: {
      // Update existing products with new fields
      legalFeeType: 'FIXED',
      legalFeeValue: 150,
      stampingFeeType: 'PERCENTAGE',
      stampingFeeValue: 0.5, // 0.5% of loan amount
      requiredDocuments: DEFAULT_REQUIRED_DOCUMENTS,
      eligibleBorrowerTypes: 'BOTH',
      loanScheduleType: 'JADUAL_J',
    },
    create: {
      id: 'demo-flat-product',
      tenantId: tenant.id,
      name: 'Personal Loan (Flat Rate)',
      description: 'Standard personal loan with flat interest rate',
      interestModel: 'FLAT',
      interestRate: 18.0,
      latePaymentRate: 8.0,
      arrearsPeriod: 14,
      defaultPeriod: 28,
      minAmount: 1000,
      maxAmount: 50000,
      minTerm: 6,
      maxTerm: 60,
      isActive: true,
      // Fee configuration
      legalFeeType: 'FIXED',
      legalFeeValue: 150,
      stampingFeeType: 'PERCENTAGE',
      stampingFeeValue: 0.5, // 0.5% of loan amount
      requiredDocuments: DEFAULT_REQUIRED_DOCUMENTS,
      // Eligibility and loan type
      eligibleBorrowerTypes: 'BOTH',
      loanScheduleType: 'JADUAL_J',
    },
  });

  const decliningProduct = await prisma.product.upsert({
    where: {
      id: 'demo-declining-product',
    },
    update: {
      // Update existing products with new fields
      legalFeeType: 'PERCENTAGE',
      legalFeeValue: 1.0, // 1% of loan amount
      stampingFeeType: 'FIXED',
      stampingFeeValue: 200,
      requiredDocuments: [
        ...DEFAULT_REQUIRED_DOCUMENTS,
        { key: 'PROPERTY_DOCS', label: 'Property Documents', required: true },
      ],
      eligibleBorrowerTypes: 'INDIVIDUAL',
      loanScheduleType: 'JADUAL_K',
      interestRate: 12.0, // Jadual K max rate
    },
    create: {
      id: 'demo-declining-product',
      tenantId: tenant.id,
      name: 'Home Improvement Loan (Secured)',
      description: 'Reducing balance loan with collateral for home improvements',
      interestModel: 'DECLINING_BALANCE',
      interestRate: 12.0, // Jadual K max rate
      latePaymentRate: 8.0,
      arrearsPeriod: 14,
      defaultPeriod: 28,
      minAmount: 5000,
      maxAmount: 100000,
      minTerm: 12,
      maxTerm: 84,
      isActive: true,
      // Fee configuration
      legalFeeType: 'PERCENTAGE',
      legalFeeValue: 1.0, // 1% of loan amount
      stampingFeeType: 'FIXED',
      stampingFeeValue: 200,
      requiredDocuments: [
        ...DEFAULT_REQUIRED_DOCUMENTS,
        { key: 'PROPERTY_DOCS', label: 'Property Documents', required: true },
      ],
      // Eligibility and loan type
      eligibleBorrowerTypes: 'INDIVIDUAL',
      loanScheduleType: 'JADUAL_K',
    },
  });

  // Corporate-only product
  const corporateProduct = await prisma.product.upsert({
    where: {
      id: 'demo-corporate-product',
    },
    update: {
      legalFeeType: 'PERCENTAGE',
      legalFeeValue: 1.5, // 1.5% of loan amount
      stampingFeeType: 'FIXED',
      stampingFeeValue: 500,
      requiredDocuments: CORPORATE_REQUIRED_DOCUMENTS,
      eligibleBorrowerTypes: 'CORPORATE',
      loanScheduleType: 'JADUAL_J',
    },
    create: {
      id: 'demo-corporate-product',
      tenantId: tenant.id,
      name: 'Business Working Capital',
      description: 'Working capital financing for SMEs and businesses',
      interestModel: 'FLAT',
      interestRate: 15.0,
      latePaymentRate: 10.0,
      arrearsPeriod: 21,
      defaultPeriod: 42,
      minAmount: 10000,
      maxAmount: 250000,
      minTerm: 6,
      maxTerm: 36,
      isActive: true,
      // Fee configuration
      legalFeeType: 'PERCENTAGE',
      legalFeeValue: 1.5, // 1.5% of loan amount
      stampingFeeType: 'FIXED',
      stampingFeeValue: 500,
      requiredDocuments: CORPORATE_REQUIRED_DOCUMENTS,
      // Eligibility and loan type
      eligibleBorrowerTypes: 'CORPORATE',
      loanScheduleType: 'JADUAL_J',
    },
  });

  console.log('✓ Created products:', flatProduct.name, ',', decliningProduct.name, ',', corporateProduct.name);

  // Create demo borrowers for first tenant with full compliance fields
  const borrower1 = await prisma.borrower.upsert({
    where: {
      tenantId_icNumber: {
        tenantId: tenant.id,
        icNumber: '880101011234',
      },
    },
    update: {
      // Update with full fields
      documentType: 'IC',
      documentVerified: true,
      verifiedAt: new Date(),
      verifiedBy: 'SEED_DATA',
      dateOfBirth: new Date('1988-01-01'),
      gender: 'MALE',
      race: 'MELAYU',
      educationLevel: 'DEGREE',
      occupation: 'Software Engineer',
      employmentStatus: 'EMPLOYED',
      bankName: 'MAYBANK',
      bankAccountNo: '1234567890',
      monthlyIncome: 8500,
      emergencyContactName: 'Fatimah binti Ahmad',
      emergencyContactPhone: '+60123456000',
      emergencyContactRelationship: 'SPOUSE',
    },
    create: {
      tenantId: tenant.id,
      name: 'Ahmad bin Abdullah',
      icNumber: '880101011234', // IC number without dashes (12 digits)
      phone: '+60123456789',
      email: 'ahmad@example.com',
      address: '123 Jalan Merdeka, 50450 Kuala Lumpur',
      documentType: 'IC',
      documentVerified: true,
      verifiedAt: new Date(),
      verifiedBy: 'SEED_DATA',
      dateOfBirth: new Date('1988-01-01'),
      gender: 'MALE',
      race: 'MELAYU',
      educationLevel: 'DEGREE',
      occupation: 'Software Engineer',
      employmentStatus: 'EMPLOYED',
      bankName: 'MAYBANK',
      bankAccountNo: '1234567890',
      monthlyIncome: 8500,
      emergencyContactName: 'Fatimah binti Ahmad',
      emergencyContactPhone: '+60123456000',
      emergencyContactRelationship: 'SPOUSE',
    },
  });

  const borrower2 = await prisma.borrower.upsert({
    where: {
      tenantId_icNumber: {
        tenantId: tenant.id,
        icNumber: '900515145678',
      },
    },
    update: {
      // Update with full fields
      documentType: 'IC',
      documentVerified: false, // Manual verification
      dateOfBirth: new Date('1990-05-15'),
      gender: 'FEMALE',
      race: 'MELAYU',
      educationLevel: 'DIPLOMA',
      occupation: 'Accountant',
      employmentStatus: 'EMPLOYED',
      bankName: 'CIMB',
      bankAccountNo: '9876543210',
      monthlyIncome: 5500,
      emergencyContactName: 'Mohd bin Ibrahim',
      emergencyContactPhone: '+60198765000',
      emergencyContactRelationship: 'PARENT',
    },
    create: {
      tenantId: tenant.id,
      name: 'Siti binti Mohd',
      icNumber: '900515145678', // IC number without dashes (12 digits)
      phone: '+60198765432',
      email: 'siti@example.com',
      address: '456 Jalan Bukit Bintang, 55100 Kuala Lumpur',
      documentType: 'IC',
      documentVerified: false,
      dateOfBirth: new Date('1990-05-15'),
      gender: 'FEMALE',
      race: 'MELAYU',
      educationLevel: 'DIPLOMA',
      occupation: 'Accountant',
      employmentStatus: 'EMPLOYED',
      bankName: 'CIMB',
      bankAccountNo: '9876543210',
      monthlyIncome: 5500,
      emergencyContactName: 'Mohd bin Ibrahim',
      emergencyContactPhone: '+60198765000',
      emergencyContactRelationship: 'PARENT',
    },
  });

  // Create a third borrower with passport (non-Malaysian)
  const borrower3 = await prisma.borrower.upsert({
    where: {
      tenantId_icNumber: {
        tenantId: tenant.id,
        icNumber: 'A12345678',
      },
    },
    update: {
      documentType: 'PASSPORT',
      documentVerified: false,
      dateOfBirth: new Date('1985-08-20'),
      gender: 'MALE',
      race: 'BUKAN_WARGANEGARA',
      educationLevel: 'POSTGRADUATE',
      occupation: 'Business Consultant',
      employmentStatus: 'SELF_EMPLOYED',
      bankName: 'HSBC',
      bankAccountNo: '1122334455',
      monthlyIncome: 15000,
    },
    create: {
      tenantId: tenant.id,
      name: 'John Smith',
      icNumber: 'A12345678', // Passport number
      phone: '+60112233445',
      email: 'john.smith@example.com',
      address: '789 Jalan Ampang, 50450 Kuala Lumpur',
      documentType: 'PASSPORT',
      documentVerified: false,
      dateOfBirth: new Date('1985-08-20'),
      gender: 'MALE',
      race: 'BUKAN_WARGANEGARA',
      educationLevel: 'POSTGRADUATE',
      occupation: 'Business Consultant',
      employmentStatus: 'SELF_EMPLOYED',
      bankName: 'HSBC',
      bankAccountNo: '1122334455',
      monthlyIncome: 15000,
    },
  });

  // Create a corporate borrower
  const corporateBorrower = await prisma.borrower.upsert({
    where: {
      tenantId_icNumber: {
        tenantId: tenant.id,
        icNumber: '202201012345', // SSM number
      },
    },
    update: {
      borrowerType: 'CORPORATE',
      documentType: 'SSM',
      documentVerified: true,
      verifiedAt: new Date(),
      verifiedBy: 'SEED_DATA',
      companyName: 'Tech Solutions Sdn Bhd',
      ssmRegistrationNo: '202201012345',
      businessAddress: '100 Jalan Tech, Cyberjaya, 63000 Selangor',
      authorizedRepName: 'Ahmad bin Abdullah',
      authorizedRepIc: '880101011234',
      companyPhone: '+60312340000',
      companyEmail: 'info@techsolutions.com.my',
      natureOfBusiness: 'IT Services & Software Development',
      dateOfIncorporation: new Date('2022-01-01'),
      paidUpCapital: 100000,
      numberOfEmployees: 25,
      bankName: 'MAYBANK',
      bankAccountNo: '5544332211',
    },
    create: {
      tenantId: tenant.id,
      name: 'Ahmad bin Abdullah', // Authorized representative
      icNumber: '202201012345', // SSM number as unique identifier
      phone: '+60312340000',
      email: 'info@techsolutions.com.my',
      address: '100 Jalan Tech, Cyberjaya, 63000 Selangor',
      borrowerType: 'CORPORATE',
      documentType: 'SSM',
      documentVerified: true,
      verifiedAt: new Date(),
      verifiedBy: 'SEED_DATA',
      companyName: 'Tech Solutions Sdn Bhd',
      ssmRegistrationNo: '202201012345',
      businessAddress: '100 Jalan Tech, Cyberjaya, 63000 Selangor',
      authorizedRepName: 'Ahmad bin Abdullah',
      authorizedRepIc: '880101011234',
      companyPhone: '+60312340000',
      companyEmail: 'info@techsolutions.com.my',
      natureOfBusiness: 'IT Services & Software Development',
      dateOfIncorporation: new Date('2022-01-01'),
      paidUpCapital: 100000,
      numberOfEmployees: 25,
      bankName: 'MAYBANK',
      bankAccountNo: '5544332211',
    },
  });

  console.log('✓ Created borrowers:', borrower1.name, ',', borrower2.name, ',', borrower3.name, ',', corporateBorrower.companyName);

  // Create demo loan applications
  const application1 = await prisma.loanApplication.upsert({
    where: { id: 'demo-application-1' },
    update: {},
    create: {
      id: 'demo-application-1',
      tenantId: tenant.id,
      borrowerId: borrower1.id,
      productId: flatProduct.id,
      amount: 10000,
      term: 12,
      status: 'DRAFT',
      notes: 'Demo loan application for testing - personal loan',
    },
  });

  // Create a submitted application
  const application2 = await prisma.loanApplication.upsert({
    where: { id: 'demo-application-2' },
    update: {},
    create: {
      id: 'demo-application-2',
      tenantId: tenant.id,
      borrowerId: borrower2.id,
      productId: flatProduct.id,
      amount: 25000,
      term: 24,
      status: 'SUBMITTED',
      notes: 'Submitted for review - awaiting approval',
    },
  });

  console.log('✓ Created loan applications:', application1.id, ',', application2.id);

  // Create audit logs for the applications
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        memberId: membership.id,
        action: 'CREATE',
        entityType: 'LoanApplication',
        entityId: application1.id,
        newData: {
          borrowerId: borrower1.id,
          borrowerName: borrower1.name,
          productId: flatProduct.id,
          productName: flatProduct.name,
          amount: 10000,
          term: 12,
          status: 'DRAFT',
        },
      },
      {
        tenantId: tenant.id,
        memberId: membership.id,
        action: 'CREATE',
        entityType: 'LoanApplication',
        entityId: application2.id,
        newData: {
          borrowerId: borrower2.id,
          borrowerName: borrower2.name,
          productId: flatProduct.id,
          productName: flatProduct.name,
          amount: 25000,
          term: 24,
          status: 'DRAFT',
        },
      },
      {
        tenantId: tenant.id,
        memberId: membership.id,
        action: 'SUBMIT',
        entityType: 'LoanApplication',
        entityId: application2.id,
        previousData: { status: 'DRAFT' },
        newData: { status: 'SUBMITTED' },
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created audit logs');

  console.log('\n🎉 Seeding completed!');
  console.log('\n📝 Demo credentials:');
  console.log('   Email: admin@demo.com');
  console.log('   Password: Demo@123');
  console.log('\n📋 User has access to:');
  console.log('   - Demo Company Sdn Bhd (OWNER) - PPW (Money Lender)');
  console.log('   - ACME Lending Sdn Bhd (ADMIN) - PPW (Money Lender)');
  console.log('\n📦 Demo data created:');
  console.log('   - 3 Products with eligibility & loan type configuration');
  console.log('     • Personal Loan (Flat Rate) - Both borrowers, Jadual J');
  console.log('     • Home Improvement Loan (Secured) - Individual only, Jadual K');
  console.log('     • Business Working Capital - Corporate only, Jadual J');
  console.log('   - 4 Borrowers (2 IC, 1 Passport, 1 Corporate)');
  console.log('   - 2 Loan Applications (1 Draft, 1 Submitted)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
