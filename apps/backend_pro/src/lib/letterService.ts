/**
 * Letter Service
 * 
 * Consolidated PDF letter generation for all loan correspondence:
 *   - Discharge Letter (full settlement confirmation)
 *   - Arrears Letter (overdue notice)
 *   - Default Letter (default notice)
 * 
 * All letters share the same letterhead design, header, and footer.
 * Uses pdfkit for PDF generation.
 */

import PDFDocument from 'pdfkit';
import { toSafeNumber, safeRound, safeAdd, safeSubtract } from './math.js';
import { fetchLogoBuffer } from './safeLogoFetch.js';
import { saveFile } from './storage.js';

// ============================================
// Shared Helpers
// ============================================

// Helper function to fetch image from URL or local file
const fetchImageBuffer = (url: string): Promise<Buffer> => {
  return fetchLogoBuffer(url, '');
};

// Format currency helper
const formatRM = (amount: unknown): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  return `RM ${num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Format date helper
const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' });
};

// ============================================
// Type Definitions
// ============================================

interface TenantInfo {
  name: string;
  registrationNumber: string | null;
  licenseNumber: string | null;
  businessAddress: string | null;
  contactNumber: string | null;
  email: string | null;
  logoUrl: string | null;
}

interface BorrowerInfo {
  displayName: string;
  identificationNumber: string | null;
  address: string | null;
}

interface OverdueRepaymentSummary {
  repaymentNumber: number;
  dueDate: Date;
  totalDue: number;
  amountPaid: number;
  outstanding: number;
  lateFeeAccrued: number;
  daysOverdue: number;
}

export interface DischargeLetterParams {
  loan: {
    id: string;
    principalAmount: unknown;
    interestRate: unknown;
    term: number;
    disbursementDate: Date | null;
    completedAt: Date;
  };
  borrower: BorrowerInfo;
  tenant: TenantInfo;
  totalPaid: number;
  totalLateFees: number;
  dischargeNotes: string | null;
  /** Early settlement details (only set when loan was settled early) */
  earlySettlement?: {
    settlementAmount: number;
    discountAmount: number;
    discountType: string;    // 'PERCENTAGE' or 'FIXED'
    discountValue: number;   // e.g. 20 for 20% or RM amount
    remainingPrincipal: number;
    remainingInterest: number;
    waiveLateFees: boolean;
    outstandingLateFees: number;
  };
}

export interface ArrearsLetterParams {
  loan: {
    id: string;
    principalAmount: unknown;
    interestRate: unknown;
    term: number;
    disbursementDate: Date | null;
    totalLateFees: unknown;
  };
  borrower: BorrowerInfo;
  tenant: TenantInfo;
  overdueRepayments: OverdueRepaymentSummary[];
  totalOutstanding: number;
  totalLateFees: number;
  arrearsPeriod: number; // Days given to settle before default
}

export interface DefaultLetterParams {
  loan: {
    id: string;
    principalAmount: unknown;
    interestRate: unknown;
    term: number;
    disbursementDate: Date | null;
    totalLateFees: unknown;
  };
  borrower: BorrowerInfo;
  tenant: TenantInfo;
  overdueRepayments: OverdueRepaymentSummary[];
  totalOutstanding: number;
  totalLateFees: number;
}

// ============================================
// Shared Letterhead: Header & Footer
// ============================================

async function addLetterHeader(
  doc: PDFKit.PDFDocument,
  tenant: TenantInfo
): Promise<void> {
  // Add logo if available
  let logoAdded = false;
  if (tenant.logoUrl) {
    try {
      const logoBuffer = await fetchImageBuffer(tenant.logoUrl);
      doc.image(logoBuffer, 50, 45, { width: 80 });
      logoAdded = true;
    } catch {
      // Continue without logo
    }
  }

  // Header - Company Info (right-aligned if logo present, centered otherwise)
  const headerX = logoAdded ? 350 : 50;
  const headerAlign = logoAdded ? 'right' as const : 'center' as const;
  const headerWidth = logoAdded ? 200 : 500;

  doc.fontSize(16).font('Helvetica-Bold')
     .text(tenant.name, headerX, 50, { width: headerWidth, align: headerAlign });

  if (tenant.registrationNumber) {
    doc.fontSize(9).font('Helvetica')
       .text(`SSM: ${tenant.registrationNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
  }
  if (tenant.licenseNumber) {
    doc.fontSize(9).font('Helvetica')
       .text(`License: ${tenant.licenseNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
  }
  if (tenant.businessAddress) {
    doc.text(tenant.businessAddress, headerX, doc.y, { width: headerWidth, align: headerAlign });
  }
  if (tenant.contactNumber) {
    doc.text(`Tel: ${tenant.contactNumber}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
  }
  if (tenant.email) {
    doc.text(`Email: ${tenant.email}`, headerX, doc.y, { width: headerWidth, align: headerAlign });
  }

  // Line separator
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#E5E7EB');
  doc.moveDown(1.5);
}

function addLetterFooter(doc: PDFKit.PDFDocument, tenant: TenantInfo): void {
  // Closing
  doc.moveDown(2);
  doc.fontSize(10).font('Helvetica').fillColor('#000000')
     .text('Yours faithfully,', { align: 'left' });
  doc.moveDown(1);
  doc.font('Helvetica-Bold').text(tenant.name, { align: 'left' });

  // Footer
  doc.fontSize(8).font('Helvetica').fillColor('#9CA3AF');
  doc.text('This is a computer-generated letter. No signature required.', 50, 750, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica').fillColor('#3B82F6')
     .text('Powered by TrueKredit', 50, doc.y, { align: 'center' });
}

// ============================================
// Shared Components
// ============================================

function addOverdueTable(
  doc: PDFKit.PDFDocument,
  overdueRepayments: OverdueRepaymentSummary[]
): void {
  // Table header
  const tableTop = doc.y;
  const colWidths = [40, 90, 85, 85, 85, 65, 55]; // #, Due Date, Total Due, Paid, Outstanding, Late Fee, Days
  const colX = [50, 90, 180, 265, 350, 435, 500];

  // Header row background
  doc.rect(50, tableTop, 505, 18).fill('#F3F4F6');
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
  doc.text('#', colX[0], tableTop + 5, { width: colWidths[0] });
  doc.text('Due Date', colX[1], tableTop + 5, { width: colWidths[1] });
  doc.text('Total Due', colX[2], tableTop + 5, { width: colWidths[2], align: 'right' });
  doc.text('Paid', colX[3], tableTop + 5, { width: colWidths[3], align: 'right' });
  doc.text('Outstanding', colX[4], tableTop + 5, { width: colWidths[4], align: 'right' });
  doc.text('Late Fee', colX[5], tableTop + 5, { width: colWidths[5], align: 'right' });
  doc.text('Days', colX[6], tableTop + 5, { width: colWidths[6], align: 'right' });

  let rowY = tableTop + 22;
  doc.fontSize(8).font('Helvetica').fillColor('#000000');

  for (const rep of overdueRepayments) {
    doc.text(`${rep.repaymentNumber}`, colX[0], rowY, { width: colWidths[0] });
    doc.text(formatDate(rep.dueDate), colX[1], rowY, { width: colWidths[1] });
    doc.text(formatRM(rep.totalDue), colX[2], rowY, { width: colWidths[2], align: 'right' });
    doc.text(formatRM(rep.amountPaid), colX[3], rowY, { width: colWidths[3], align: 'right' });
    doc.text(formatRM(rep.outstanding), colX[4], rowY, { width: colWidths[4], align: 'right' });
    doc.text(formatRM(rep.lateFeeAccrued), colX[5], rowY, { width: colWidths[5], align: 'right' });
    doc.text(`${rep.daysOverdue}`, colX[6], rowY, { width: colWidths[6], align: 'right' });
    rowY += 16;
  }

  // Totals row
  rowY += 4;
  doc.moveTo(50, rowY - 2).lineTo(555, rowY - 2).stroke('#E5E7EB');
  doc.font('Helvetica-Bold');

  const totalOutstanding = overdueRepayments.reduce((sum, r) => safeAdd(sum, r.outstanding), 0);
  const totalLateFees = overdueRepayments.reduce((sum, r) => safeAdd(sum, r.lateFeeAccrued), 0);

  doc.text('Total', colX[0], rowY + 2, { width: colWidths[0] });
  doc.text(formatRM(totalOutstanding), colX[4], rowY + 2, { width: colWidths[4], align: 'right' });
  doc.text(formatRM(totalLateFees), colX[5], rowY + 2, { width: colWidths[5], align: 'right' });

  doc.y = rowY + 20;
}

function addLoanDetailsBox(
  doc: PDFKit.PDFDocument,
  loan: { id: string; principalAmount: unknown; interestRate: unknown; term: number; disbursementDate: Date | null },
  extraFields?: { label: string; value: string }[],
  boxColor: string = '#F9FAFB'
): void {
  const extraCount = extraFields?.length || 0;
  const boxHeight = 70 + (extraCount > 2 ? (extraCount - 2) * 15 : 0);
  const boxY = doc.y;
  doc.rect(50, boxY, 500, boxHeight).fill(boxColor);

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
     .text('LOAN DETAILS', 70, boxY + 12);

  const detailsY = boxY + 28;
  doc.fontSize(9).font('Helvetica').fillColor('#6B7280');

  // Left column
  doc.text('Loan Reference:', 70, detailsY);
  doc.text('Principal Amount:', 70, detailsY + 14);
  doc.text('Interest Rate:', 70, detailsY + 28);

  doc.font('Helvetica-Bold').fillColor('#000000');
  doc.text(loan.id.substring(0, 12), 180, detailsY);
  doc.text(formatRM(loan.principalAmount), 180, detailsY + 14);
  doc.text(`${toSafeNumber(loan.interestRate)}% p.a.`, 180, detailsY + 28);

  // Right column
  doc.font('Helvetica').fillColor('#6B7280');
  doc.text('Disbursement Date:', 320, detailsY);
  doc.text('Term:', 320, detailsY + 14);

  doc.font('Helvetica-Bold').fillColor('#000000');
  doc.text(loan.disbursementDate ? formatDate(loan.disbursementDate) : 'N/A', 440, detailsY);
  doc.text(`${loan.term} months`, 440, detailsY + 14);

  // Extra fields (e.g. settlement date, total paid, late fees paid)
  if (extraFields) {
    let extraY = detailsY + 28;
    for (const field of extraFields) {
      doc.font('Helvetica').fillColor('#6B7280');
      doc.text(field.label, 320, extraY);
      doc.font('Helvetica-Bold').fillColor('#000000');
      doc.text(field.value, 440, extraY);
      extraY += 15;
    }
  }

  doc.y = boxY + boxHeight + 15;
}

function addRecipient(
  doc: PDFKit.PDFDocument,
  borrower: BorrowerInfo
): void {
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
     .text(borrower.displayName);
  if (borrower.identificationNumber) {
    doc.font('Helvetica').text(`IC/SSM: ${borrower.identificationNumber}`);
  }
  if (borrower.address) {
    doc.text(borrower.address);
  }
}

// ============================================
// Helper: create PDF write stream and return path promise
// ============================================

function createPdfWriter(
  subDir: string,
  prefix: string,
  loanId: string
): { doc: PDFKit.PDFDocument; pathPromise: Promise<string> } {

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6); // HHmmss
  const filename = `${prefix}-${dateStr}-${timeStr}-${loanId.substring(0, 8)}.pdf`;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const pathPromise = new Promise<string>((resolve, reject) => {
    doc.on('end', async () => {
      try {
        const { path: storedPath } = await saveFile(
          Buffer.concat(chunks),
          `letters/${subDir}`,
          loanId,
          filename
        );
        resolve(storedPath);
      } catch (error) {
        reject(error);
      }
    });
    doc.on('error', reject);
  });

  return { doc, pathPromise };
}

// ============================================
// Discharge Letter
// ============================================

export async function generateDischargeLetter(params: DischargeLetterParams): Promise<string> {
  const { loan, borrower, tenant, totalPaid, totalLateFees, dischargeNotes, earlySettlement } = params;

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const filename = `DIS-${dateStr}-${loan.id.substring(0, 8)}.pdf`;

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      doc.on('error', reject);

      // Shared header
      await addLetterHeader(doc, tenant);

      // Letter Title
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000')
         .text('LETTER OF DISCHARGE', 50, doc.y, { align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#6B7280')
         .text(`Ref: ${loan.id}`, { align: 'center' });

      // Date
      doc.moveDown(1.5);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`Date: ${formatDate(loan.completedAt)}`, { align: 'left' });

      // Recipient
      doc.moveDown(1.5);
      addRecipient(doc, borrower);

      // Letter Body
      doc.moveDown(2);
      doc.font('Helvetica').text('Dear Sir/Madam,', { align: 'left' });

      doc.moveDown(1);
      const subjectLine = earlySettlement
        ? 'RE: EARLY SETTLEMENT AND DISCHARGE OF LOAN'
        : 'RE: FULL SETTLEMENT AND DISCHARGE OF LOAN';
      doc.font('Helvetica-Bold').text(subjectLine, { align: 'left' });

      doc.moveDown(1);
      const introText = earlySettlement
        ? `We are pleased to confirm that the loan facility extended to you has been settled early and discharged, subject to the early settlement terms detailed below.`
        : `We are pleased to confirm that the loan facility extended to you has been fully settled and discharged.`;
      doc.font('Helvetica').text(introText, { align: 'justify' });

      // Loan Details Box
      doc.moveDown(1.5);
      const boxY = doc.y;

      // Determine how many right-column rows we need for dynamic box height
      let rightRowCount = 3; // Disbursement Date, Settlement Date, Total Amount Paid
      if (totalLateFees > 0) rightRowCount++;
      if (earlySettlement && earlySettlement.discountAmount > 0) rightRowCount++;
      const boxHeight = Math.max(100, 55 + rightRowCount * 15);
      doc.rect(50, boxY, 500, boxHeight).fill('#F9FAFB');

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151')
         .text('LOAN DETAILS', 70, boxY + 15);

      doc.moveDown(0.8);
      const detailsY = doc.y;
      doc.fontSize(9).font('Helvetica').fillColor('#6B7280');

      // Left column
      doc.text('Loan Reference:', 70, detailsY);
      doc.text('Principal Amount:', 70, detailsY + 15);
      doc.text('Interest Rate:', 70, detailsY + 30);
      doc.text('Term:', 70, detailsY + 45);

      // Left values
      doc.font('Helvetica-Bold').fillColor('#000000');
      doc.text(loan.id.substring(0, 12), 180, detailsY);
      doc.text(formatRM(loan.principalAmount), 180, detailsY + 15);
      doc.text(`${toSafeNumber(loan.interestRate)}% p.a.`, 180, detailsY + 30);
      doc.text(`${loan.term} months`, 180, detailsY + 45);

      // Right column — build rows dynamically
      let rightY = detailsY;
      const addRightRow = (label: string, value: string, valueColor?: string) => {
        doc.font('Helvetica').fillColor('#6B7280').text(label, 320, rightY);
        doc.font('Helvetica-Bold').fillColor(valueColor || '#000000').text(value, 440, rightY);
        rightY += 15;
      };

      addRightRow('Disbursement Date:', loan.disbursementDate ? formatDate(loan.disbursementDate) : 'N/A');
      addRightRow('Settlement Date:', formatDate(loan.completedAt));
      addRightRow('Total Amount Paid:', formatRM(totalPaid));
      if (earlySettlement && earlySettlement.discountAmount > 0) {
        addRightRow('Discount Given:', `- ${formatRM(earlySettlement.discountAmount)}`, '#059669');
      }
      if (totalLateFees > 0) {
        addRightRow('Late Fees Paid:', formatRM(totalLateFees));
      }

      // Move past the box
      doc.y = boxY + boxHeight + 15;

      // Early Settlement Breakdown (only for early-settled loans)
      if (earlySettlement) {
        doc.moveDown(0.5);
        const esBoxY = doc.y;
        const esRows: { label: string; value: string; color?: string; bold?: boolean }[] = [
          { label: 'Remaining Principal', value: formatRM(earlySettlement.remainingPrincipal) },
          { label: 'Remaining Interest', value: formatRM(earlySettlement.remainingInterest) },
        ];

        // Discount row
        const discountLabel = earlySettlement.discountType === 'PERCENTAGE'
          ? `Early Settlement Discount (${earlySettlement.discountValue}% of future interest)`
          : `Early Settlement Discount (Fixed)`;
        if (earlySettlement.discountAmount > 0) {
          esRows.push({ label: discountLabel, value: `- ${formatRM(earlySettlement.discountAmount)}`, color: '#059669' });
        }

        // Late fees row
        if (earlySettlement.outstandingLateFees > 0) {
          if (earlySettlement.waiveLateFees) {
            esRows.push({ label: 'Outstanding Late Fees (Waived)', value: `- ${formatRM(earlySettlement.outstandingLateFees)}`, color: '#059669' });
          } else {
            esRows.push({ label: 'Outstanding Late Fees', value: formatRM(earlySettlement.outstandingLateFees) });
          }
        }

        // Total settlement
        esRows.push({ label: 'Total Settlement Amount', value: formatRM(earlySettlement.settlementAmount), bold: true });

        const esBoxHeight = 30 + (esRows.length * 16) + 10;
        doc.rect(50, esBoxY, 500, esBoxHeight).fill('#ECFDF5');

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#065F46')
           .text('EARLY SETTLEMENT BREAKDOWN', 70, esBoxY + 12);

        let esRowY = esBoxY + 32;
        for (const row of esRows) {
          doc.fontSize(9);
          if (row.bold) {
            doc.font('Helvetica-Bold').fillColor('#000000');
            // Draw a thin separator line before the total
            doc.strokeColor('#A7F3D0').lineWidth(0.5)
               .moveTo(70, esRowY - 3).lineTo(530, esRowY - 3).stroke();
            esRowY += 2;
          } else {
            doc.font('Helvetica').fillColor('#6B7280');
          }
          doc.text(row.label, 70, esRowY);
          doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
             .fillColor(row.color || '#000000')
             .text(row.value, 400, esRowY, { width: 130, align: 'right' });
          esRowY += 16;
        }

        doc.y = esBoxY + esBoxHeight + 15;

        // Savings callout
        if (earlySettlement.discountAmount > 0) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#059669')
             .text(`You saved ${formatRM(earlySettlement.discountAmount)} through early settlement.`, 50, doc.y, { align: 'left' });
          doc.moveDown(1);
        }
      }

      // Confirmation paragraph
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(
           `This letter confirms that all obligations under the above loan facility have been fully satisfied. ` +
           `You are hereby released and discharged from any further liability in respect of this loan.`,
           50, doc.y, { align: 'justify' }
         );

      doc.moveDown(1);
      doc.text(
        `Please retain this letter for your records as proof of full settlement.`,
        { align: 'justify' }
      );

      // Notes if any
      if (dischargeNotes) {
        doc.moveDown(1.5);
        doc.font('Helvetica-Bold').text('Notes:', { align: 'left' });
        doc.font('Helvetica').text(dischargeNotes, { align: 'left' });
      }

      // Closing
      doc.moveDown(2);
      doc.font('Helvetica').text('Thank you for your patronage.', { align: 'left' });

      // Shared footer
      addLetterFooter(doc, tenant);

      doc.end();
      doc.on('end', async () => {
        try {
          const { path: dischargeLetterPath } = await saveFile(
            Buffer.concat(chunks),
            'discharge-letters',
            loan.id,
            filename
          );
          resolve(dischargeLetterPath);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// Arrears Letter
// ============================================

export async function generateArrearsLetter(params: ArrearsLetterParams): Promise<string> {
  const { loan, borrower, tenant, overdueRepayments, totalOutstanding, totalLateFees, arrearsPeriod } = params;

  const { doc, pathPromise } = createPdfWriter('arrears', 'ARR', loan.id);

  try {
    // Shared header
    await addLetterHeader(doc, tenant);

    // Letter Title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#DC2626')
       .text('NOTICE OF ARREARS', 50, doc.y, { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280')
       .text(`Ref: ${loan.id}`, { align: 'center' });

    // Date
    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(`Date: ${formatDate(new Date())}`, { align: 'left' });

    // Recipient
    doc.moveDown(1.5);
    addRecipient(doc, borrower);

    // Letter Body
    doc.moveDown(2);
    doc.font('Helvetica').text('Dear Sir/Madam,', { align: 'left' });

    doc.moveDown(1);
    doc.font('Helvetica-Bold')
       .text('RE: NOTICE OF OVERDUE LOAN REPAYMENT(S)', { align: 'left' });

    doc.moveDown(1);
    doc.font('Helvetica').text(
      `We refer to the loan facility granted to you under the above reference. ` +
      `Our records indicate that the following repayment(s) are overdue:`,
      { align: 'justify' }
    );

    // Loan Details Box
    doc.moveDown(1.5);
    addLoanDetailsBox(doc, loan, undefined, '#FEF2F2');

    // Overdue Repayments Table
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
       .text('Overdue Repayment Schedule:', 50, doc.y, { width: 500, align: 'left' });
    doc.moveDown(0.5);
    addOverdueTable(doc, overdueRepayments);

    // Summary (full page width)
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#DC2626')
       .text(`Total Outstanding Amount: ${formatRM(totalOutstanding)}`, 50, doc.y, { width: 500, align: 'left' });
    if (totalLateFees > 0) {
      doc.text(`Total Late Fees Accrued: ${formatRM(totalLateFees)}`, 50, doc.y, { width: 500, align: 'left' });
      doc.fillColor('#DC2626')
         .text(`Grand Total Due: ${formatRM(safeAdd(totalOutstanding, totalLateFees))}`, 50, doc.y, { width: 500, align: 'left' });
    }

    // Dateline & request to settle (full page width)
    const letterDate = new Date();
    const deadlineDate = new Date(letterDate);
    deadlineDate.setDate(deadlineDate.getDate() + arrearsPeriod);

    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(
         `We kindly request that you settle the above outstanding amount(s) within ` +
         `${arrearsPeriod} days from the date of this letter (by ${formatDate(deadlineDate)}) ` +
         `to avoid further accumulation of late payment charges. Late fees are charged daily at ` +
         `the rate specified in your loan agreement.`,
         50, doc.y, { width: 500, align: 'justify' }
       );

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fillColor('#DC2626')
       .text(
         `Failure to settle the outstanding amount(s) by ${formatDate(deadlineDate)} may result ` +
         `in your loan being classified as defaulted, and the company may initiate legal action ` +
         `to recover the outstanding amount.`,
         50, doc.y, { width: 500, align: 'justify' }
       );

    doc.moveDown(1);
    doc.font('Helvetica').fillColor('#000000')
       .text(
         `If you have already made the payment, please disregard this notice. ` +
         `For any enquiries, please contact us at the above contact details.`,
         50, doc.y, { width: 500, align: 'justify' }
       );

    // Shared footer
    addLetterFooter(doc, tenant);

    doc.end();

    return await pathPromise;
  } catch (error) {
    doc.end();
    throw error;
  }
}

// ============================================
// Default Letter
// ============================================

export async function generateDefaultLetter(params: DefaultLetterParams): Promise<string> {
  const { loan, borrower, tenant, overdueRepayments, totalOutstanding, totalLateFees } = params;

  const { doc, pathPromise } = createPdfWriter('default', 'DEF', loan.id);

  try {
    // Shared header
    await addLetterHeader(doc, tenant);

    // Letter Title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#991B1B')
       .text('NOTICE OF DEFAULT', 50, doc.y, { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280')
       .text(`Ref: ${loan.id}`, { align: 'center' });

    // Date
    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(`Date: ${formatDate(new Date())}`, { align: 'left' });

    // Recipient
    doc.moveDown(1.5);
    addRecipient(doc, borrower);

    // Letter Body
    doc.moveDown(2);
    doc.font('Helvetica').text('Dear Sir/Madam,', { align: 'left' });

    doc.moveDown(1);
    doc.font('Helvetica-Bold')
       .text('RE: NOTICE OF DEFAULT ON LOAN FACILITY', { align: 'left' });

    doc.moveDown(1);
    doc.font('Helvetica').text(
      `We refer to the loan facility granted to you under the above reference and our previous ` +
      `correspondence regarding the overdue repayment(s).`,
      { align: 'justify' }
    );

    doc.moveDown(1);
    doc.font('Helvetica').text(
      `Despite our earlier notice, the outstanding amount(s) remain unsettled. ` +
      `In accordance with the terms and conditions of your loan agreement, we hereby formally ` +
      `notify you that your loan has been classified as DEFAULTED.`,
      { align: 'justify' }
    );

    // Loan Details Box
    doc.moveDown(1.5);
    addLoanDetailsBox(doc, loan, undefined, '#FEF2F2');

    // Overdue Repayments Table
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
       .text('Outstanding Repayments:', 50, doc.y, { width: 500, align: 'left' });
    doc.moveDown(0.5);
    addOverdueTable(doc, overdueRepayments);

    // Summary (full page width)
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#991B1B')
       .text(`Total Outstanding Principal & Interest: ${formatRM(totalOutstanding)}`, 50, doc.y, { width: 500, align: 'left' });
    if (totalLateFees > 0) {
      doc.text(`Total Late Fees: ${formatRM(totalLateFees)}`, 50, doc.y, { width: 500, align: 'left' });
    }
    doc.fontSize(12)
       .text(`TOTAL AMOUNT DUE: ${formatRM(safeAdd(totalOutstanding, totalLateFees))}`, 50, doc.y, { width: 500, align: 'left' });

    // Consequences (full page width)
    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(
         `As a result of this default, we reserve the right to take any or all of the following actions ` +
         `as provided under the terms of your loan agreement and applicable laws:`,
         50, doc.y, { width: 500, align: 'justify' }
       );

    doc.moveDown(0.5);
    doc.text('  1. Demand immediate repayment of the entire outstanding amount;', 50, doc.y, { width: 500, indent: 20 });
    doc.text('  2. Impose additional default charges as stipulated in the agreement;', 50, doc.y, { width: 500, indent: 20 });
    doc.text('  3. Initiate legal proceedings to recover the outstanding amount;', 50, doc.y, { width: 500, indent: 20 });
    doc.text('  4. Report the default to relevant credit reporting agencies.', 50, doc.y, { width: 500, indent: 20 });

    doc.moveDown(1);
    doc.text(
      `We strongly urge you to contact us immediately to discuss repayment arrangements ` +
      `and avoid further escalation of this matter.`,
      50, doc.y, { width: 500, align: 'justify' }
    );

    // Shared footer
    addLetterFooter(doc, tenant);

    doc.end();

    return await pathPromise;
  } catch (error) {
    doc.end();
    throw error;
  }
}
