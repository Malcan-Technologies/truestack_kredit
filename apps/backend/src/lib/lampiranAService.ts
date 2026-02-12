/**
 * Lampiran A Service
 * 
 * Generates Lampiran A (Borrower Account Ledger) PDF for KPKT compliance.
 * Format follows Akta Pemberi Pinjam Wang 1951 [Subseksyen 18(1)].
 * 
 * Layout matches the official PPW form exactly - clean black & white,
 * uniform borders, no background fills.
 * 
 * Uses pdfkit for PDF generation.
 */

import PDFDocument from 'pdfkit';

// ============================================
// Types
// ============================================

export interface LampiranABorrower {
  fullName: string;
  icNumber?: string;
  race?: string;
  gender?: string;
  occupation?: string;
  employmentStatus?: string;
  monthlyIncome?: string;
  address: string;
  // Corporate fields
  isCorporate?: boolean;
  companyRegNo?: string;
  bumiStatus?: string; // Bumi / Bukan Bumi / Asing
}

export interface LampiranALoan {
  disbursedAt: string;
  principalAmount: number;
  totalInterest: number;
  totalAmount: number;
  interestRateMonthly: number;
  isSecured: boolean;
  collateralType?: string;
  collateralValue?: number;
  term: number;
  monthlyPayment: number;
}

export interface LampiranARepayment {
  date: string;
  totalAmount: number;   // Balance before this payment (Jumlah Besar)
  paymentAmount: number;  // Amount paid (Bayaran Balik Pinjaman)
  balanceAfter: number;   // Balance after payment (Baki Pinjaman)
  receiptNumber?: string;
  status: number; // 1-4 based on catatan codes
  lateFee?: number;      // Late fee charged with this payment
  discount?: number;     // Early settlement discount (interest rebate)
}

export interface LampiranACompany {
  name: string;
  address: string;
  regNo?: string;
  licenseNo?: string;
}

export interface LampiranAData {
  borrower: LampiranABorrower;
  loan: LampiranALoan;
  repayments: LampiranARepayment[];
  company: LampiranACompany;
  generatedAt: string;
  loanStatus: string;
}

// ============================================
// Helpers
// ============================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-MY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/**
 * Get Bangsa (Race) for Lampiran A
 */
export const getBangsa = (race?: string): string => {
  if (!race) return '';
  const r = race.toUpperCase();
  if (r.includes('MALAY') || r === 'MELAYU') return 'Melayu';
  if (r.includes('CHINESE') || r === 'CINA') return 'Cina';
  if (r.includes('INDIAN') || r === 'INDIA') return 'India';
  if (r.includes('SABAH') || r.includes('SARAWAK') || r.includes('BUMIPUTRA') || r.includes('KADAZAN') || r.includes('IBAN') || r.includes('BIDAYUH')) return 'Bumiputra (Sabah/Sarawak)';
  if (r.includes('OTHER') || r.includes('LAIN')) return 'Lain-lain';
  return race;
};

/**
 * Get Pekerjaan (Occupation/Job title)
 */
export const getPekerjaan = (occupation?: string): string => {
  return occupation || '';
};

/**
 * Get Majikan (Employer type) for Lampiran A
 * Valid values: Kerajaan, Swasta, Berniaga, Kerja Sendiri, Tidak Bekerja
 */
export const getMajikan = (employmentStatus?: string): string => {
  if (!employmentStatus) return '';
  const status = employmentStatus.toUpperCase();
  if (status.includes('UNEMPLOYED') || status.includes('NOT WORKING') || status.includes('TIDAK BEKERJA') ||
    status.includes('STUDENT') || status.includes('PELAJAR') || status.includes('RETIRED') || status.includes('PENCEN')) {
    return 'Tidak Bekerja';
  }
  if (status.includes('GOVERNMENT') || status.includes('KERAJAAN')) return 'Kerajaan';
  if (status.includes('PRIVATE') || status.includes('SWASTA') || status.includes('EMPLOYED')) return 'Swasta';
  if (status.includes('BUSINESS') || status.includes('BERNIAGA')) return 'Berniaga';
  if (status.includes('SELF') || status.includes('FREELANCE') || status.includes('SENDIRI')) return 'Kerja Sendiri';
  return '';
};

/**
 * Get Jantina (Gender) translation
 */
export const getJantina = (gender?: string): string => {
  if (!gender) return '';
  const g = gender.toUpperCase();
  if (g === 'MALE' || g === 'M' || g === 'LELAKI') return 'Lelaki';
  if (g === 'FEMALE' || g === 'F' || g === 'PEREMPUAN') return 'Perempuan';
  return '';
};

const getStatusNote = (status: number): string => {
  switch (status) {
    case 1: return '1';
    case 2: return '2';
    case 3: return '3';
    case 4: return '4';
    default: return '2';
  }
};

/**
 * Determine loan status code for Catatan
 * 1. Pinjaman Selesai - Loan fully paid
 * 2. Pinjaman Semasa - Current active loan
 * 3. Dalam Proses Dapat Balik - In recovery
 * 4. Dalam Tindakan Mahkamah - Defaulted/legal action
 */
export function getLoanStatusCode(
  loanStatus: string,
  hasDefaultRiskFlag?: boolean,
): number {
  const status = loanStatus.toUpperCase();

  // Status 1: Pinjaman Selesai
  if (status === 'COMPLETED' || status === 'DISCHARGED' || status === 'SETTLED') {
    return 1;
  }

  // Status 4: Dalam Tindakan Mahkamah
  if (status === 'DEFAULTED' || status === 'DEFAULT' || status === 'IN_COURT' || status === 'LEGAL_ACTION') {
    return 4;
  }

  // Status 3: Dalam Proses Dapat Balik
  if (status === 'POTENTIAL_DEFAULT' || status === 'RECOVERY' || status === 'COLLECTION' ||
    status === 'OVERDUE' || status === 'IN_ARREARS' || hasDefaultRiskFlag) {
    return 3;
  }

  // Status 2: Pinjaman Semasa
  return 2;
}

/**
 * Get Nota (status note) for KPKT CSV format
 */
export function getLoanNota(loanStatus: string, hasDefaultRiskFlag?: boolean): string {
  const code = getLoanStatusCode(loanStatus, hasDefaultRiskFlag);
  switch (code) {
    case 1: return 'PINJAMAN SELESAI';
    case 3: return 'DALAM PROSES DAPAT BALIK';
    case 4: return 'DALAM TINDAKAN MAHKAMAH';
    default: return 'PINJAMAN SEMASA';
  }
}

// ============================================
// PDF Generation
// ============================================

// Page layout constants
const PAGE = {
  marginLeft: 50,
  marginRight: 50,
  marginTop: 40,
  marginBottom: 40,
  width: 595.28, // A4 width
  height: 841.89, // A4 height
};

const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;
const BORDER_COLOR = '#000000';
const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

/**
 * Draw a cell with border and optional text
 */
function drawCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  options?: {
    font?: string;
    fontSize?: number;
    align?: 'left' | 'center' | 'right';
    paddingLeft?: number;
    paddingTop?: number;
    bold?: boolean;
  },
): void {
  // Draw border
  doc.rect(x, y, w, h).stroke(BORDER_COLOR);

  // Draw text if provided
  if (text) {
    const font = options?.bold ? FONT_BOLD : (options?.font || FONT_REGULAR);
    const fontSize = options?.fontSize || 9;
    const align = options?.align || 'left';
    const paddingLeft = options?.paddingLeft ?? 4;
    const paddingTop = options?.paddingTop ?? 4;

    doc.font(font)
      .fontSize(fontSize)
      .fillColor('#000000')
      .text(text, x + paddingLeft, y + paddingTop, {
        width: w - paddingLeft - 4,
        align,
      });
  }
}

/**
 * Check if we need a new page and add one if so.
 * Returns the new Y position.
 */
function checkNewPage(doc: PDFKit.PDFDocument, y: number, neededHeight: number): number {
  if (y + neededHeight > PAGE.height - PAGE.marginBottom) {
    doc.addPage();
    return PAGE.marginTop;
  }
  return y;
}

/**
 * Generate Lampiran A PDF document
 * Layout matches the official PPW form exactly.
 */
export async function generateLampiranAPdf(data: LampiranAData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE.marginTop,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const x = PAGE.marginLeft;

      // ============================================
      // HEADER
      // ============================================

      // "Lampiran A" - top right
      doc.font(FONT_BOLD)
        .fontSize(10)
        .text('Lampiran A', x, PAGE.marginTop, {
          width: CONTENT_WIDTH,
          align: 'right',
        });

      let y = PAGE.marginTop + 20;

      // Title block
      doc.font(FONT_BOLD)
        .fontSize(11)
        .text('AKTA PEMBERI PINJAM WANG 1951', x, y, {
          width: CONTENT_WIDTH,
          align: 'center',
        });
      y += 16;

      doc.font(FONT_REGULAR)
        .fontSize(10)
        .text('[Subseksyen 18(1)]', x, y, {
          width: CONTENT_WIDTH,
          align: 'center',
        });
      y += 18;

      doc.font(FONT_BOLD)
        .fontSize(11)
        .text('LEJAR AKAUN PEMINJAM', x, y, {
          width: CONTENT_WIDTH,
          align: 'center',
        });
      y += 25;

      // ============================================
      // SECTION 1: BUTIRAN PEMINJAM
      // ============================================

      doc.font(FONT_BOLD)
        .fontSize(10)
        .fillColor('#000000')
        .text('1. BUTIRAN PEMINJAM', x, y);
      y += 16;

      // Table dimensions for borrower section
      const col1W = CONTENT_WIDTH * 0.18;  // Left label column (Nama, Jika Syarikat, etc.)
      const col2W = CONTENT_WIDTH * 0.42;  // Middle content
      const col3W = CONTENT_WIDTH * 0.40;  // Right content
      const rowH = 20;

      // Row 1: Nama
      drawCell(doc, x, y, col1W, rowH, 'Nama', { fontSize: 9 });
      drawCell(doc, x + col1W, y, col2W + col3W, rowH, data.borrower.fullName, { bold: true, fontSize: 9 });
      y += rowH;

      // Row 2: Jika Syarikat | Taraf: Bumi/Bukan Bumi/Asing | No. Daftar Perniagaan
      drawCell(doc, x, y, col1W, rowH, 'Jika Syarikat', { fontSize: 9 });
      const bumiStatus = data.borrower.isCorporate
        ? `Taraf : ${data.borrower.bumiStatus || 'Bumi/ Bukan Bumi/ Asing'}`
        : 'Taraf : Bumi/ Bukan Bumi/ Asing';
      drawCell(doc, x + col1W, y, col2W, rowH, bumiStatus, { fontSize: 9 });
      const regNo = data.borrower.isCorporate ? `No. Daftar Perniagaan : ${data.borrower.companyRegNo || ''}` : 'No. Daftar Perniagaan :';
      drawCell(doc, x + col1W + col2W, y, col3W, rowH, regNo, { fontSize: 9 });
      y += rowH;

      // Row 3: Jika Individu | No. K/P | Bangsa
      drawCell(doc, x, y, col1W, rowH, 'Jika Individu', { fontSize: 9 });
      const icValue = !data.borrower.isCorporate
        ? `No. K/P : ${data.borrower.icNumber || ''}`
        : 'No. K/P :';
      drawCell(doc, x + col1W, y, col2W, rowH, icValue, { fontSize: 9 });
      const bangsaValue = !data.borrower.isCorporate
        ? `Bangsa : ${getBangsa(data.borrower.race)}`
        : 'Bangsa :';
      drawCell(doc, x + col1W + col2W, y, col3W, rowH, bangsaValue, { fontSize: 9 });
      y += rowH;

      // Row 4: (empty) | Pekerjaan | Pendapatan
      drawCell(doc, x, y, col1W, rowH, '', { fontSize: 9 });
      const pekerjaanValue = !data.borrower.isCorporate
        ? `Pekerjaan : ${getPekerjaan(data.borrower.occupation)}`
        : 'Pekerjaan :';
      drawCell(doc, x + col1W, y, col2W, rowH, pekerjaanValue, { fontSize: 9 });
      const pendapatanValue = !data.borrower.isCorporate && data.borrower.monthlyIncome != null
        ? (Number(data.borrower.monthlyIncome) === 0
          ? 'Pendapatan : Tiada Pendapatan'
          : `Pendapatan : RM ${data.borrower.monthlyIncome}`)
        : 'Pendapatan :';
      drawCell(doc, x + col1W + col2W, y, col3W, rowH, pendapatanValue, { fontSize: 9 });
      y += rowH;

      // Row 5: (empty) | Majikan (spans middle + right columns)
      drawCell(doc, x, y, col1W, rowH, '', { fontSize: 9 });
      const majikanValue = !data.borrower.isCorporate
        ? `Majikan : *${getMajikan(data.borrower.employmentStatus) || 'Kerajaan/ Swasta/ Berniaga/ Kerja Sendiri/ Tidak Bekerja'}`
        : 'Majikan : *Kerajaan/ Swasta/ Berniaga/ Kerja Sendiri/ Tidak Bekerja';
      drawCell(doc, x + col1W, y, col2W + col3W, rowH, majikanValue, { fontSize: 9 });
      y += rowH;

      // Row 6: (empty) | Alamat Rumah (spans middle + right columns)
      drawCell(doc, x, y, col1W, rowH, '', { fontSize: 9 });
      const alamatValue = data.borrower.address
        ? `Alamat Rumah : ${data.borrower.address}`
        : 'Alamat Rumah :';
      drawCell(doc, x + col1W, y, col2W + col3W, rowH, alamatValue, { fontSize: 9 });
      y += rowH;

      // Row 7: Jenis Cagaran (Jika Berkaitan) - full width value
      drawCell(doc, x, y, col1W + col2W, rowH, 'Jenis Cagaran (Jika Berkaitan)', { fontSize: 9 });
      const cagaranValue = data.loan.isSecured ? (data.loan.collateralType || 'Bercagar') : '';
      drawCell(doc, x + col1W + col2W, y, col3W, rowH, cagaranValue, { bold: true, fontSize: 9 });
      y += rowH;

      // Row 8: Anggaran Nilai Semasa (RM) - full width value
      drawCell(doc, x, y, col1W + col2W, rowH, 'Anggaran Nilai Semasa (RM)', { fontSize: 9 });
      const nilaiValue = data.loan.collateralValue ? formatCurrency(data.loan.collateralValue) : '';
      drawCell(doc, x + col1W + col2W, y, col3W, rowH, nilaiValue, { bold: true, fontSize: 9 });
      y += rowH;

      y += 20;

      // ============================================
      // SECTION 2: BUTIRAN PINJAMAN
      // ============================================

      y = checkNewPage(doc, y, 80);

      doc.font(FONT_BOLD)
        .fontSize(10)
        .fillColor('#000000')
        .text('2. BUTIRAN PINJAMAN', x, y);
      y += 16;

      // 7 columns matching the official form exactly
      const loanCols = [
        { label: 'Tarikh', width: CONTENT_WIDTH * 0.12 },
        { label: 'Pinjaman\nPokok\n(RM)', width: CONTENT_WIDTH * 0.14 },
        { label: 'Jumlah\nFaedah\n(RM)', width: CONTENT_WIDTH * 0.14 },
        { label: 'Jumlah\nBesar\n(RM)', width: CONTENT_WIDTH * 0.14 },
        { label: 'Kadar\nFaedah\n(Sebulan)', width: CONTENT_WIDTH * 0.14 },
        { label: 'Bercagar/\nTidak\nBercagar', width: CONTENT_WIDTH * 0.14 },
        { label: 'Tempoh\nBayaran\n(Bulan)', width: CONTENT_WIDTH * 0.10 },
        { label: 'Bayaran\nSebulan\n(RM)', width: CONTENT_WIDTH * 0.08 },
      ];

      // Adjust widths to fill exactly
      const totalLoanW = loanCols.reduce((s, c) => s + c.width, 0);
      const loanScale = CONTENT_WIDTH / totalLoanW;
      loanCols.forEach(c => { c.width = Math.round(c.width * loanScale * 100) / 100; });

      const loanHeaderH = 42;

      // Draw header row
      let colX = x;
      for (const col of loanCols) {
        drawCell(doc, colX, y, col.width, loanHeaderH, col.label, {
          fontSize: 8,
          align: 'center',
          paddingTop: 4,
        });
        colX += col.width;
      }
      y += loanHeaderH;

      // Draw data row
      const loanDataH = 20;
      const loanValues = [
        formatDate(data.loan.disbursedAt),
        formatCurrency(data.loan.principalAmount),
        formatCurrency(data.loan.totalInterest),
        formatCurrency(data.loan.totalAmount),
        `${data.loan.interestRateMonthly.toFixed(2)}%`,
        data.loan.isSecured ? 'Bercagar' : 'Tidak Bercagar',
        data.loan.term.toString(),
        formatCurrency(data.loan.monthlyPayment),
      ];

      colX = x;
      for (let i = 0; i < loanCols.length; i++) {
        drawCell(doc, colX, y, loanCols[i].width, loanDataH, loanValues[i], {
          fontSize: 8,
          align: 'center',
          paddingTop: 5,
        });
        colX += loanCols[i].width;
      }
      y += loanDataH;

      // Draw a few empty rows (as in the official form)
      for (let r = 0; r < 2; r++) {
        colX = x;
        for (const col of loanCols) {
          drawCell(doc, colX, y, col.width, loanDataH, '', {});
          colX += col.width;
        }
        y += loanDataH;
      }

      y += 20;

      // ============================================
      // SECTION 3: BUTIRAN BAYARAN BALIK
      // ============================================

      y = checkNewPage(doc, y, 100);

      doc.font(FONT_BOLD)
        .fontSize(10)
        .fillColor('#000000')
        .text('3. BUTIRAN BAYARAN BALIK', x, y);
      y += 16;

      // 6 columns matching the official form
      const repayCols = [
        { label: 'Tarikh', width: CONTENT_WIDTH * 0.12 },
        { label: 'Jumlah Besar\n(RM)', width: CONTENT_WIDTH * 0.16 },
        { label: 'Bayaran\nBalik\nPinjaman\n(RM)', width: CONTENT_WIDTH * 0.16 },
        { label: 'Baki\nPinjaman\n(RM)', width: CONTENT_WIDTH * 0.14 },
        { label: 'No. Resit', width: CONTENT_WIDTH * 0.14 },
        { label: '', width: CONTENT_WIDTH * 0.28 }, // Catatan column - label drawn manually
      ];

      // Adjust widths
      const totalRepayW = repayCols.reduce((s, c) => s + c.width, 0);
      const repayScale = CONTENT_WIDTH / totalRepayW;
      repayCols.forEach(c => { c.width = Math.round(c.width * repayScale * 100) / 100; });

      const repayHeaderH = 55;

      // Draw header row - first 5 columns
      colX = x;
      for (let i = 0; i < repayCols.length - 1; i++) {
        const col = repayCols[i];
        drawCell(doc, colX, y, col.width, repayHeaderH, col.label, {
          fontSize: 8,
          align: 'center',
          paddingTop: 8,
        });
        colX += col.width;
      }

      // Catatan column with legend - draw cell border then add text manually
      const catatanCol = repayCols[repayCols.length - 1];
      doc.rect(colX, y, catatanCol.width, repayHeaderH).stroke(BORDER_COLOR);

      doc.font(FONT_BOLD)
        .fontSize(9)
        .fillColor('#000000')
        .text('Catatan :', colX + 4, y + 4);

      doc.font(FONT_REGULAR)
        .fontSize(8)
        .text('1. Pinjaman Selesai', colX + 4, y + 16)
        .text('2. Pinjaman Semasa', colX + 4, y + 26)
        .text('3. Dalam Proses Dapat Balik', colX + 4, y + 36)
        .text('4. Dalam Tindakan Mahkamah', colX + 4, y + 46);

      y += repayHeaderH;

      // Draw repayment data rows
      const repayRowH = 18;
      const repayments = data.repayments;

      // Calculate how many empty rows to add to fill a reasonable area
      const minRows = Math.max(repayments.length, 12);

      for (let rowIdx = 0; rowIdx < minRows; rowIdx++) {
        // Determine actual row height for page break check
        const hasAnnotation = rowIdx < repayments.length && (
          (repayments[rowIdx].lateFee && repayments[rowIdx].lateFee! > 0) ||
          (repayments[rowIdx].discount && repayments[rowIdx].discount! > 0)
        );
        const estimatedRowH = hasAnnotation ? 26 : repayRowH;
        // Check for new page
        if (y + estimatedRowH > PAGE.height - PAGE.marginBottom - 30) {
          doc.addPage();
          y = PAGE.marginTop;

          // Re-draw header on new page
          colX = x;
          const miniHeaderH = 25;
          for (let i = 0; i < repayCols.length - 1; i++) {
            const col = repayCols[i];
            drawCell(doc, colX, y, col.width, miniHeaderH, col.label.split('\n')[0], {
              fontSize: 8,
              align: 'center',
              paddingTop: 6,
            });
            colX += col.width;
          }
          drawCell(doc, colX, y, catatanCol.width, miniHeaderH, 'Catatan', {
            fontSize: 8,
            align: 'center',
            paddingTop: 6,
            bold: true,
          });
          y += miniHeaderH;
        }

        if (rowIdx < repayments.length) {
          // Filled row
          const rep = repayments[rowIdx];
          const hasLateFee = rep.lateFee && rep.lateFee > 0;
          const hasDiscount = rep.discount && rep.discount > 0;
          const hasNote = hasLateFee || hasDiscount;

          // Use a taller row when annotations need to be shown
          const thisRowH = hasNote ? 26 : repayRowH;

          const repValues = [
            formatDate(rep.date),
            '', // Jumlah Besar - drawn manually for annotations
            formatCurrency(rep.paymentAmount),
            formatCurrency(rep.balanceAfter),
            rep.receiptNumber || '',
            getStatusNote(rep.status),
          ];

          colX = x;
          for (let i = 0; i < repayCols.length; i++) {
            if (i === 1) {
              // Jumlah Besar column — custom render for late fee / discount annotations
              const colW = repayCols[i].width;
              doc.rect(colX, y, colW, thisRowH).stroke(BORDER_COLOR);

              if (hasNote) {
                // Main amount
                doc.font(FONT_REGULAR)
                  .fontSize(8)
                  .fillColor('#000000')
                  .text(formatCurrency(rep.totalAmount), colX + 4, y + 2, {
                    width: colW - 8,
                    align: 'center',
                  });
                // Annotation line (smaller text below)
                let noteText = '';
                if (hasLateFee && hasDiscount) {
                  noteText = `(+${formatCurrency(rep.lateFee!)} caj lewat, -${formatCurrency(rep.discount!)} rebat)`;
                } else if (hasLateFee) {
                  noteText = `(caj lewat: +${formatCurrency(rep.lateFee!)})`;
                } else if (hasDiscount) {
                  noteText = `(rebat faedah: -${formatCurrency(rep.discount!)})`;
                }
                doc.font(FONT_REGULAR)
                  .fontSize(5)
                  .fillColor('#000000')
                  .text(noteText, colX + 2, y + 14, {
                    width: colW - 4,
                    align: 'center',
                  });
              } else {
                doc.font(FONT_REGULAR)
                  .fontSize(8)
                  .fillColor('#000000')
                  .text(formatCurrency(rep.totalAmount), colX + 4, y + 4, {
                    width: colW - 8,
                    align: 'center',
                  });
              }
            } else {
              drawCell(doc, colX, y, repayCols[i].width, thisRowH, repValues[i], {
                fontSize: i === 4 ? 6 : 8,
                align: 'center',
                paddingTop: hasNote ? 6 : 4,
              });
            }
            colX += repayCols[i].width;
          }

          // Use the actual row height for positioning
          y += thisRowH;
          continue; // skip the y += repayRowH at the bottom
        } else {
          // Empty row
          colX = x;
          for (const col of repayCols) {
            drawCell(doc, colX, y, col.width, repayRowH, '', {});
            colX += col.width;
          }
        }
        y += repayRowH;
      }

      // ============================================
      // FOOTER
      // ============================================

      y += 15;
      if (y + 30 > PAGE.height - PAGE.marginBottom) {
        doc.addPage();
        y = PAGE.marginTop;
      }

      doc.font(FONT_REGULAR)
        .fontSize(7)
        .fillColor('#666666')
        .text(
          `Dokumen ini dijana secara automatik pada ${formatDate(data.generatedAt)} untuk tujuan pematuhan Akta Pemberi Pinjam Wang 1951 [Subseksyen 18(1)]`,
          x,
          y,
          {
            width: CONTENT_WIDTH,
            align: 'center',
          },
        );

      y += 12;
      if (data.company.name) {
        doc.text(
          `${data.company.name}${data.company.licenseNo ? ` | Lesen: ${data.company.licenseNo}` : ''}${data.company.regNo ? ` | SSM: ${data.company.regNo}` : ''}`,
          x,
          y,
          {
            width: CONTENT_WIDTH,
            align: 'center',
          },
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
