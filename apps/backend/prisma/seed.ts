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

  // Create a Jadual K application with collateral (secured loan)
  const application3 = await prisma.loanApplication.upsert({
    where: { id: 'demo-application-3' },
    update: {
      collateralType: 'Kenderaan - Proton X50 2024 (WA 1234 B)',
      collateralValue: 85000,
    },
    create: {
      id: 'demo-application-3',
      tenantId: tenant.id,
      borrowerId: borrower1.id,
      productId: decliningProduct.id,
      amount: 30000,
      term: 36,
      status: 'SUBMITTED',
      notes: 'Secured loan for home improvement - vehicle as collateral',
      collateralType: 'Kenderaan - Proton X50 2024 (WA 1234 B)',
      collateralValue: 85000,
    },
  });

  console.log('✓ Created loan applications:', application1.id, ',', application2.id, ',', application3.id);

  // ============================================
  // Create overdue test loans for late fee testing
  // ============================================
  console.log('\n🏦 Creating overdue test loans for late fee testing...');

  // Helper to create a date N days ago
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Helper to create a date N months ago on day 1
  const monthsAgo = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Helper to add months to a date
  const addMonths = (date: Date, months: number) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  };

  // Loan A: 2 repayments overdue by 7 days (within arrears period)
  const appA = await prisma.loanApplication.upsert({
    where: { id: 'demo-overdue-app-a' },
    update: {},
    create: {
      id: 'demo-overdue-app-a',
      tenantId: tenant.id,
      borrowerId: borrower1.id,
      productId: flatProduct.id,
      amount: 6000,
      term: 6,
      status: 'APPROVED',
      notes: 'Test loan - 7 days overdue (within arrears period)',
    },
  });

  const loanA = await prisma.loan.upsert({
    where: { applicationId: 'demo-overdue-app-a' },
    update: {},
    create: {
      id: 'demo-overdue-loan-a',
      tenantId: tenant.id,
      borrowerId: borrower1.id,
      productId: flatProduct.id,
      applicationId: appA.id,
      principalAmount: 6000,
      interestRate: 18.0,
      term: 6,
      status: 'ACTIVE',
      disbursementDate: monthsAgo(4), // Disbursed 4 months ago
    },
  });

  // Create schedule for Loan A
  const disbDateA = monthsAgo(4);
  const totalInterestA = 6000 * 0.18 * (6 / 12); // 540
  const monthlyPaymentA = (6000 + totalInterestA) / 6; // 1090
  const monthlyPrincipalA = 6000 / 6; // 1000
  const monthlyInterestA = totalInterestA / 6; // 90

  const scheduleVersionA = await prisma.loanScheduleVersion.upsert({
    where: { loanId_version: { loanId: loanA.id, version: 1 } },
    update: {},
    create: {
      loanId: loanA.id,
      version: 1,
      interestModel: 'FLAT',
      inputs: { principal: 6000, interestRate: 18, term: 6, disbursementDate: disbDateA.toISOString() },
      outputsHash: 'seed-hash-a',
    },
  });

  // Create 6 repayments, first 2 paid, next 2 overdue by 7 days
  for (let i = 1; i <= 6; i++) {
    const dueDate = addMonths(disbDateA, i);
    const isPaid = i <= 2; // First 2 months paid
    const repaymentId = `demo-repayment-a-${i}`;

    await prisma.loanRepayment.upsert({
      where: { id: repaymentId },
      update: {},
      create: {
        id: repaymentId,
        scheduleVersionId: scheduleVersionA.id,
        dueDate,
        principal: Math.round(monthlyPrincipalA * 100) / 100,
        interest: Math.round(monthlyInterestA * 100) / 100,
        totalDue: Math.round(monthlyPaymentA * 100) / 100,
        status: isPaid ? 'PAID' : 'PENDING',
      },
    });

    // Create payment allocations for paid months
    if (isPaid) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-a-${i}` },
        update: {},
        create: {
          id: `demo-alloc-a-${i}`,
          repaymentId,
          amount: Math.round(monthlyPaymentA * 100) / 100,
          allocatedAt: dueDate,
        },
      });
    }
  }

  console.log('  ✓ Loan A: 6-month loan, 2 paid, 2 overdue by ~7 days');

  // Loan B: 1 repayment overdue by 20 days (past arrears period of 14 days)
  const appB = await prisma.loanApplication.upsert({
    where: { id: 'demo-overdue-app-b' },
    update: {},
    create: {
      id: 'demo-overdue-app-b',
      tenantId: tenant.id,
      borrowerId: borrower2.id,
      productId: flatProduct.id,
      amount: 10000,
      term: 12,
      status: 'APPROVED',
      notes: 'Test loan - 20 days overdue (past arrears period)',
    },
  });

  const loanB = await prisma.loan.upsert({
    where: { applicationId: 'demo-overdue-app-b' },
    update: {},
    create: {
      id: 'demo-overdue-loan-b',
      tenantId: tenant.id,
      borrowerId: borrower2.id,
      productId: flatProduct.id,
      applicationId: appB.id,
      principalAmount: 10000,
      interestRate: 18.0,
      term: 12,
      status: 'ACTIVE',
      disbursementDate: monthsAgo(3), // Disbursed 3 months ago
    },
  });

  const disbDateB = monthsAgo(3);
  const totalInterestB = 10000 * 0.18 * (12 / 12); // 1800
  const monthlyPaymentB = (10000 + totalInterestB) / 12; // 983.33
  const monthlyPrincipalB = 10000 / 12;
  const monthlyInterestB = totalInterestB / 12;

  const scheduleVersionB = await prisma.loanScheduleVersion.upsert({
    where: { loanId_version: { loanId: loanB.id, version: 1 } },
    update: {},
    create: {
      loanId: loanB.id,
      version: 1,
      interestModel: 'FLAT',
      inputs: { principal: 10000, interestRate: 18, term: 12, disbursementDate: disbDateB.toISOString() },
      outputsHash: 'seed-hash-b',
    },
  });

  for (let i = 1; i <= 12; i++) {
    const dueDate = addMonths(disbDateB, i);
    const isPaid = i <= 2; // First 2 months paid
    const repaymentId = `demo-repayment-b-${i}`;

    await prisma.loanRepayment.upsert({
      where: { id: repaymentId },
      update: {},
      create: {
        id: repaymentId,
        scheduleVersionId: scheduleVersionB.id,
        dueDate,
        principal: Math.round(monthlyPrincipalB * 100) / 100,
        interest: Math.round(monthlyInterestB * 100) / 100,
        totalDue: Math.round(monthlyPaymentB * 100) / 100,
        status: isPaid ? 'PAID' : 'PENDING',
      },
    });

    if (isPaid) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-b-${i}` },
        update: {},
        create: {
          id: `demo-alloc-b-${i}`,
          repaymentId,
          amount: Math.round(monthlyPaymentB * 100) / 100,
          allocatedAt: dueDate,
        },
      });
    }
  }

  console.log('  ✓ Loan B: 12-month loan, 2 paid, 1 overdue by ~20 days');

  // Loan C: 1 repayment overdue by 35 days (past default period of 28 days)
  const appC = await prisma.loanApplication.upsert({
    where: { id: 'demo-overdue-app-c' },
    update: {},
    create: {
      id: 'demo-overdue-app-c',
      tenantId: tenant.id,
      borrowerId: borrower3.id,
      productId: flatProduct.id,
      amount: 15000,
      term: 12,
      status: 'APPROVED',
      notes: 'Test loan - 35 days overdue (past default period)',
    },
  });

  const loanC = await prisma.loan.upsert({
    where: { applicationId: 'demo-overdue-app-c' },
    update: {},
    create: {
      id: 'demo-overdue-loan-c',
      tenantId: tenant.id,
      borrowerId: borrower3.id,
      productId: flatProduct.id,
      applicationId: appC.id,
      principalAmount: 15000,
      interestRate: 18.0,
      term: 12,
      status: 'ACTIVE',
      disbursementDate: monthsAgo(4), // Disbursed 4 months ago
    },
  });

  const disbDateC = monthsAgo(4);
  const totalInterestC = 15000 * 0.18 * (12 / 12); // 2700
  const monthlyPaymentC = (15000 + totalInterestC) / 12; // 1475
  const monthlyPrincipalC = 15000 / 12;
  const monthlyInterestC = totalInterestC / 12;

  const scheduleVersionC = await prisma.loanScheduleVersion.upsert({
    where: { loanId_version: { loanId: loanC.id, version: 1 } },
    update: {},
    create: {
      loanId: loanC.id,
      version: 1,
      interestModel: 'FLAT',
      inputs: { principal: 15000, interestRate: 18, term: 12, disbursementDate: disbDateC.toISOString() },
      outputsHash: 'seed-hash-c',
    },
  });

  for (let i = 1; i <= 12; i++) {
    const dueDate = addMonths(disbDateC, i);
    const isPaid = i <= 2; // First 2 months paid
    const repaymentId = `demo-repayment-c-${i}`;

    await prisma.loanRepayment.upsert({
      where: { id: repaymentId },
      update: {},
      create: {
        id: repaymentId,
        scheduleVersionId: scheduleVersionC.id,
        dueDate,
        principal: Math.round(monthlyPrincipalC * 100) / 100,
        interest: Math.round(monthlyInterestC * 100) / 100,
        totalDue: Math.round(monthlyPaymentC * 100) / 100,
        status: isPaid ? 'PAID' : 'PENDING',
      },
    });

    if (isPaid) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-c-${i}` },
        update: {},
        create: {
          id: `demo-alloc-c-${i}`,
          repaymentId,
          amount: Math.round(monthlyPaymentC * 100) / 100,
          allocatedAt: dueDate,
        },
      });
    }
  }

  console.log('  ✓ Loan C: 12-month loan, 2 paid, 1+ overdue by ~35 days');

  // ============================================
  // Loan D: Just entered arrears period (16 days overdue, arrearsPeriod=14)
  // Due date: Jan 23 2026 → 16 days overdue on Feb 8
  // ============================================
  const appD = await prisma.loanApplication.upsert({
    where: { id: 'demo-overdue-app-d' },
    update: {},
    create: {
      id: 'demo-overdue-app-d',
      tenantId: tenant.id,
      borrowerId: borrower2.id,
      productId: flatProduct.id,
      amount: 8000,
      term: 12,
      status: 'APPROVED',
      notes: 'Test loan - 16 days overdue (just entered arrears period)',
    },
  });

  const disbDateD = new Date('2025-10-23'); // Disbursed Oct 23, first due Nov 23
  const loanD = await prisma.loan.upsert({
    where: { applicationId: 'demo-overdue-app-d' },
    update: {},
    create: {
      id: 'demo-overdue-loan-d',
      tenantId: tenant.id,
      borrowerId: borrower2.id,
      productId: flatProduct.id,
      applicationId: appD.id,
      principalAmount: 8000,
      interestRate: 18.0,
      term: 12,
      status: 'ACTIVE',
      disbursementDate: disbDateD,
    },
  });

  const totalInterestD = 8000 * 0.18 * (12 / 12); // 1440
  const monthlyPaymentD = (8000 + totalInterestD) / 12; // 786.67
  const monthlyPrincipalD = 8000 / 12;
  const monthlyInterestD = totalInterestD / 12;

  const scheduleVersionD = await prisma.loanScheduleVersion.upsert({
    where: { loanId_version: { loanId: loanD.id, version: 1 } },
    update: {},
    create: {
      loanId: loanD.id,
      version: 1,
      interestModel: 'FLAT',
      inputs: { principal: 8000, interestRate: 18, term: 12, disbursementDate: disbDateD.toISOString() },
      outputsHash: 'seed-hash-d',
    },
  });

  // 12 repayments: due Nov 23, Dec 23, Jan 23, Feb 23...
  // First 2 paid (Nov, Dec), Jan 23 is 16 days overdue on Feb 8
  for (let i = 1; i <= 12; i++) {
    const dueDate = addMonths(disbDateD, i);
    const isPaid = i <= 2; // Nov and Dec paid
    const repaymentId = `demo-repayment-d-${i}`;

    await prisma.loanRepayment.upsert({
      where: { id: repaymentId },
      update: {},
      create: {
        id: repaymentId,
        scheduleVersionId: scheduleVersionD.id,
        dueDate,
        principal: Math.round(monthlyPrincipalD * 100) / 100,
        interest: Math.round(monthlyInterestD * 100) / 100,
        totalDue: Math.round(monthlyPaymentD * 100) / 100,
        status: isPaid ? 'PAID' : 'PENDING',
      },
    });

    if (isPaid) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-d-${i}` },
        update: {},
        create: {
          id: `demo-alloc-d-${i}`,
          repaymentId,
          amount: Math.round(monthlyPaymentD * 100) / 100,
          allocatedAt: dueDate,
        },
      });
    }
  }

  console.log('  ✓ Loan D: 12-month loan, 2 paid, 1 overdue by 16 days (just in arrears)');

  // ============================================
  // Loan E: Deep in arrears with multiple months unpaid (25 days + second month overdue)
  // Disbursed Sep 15, first due Oct 15. Oct+Nov paid, Dec 15 is 55 days overdue, Jan 15 is 24 days
  // ============================================
  const appE = await prisma.loanApplication.upsert({
    where: { id: 'demo-overdue-app-e' },
    update: {},
    create: {
      id: 'demo-overdue-app-e',
      tenantId: tenant.id,
      borrowerId: borrower1.id,
      productId: flatProduct.id,
      amount: 12000,
      term: 12,
      status: 'APPROVED',
      notes: 'Test loan - multiple months overdue, deep arrears',
    },
  });

  const disbDateE = new Date('2025-09-15');
  const loanE = await prisma.loan.upsert({
    where: { applicationId: 'demo-overdue-app-e' },
    update: {},
    create: {
      id: 'demo-overdue-loan-e',
      tenantId: tenant.id,
      borrowerId: borrower1.id,
      productId: flatProduct.id,
      applicationId: appE.id,
      principalAmount: 12000,
      interestRate: 18.0,
      term: 12,
      status: 'ACTIVE',
      disbursementDate: disbDateE,
    },
  });

  const totalInterestE = 12000 * 0.18 * (12 / 12); // 2160
  const monthlyPaymentE = (12000 + totalInterestE) / 12; // 1180
  const monthlyPrincipalE = 12000 / 12;
  const monthlyInterestE = totalInterestE / 12;

  const scheduleVersionE = await prisma.loanScheduleVersion.upsert({
    where: { loanId_version: { loanId: loanE.id, version: 1 } },
    update: {},
    create: {
      loanId: loanE.id,
      version: 1,
      interestModel: 'FLAT',
      inputs: { principal: 12000, interestRate: 18, term: 12, disbursementDate: disbDateE.toISOString() },
      outputsHash: 'seed-hash-e',
    },
  });

  // Due dates: Oct 15, Nov 15, Dec 15, Jan 15, Feb 15...
  // Oct + Nov paid, Dec 15 (55 days overdue) + Jan 15 (24 days overdue) unpaid
  for (let i = 1; i <= 12; i++) {
    const dueDate = addMonths(disbDateE, i);
    const isPaid = i <= 2; // Oct and Nov paid
    const repaymentId = `demo-repayment-e-${i}`;

    await prisma.loanRepayment.upsert({
      where: { id: repaymentId },
      update: {},
      create: {
        id: repaymentId,
        scheduleVersionId: scheduleVersionE.id,
        dueDate,
        principal: Math.round(monthlyPrincipalE * 100) / 100,
        interest: Math.round(monthlyInterestE * 100) / 100,
        totalDue: Math.round(monthlyPaymentE * 100) / 100,
        status: isPaid ? 'PAID' : 'PENDING',
      },
    });

    if (isPaid) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-e-${i}` },
        update: {},
        create: {
          id: `demo-alloc-e-${i}`,
          repaymentId,
          amount: Math.round(monthlyPaymentE * 100) / 100,
          allocatedAt: dueDate,
        },
      });
    }
  }

  console.log('  ✓ Loan E: 12-month loan, 2 paid, 2 overdue (Dec 15 = 55 days, Jan 15 = 24 days)');

  // ============================================
  // Loan F: Partially paid repayment in arrears (borrower paid half, still overdue)
  // Disbursed Nov 1, first due Dec 1. Dec paid, Jan 1 partially paid (RM 500 of RM 841.67)
  // ============================================
  const appF = await prisma.loanApplication.upsert({
    where: { id: 'demo-overdue-app-f' },
    update: {},
    create: {
      id: 'demo-overdue-app-f',
      tenantId: tenant.id,
      borrowerId: borrower3.id,
      productId: flatProduct.id,
      amount: 5000,
      term: 6,
      status: 'APPROVED',
      notes: 'Test loan - partial payment, still in arrears',
    },
  });

  const disbDateF = new Date('2025-11-01');
  const loanF = await prisma.loan.upsert({
    where: { applicationId: 'demo-overdue-app-f' },
    update: {},
    create: {
      id: 'demo-overdue-loan-f',
      tenantId: tenant.id,
      borrowerId: borrower3.id,
      productId: flatProduct.id,
      applicationId: appF.id,
      principalAmount: 5000,
      interestRate: 18.0,
      term: 6,
      status: 'ACTIVE',
      disbursementDate: disbDateF,
    },
  });

  const totalInterestF = 5000 * 0.18 * (6 / 12); // 450
  const monthlyPaymentF = (5000 + totalInterestF) / 6; // 908.33
  const monthlyPrincipalF = 5000 / 6;
  const monthlyInterestF = totalInterestF / 6;

  const scheduleVersionF = await prisma.loanScheduleVersion.upsert({
    where: { loanId_version: { loanId: loanF.id, version: 1 } },
    update: {},
    create: {
      loanId: loanF.id,
      version: 1,
      interestModel: 'FLAT',
      inputs: { principal: 5000, interestRate: 18, term: 6, disbursementDate: disbDateF.toISOString() },
      outputsHash: 'seed-hash-f',
    },
  });

  // Due dates: Dec 1, Jan 1, Feb 1...
  // Dec paid, Jan 1 partially paid (500 of 908.33), Feb 1 not yet due
  for (let i = 1; i <= 6; i++) {
    const dueDate = addMonths(disbDateF, i);
    const isPaid = i <= 1; // Dec paid
    const isPartial = i === 2; // Jan partially paid
    const repaymentId = `demo-repayment-f-${i}`;

    await prisma.loanRepayment.upsert({
      where: { id: repaymentId },
      update: {},
      create: {
        id: repaymentId,
        scheduleVersionId: scheduleVersionF.id,
        dueDate,
        principal: Math.round(monthlyPrincipalF * 100) / 100,
        interest: Math.round(monthlyInterestF * 100) / 100,
        totalDue: Math.round(monthlyPaymentF * 100) / 100,
        status: isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'PENDING',
      },
    });

    if (isPaid) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-f-${i}` },
        update: {},
        create: {
          id: `demo-alloc-f-${i}`,
          repaymentId,
          amount: Math.round(monthlyPaymentF * 100) / 100,
          allocatedAt: dueDate,
        },
      });
    }

    // Partial payment on Jan 1 repayment
    if (isPartial) {
      await prisma.paymentAllocation.upsert({
        where: { id: `demo-alloc-f-${i}-partial` },
        update: {},
        create: {
          id: `demo-alloc-f-${i}-partial`,
          repaymentId,
          amount: 500, // Paid 500 of 908.33
          allocatedAt: new Date('2026-01-10'), // Paid on Jan 10
        },
      });
    }
  }

  console.log('  ✓ Loan F: 6-month loan, 1 paid, 1 partially paid (Jan 1 = 38 days overdue, RM 500/908.33 paid)');

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
      {
        tenantId: tenant.id,
        memberId: membership.id,
        action: 'CREATE',
        entityType: 'LoanApplication',
        entityId: application3.id,
        newData: {
          borrowerId: borrower1.id,
          borrowerName: borrower1.name,
          productId: decliningProduct.id,
          productName: decliningProduct.name,
          amount: 30000,
          term: 36,
          status: 'DRAFT',
          collateralType: 'Kenderaan - Proton X50 2024 (WA 1234 B)',
          collateralValue: 85000,
        },
      },
      {
        tenantId: tenant.id,
        memberId: membership.id,
        action: 'SUBMIT',
        entityType: 'LoanApplication',
        entityId: application3.id,
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
  console.log('   - 3 Loan Applications (1 Draft, 2 Submitted)');
  console.log('     • 1 Jadual K application with collateral (Kenderaan)');
  console.log('   - 6 Overdue Test Loans (for late fee testing):');
  console.log('     • Loan A: ~7 days overdue (within arrears period - late fees only)');
  console.log('     • Loan B: ~20 days overdue (past arrears period - should enter arrears)');
  console.log('     • Loan C: ~35 days overdue (past default period - ready for default)');
  console.log('     • Loan D: ~16 days overdue (just entered arrears period)');
  console.log('     • Loan E: 2 months unpaid (Dec 15 = 55 days, Jan 15 = 24 days - deep arrears)');
  console.log('     • Loan F: Partial payment (Jan 1 = 38 days, RM 500/908.33 paid)');
  console.log('\n💡 To test late fees:');
  console.log('   1. Run the seed, then click "Process Late Fees" on the Loans page');
  console.log('   2. Or wait for the cron job at 12:30 AM MYT');
  console.log('   3. Safe to run multiple times - backfill catches missed days, no double-charging');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
