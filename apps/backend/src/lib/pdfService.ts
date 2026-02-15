/**
 * PDF Service for generating Jadual J/K loan agreements.
 * Jadual J follows the exact KPKT template word-for-word.
 */

import PDFDocument from 'pdfkit';
import { Decimal } from '@prisma/client/runtime/library';
import { calculateEMI, calculateFlatInterest, monthlyInterestRate, safeAdd, safeDivide, safeMultiply, safeRound, safeSubtract, toSafeNumber } from './math.js';

// ============================================
// Types
// ============================================

export interface LoanForAgreement {
  id: string;
  principalAmount: Decimal;
  interestRate: Decimal;
  term: number;
  firstRepaymentDate?: Date | null;
  monthlyRepaymentDay?: number | null;
  borrower: {
    name: string;
    icNumber: string;
    address: string | null;
    type: string;
    borrowerType: string;
    companyName: string | null;
    companyRegistrationNumber: string | null;
    directors?: Array<{
      name: string;
      icNumber: string;
      position?: string | null;
    }>;
  };
  tenant: {
    name: string;
    registrationNumber: string | null;
    licenseNumber: string | null;
    businessAddress: string | null;
  };
  product: {
    interestModel: string;
    loanScheduleType: string; // 'JADUAL_J' or 'JADUAL_K'
  };
  collateralType?: string | null;
  collateralValue?: number | null;
}

interface AgreementComputedValues {
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  totalPayable: number;
  totalInterest: number;
  agreementDateText: string;
  firstRepaymentDateText: string;
  monthlyRepaymentDay: number | null;
  borrowerName: string;
  borrowerDisplayName: string;
  borrowerDetails: string;
  lenderDetails: string;
}

interface Signatory {
  name: string;          // For individual: borrower name. For corporate: company name.
  icNumber: string;      // For individual: IC. For corporate: company reg number.
  label: string;         // "No. K.P." or "No. Pendaftaran Syarikat"
  // Corporate director info (filled in the signature space area)
  directorName?: string;
  directorIc?: string;
  directorPosition?: string; // Designation, defaults to "Director"
}

interface JadualRow {
  no: string;
  perkara: string;
  butir: string;
}

// ============================================
// Layout Constants
// ============================================

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const ML = 72;   // 1-inch left margin
const MR = 72;
const MT = 65;   // top margin
const MB = 60;
const CW = PAGE_WIDTH - ML - MR; // content width ~451pt

// Fonts — serif for formal legal documents (matching KPKT template)
const FR = 'Times-Roman';
const FB = 'Times-Bold';
const FI = 'Times-Italic';
const FBI = 'Times-BoldItalic';

// Font sizes — matching the template proportions
const FS_BODY = 11;
const FS_HEADING = 13;
const FS_SUBHEADING = 11;
const FS_SMALL = 10;
const FS_TABLE = 10;
const LG = 9;      // ~2.0 line spacing for body text (11pt font + 9pt gap ≈ 20pt line height)
const LG_TIGHT = 2; // tight line gap for multi-line centered headers

// Indentation — matching template layout closely
// Template: clause number "1." at left margin, text body indented by a tab.
// Continuation lines wrap back to left margin (under the number).
const IND1 = 36;    // "1.", "2." number column width
const IND_BODY = 42; // first-line indent for clause body text after number (tighter)
const IND_SUB = 60;  // "(1)", "(2)" sub-clause text start (with space after number)
const IND_SUBSUB = 108; // "(a)", "(b)" sub-sub-clause text start (past the label)

// First-line indent for paragraphs (SUATU PERJANJIAN, BAHAWASANYA, etc.)
const FIRST_LINE_INDENT = 36;

// Signature bracket column — vertically aligned, closer to text
const BRACKET_COL = ML + 310;

// ============================================
// Helpers
// ============================================

function createPdfBuffer(renderer: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MT, bottom: MB, left: ML, right: MR },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderer(doc);
    doc.end();
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(safeRound(amount));
  return formatted.replace('MYR', 'RM');
}

function numberToMalayWords(num: number): string {
  const ones = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'lapan', 'sembilan'];
  const tens = ['', 'sepuluh', 'dua puluh', 'tiga puluh', 'empat puluh', 'lima puluh', 'enam puluh', 'tujuh puluh', 'lapan puluh', 'sembilan puluh'];
  const teens = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'lapan belas', 'sembilan belas'];

  if (num === 0) return 'sifar';
  if (num < 0) return `negatif ${numberToMalayWords(-num)}`;

  let value = Math.floor(num);
  let words = '';

  if (value >= 1_000_000) {
    const millions = Math.floor(value / 1_000_000);
    words += (millions === 1 ? 'sejuta' : `${numberToMalayWords(millions)} juta`) + ' ';
    value %= 1_000_000;
  }

  if (value >= 1_000) {
    const thousands = Math.floor(value / 1_000);
    words += (thousands === 1 ? 'seribu' : `${numberToMalayWords(thousands)} ribu`) + ' ';
    value %= 1_000;
  }

  if (value >= 100) {
    const hundreds = Math.floor(value / 100);
    words += (hundreds === 1 ? 'seratus' : `${ones[hundreds]} ratus`) + ' ';
    value %= 100;
  }

  if (value >= 20) {
    words += tens[Math.floor(value / 10)] + ' ';
    value %= 10;
  } else if (value >= 10) {
    words += teens[value - 10] + ' ';
    value = 0;
  }

  if (value > 0) {
    words += `${ones[value]} `;
  }

  return words.trim();
}

/** Converts amount to Malay words with "ringgit" and optional "sen", suffixed with "sahaja". Capitalizes first letter. */
function currencyToMalayWords(amount: number): string {
  const ringgit = Math.floor(amount);
  const sen = Math.round((amount - ringgit) * 100);
  let words = `${numberToMalayWords(ringgit)} ringgit`;
  if (sen > 0) {
    words += ` dan ${numberToMalayWords(sen)} sen`;
  }
  words += ' sahaja';
  return capitalize(words);
}

function formatMalayDate(date: Date): string {
  const day = date.getDate();
  const months = [
    'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
    'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
  ];
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}


/** Justified paragraph. Returns new y. */
function para(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, opts?: { lineGap?: number; fontSize?: number; font?: string; align?: string; indent?: number }): number {
  doc.font(opts?.font ?? FR)
    .fontSize(opts?.fontSize ?? FS_BODY)
    .text(text, x, y, {
      width,
      align: (opts?.align as 'left' | 'center' | 'right' | 'justify') ?? 'justify',
      lineGap: opts?.lineGap ?? LG,
      indent: opts?.indent,
    });
  return doc.y;
}

/** Bold-prefix + regular paragraph (bold words then regular continuation on same line).
 *  First line is indented; continuation lines flow back to x (left margin). */
function boldPara(doc: PDFKit.PDFDocument, boldText: string, regularText: string, x: number, y: number, width: number): number {
  doc.font(FB).fontSize(FS_BODY)
    .text(boldText, x, y, { width, continued: true, align: 'justify', lineGap: LG, indent: FIRST_LINE_INDENT });
  doc.font(FR).text(regularText, { align: 'justify', lineGap: LG });
  return doc.y;
}


// ============================================
// Schedule-accurate total calculation
// ============================================

/**
 * Simulate the actual repayment schedule to compute the real total payable,
 * including the last-payment rounding adjustment that the schedule service applies.
 * This prevents the agreement PDF from showing a slightly inflated total
 * (e.g. RM 0.01–0.02 extra) caused by monthlyPayment × term rounding.
 */
function computeScheduleTotal(principal: number, interestRate: number, term: number, isFlat: boolean, monthlyPayment: number): number {
  if (isFlat) {
    // Flat: totalPayable = principal + totalInterest, each instalment = totalPayable / term
    const totalInterest = calculateFlatInterest(principal, interestRate, term);
    const exactTotal = safeAdd(principal, totalInterest);
    // Each instalment is rounded to 2 dp; sum them up
    const roundedInstalment = safeRound(monthlyPayment, 2);
    const sumOfInstalments = safeMultiply(roundedInstalment, term);
    // If there's a rounding gap, the last payment is adjusted
    if (Math.abs(sumOfInstalments - exactTotal) > 0.001) {
      // last payment adjusted: sum of (term-1) normal payments + adjusted last
      const normalSum = safeMultiply(roundedInstalment, term - 1);
      const lastPayment = safeRound(safeSubtract(exactTotal, normalSum), 2);
      return safeRound(safeAdd(normalSum, lastPayment), 2);
    }
    return safeRound(sumOfInstalments, 2);
  }

  // Declining balance / Effective rate: simulate month-by-month like the schedule service
  const mRate = monthlyInterestRate(interestRate);
  if (interestRate === 0) {
    return safeRound(principal, 2);
  }

  const emi = safeRound(monthlyPayment, 2);
  let balance = principal;
  let totalPaid = 0;

  // Track per-instalment values so we can adjust the last one
  const instalments: { principal: number; interest: number; totalDue: number }[] = [];

  for (let i = 1; i <= term; i++) {
    const interest = safeRound(safeMultiply(balance, mRate, 8));
    const principalPmt = safeSubtract(emi, interest);
    balance = Math.max(0, safeSubtract(balance, principalPmt));

    instalments.push({
      principal: safeRound(principalPmt, 2),
      interest: safeRound(interest, 2),
      totalDue: safeRound(emi, 2),
    });
  }

  // Adjust last payment for remaining balance (mirrors schedule service exactly)
  if (balance !== 0 && instalments.length > 0) {
    const last = instalments[instalments.length - 1];
    last.principal = safeRound(safeAdd(last.principal, balance), 2);
    last.totalDue = safeRound(safeAdd(last.principal, last.interest), 2);
  }

  for (const inst of instalments) {
    totalPaid = safeAdd(totalPaid, inst.totalDue);
  }

  return safeRound(totalPaid, 2);
}

// ============================================
// Computed values
// ============================================

function calculateValues(loan: LoanForAgreement): AgreementComputedValues {
  const principal = toSafeNumber(loan.principalAmount);
  const interestRate = toSafeNumber(loan.interestRate);
  const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
    ? loan.borrower.companyName
    : loan.borrower.name;

  const flatInterest = calculateFlatInterest(principal, interestRate, loan.term);
  const monthlyPaymentFlat = safeDivide(safeAdd(principal, flatInterest), loan.term);
  const monthlyPaymentEmi = calculateEMI(principal, interestRate, loan.term);
  const isFlat = loan.product.interestModel === 'FLAT';
  const monthlyPayment = isFlat ? monthlyPaymentFlat : monthlyPaymentEmi;

  // Calculate totalPayable by simulating the actual schedule (including last-payment
  // rounding adjustment) so the agreement PDF matches the real schedule exactly.
  const totalPayable = computeScheduleTotal(principal, interestRate, loan.term, isFlat, monthlyPayment);
  const totalInterest = safeRound(totalPayable - principal, 2);

  const lenderLines = [loan.tenant.name];
  if (loan.tenant.registrationNumber) lenderLines.push(`No. Pendaftaran: ${loan.tenant.registrationNumber}`);
  if (loan.tenant.licenseNumber) lenderLines.push(`No. Lesen: ${loan.tenant.licenseNumber}`);
  if (loan.tenant.businessAddress) lenderLines.push(loan.tenant.businessAddress);

  const borrowerLines = [borrowerName];
  if (loan.borrower.borrowerType === 'CORPORATE') {
    if (loan.borrower.companyRegistrationNumber) {
      borrowerLines.push(`No. Pendaftaran Syarikat: ${loan.borrower.companyRegistrationNumber}`);
    }
  } else {
    borrowerLines.push(`No. K.P.: ${loan.borrower.icNumber}`);
  }
  if (loan.borrower.address) borrowerLines.push(loan.borrower.address);

  let borrowerDisplayName = borrowerName;
  if (loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyRegistrationNumber) {
    borrowerDisplayName = `${borrowerName} (${loan.borrower.companyRegistrationNumber})`;
  } else if (loan.borrower.borrowerType !== 'CORPORATE') {
    borrowerDisplayName = `${borrowerName} (No. K.P.: ${loan.borrower.icNumber})`;
  }

  const effectiveFirstRepaymentDate = loan.firstRepaymentDate ? new Date(loan.firstRepaymentDate) : null;
  const effectiveRepaymentDay = loan.monthlyRepaymentDay
    ?? (effectiveFirstRepaymentDate ? effectiveFirstRepaymentDate.getDate() : null);

  return {
    principal,
    interestRate,
    monthlyPayment,
    totalPayable,
    totalInterest,
    agreementDateText: formatMalayDate(new Date()),
    firstRepaymentDateText: effectiveFirstRepaymentDate ? formatMalayDate(effectiveFirstRepaymentDate) : '___________________',
    monthlyRepaymentDay: effectiveRepaymentDay,
    borrowerName,
    borrowerDisplayName,
    borrowerDetails: borrowerLines.join('\n'),
    lenderDetails: lenderLines.join('\n'),
  };
}

function getBorrowerSignatories(loan: LoanForAgreement, borrowerName: string): Signatory[] {
  if (loan.borrower.borrowerType !== 'CORPORATE') {
    // Individual borrower — one signature block with their name + IC
    return [{
      name: borrowerName,
      icNumber: loan.borrower.icNumber || '___________________',
      label: 'No. K.P.',
    }];
  }

  // Corporate borrower — company info on the left, director signs in the space
  const companyName = loan.borrower.companyName || borrowerName;
  const companyReg = loan.borrower.companyRegistrationNumber || '___________________';

  const directors = (loan.borrower.directors || [])
    .filter((d) => d.name?.trim() && d.icNumber?.trim())
    .slice(0, 10);

  if (directors.length > 0) {
    // One signature block per director, each with company info on left
    return directors.map((d) => ({
      name: companyName,
      icNumber: companyReg,
      label: 'No. Pendaftaran Syarikat',
      directorName: d.name,
      directorIc: d.icNumber,
      directorPosition: d.position?.trim() || 'Director',
    }));
  }

  // No directors — just company info, blank signature
  return [{
    name: companyName,
    icNumber: companyReg,
    label: 'No. Pendaftaran Syarikat',
  }];
}

// ============================================
// Signature drawing — matching template layout
// ============================================
// Template shows:
//   DITANDATANGANI oleh Peminjam             )
//   yang bernama di atas                      )
//   Nama..........................................................  )
//   No. K.P./No. Pendaftaran Syarikat ........  )
// The ) brackets are vertically aligned at a fixed column.
// For auto-filled names/ICs, we print the value with dotted underline.

function drawBorrowerSigBlock(doc: PDFKit.PDFDocument, sig: Signatory, y: number): number {
  const lineH = 22; // line height between each row in block (matches ~2.0 spacing)
  const startY = y;  // remember start for right-side director info
  doc.font(FR).fontSize(FS_BODY);

  // Row 1
  doc.text('DITANDATANGANI oleh Peminjam', ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  // Row 2
  doc.text('yang bernama di atas', ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  // Row 3: Nama — company name (corporate) or borrower name (individual)
  doc.text(`Nama: ${sig.name}`, ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  // Row 4: ID — company reg (corporate) or IC (individual)
  doc.text(`${sig.label}: ${sig.icNumber}`, ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  // For corporate: director signature info in the blank space to the RIGHT of )
  if (sig.directorName) {
    const rightX = BRACKET_COL + 16; // start after the ) bracket
    const rightW = PAGE_WIDTH - MR - rightX; // available width to right margin
    // Signature line in the right column, vertically centered with rows 1-2
    const sigLineY = startY + lineH * 2 - 4; // between rows 2 and 3
    doc.save().lineWidth(0.4).dash(1.5, { space: 2 });
    doc.moveTo(rightX, sigLineY).lineTo(rightX + rightW, sigLineY).stroke('#000');
    doc.undash().restore();
    // Director name + IC + Designation below the signature line
    doc.font(FR).fontSize(FS_SMALL);
    doc.text(sig.directorName, rightX, sigLineY + 3, { width: rightW, align: 'center' });
    doc.text(`No. K.P.: ${sig.directorIc || ''}`, rightX, doc.y + 1, { width: rightW, align: 'center' });
    doc.text(`Designation: ${sig.directorPosition || 'Director'}`, rightX, doc.y + 1, { width: rightW, align: 'center' });
    doc.font(FR).fontSize(FS_BODY); // restore
  }

  return y;
}

function drawLenderSigBlock(doc: PDFKit.PDFDocument, loan: LoanForAgreement, y: number): number {
  const lineH = 22;
  doc.font(FR).fontSize(FS_BODY);

  doc.text('DITANDATANGANI oleh', ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  doc.text('Pemberi Pinjam yang bernama di atas', ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  doc.text(`Nama: ${loan.tenant.name}`, ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  const idText = loan.tenant.registrationNumber
    ? `No. K.P./No. Pendaftaran Syarikat: ${loan.tenant.registrationNumber}`
    : 'No. K.P./No. Pendaftaran Syarikat: ___________________';
  doc.text(idText, ML, y);
  doc.text(')', BRACKET_COL, y);
  y += lineH;

  return y;
}

// ============================================
// Jadual J — Continuous flow renderer
// ============================================
// All legal content flows continuously. Page breaks happen automatically
// when content nears the bottom margin. Signature pages and Jadual Pertama
// are forced to new pages.

const PAGE_BOTTOM = PAGE_HEIGHT - MB; // usable bottom boundary

/** Check remaining space; if insufficient, add a page and return MT. */
function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage();
    return MT;
  }
  return y;
}

/** Section heading gap (before a bold heading like "Keingkaran"). */
const SEC_GAP = 14;
/** Paragraph gap (between clauses). */
const PARA_GAP = 6;

function drawJadualJContent(doc: PDFKit.PDFDocument, loan: LoanForAgreement, v: AgreementComputedValues, signatories: Signatory[]): void {
  let y = MT;

  // ==== HEADER BLOCK ====
  // ~2.0 line spacing (20pt) between each header section
  const HDR_GAP = 20;

  doc.font(FB).fontSize(14);
  doc.text('JADUAL J', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FI).fontSize(FS_BODY);
  doc.text('AKTA PEMBERI PINJAM WANG 1951', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FR).fontSize(FS_BODY);
  doc.text('PERATURAN-PERATURAN PEMBERI PINJAM WANG (KAWALAN DAN', ML, y, { width: CW, align: 'center' });
  y = doc.y;
  doc.text('PELESENAN) 2003', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FR).fontSize(FS_BODY);
  doc.text('(Subperaturan 10(1))', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FB).fontSize(FS_BODY);
  doc.text('PERJANJIAN PEMBERIAN PINJAMAN WANG (PINJAMAN TANPA', ML, y, { width: CW, align: 'center' });
  y = doc.y;
  doc.text('CAGARAN)', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  // ==== SUATU PERJANJIAN ====
  y = ensureSpace(doc, y, 100);
  y = boldPara(doc,
    'SUATU PERJANJIAN ',
    `diperbuat pada hari dan tahun yang dinyatakan dalam Seksyen 1 Jadual Pertama kepada Perjanjian ini di antara pemberi pinjam wang yang dinyatakan dalam seksyen 2 Jadual Pertama (\u201CPemberi Pinjam\u201D) sebagai satu pihak dan peminjam yang dinyatakan dalam seksyen 3 Jadual Pertama (\u201CPeminjam\u201D) sebagai pihak yang satu lagi.`,
    ML, y, CW
  );
  y += SEC_GAP;

  // ==== BAHAWASANYA ====
  y = ensureSpace(doc, y, 100);
  y = boldPara(doc,
    'BAHAWASANYA ',
    `Pemberi Pinjam adalah seorang pemberi pinjam wang berlesen di bawah Akta Pemberi Pinjam Wang 1951 dengan ini bersetuju untuk meminjamkan kepada Peminjam dan Peminjam bersetuju untuk meminjam daripada Pemberi Pinjam bagi maksud Perjanjian ini suatu jumlah wang yang dinyatakan dalam seksyen 4 Jadual Pertama (\u201CJumlah Wang Pokok\u201D).`,
    ML, y, CW
  );
  y += SEC_GAP;

  // ==== MAKA ADALAH DENGAN INI DIPERSETUJUI ====
  y = ensureSpace(doc, y, 40);
  // Manually center the bold + regular text as one unit
  const makaBold = 'MAKA ADALAH DENGAN INI DIPERSETUJUI ';
  const makaReg = 'seperti yang berikut:';
  doc.font(FB).fontSize(FS_BODY);
  const makaBoldW = doc.widthOfString(makaBold);
  doc.font(FR).fontSize(FS_BODY);
  const makaRegW = doc.widthOfString(makaReg);
  const makaX = ML + (CW - makaBoldW - makaRegW) / 2;
  doc.font(FB).fontSize(FS_BODY).text(makaBold, makaX, y, { continued: true });
  doc.font(FR).text(makaReg);
  y = doc.y + SEC_GAP;

  // ================================================================
  // CLAUSE 1 — Bayaran balik ansuran
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Bayaran balik ansuran', ML, y);
  y = doc.y + PARA_GAP;

  const repayDay = v.monthlyRepaymentDay != null ? `${v.monthlyRepaymentDay} HB` : '_______________';
  const firstRepayDate = v.firstRepaymentDateText;
  const termText = v.monthlyRepaymentDay != null ? String(loan.term) : '_______________';

  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('1.', ML, y);
  // Render clause 1 with underlined auto-filled values using continued segments
  const c1Opts = { width: CW, align: 'justify' as const, lineGap: LG, indent: IND_BODY };
  doc.font(FR).fontSize(FS_BODY)
    .text('Bayaran balik ansuran dalam Perjanjian ini hendaklah genap masa dan kena dibayar tanpa dituntut yang bayaran balik ansuran pertama hendaklah dibuat pada ', ML, y, { ...c1Opts, continued: true })
    .text(` ${firstRepayDate} `, { continued: true, underline: true })
    .text('(tarikh bayaran balik yang pertama) dan selepas itu pada ', { continued: true, underline: false })
    .text(` ${repayDay} `, { continued: true, underline: true })
    .text('setiap dan tiap-tiap bulan yang berikutnya sehingga tamat ', { continued: true, underline: false })
    .text(` ${termText} `, { continued: true, underline: true })
    .text('bulan tersebut dari tarikh bayaran ansuran pertama tersebut.', { underline: false });
  y = doc.y;
  y += SEC_GAP;

  // ================================================================
  // CLAUSE 2 — Keingkaran
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Keingkaran', ML, y);
  y = doc.y + PARA_GAP;

  // 2(1) — number "2." at left margin, "(1)" after, text indented on first line only
  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('2.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc,
    'Jika keingkaran dilakukan dalam bayaran balik pada tarikh genap akan mana-mana jumlah bayaran balik yang kena dibayar kepada Pemberi Pinjam di bawah Perjanjian ini, sama ada berkenaan dengan wang pokok atau faedah, maka Pemberi Pinjam adalah berhak untuk mengenakan faedah ringan ke atas jumlah wang ansuran yang tidak dibayar itu yang hendaklah dikira pada kadar lapan peratus setahun dari hari ke hari dari tarikh keingkaran bayaran balik jumlah wang ansuran itu sehingga jumlah wang ansuran itu dijelaskan, dan apa-apa faedah yang dikenakan tidak boleh dikira bagi maksud Perjanjian ini sebagai sebahagian daripada faedah yang dikenakan berkenaan dengan pinjaman.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP;

  // 2(2) — formula section
  y = ensureSpace(doc, y, 160);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(2)', ML + IND1, y);
  y = para(doc,
    'Faedah hendaklah dikira mengikut formula yang berikut:',
    ML, y, CW, { indent: IND_SUB }
  );
  y += 14;

  // Formula: R = 8/100 x D/365 x S
  const fX = ML + IND_SUB + 50;
  doc.font(FR).fontSize(FS_BODY);
  doc.text('R  =', fX - 8, y + 4);

  const f1X = fX + 40;
  doc.text('8', f1X + 4, y - 1);
  doc.save().lineWidth(0.5);
  doc.moveTo(f1X - 2, y + 11).lineTo(f1X + 18, y + 11).stroke('#000');
  doc.restore();
  doc.text('100', f1X - 2, y + 14, { width: 22, align: 'center' });

  doc.text('x', f1X + 28, y + 4);

  const f2X = f1X + 48;
  doc.text('D', f2X + 4, y - 1);
  doc.save().lineWidth(0.5);
  doc.moveTo(f2X - 2, y + 11).lineTo(f2X + 22, y + 11).stroke('#000');
  doc.restore();
  doc.text('365', f2X - 2, y + 14, { width: 26, align: 'center' });

  doc.text('x', f2X + 32, y + 4);
  doc.text('S', f2X + 50, y + 4);
  y += 40;

  // Variable legend
  doc.font(FR).fontSize(FS_BODY).text('iaitu,', ML + IND_SUB, y, { lineGap: LG });
  y = doc.y + 10;

  const defX = ML + IND_SUB;
  const defValX = defX + 28;
  const defW = CW - IND_SUB - 28;

  doc.font(FB).fontSize(FS_BODY).text('R', defX, y);
  doc.font(FR).text('mewakili jumlah wang faedah yang hendaklah dibayar.', defValX, y, { width: defW, lineGap: LG });
  y = doc.y + PARA_GAP;

  doc.font(FB).text('D', defX, y);
  doc.font(FR).text('mewakili bilangan hari keingkaran.', defValX, y, { width: defW, lineGap: LG });
  y = doc.y + PARA_GAP;

  doc.font(FB).text('S', defX, y);
  doc.font(FR).text('mewakili jumlah wang ansuran bulanan yang genap tempoh.', defValX, y, { width: defW, lineGap: LG });
  y = doc.y + SEC_GAP + 4;

  // ================================================================
  // CLAUSE 3 — Hak tindakan
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Hak tindakan', ML, y);
  y = doc.y + PARA_GAP;

  // 3(1)
  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('3.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc, 'Jika Peminjam \u2013', ML, y, CW, { indent: IND_SUB });
  y += PARA_GAP;

  // 3(1)(a) — text stays indented at IND_SUBSUB for ALL lines
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(a)', ML + IND_SUB + 20, y);
  y = para(doc,
    'tidak membayar balik apa-apa jumlah wang ansuran yang kena dibayar atau apa-apa jumlah daripada wang ansuran itu dan mana-mana faedah yang kena dibayar di bawah seksyen 5 Jadual Pertama bagi apa-apa tempoh yang melebihi dua puluh lapan hari selepas tarikh genapnya; atau',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 3(1)(b) — text stays indented at IND_SUBSUB for ALL lines
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(b)', ML + IND_SUB + 20, y);
  y = para(doc,
    'melakukan perbuatan kebankrapan atau memasuki mana-mana komposisi atau perkiraan dengan pemiutangnya atau, sebagai syarikat, memasuki penyelesaian likuidasi, sama ada secara paksa atau sukarela,',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // Closing for 3(1)
  y = ensureSpace(doc, y, 30);
  y = para(doc, 'maka Pemberi Pinjam boleh menamatkan Perjanjian ini.', ML, y, CW);
  y += SEC_GAP;

  // 3(2)
  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(2)', ML + IND1, y);
  y = para(doc,
    'Apabila berlaku mana-mana perkara yang dinyatakan dalam subklausa (1), Pemberi Pinjam hendaklah memberi Peminjam notis secara bertulis tidak kurang daripada empat belas hari supaya menganggapkan Perjanjian ini sebagai telah ditolak oleh Peminjam dan melainkan dalam sementara itu keingkaran itu dibetulkan atau jumlah wang ansuran yang belum dibayar dan faedah itu dijelaskan, maka Perjanjian ini hendaklah apabila tamat tempoh notis tersebut, atas pilihan Pemberi Pinjam disifatkan sebagai terbatal.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 3(3)
  y = ensureSpace(doc, y, 80);
  doc.text('(3)', ML + IND1, y);
  y = para(doc,
    `Sekiranya Perjanjian ini telah ditamatkan atau dibatalkan, maka Pemberi Pinjam boleh menuntut baki belum jelas daripada Peminjam mengikut peruntukan di bawah Perintah 45 Kaedah-Kaedah Mahkamah Rendah 1990 [P.U. (A) 97/90] jika baki belum jelas itu tidak lebih daripada dua ratus lima puluh ribu ringgit atau Perintah 79 Kaedah-Kaedah Mahkamah Tinggi 1980 [P.U. (A) 50/80] jika baki belum jelas itu lebih tinggi daripada dua ratus lima puluh ribu ringgit.`,
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 4 — Pematuhan undang-undang bertulis
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Pematuhan undang-undang bertulis', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('4.', ML, y);
  y = para(doc,
    'Pemberi Pinjam hendaklah, berkenaan dengan perniagaan meminjamkan wang, mematuhi peruntukan dan kehendak Akta Pemberi Pinjam Wang 1951 dan mana-mana undang-undang bertulis yang pada masa ini berkuat kuasa yang menyentuh perniagaan itu.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 5 — Duti setem dan fi pengakusaksian
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Duti setem dan fi pengakusaksian', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 40);
  doc.font(FR).fontSize(FS_BODY).text('5.', ML, y);
  y = para(doc,
    'Semua duti setem dan fi pengakusaksian yang dilakukan berkaitan dengan Perjanjian ini hendaklah ditanggung oleh Peminjam.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 6 — Penyampaian dokumen
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Penyampaian dokumen', ML, y);
  y = doc.y + PARA_GAP;

  // 6(1)
  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('6.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc,
    'Apa-apa notis, permintaan atau tuntutan yang dikehendaki disampaikan oleh mana-mana pihak kepada pihak yang satu lagi dalam Perjanjian ini hendaklah secara bertulis dan hendaklah disifatkan sebagai penyampaian yang mencukupi\u2013',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 6(1)(a) — text stays indented at IND_SUBSUB for ALL lines
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(a)', ML + IND_SUB + 20, y);
  y = para(doc,
    'jika ia dihantar oleh pihak itu atau peguam caranya melalui pos A.R berdaftar yang dialamatkan ke alamat pihak yang satu lagi seperti yang tersebut terdahulu daripada ini dan dalam hal yang sedemikian ia hendaklah disifatkan sebagai telah diterima apabila tamatnya tempoh lima hari dari pengepos\u00ADan surat berdaftar sedemikian; atau',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 6(1)(b) — text stays indented at IND_SUBSUB for ALL lines
  y = ensureSpace(doc, y, 60);
  doc.font(FI).fontSize(FS_BODY).text('(b)', ML + IND_SUB + 20, y);
  y = para(doc,
    'jika ia diberikan oleh pihak itu atau peguam caranya dengan tangan kepada pihak yang satu lagi atau peguam caranya.',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 6(2)
  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(2)', ML + IND1, y);
  y = para(doc,
    'Apa-apa pertukaran mengenai alamat oleh mana-mana pihak hendaklah dimaklumkan kepada pihak yang satu lagi.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 7 — Jadual
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Jadual', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('7.', ML, y);
  y = para(doc,
    'Jadual kepada Perjanjian ini hendaklah menjadi sebahagian daripada Perjanjian ini dan hendaklah dibaca, diambil dan diertikan sebagai suatu bahagian yang perlu dalam Perjanjian ini.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 8 — Masa merupakan pati perjanjian
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Masa merupakan pati perjanjian', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 40);
  doc.font(FR).fontSize(FS_BODY).text('8.', ML, y);
  y = para(doc,
    'Masa hendaklah menjadi intipati Perjanjian ini yang berhubungan dengan segala peruntukan dalam Perjanjian ini.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 9 — Orang-orang yang terikat kepada Perjanjian
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Orang-orang yang terikat kepada Perjanjian', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('9.', ML, y);
  y = para(doc,
    'Perjanjian ini hendaklah mengikat pengganti dalam hakmilik dan penerima serah hak yang dibenarkan kepada Pemberi Pinjam, waris, wakil peribadi, pengganti dalam hakmilik dan penerima serah hak yang dibenarkan kepada Peminjam.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // PADA MENYAKSIKAN HAL DI ATAS — no indentation
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY)
    .text('PADA MENYAKSIKAN HAL DI ATAS ', ML, y, { width: CW, continued: true, align: 'justify', lineGap: LG });
  doc.font(FR)
    .text('pihak-pihak kepada Perjanjian ini telah menurunkan tandatangan mereka pada hari dan tahun mula-mula bertulis di atas.', { align: 'justify', lineGap: LG });
  y = doc.y;
  y += 24;

  // ================================================================
  // SIGNATURE BLOCKS — Borrowers
  // ================================================================
  for (let i = 0; i < signatories.length; i++) {
    y = ensureSpace(doc, y, 90);
    y = drawBorrowerSigBlock(doc, signatories[i], y);
    y += 10;
  }

  // ================================================================
  // SIGNATURE BLOCK — Lender (new page to give signing space)
  // ================================================================
  doc.addPage();
  y = MT;
  y = drawLenderSigBlock(doc, loan, y);
  y += 40;

  // ================================================================
  // PENGAKUSAKSI (Attestation)
  // ================================================================
  y = ensureSpace(doc, y, 120);
  y = para(doc,
    'Saya, dengan sesungguhnya dan sebenarnya mengakui bahawa saya telah menerangkan terma-terma Perjanjian ini kepada Peminjam dan saya mendapati bahawa Peminjam telah memahami sifat dan akibat Perjanjian ini.',
    ML, y, CW
  );
  y += 90; // extra space for witness signature

  // Signature line (centered dots)
  const lineWidth = 260;
  const lineX = ML + (CW - lineWidth) / 2;
  doc.save().lineWidth(0.4).dash(1.5, { space: 2.5 });
  doc.moveTo(lineX, y).lineTo(lineX + lineWidth, y).stroke('#000');
  doc.undash().restore();
  y += 4;

  doc.font(FR).fontSize(FS_SMALL).text('(Nama pengakusaksi)', ML, y, { width: CW, align: 'center' });
  y = doc.y + 2;

  doc.text(
    '(Peguam bela dan Peguam cara, pegawai Perkhidmatan Kehakiman dan Perundangan, Pesuruhjaya Sumpah, Pegawai Daerah, Jaksa Pendamai atau orang yang dilantik oleh Menteri)',
    ML + 60, y, { width: CW - 120, align: 'center', lineGap: LG }
  );
}

// ============================================
// Jadual Pertama (last page) — works for both J and K
// ============================================

function drawTableCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  options?: {
    bold?: boolean;
    italic?: boolean;
    align?: 'left' | 'center' | 'right';
    fontSize?: number;
    paddingX?: number;
  }
): void {
  const paddingX = options?.paddingX ?? 6;
  // Draw the cell border
  doc.rect(x, y, width, height).lineWidth(0.5).stroke('#000000');
  // Calculate text height to vertically center
  const font = options?.bold && options?.italic ? FBI : options?.bold ? FB : options?.italic ? FI : FR;
  const fontSize = options?.fontSize ?? FS_TABLE;
  const textWidth = width - paddingX * 2;
  doc.font(font).fontSize(fontSize);
  const textH = doc.heightOfString(text, { width: textWidth, lineGap: 1 });
  const topOffset = Math.max(4, (height - textH) / 2);
  doc.text(text, x + paddingX, y + topOffset, {
    width: textWidth,
    align: options?.align ?? 'left',
    lineGap: 1,
  });
}

function buildJadualJRows(v: AgreementComputedValues): JadualRow[] {
  return [
    { no: '1.', perkara: 'Hari dan tahun Perjanjian ini', butir: v.agreementDateText },
    { no: '2.', perkara: 'Nama, No. K.P., No. Pendaftaran Syarikat, No. Lesen dan alamat Pemberi Pinjam', butir: v.lenderDetails },
    { no: '3.', perkara: 'Nama, No. K.P., No. Pendaftaran Syarikat dan alamat Peminjam', butir: v.borrowerDetails },
    { no: '4.', perkara: 'Jumlah Wang Pokok', butir: `${currencyToMalayWords(v.principal)}\n(${formatCurrency(v.principal)})` },
    { no: '5.', perkara: 'Kadar faedah', butir: `Kadar faedah adalah\n${capitalize(numberToMalayWords(Math.floor(v.interestRate)))} peratus (${v.interestRate}%)\nsetahun` },
    { no: '6.', perkara: 'Jumlah wang setiap bayaran balik ansuran', butir: formatCurrency(v.monthlyPayment) },
    { no: '7.', perkara: 'Jumlah keseluruhan bayaran balik', butir: formatCurrency(v.totalPayable) },
  ];
}

function buildJadualKRows(loan: LoanForAgreement, v: AgreementComputedValues): JadualRow[] {
  const repaymentDay = v.monthlyRepaymentDay;
  const collateralValue = loan.collateralValue && loan.collateralValue > 0 ? loan.collateralValue : 0;

  return [
    { no: '1.', perkara: 'Hari dan tahun Perjanjian ini', butir: v.agreementDateText },
    { no: '2.', perkara: 'Nama, No. K.P., No. Pendaftaran Syarikat, No. Lesen dan alamat Pemberi Pinjam', butir: v.lenderDetails },
    { no: '3.', perkara: 'Nama, No. K.P., No. Pendaftaran Syarikat dan alamat Peminjam', butir: v.borrowerDetails },
    { no: '4.', perkara: 'Jumlah Wang Pokok', butir: `${currencyToMalayWords(v.principal)}\n(${formatCurrency(v.principal)})` },
    { no: '5.', perkara: 'Kadar faedah', butir: `Kadar faedah adalah\n${capitalize(numberToMalayWords(Math.floor(v.interestRate)))} peratus (${v.interestRate}%)\nsetahun` },
    { no: '6.', perkara: 'Tempoh bayaran balik', butir: `${loan.term} bulan dari tarikh\npembayaran Jumlah Wang Pokok` },
    { no: '7.', perkara: 'Bilangan bayaran balik ansuran', butir: `${loan.term} ansuran` },
    { no: '8.', perkara: 'Jumlah wang bagi setiap bayaran balik ansuran', butir: formatCurrency(v.monthlyPayment) },
    { no: '9.', perkara: 'Cara bayaran balik', butir: repaymentDay ? `Bayaran balik yang pertama bermula pada hari ke-${repaymentDay} bulan yang berikutnya selepas tarikh pembayaran Jumlah Wang Pokok` : 'Mengikut jadual bayaran balik yang dipersetujui' },
    { no: '10.', perkara: 'Jumlah keseluruhan bayaran balik', butir: formatCurrency(v.totalPayable) },
    { no: '11.', perkara: 'Butir-butir Cagaran', butir: loan.collateralType || 'Tiada' },
    {
      no: '12.',
      perkara: 'Nilai Cagaran',
      butir: collateralValue > 0
        ? `${currencyToMalayWords(collateralValue)}\n(${formatCurrency(collateralValue)})`
        : 'Tidak berkenaan',
    },
  ];
}

function drawJadualPertamaPage(doc: PDFKit.PDFDocument, rows: JadualRow[]): void {
  let y = MT;

  // Title — no underline, no bold (matching template)
  doc.font(FR).fontSize(FS_HEADING).text('JADUAL PERTAMA', ML, y, { width: CW, align: 'center' });
  y = doc.y + 6;

  doc.font(FR).fontSize(FS_SMALL).text(
    '(yang hendaklah dibaca dan diertikan sebagai\nsuatu  bahagian penting Perjanjian ini)',
    ML, y, { width: CW, align: 'center', lineGap: LG_TIGHT }
  );
  y = doc.y + 14;

  // Table
  const x = ML;
  const noWidth = 52;
  const perkaraWidth = 190;
  const butirWidth = CW - noWidth - perkaraWidth;

  // Header row
  const headerHeight = 30;
  drawTableCell(doc, x, y, noWidth, headerHeight, 'No.\nSeksyen', { italic: true, align: 'center', fontSize: FS_TABLE });
  drawTableCell(doc, x + noWidth, y, perkaraWidth, headerHeight, 'Perkara', { italic: true, align: 'center', fontSize: FS_TABLE });
  drawTableCell(doc, x + noWidth + perkaraWidth, y, butirWidth, headerHeight, 'Butir-butir', { italic: true, align: 'center', fontSize: FS_TABLE });
  y += headerHeight;

  // Data rows
  for (const row of rows) {
    doc.font(FR).fontSize(FS_TABLE);
    const perkaraH = doc.heightOfString(row.perkara, { width: perkaraWidth - 12, lineGap: 1 });
    const butirH = doc.heightOfString(row.butir, { width: butirWidth - 12, lineGap: 1 });
    const rowHeight = Math.max(34, Math.ceil(Math.max(perkaraH, butirH)) + 14);

    if (y + rowHeight > PAGE_HEIGHT - MB) {
      doc.addPage();
      y = MT;
    }

    drawTableCell(doc, x, y, noWidth, rowHeight, row.no, { align: 'center', fontSize: FS_TABLE });
    drawTableCell(doc, x + noWidth, y, perkaraWidth, rowHeight, row.perkara, { fontSize: FS_TABLE });
    drawTableCell(doc, x + noWidth + perkaraWidth, y, butirWidth, rowHeight, row.butir, { fontSize: FS_TABLE });
    y += rowHeight;
  }
}

// ============================================
// Jadual K — Continuous flow renderer (exact KPKT template)
// ============================================

function drawJadualKContent(doc: PDFKit.PDFDocument, loan: LoanForAgreement, v: AgreementComputedValues, signatories: Signatory[]): void {
  let y = MT;

  // ==== HEADER BLOCK ====
  const HDR_GAP = 20;

  doc.font(FB).fontSize(14);
  doc.text('JADUAL K', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FI).fontSize(FS_BODY);
  doc.text('AKTA PEMBERI PINJAM WANG 1951', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FR).fontSize(FS_BODY);
  doc.text('PERATURAN-PERATURAN PEMBERI PINJAM WANG (KAWALAN DAN', ML, y, { width: CW, align: 'center' });
  y = doc.y;
  doc.text('PELESENAN) 2003', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FR).fontSize(FS_BODY);
  doc.text('(Subperaturan 10(1))', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  doc.font(FB).fontSize(FS_BODY);
  doc.text('PERJANJIAN PEMBERIAN PINJAMAN WANG (PINJAMAN BERCAGAR)', ML, y, { width: CW, align: 'center' });
  y = doc.y + HDR_GAP;

  // ==== SUATU PERJANJIAN ====
  y = ensureSpace(doc, y, 100);
  y = boldPara(doc,
    'SUATU PERJANJIAN ',
    `diperbuat pada hari dan tahun yang dinyatakan dalam Seksyen 1 Jadual Pertama kepada Perjanjian ini di antara pemberi pinjam wang yang dinyatakan dalam seksyen 2 Jadual Pertama (\u201CPemberi Pinjam\u201D) sebagai satu pihak dan peminjam yang dinyatakan dalam seksyen 3 Jadual Pertama (\u201CPeminjam\u201D) sebagai pihak yang satu lagi.`,
    ML, y, CW
  );
  y += SEC_GAP;

  // ==== BAHAWASANYA ====
  y = ensureSpace(doc, y, 100);
  y = boldPara(doc,
    'BAHAWASANYA ',
    `Pemberi Pinjam adalah seorang pemberi pinjam wang berlesen di bawah Akta Pemberi Pinjam Wang 1951 dengan ini bersetuju untuk meminjamkan kepada Peminjam dan Peminjam bersetuju untuk meminjam daripada Pemberi Pinjam bagi maksud Perjanjian ini suatu jumlah wang yang dinyatakan dalam seksyen 4 Jadual Pertama (\u201CJumlah Wang Pokok\u201D).`,
    ML, y, CW
  );
  y += SEC_GAP;

  // ==== MAKA ADALAH DENGAN INI DIPERSETUJUI ====
  y = ensureSpace(doc, y, 40);
  const makaBold = 'MAKA ADALAH DENGAN INI DIPERSETUJUI ';
  const makaReg = 'seperti yang berikut:';
  doc.font(FB).fontSize(FS_BODY);
  const makaBoldW2 = doc.widthOfString(makaBold);
  doc.font(FR).fontSize(FS_BODY);
  const makaRegW2 = doc.widthOfString(makaReg);
  const makaX2 = ML + (CW - makaBoldW2 - makaRegW2) / 2;
  doc.font(FB).fontSize(FS_BODY).text(makaBold, makaX2, y, { continued: true });
  doc.font(FR).text(makaReg);
  y = doc.y + SEC_GAP;

  // ================================================================
  // CLAUSE 1 — Bayaran balik ansuran
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Bayaran balik ansuran', ML, y);
  y = doc.y + PARA_GAP;

  const repayDay = v.monthlyRepaymentDay != null ? `${v.monthlyRepaymentDay} HB` : '_______________';
  const firstRepayDate = v.firstRepaymentDateText;
  const termText = v.monthlyRepaymentDay != null ? String(loan.term) : '_______________';

  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('1.', ML, y);
  const c1OptsK = { width: CW, align: 'justify' as const, lineGap: LG, indent: IND_BODY };
  doc.font(FR).fontSize(FS_BODY)
    .text('Bayaran balik ansuran dalam Perjanjian ini hendaklah genap masa dan kena dibayar tanpa dituntut yang bayaran balik ansuran pertama hendaklah dibuat pada ', ML, y, { ...c1OptsK, continued: true })
    .text(` ${firstRepayDate} `, { continued: true, underline: true })
    .text('(tarikh bayaran balik yang pertama) dan selepas itu pada ', { continued: true, underline: false })
    .text(` ${repayDay} `, { continued: true, underline: true })
    .text('setiap dan tiap-tiap bulan yang berikutnya sehingga tamat ', { continued: true, underline: false })
    .text(` ${termText} `, { continued: true, underline: true })
    .text('bulan tersebut dari tarikh bayaran ansuran pertama tersebut.', { underline: false });
  y = doc.y;
  y += SEC_GAP;

  // ================================================================
  // CLAUSE 2 — Keingkaran
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Keingkaran', ML, y);
  y = doc.y + PARA_GAP;

  // 2(1)
  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('2.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc,
    'Jika keingkaran dilakukan dalam bayaran balik pada tarikh genap akan mana-mana jumlah bayaran balik yang kena dibayar kepada Pemberi Pinjam di bawah Perjanjian ini, sama ada berkenaan dengan wang pokok atau faedah, maka Pemberi Pinjam adalah berhak untuk mengenakan faedah ringan ke atas jumlah wang ansuran yang tidak dibayar itu yang hendaklah dikira pada kadar lapan peratus setahun dari hari ke hari dari tarikh keingkaran bayaran balik jumlah wang ansuran itu sehingga jumlah wang ansuran itu dijelaskan, dan apa-apa faedah yang dikenakan tidak boleh dikira bagi maksud Perjanjian ini sebagai sebahagian daripada faedah yang dikenakan berkenaan dengan pinjaman.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP;

  // 2(3) — formula section (template uses (3) after the long 2(1))
  y = ensureSpace(doc, y, 160);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(3)', ML + IND1, y);
  y = para(doc,
    'Faedah hendaklah dikira mengikut formula yang berikut:',
    ML, y, CW, { indent: IND_SUB }
  );
  y += 14;

  // Formula: R = 8/100 x D/365 x S
  const fX = ML + IND_SUB + 50;
  doc.font(FR).fontSize(FS_BODY);
  doc.text('R  =', fX - 8, y + 4);

  const f1X = fX + 40;
  doc.text('8', f1X + 4, y - 1);
  doc.save().lineWidth(0.5);
  doc.moveTo(f1X - 2, y + 11).lineTo(f1X + 18, y + 11).stroke('#000');
  doc.restore();
  doc.text('100', f1X - 2, y + 14, { width: 22, align: 'center' });

  doc.text('x', f1X + 28, y + 4);

  const f2X = f1X + 48;
  doc.text('D', f2X + 4, y - 1);
  doc.save().lineWidth(0.5);
  doc.moveTo(f2X - 2, y + 11).lineTo(f2X + 22, y + 11).stroke('#000');
  doc.restore();
  doc.text('365', f2X - 2, y + 14, { width: 26, align: 'center' });

  doc.text('x', f2X + 32, y + 4);
  doc.text('S', f2X + 50, y + 4);
  y += 40;

  // Variable legend
  doc.font(FR).fontSize(FS_BODY).text('iaitu,', ML + IND_SUB, y, { lineGap: LG });
  y = doc.y + 10;

  const defX = ML + IND_SUB;
  const defValX = defX + 28;
  const defW = CW - IND_SUB - 28;

  doc.font(FB).fontSize(FS_BODY).text('R', defX, y);
  doc.font(FR).text('mewakili jumlah wang faedah yang hendaklah dibayar.', defValX, y, { width: defW, lineGap: LG });
  y = doc.y + PARA_GAP;

  doc.font(FB).text('D', defX, y);
  doc.font(FR).text('mewakili bilangan hari keingkaran.', defValX, y, { width: defW, lineGap: LG });
  y = doc.y + PARA_GAP;

  doc.font(FB).text('S', defX, y);
  doc.font(FR).text('mewakili jumlah wang ansuran bulanan yang genap tempoh.', defValX, y, { width: defW, lineGap: LG });
  y = doc.y + SEC_GAP + 4;

  // ================================================================
  // CLAUSE 3 — Cagaran
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Cagaran', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('3.', ML, y);
  y = para(doc,
    'Sebagai balasan bagi Perjanjian ini Peminjam bersetuju untuk menyerahkan kepada Pemberi Pinjam cagaran yang dinyatakan dalam seksyen 11 Jadual Pertama (\u201CCagaran\u201D) dan Cagaran itu hendaklah bagi sepanjang tempoh bayaran balik.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 4 — Tanggungjawab Pemberi Pinjam berkenaan dengan Cagaran
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Tanggungjawab Pemberi Pinjam berkenaan dengan Cagaran', ML, y);
  y = doc.y + PARA_GAP;

  // 4(1)
  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('4.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc,
    'Pemberi Pinjam hendaklah melakukan pemeliharaan dan usaha yang sama bagi menjaga Cagaran dalam jagaannya sebagaimana seorang pemunya berhemat akan lakukan dalam menjaga hartanya sendiri.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 4(2)
  y = ensureSpace(doc, y, 60);
  doc.text('(2)', ML + IND1, y);
  y = para(doc,
    'Pemberi Pinjam adalah bertanggungjawab bagi kehilangan apa-apa Cagaran, sama ada kehilangan itu disebabkan oleh kebakaran, kecurian, kecuaian atau selainnya dan adalah juga bertanggungjawab bagi kerosakan Cagaran itu yang disebabkan oleh kebakaran, kecurian, kecuaian atau selainnya.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 4(3)
  y = ensureSpace(doc, y, 60);
  doc.text('(3)', ML + IND1, y);
  y = para(doc,
    'Jika mana-mana Cagaran yang musnah atau rosak disebabkan oleh kebakaran, maka nilai Cagaran itu hendaklah, bagi maksud pampasan kepada Peminjam, dianggap sebagai satu perempat lebih daripada nilai Cagaran yang diserahkan itu.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 4(4)
  y = ensureSpace(doc, y, 40);
  doc.text('(4)', ML + IND1, y);
  y = para(doc,
    'Pemberi Pinjam tidak boleh membebankan Cagaran itu bagi apa jua tujuan.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 5 — Hak tindakan
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Hak tindakan', ML, y);
  y = doc.y + PARA_GAP;

  // 5(1)
  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('5.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc, 'Jika Peminjam \u2013', ML, y, CW, { indent: IND_SUB });
  y += PARA_GAP;

  // 5(1)(a)
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(a)', ML + IND_SUB + 20, y);
  y = para(doc,
    'tidak membayar balik mana-mana jumlah wang ansuran yang kena dibayar atau mana-mana jumlah daripada wang ansuran itu dan mana-mana faedah yang kena dibayar yang dinyatakan dalam seksyen 5 Jadual Pertama bagi apa-apa tempoh yang melebihi dua puluh lapan hari selepas tarikh genapnya; atau',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 5(1)(b)
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(b)', ML + IND_SUB + 20, y);
  y = para(doc,
    'melakukan perbuatan kebankrapan atau memasuki mana-mana komposisi atau perkiraan dengan pemiutangnya atau, sebagai syarikat, memasuki penyelesaian likuidasi, sama ada secara paksa atau sukarela,',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // Closing for 5(1)
  y = ensureSpace(doc, y, 30);
  y = para(doc, 'maka Pemberi Pinjam boleh menamatkan Perjanjian ini.', ML, y, CW);
  y += SEC_GAP;

  // 5(2)
  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(2)', ML + IND1, y);
  y = para(doc,
    'Apabila berlakunya mana-mana perkara yang dinyatakan dalam subfasal (1), Pemberi Pinjam hendaklah memberi Peminjam notis bertulis tidak kurang daripada empat belas hari supaya menganggapkan Perjanjian ini sebagai telah ditolak oleh Peminjam dan melainkan dalam sementara itu keingkaran itu dibetulkan atau jumlah wang ansuran yang belum dibayar dan faedah itu dijelaskan, maka Perjanjian ini hendaklah apabila tamat tempoh notis tersebut, atas pilihan Pemberi Pinjam disifatkan sebagai terbatal.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(3)
  y = ensureSpace(doc, y, 80);
  doc.text('(3)', ML + IND1, y);
  y = para(doc,
    `Sekiranya Perjanjian ini telah ditamatkan atau dibatalkan, maka Pemberi Pinjam boleh menuntut baki belum jelas daripada Peminjam mengikut peruntukan di bawah Perintah 45 Kaedah-Kaedah Mahkamah Rendah 1990 [P.U. (A) 97/1990] jika baki belum jelas itu tidak lebih daripada dua ratus lima puluh ribu ringgit atau Perintah 79 Kaedah-Kaedah Mahkamah Tinggi 1980 [P.U. (A) 50/1980] jika baki belum jelas itu lebih tinggi daripada dua ratus lima puluh ribu ringgit.`,
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(4)
  y = ensureSpace(doc, y, 60);
  doc.text('(4)', ML + IND1, y);
  y = para(doc,
    'Walau apapun subfasal (3) di dalam ini, Pemberi Pinjam berhak untuk memperlakukan Cagaran itu bagi maksud menuntut baki belum jelas daripada Peminjam seperti yang berikut:',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(4)(a)
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(a)', ML + IND_SUB + 20, y);
  y = para(doc,
    'jika Cagaran itu adalah harta tak alih, maka harta itu hendaklah diperlakukan seperti yang diperuntukkan di bawah Perintah 83 Kaedah-Kaedah Mahkamah Tinggi 1980; atau',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 5(4)(b)
  y = ensureSpace(doc, y, 60);
  doc.font(FI).fontSize(FS_BODY).text('(b)', ML + IND_SUB + 20, y);
  y = para(doc,
    'jika Cagaran itu adalah harta alih, maka Pemberi Pinjam adalah bebas untuk melupuskan Cagaran itu melalui lelongan yang dikendalikan oleh pelelong berlesen.',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 5(5)
  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(5)', ML + IND1, y);
  y = para(doc,
    'Pemberi Pinjam boleh menawar atau membeli Cagaran yang diserah simpan kepadanya di lelongan itu dan atas pembelian itu dia hendaklah disifatkan sebagai pemilik yang sah Cagaran itu.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(6)
  y = ensureSpace(doc, y, 60);
  doc.text('(6)', ML + IND1, y);
  y = para(doc,
    'Jika Cagaran itu dilelong, Pemberi Pinjam hendaklah, dalam masa tujuh hari selepas lelongan itu, mengemukakan kepada Peminjam suatu notis yang menyatakan butir-butir lelongan itu termasuklah hasil jualan Cagaran itu.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(7)
  y = ensureSpace(doc, y, 60);
  doc.text('(7)', ML + IND1, y);
  y = para(doc,
    'Pemberi Pinjam hendaklah, dalam masa tiga puluh hari selepas lelongan itu, membayar lebihan daripada hasil jualan Cagaran itu, jika ada, kepada Peminjam.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(8)
  y = ensureSpace(doc, y, 80);
  doc.text('(6)', ML + IND1, y); // template shows (6) here — follows original numbering
  y = para(doc,
    'Jika Pemberi Pinjam gagal mematuhi subfasal (7), Pemberi Pinjam adalah bertanggungan membayar jumlah wang lebihan itu kepada Peminjam berserta dengan ganti rugi jumlah tertentu yang dikira dari hari ke hari pada kadar lapan peratus setahun daripada jumlah wang lebihan itu dari tamatnya tempoh tiga puluh hari selepas lelongan itu sehingga tarikh Pemberi Pinjam membayar jumlah wang lebihan itu.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 5(9)
  y = ensureSpace(doc, y, 60);
  doc.text('(9)', ML + IND1, y);
  y = para(doc,
    'Bagi mengelakkan kekeliruan, apa-apa kausa tindakan untuk menuntut ganti rugi jumlah tertentu yang dinyatakan dalam subfasal (8) hendaklah terakru pada tarikh tamatnya tempoh tiga puluh hari selepas lelongan itu.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 6 — Pematuhan undang-undang bertulis
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Pematuhan undang-undang bertulis', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('6.', ML, y);
  y = para(doc,
    'Pemberi Pinjam hendaklah, berkenaan dengan perniagaan meminjamkan wang, mematuhi peruntukan dan kehendak Akta Pemberi Pinjam Wang 1951 dan mana-mana undang-undang bertulis yang pada masa ini berkuat kuasa yang menyentuh perniagaan itu.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 7 — Duti setem dan fi pengakusaksian
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Duti setem dan fi pengakusaksian', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 40);
  doc.font(FR).fontSize(FS_BODY).text('7.', ML, y);
  y = para(doc,
    'Semua duti setem dan fi pengakusaksian yang dilakukan berkaitan dengan Perjanjian ini hendaklah ditanggung oleh Peminjam.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 8 — Penyampaian dokumen
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Penyampaian dokumen', ML, y);
  y = doc.y + PARA_GAP;

  // 8(1)
  y = ensureSpace(doc, y, 80);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('8.', ML, y);
  doc.text('(1)', ML + IND1, y);
  y = para(doc,
    'Apa-apa notis, permintaan atau tuntutan yang dikehendaki disampaikan oleh mana-mana pihak kepada pihak yang satu lagi dalam Perjanjian ini hendaklah secara bertulis dan hendaklah disifatkan sebagai penyampaian yang mencukupi\u2013',
    ML, y, CW, { indent: IND_SUB }
  );
  y += PARA_GAP;

  // 8(1)(a)
  y = ensureSpace(doc, y, 80);
  doc.font(FI).fontSize(FS_BODY).text('(a)', ML + IND_SUB + 20, y);
  y = para(doc,
    'jika ia dihantar oleh pihak itu atau peguam caranya melalui pos A.R. berdaftar yang dialamatkan ke alamat pihak yang satu lagi seperti yang tersebut terdahulu daripada ini dan dalam hal yang sedemikian ia hendaklah disifatkan sebagai telah diterima apabila tamatnya tempoh lima hari dari pengeposan surat berdaftar demikian; atau',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 8(1)(b)
  y = ensureSpace(doc, y, 60);
  doc.font(FI).fontSize(FS_BODY).text('(b)', ML + IND_SUB + 20, y);
  y = para(doc,
    'jika ia diberikan oleh pihak itu atau peguam caranya dengan tangan kepada pihak yang satu lagi atau peguam caranya.',
    ML + IND_SUBSUB, y, CW - IND_SUBSUB
  );
  y += PARA_GAP;

  // 8(2)
  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY);
  doc.text('(2)', ML + IND1, y);
  y = para(doc,
    'Apa-apa perubahan mengenai alamat oleh mana-mana pihak hendaklah dimaklumkan kepada pihak yang satu lagi.',
    ML, y, CW, { indent: IND_SUB }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 9 — Jadual
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Jadual', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('9.', ML, y);
  y = para(doc,
    'Jadual kepada Perjanjian ini hendaklah menjadi sebahagian daripada Perjanjian ini dan hendaklah dibaca, diambil dan diertikan sebagai suatu bahagian yang perlu dalam Perjanjian ini.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 10 — Masa merupakan pati perjanjian
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Masa merupakan pati perjanjian', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 40);
  doc.font(FR).fontSize(FS_BODY).text('10.', ML, y);
  y = para(doc,
    'Masa hendaklah menjadi pati Perjanjian ini berhubungan dengan segala peruntukan dalam Perjanjian ini.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 11 — Tafsiran
  // ================================================================
  y = ensureSpace(doc, y, 60);
  doc.font(FB).fontSize(FS_BODY).text('Tafsiran', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 40);
  doc.font(FR).fontSize(FS_BODY).text('11.', ML, y);
  y = para(doc,
    'Dalam Perjanjian ini jika konteksnya menghendaki sedemikian \u2013',
    ML, y, CW, { indent: IND_BODY }
  );
  y += PARA_GAP;

  y = ensureSpace(doc, y, 60);
  y = para(doc,
    '\u201CCagaran\u201D tidaklah termasuk suatu kad kredit, kad caj, kad mesin juruwang automatik, sijil kelahiran, kad pengenalan atau surat pajak gadai.',
    ML + IND_BODY, y, CW - IND_BODY
  );
  y += SEC_GAP + 4;

  // ================================================================
  // CLAUSE 12 — Orang-orang yang terikat kepada Perjanjian
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY).text('Orang-orang yang terikat kepada Perjanjian', ML, y);
  y = doc.y + PARA_GAP;

  y = ensureSpace(doc, y, 60);
  doc.font(FR).fontSize(FS_BODY).text('12.', ML, y);
  y = para(doc,
    'Perjanjian ini hendaklah mengikat pengganti dalam hakmilik dan penerima serah hak yang dibenarkan kepada Pemberi Pinjam, waris, wakil peribadi, pengganti dalam hakmilik dan penerima serah hak yang dibenarkan kepada Peminjam.',
    ML, y, CW, { indent: IND_BODY }
  );
  y += SEC_GAP + 4;

  // ================================================================
  // PADA MENYAKSIKAN HAL DI ATAS — no indentation
  // ================================================================
  y = ensureSpace(doc, y, 80);
  doc.font(FB).fontSize(FS_BODY)
    .text('PADA MENYAKSIKAN HAL DI ATAS ', ML, y, { width: CW, continued: true, align: 'justify', lineGap: LG });
  doc.font(FR)
    .text('pihak-pihak kepada Perjanjian ini telah menurunkan tandatangan mereka pada hari dan tahun mula-mula bertulis di atas.', { align: 'justify', lineGap: LG });
  y = doc.y;
  y += 24;

  // ================================================================
  // SIGNATURE BLOCKS — Borrowers
  // ================================================================
  for (let i = 0; i < signatories.length; i++) {
    y = ensureSpace(doc, y, 90);
    y = drawBorrowerSigBlock(doc, signatories[i], y);
    y += 10;
  }

  // ================================================================
  // SIGNATURE BLOCK — Lender (new page to give signing space)
  // ================================================================
  doc.addPage();
  y = MT;
  y = drawLenderSigBlock(doc, loan, y);
  y += 40;

  // ================================================================
  // PENGAKUSAKSI (Attestation)
  // ================================================================
  y = ensureSpace(doc, y, 120);
  y = para(doc,
    'Saya, dengan sesungguhnya dan sebenarnya mengakui bahawa saya telah menerangkan terma-terma Perjanjian ini kepada Peminjam dan saya mendapati bahawa Peminjam telah memahami sifat dan akibat Perjanjian ini.',
    ML, y, CW
  );
  y += 90; // extra space for witness signature

  // Signature line (centered dots)
  const lineWidthK = 260;
  const lineXK = ML + (CW - lineWidthK) / 2;
  doc.save().lineWidth(0.4).dash(1.5, { space: 2.5 });
  doc.moveTo(lineXK, y).lineTo(lineXK + lineWidthK, y).stroke('#000');
  doc.undash().restore();
  y += 4;

  doc.font(FR).fontSize(FS_SMALL).text('(Nama pengakusaksi)', ML, y, { width: CW, align: 'center' });
  y = doc.y + 2;

  doc.text(
    '(Peguam bela dan Peguam cara, pegawai Perkhidmatan Kehakiman dan Perundangan, Pesuruhjaya Sumpah, Pegawai Daerah, Jaksa Pendamai atau orang yang dilantik oleh Menteri)',
    ML + 60, y, { width: CW - 120, align: 'center', lineGap: LG }
  );
}

// ============================================
// Main PDF generation
// ============================================

export async function generateLoanAgreement(loan: LoanForAgreement): Promise<Buffer> {
  const isJadualK = loan.product.loanScheduleType === 'JADUAL_K';
  const values = calculateValues(loan);
  const signatories = getBorrowerSignatories(loan, values.borrowerName);

  if (!isJadualK) {
    // ======== JADUAL J — exact KPKT template ========
    const jadualRows = buildJadualJRows(values);

    return createPdfBuffer((doc) => {
      // All legal content flows continuously with automatic page breaks
      drawJadualJContent(doc, loan, values, signatories);

      // JADUAL PERTAMA — always on its own page
      doc.addPage();
      drawJadualPertamaPage(doc, jadualRows);
    });
  }

  // ======== JADUAL K — exact KPKT template ========
  const jadualRows = buildJadualKRows(loan, values);

  return createPdfBuffer((doc) => {
    // All legal content flows continuously with automatic page breaks
    drawJadualKContent(doc, loan, values, signatories);

    // JADUAL PERTAMA — always on its own page
    doc.addPage();
    drawJadualPertamaPage(doc, jadualRows);
  });
}

// ============================================
// Test helpers
// ============================================

export async function generateCalibrationPdf(template: 'jadual-j' | 'jadual-k' = 'jadual-j'): Promise<Buffer> {
  const pageCount = template === 'jadual-k' ? 8 : 6;
  return createPdfBuffer((doc) => {
    for (let i = 0; i < pageCount; i++) {
      if (i > 0) doc.addPage();

      doc.font(FB).fontSize(12).fillColor('#cc0000').text(
        `${template.toUpperCase()} - Page ${i + 1}`,
        ML,
        20
      );

      doc.font(FR).fontSize(8).fillColor('#000000');
      for (let x = 0; x <= PAGE_WIDTH; x += 50) {
        doc.moveTo(x, 0).lineTo(x, PAGE_HEIGHT).strokeColor('#dddddd').stroke();
        if (x % 100 === 0) {
          doc.text(String(x), x + 2, 6, { width: 35 });
        }
      }
      for (let yy = 0; yy <= PAGE_HEIGHT; yy += 50) {
        doc.moveTo(0, yy).lineTo(PAGE_WIDTH, yy).strokeColor('#dddddd').stroke();
        if (yy % 100 === 0) {
          doc.text(String(yy), 4, yy + 2, { width: 35 });
        }
      }
    }
  });
}

export async function generateTestAgreement(template: 'jadual-j' | 'jadual-k' = 'jadual-j'): Promise<Buffer> {
  const isK = template === 'jadual-k';

  const testLoan: LoanForAgreement = {
    id: 'test-loan-001',
    principalAmount: new Decimal(10000),
    interestRate: new Decimal(isK ? 12 : 18),
    term: 12,
    firstRepaymentDate: new Date('2026-03-15'),
    monthlyRepaymentDay: 15,
    borrower: {
      name: 'Siti Nur Aisyah',
      icNumber: '900101011234',
      address: 'No. 123, Jalan Merdeka, Taman Bahagia, 50000 Kuala Lumpur',
      type: 'CORPORATE',
      borrowerType: 'CORPORATE',
      companyName: 'Maju Niaga Sdn. Bhd.',
      companyRegistrationNumber: '202101123456',
      directors: [
        { name: 'Siti Nur Aisyah', icNumber: '900101011234', position: 'Pengarah' },
        { name: 'Mohd Irfan Hakim', icNumber: '880808101010', position: 'Pengarah Urusan' },
      ],
    },
    tenant: {
      name: 'Pinjaman Mudah Sdn. Bhd.',
      registrationNumber: '1234567-A',
      licenseNumber: 'PPW/KL/2024/001',
      businessAddress: 'No. 456, Jalan Bisnes, Pusat Perniagaan, 50100 Kuala Lumpur',
    },
    product: {
      interestModel: 'FLAT',
      loanScheduleType: isK ? 'JADUAL_K' : 'JADUAL_J',
    },
    ...(isK
      ? {
          collateralType: 'Kenderaan - Proton X50 2024',
          collateralValue: 85000,
        }
      : {}),
  };

  return generateLoanAgreement(testLoan);
}
