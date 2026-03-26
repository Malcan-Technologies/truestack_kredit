import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { addMonthsClamped } from '../../lib/math.js';
import { generateLoanAgreement, type LoanForAgreement } from '../../lib/pdfService.js';

/**
 * Build loan agreement PDF buffer for download. Optionally applies agreementDate query (YYYY-MM-DD)
 * and persists agreementDate on the loan (same behavior as admin GET /loans/:loanId/generate-agreement).
 */
export async function buildLoanAgreementPdfBuffer(params: {
  tenantId: string;
  loanId: string;
  agreementDateParam: string | undefined;
}): Promise<{ buffer: Buffer; filename: string }> {
  const { tenantId, loanId, agreementDateParam } = params;

  const loan = await prisma.loan.findFirst({
    where: {
      id: loanId,
      tenantId,
    },
    include: {
      borrower: {
        include: {
          directors: {
            orderBy: { order: 'asc' },
          },
        },
      },
      product: true,
      tenant: true,
    },
  });

  if (!loan) {
    throw new NotFoundError('Loan');
  }

  const calculateFirstRepaymentDate = (agreementDate: Date): Date => {
    return addMonthsClamped(agreementDate, 1);
  };

  let agreementDate: Date | null = null;
  let firstRepaymentDate: Date | null = null;
  let monthlyRepaymentDay: number | null = null;

  if (agreementDateParam !== undefined) {
    if (typeof agreementDateParam !== 'string') {
      throw new BadRequestError('Invalid agreementDate. Expected YYYY-MM-DD.');
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(agreementDateParam);
    if (!match) {
      throw new BadRequestError('Invalid agreementDate. Expected YYYY-MM-DD.');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    const isValidDate =
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day;
    if (!isValidDate) {
      throw new BadRequestError('Invalid agreementDate. Expected YYYY-MM-DD.');
    }

    agreementDate = parsedDate;
    firstRepaymentDate = calculateFirstRepaymentDate(parsedDate);
    monthlyRepaymentDay = firstRepaymentDate.getUTCDate();

    const agreementDateChanged = (loan.agreementDate?.getTime() ?? null) !== parsedDate.getTime();

    if (agreementDateChanged) {
      await prisma.$transaction([
        prisma.loan.update({
          where: { id: loan.id },
          data: { agreementDate: parsedDate },
        }),
        prisma.loanGuarantor.updateMany({
          where: {
            tenantId,
            loanId: loan.id,
          },
          data: { agreementGeneratedAt: null },
        }),
      ]);
    } else {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { agreementDate: parsedDate },
      });
    }
  }

  if (!agreementDate && loan.agreementDate) {
    agreementDate = loan.agreementDate;
    firstRepaymentDate = calculateFirstRepaymentDate(loan.agreementDate);
    monthlyRepaymentDay = firstRepaymentDate.getUTCDate();
  }

  if (!agreementDate) {
    throw new BadRequestError(
      'Agreement date is required. Provide agreementDate query parameter (YYYY-MM-DD) or ensure the loan has a stored agreement date.'
    );
  }

  const loanData: LoanForAgreement = {
    id: loan.id,
    principalAmount: loan.principalAmount,
    interestRate: loan.interestRate,
    term: loan.term,
    agreementDate,
    firstRepaymentDate,
    monthlyRepaymentDay,
    borrower: {
      name: loan.borrower.name,
      icNumber: loan.borrower.icNumber,
      address: loan.borrower.address,
      type: loan.borrower.borrowerType,
      borrowerType: loan.borrower.borrowerType,
      companyName: loan.borrower.companyName,
      companyRegistrationNumber: loan.borrower.ssmRegistrationNo,
      directors: loan.borrower.directors.map((director) => ({
        name: director.name,
        icNumber: director.icNumber,
        position: director.position,
      })),
    },
    tenant: {
      name: loan.tenant.name,
      registrationNumber: loan.tenant.registrationNumber,
      licenseNumber: loan.tenant.licenseNumber,
      businessAddress: loan.tenant.businessAddress,
    },
    product: {
      interestModel: loan.product.interestModel,
      loanScheduleType: loan.product.loanScheduleType,
    },
    collateralType: loan.collateralType,
    collateralValue: loan.collateralValue ? Number(loan.collateralValue) : null,
  };

  const pdfBuffer = await generateLoanAgreement(loanData);

  const scheduleLabel = loan.product.loanScheduleType === 'JADUAL_K' ? 'Jadual_K' : 'Jadual_J';
  const borrowerName =
    loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
      ? loan.borrower.companyName
      : loan.borrower.name;
  const sanitizedName = borrowerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const filename = `${scheduleLabel}_Agreement_${sanitizedName}_${loanId.substring(0, 8)}.pdf`;

  return { buffer: pdfBuffer, filename };
}
