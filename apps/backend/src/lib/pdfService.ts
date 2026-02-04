/**
 * PDF Service for generating loan agreement documents
 * Uses pdf-lib to fill in the Jadual J template with loan data
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================
// Types
// ============================================

export interface LoanForAgreement {
  id: string;
  principalAmount: Decimal;
  interestRate: Decimal;
  term: number;
  firstRepaymentDate?: Date | null; // Date of first repayment
  monthlyRepaymentDay?: number | null; // Day of month for repayments (1-31)
  borrower: {
    name: string;
    icNumber: string;
    address: string | null;
    type: string; // 'INDIVIDUAL' or 'CORPORATE'
    borrowerType: string;
    companyName: string | null;
    companyRegistrationNumber: string | null;
  };
  tenant: {
    name: string;
    registrationNumber: string | null;
    licenseNumber: string | null;
    businessAddress: string | null;
  };
  product: {
    interestModel: string;
  };
}

interface FieldPosition {
  x: number;
  y: number;
  page: number;
  maxWidth?: number;
  fontSize?: number;
}

// ============================================
// Coordinate Mapping for Jadual J Template
// Page 6 (0-indexed: page 5) contains "Jadual Pertama" (Schedule 1)
// Coordinates are measured from bottom-left in points (1 point = 1/72 inch)
// Size: 595 x 842 points (A4)
// 
// The "Butir-butir" (Details) column starts around x=480
// ============================================

const JADUAL_PERTAMA_FIELDS: Record<string, FieldPosition> = {
  // ============================================
  // Page 1 (index 0) - Bayaran balik ansuran
  // ============================================
  
  // First repayment date (tarikh bayaran balik yang pertama)
  firstRepaymentDate: { x: 115, y: 240, page: 0, fontSize: 9 },
  
  // Monthly repayment date (setiap dan tiap-tiap bulan)
  monthlyRepaymentDate: { x: 115, y: 220, page: 0, fontSize: 9 },
  
  // Repayment tenure in months (bulan tersebut)
  repaymentTenure: { x: 115, y: 200, page: 0, fontSize: 9 },
  
  // ============================================
  // Page 6 (index 5) - Jadual Pertama
  // ============================================
  
  // Section 1: Hari dan tahun Perjanjian ini (Agreement Date)
  agreementDate: { x: 340, y: 610, page: 5, fontSize: 9 },
  
  // Section 2: Lender Details - Combined into single multi-line field
  lenderDetails: { x: 340, y: 575, page: 5, fontSize: 8, maxWidth: 140 },
  
  // Section 3: Borrower Details - Combined into single multi-line field
  borrowerDetails: { x: 340, y: 508, page: 5, fontSize: 8, maxWidth: 140 },
  
  // Section 4: Jumlah Wang Pokok (Principal Amount)
  // "........................... ringgit" and "(RM..................................)"
  principalAmountWords: { x: 337, y: 449, page: 5, fontSize: 9, maxWidth: 90 },
  principalAmountFigures: { x: 360, y: 433, page: 5, fontSize: 9 },
  
  // Section 5: Kadar faedah (Interest Rate)
  // "Kadar faedah adalah .....................peratus(...............%) setahun"
  interestRateWords: { x: 337, y: 377, page: 5, fontSize: 9 },
  interestRatePercent: { x: 440, y: 377, page: 5, fontSize: 9 },
  
  // Section 6: Jumlah wang setiap bayaran balik ansuran (Monthly Payment)
  monthlyPayment: { x: 340, y: 320, page: 5, fontSize: 9 },
  
  // Section 7: Jumlah keseluruhan bayaran balik (Total Repayment)
  totalRepayment: { x: 340, y: 280, page: 5, fontSize: 9 },
  
  // ============================================
  // Signature Sections
  // ============================================
  
  // Borrower Signature Section (DITANDATANGANI oleh Peminjam)
  signBorrowerName: { x: 148, y: 141, page: 3, fontSize: 9, maxWidth: 180 },
  signBorrowerIcOrRegNo: { x: 278, y: 120, page: 3, fontSize: 9 },
  
  // Lender Signature Section (DITANDATANGANI oleh Pemberi Pinjam)
  signLenderName: { x: 148, y: 679, page: 4, fontSize: 9, maxWidth: 180 },
  signLenderRegNo: { x: 278, y: 659, page: 4, fontSize: 9 },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Format a number as Malaysian Ringgit
 */
function formatCurrency(amount: number): string {
  // Format with MYR then replace with RM for display
  const formatted = new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(amount);
  return formatted.replace('MYR', 'RM');
}

/**
 * Convert a number to words (Malay)
 */
function numberToMalayWords(num: number): string {
  const ones = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'lapan', 'sembilan'];
  const tens = ['', 'sepuluh', 'dua puluh', 'tiga puluh', 'empat puluh', 'lima puluh', 'enam puluh', 'tujuh puluh', 'lapan puluh', 'sembilan puluh'];
  const teens = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'lapan belas', 'sembilan belas'];
  
  if (num === 0) return 'sifar';
  if (num < 0) return 'negatif ' + numberToMalayWords(-num);
  
  let words = '';
  
  if (num >= 1000000) {
    const millions = Math.floor(num / 1000000);
    words += (millions === 1 ? 'sejuta' : numberToMalayWords(millions) + ' juta') + ' ';
    num %= 1000000;
  }
  
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    words += (thousands === 1 ? 'seribu' : numberToMalayWords(thousands) + ' ribu') + ' ';
    num %= 1000;
  }
  
  if (num >= 100) {
    const hundreds = Math.floor(num / 100);
    words += (hundreds === 1 ? 'seratus' : ones[hundreds] + ' ratus') + ' ';
    num %= 100;
  }
  
  if (num >= 20) {
    words += tens[Math.floor(num / 10)] + ' ';
    num %= 10;
  } else if (num >= 10) {
    words += teens[num - 10] + ' ';
    num = 0;
  }
  
  if (num > 0) {
    words += ones[num] + ' ';
  }
  
  return words.trim();
}

/**
 * Convert currency amount to Malay words
 */
function currencyToMalayWords(amount: number): string {
  const ringgit = Math.floor(amount);
  const sen = Math.round((amount - ringgit) * 100);
  
  let words = numberToMalayWords(ringgit) + ' ringgit';
  
  if (sen > 0) {
    words += ' dan ' + numberToMalayWords(sen) + ' sen';
  }
  
  return words;
}

/**
 * Format date in Malay format
 */
function formatMalayDate(date: Date): string {
  const day = date.getDate();
  const months = [
    'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
    'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} ${month} ${year}`;
}

/**
 * Calculate monthly payment (flat rate model)
 */
function calculateMonthlyPaymentFlat(principal: number, annualRate: number, termMonths: number): number {
  const totalInterest = (principal * annualRate / 100) * (termMonths / 12);
  const totalPayable = principal + totalInterest;
  return totalPayable / termMonths;
}

/**
 * Calculate monthly payment (declining balance / EMI)
 */
function calculateMonthlyPaymentEMI(principal: number, annualRate: number, termMonths: number): number {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) {
    return principal / termMonths;
  }
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return principal * (monthlyRate * factor) / (factor - 1);
}

/**
 * Draw text with word wrapping
 */
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  lineHeight: number = 10
): number {
  let currentY = y;
  
  // Split by explicit newlines first
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (testWidth > maxWidth && currentLine) {
        page.drawText(currentLine, { x, y: currentY, size: fontSize, font, color: rgb(0, 0, 0) });
        currentY -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      page.drawText(currentLine, { x, y: currentY, size: fontSize, font, color: rgb(0, 0, 0) });
      currentY -= lineHeight;
    }
  }
  
  return currentY;
}

// ============================================
// Main PDF Generation Function
// ============================================

/**
 * Generate a pre-filled loan agreement PDF
 */
export async function generateLoanAgreement(loan: LoanForAgreement): Promise<Buffer> {
  // Load the Jadual J template
  const templatePath = path.join(process.cwd(), 'templates', 'jadual-j.pdf');
  const templateBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  
  // Embed font for text overlay
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  
  // Calculate loan values
  const principal = Number(loan.principalAmount);
  const rate = Number(loan.interestRate);
  const term = loan.term;
  
  // Calculate monthly payment based on interest model
  const monthlyPayment = loan.product.interestModel === 'FLAT'
    ? calculateMonthlyPaymentFlat(principal, rate, term)
    : calculateMonthlyPaymentEMI(principal, rate, term);
  
  const totalPayable = monthlyPayment * term;
  
  // Get borrower display name
  const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
    ? loan.borrower.companyName
    : loan.borrower.name;
  
  // Helper to draw field - uses the page index from field configuration
  const drawField = (fieldKey: string, text: string, useBold: boolean = false) => {
    const field = JADUAL_PERTAMA_FIELDS[fieldKey];
    if (!field) return;
    
    // Get the correct page from field configuration
    const targetPage = pages[field.page];
    if (!targetPage) return;
    
    const selectedFont = useBold ? fontBold : font;
    const fontSize = field.fontSize || 10;
    
    if (field.maxWidth) {
      drawWrappedText(targetPage, text, field.x, field.y, selectedFont, fontSize, field.maxWidth);
    } else {
      targetPage.drawText(text, {
        x: field.x,
        y: field.y,
        size: fontSize,
        font: selectedFont,
        color: rgb(0, 0, 0),
      });
    }
  };
  
  // Fill in the fields
  
  // ============================================
  // Page 1 - Bayaran balik ansuran
  // ============================================
  
  // First repayment date
  if (loan.firstRepaymentDate) {
    drawField('firstRepaymentDate', formatMalayDate(new Date(loan.firstRepaymentDate)));
  }
  
  // Monthly repayment date (day of month) with HB suffix (Hari Bulan)
  if (loan.monthlyRepaymentDay) {
    drawField('monthlyRepaymentDate', `${loan.monthlyRepaymentDay} HB`);
  } else if (loan.firstRepaymentDate) {
    // Default to the day from first repayment date
    const day = new Date(loan.firstRepaymentDate).getDate();
    drawField('monthlyRepaymentDate', `${day} HB`);
  }
  
  // Repayment tenure (term in months)
  drawField('repaymentTenure', `${loan.term}`);
  
  // ============================================
  // Page 6 - Jadual Pertama
  // ============================================
  
  // Section 1: Agreement Date
  drawField('agreementDate', formatMalayDate(new Date()));
  
  // Section 2: Lender Details - Combined into single multi-line string
  const lenderLines: string[] = [loan.tenant.name];
  if (loan.tenant.registrationNumber) {
    lenderLines.push(`No. Pendaftaran: ${loan.tenant.registrationNumber}`);
  }
  if (loan.tenant.licenseNumber) {
    lenderLines.push(`No. Lesen: ${loan.tenant.licenseNumber}`);
  }
  if (loan.tenant.businessAddress) {
    lenderLines.push(loan.tenant.businessAddress);
  }
  drawField('lenderDetails', lenderLines.join('\n'));
  
  // Section 3: Borrower Details - Combined into single multi-line string
  // Handle both individual and corporate borrowers
  const isCorporate = loan.borrower.type === 'CORPORATE';
  const borrowerLines: string[] = [borrowerName];
  
  if (isCorporate) {
    // Corporate borrower: use SSM registration number
    if (loan.borrower.companyRegistrationNumber) {
      borrowerLines.push(`No. SSM: ${loan.borrower.companyRegistrationNumber}`);
    }
  } else {
    // Individual borrower: use IC number
    borrowerLines.push(`No. K.P.: ${loan.borrower.icNumber}`);
  }
  
  if (loan.borrower.address) {
    borrowerLines.push(loan.borrower.address);
  }
  drawField('borrowerDetails', borrowerLines.join('\n'));
  
  // Section 4: Principal Amount
  drawField('principalAmountWords', numberToMalayWords(Math.floor(principal)));
  drawField('principalAmountFigures', formatCurrency(principal).replace(/^RM\s*/, ''));
  
  // Section 5: Interest Rate
  drawField('interestRateWords', numberToMalayWords(Math.floor(rate)));
  drawField('interestRatePercent', `${rate}`);
  
  // Section 6: Monthly Payment
  drawField('monthlyPayment', formatCurrency(monthlyPayment).replace('MYR', 'RM'));
  
  // Section 7: Total Repayment
  drawField('totalRepayment', formatCurrency(totalPayable).replace('MYR', 'RM'));
  
  // ============================================
  // Signature Sections (Pages 4 & 5)
  // ============================================
  
  // Determine borrower display name and ID based on type
  const isCorporateBorrower = loan.borrower.type === 'CORPORATE';
  const signBorrowerDisplayName = isCorporateBorrower 
    ? (loan.borrower.companyName || borrowerName)
    : borrowerName;
  const signBorrowerIdNo = isCorporateBorrower
    ? (loan.borrower.companyRegistrationNumber || '')
    : loan.borrower.icNumber;
  
  // Borrower Signature
  drawField('signBorrowerName', signBorrowerDisplayName);
  drawField('signBorrowerIcOrRegNo', signBorrowerIdNo);
  
  // Lender Signature
  drawField('signLenderName', loan.tenant.name);
  if (loan.tenant.registrationNumber) {
    drawField('signLenderRegNo', loan.tenant.registrationNumber);
  }
  
  // Save and return the PDF
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ============================================
// Calibration Function
// ============================================

/**
 * Generate a calibration PDF with grid lines to help map field coordinates
 * Run this function to get exact coordinates for the Jadual J template
 */
export async function generateCalibrationPdf(): Promise<Buffer> {
  // Load the Jadual J template
  const templatePath = path.join(process.cwd(), 'templates', 'jadual-j.pdf');
  const templateBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  
  // Draw grid on each page
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    
    // Draw page number
    page.drawText(`Page ${pageIndex + 1} (index: ${pageIndex})`, {
      x: 10,
      y: height - 20,
      size: 12,
      font,
      color: rgb(1, 0, 0),
    });
    
    // Draw vertical grid lines every 50 points
    for (let x = 0; x <= width; x += 50) {
      page.drawLine({
        start: { x, y: 0 },
        end: { x, y: height },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      // Label every 100 points
      if (x % 100 === 0) {
        page.drawText(String(x), {
          x: x + 2,
          y: 10,
          size: 6,
          font,
          color: rgb(0.5, 0, 0),
        });
      }
    }
    
    // Draw horizontal grid lines every 50 points
    for (let y = 0; y <= height; y += 50) {
      page.drawLine({
        start: { x: 0, y },
        end: { x: width, y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      // Label every 100 points
      if (y % 100 === 0) {
        page.drawText(String(y), {
          x: 5,
          y: y + 2,
          size: 6,
          font,
          color: rgb(0, 0, 0.5),
        });
      }
    }
    
    // Draw dimension info
    page.drawText(`Size: ${Math.round(width)} x ${Math.round(height)} points`, {
      x: 10,
      y: height - 35,
      size: 10,
      font,
      color: rgb(0, 0.5, 0),
    });
  }
  
  // Mark the current field positions on page 5
  const page5 = pages[4];
  for (const [fieldKey, field] of Object.entries(JADUAL_PERTAMA_FIELDS)) {
    if (field.page === 4) {
      // Draw a small red marker at the position
      page5.drawCircle({
        x: field.x,
        y: field.y,
        size: 3,
        color: rgb(1, 0, 0),
      });
      // Label the field
      page5.drawText(fieldKey, {
        x: field.x + 5,
        y: field.y - 3,
        size: 6,
        font,
        color: rgb(1, 0, 0),
      });
    }
  }
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generate a test agreement PDF with sample data
 */
export async function generateTestAgreement(): Promise<Buffer> {
  const testLoan: LoanForAgreement = {
    id: 'test-loan-001',
    principalAmount: new Decimal(10000),
    interestRate: new Decimal(18),
    term: 12,
    firstRepaymentDate: new Date('2026-03-15'),
    monthlyRepaymentDay: 15,
    borrower: {
      name: 'Ahmad bin Abdullah',
      icNumber: '900101-01-1234',
      address: 'No. 123, Jalan Merdeka, Taman Bahagia, 50000 Kuala Lumpur',
      type: 'INDIVIDUAL',
      borrowerType: 'INDIVIDUAL',
      companyName: null,
      companyRegistrationNumber: null,
    },
    tenant: {
      name: 'Pinjaman Mudah Sdn. Bhd.',
      registrationNumber: '1234567-A',
      licenseNumber: 'PPW/KL/2024/001',
      businessAddress: 'No. 456, Jalan Bisnes, Pusat Perniagaan, 50100 Kuala Lumpur',
    },
    product: {
      interestModel: 'FLAT',
    },
  };
  
  return generateLoanAgreement(testLoan);
}
