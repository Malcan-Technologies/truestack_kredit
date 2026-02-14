/**
 * PDF Service for generating Jadual J/K loan agreements from scratch.
 */

import PDFDocument from 'pdfkit';
import { Decimal } from '@prisma/client/runtime/library';
import { calculateEMI, calculateFlatInterest, safeAdd, safeDivide, safeMultiply, safeRound, toSafeNumber } from './math.js';

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
  agreementDateText: string;
  firstRepaymentDateText: string;
  monthlyRepaymentDayText: string;
  borrowerName: string;
  borrowerDetails: string;
  lenderDetails: string;
}

interface Signatory {
  name: string;
  idLabel: string;
  idValue: string;
  roleLabel: string;
}

interface JadualRow {
  no: string;
  perkara: string;
  butir: string;
}

// ============================================
// Layout
// ============================================

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const JADUAL_J_CLAUSES = [
  'Fasal 1: Definisi. Dalam Perjanjian ini, melainkan jika konteksnya menghendaki makna yang lain, istilah-istilah yang digunakan hendaklah mempunyai maksud sebagaimana yang diperuntukkan di bawah Akta Pemberi Pinjam Wang 1951 dan peraturan-peraturannya.',
  'Fasal 2: Kemudahan pinjaman. Pemberi Pinjam bersetuju untuk memberikan pinjaman kepada Peminjam tertakluk kepada syarat-syarat Perjanjian ini dan Jadual Pertama yang menjadi sebahagian penting Perjanjian.',
  'Fasal 3: Bayaran balik. Peminjam hendaklah membuat bayaran balik ansuran mengikut jumlah, tempoh, serta tarikh yang dinyatakan. Semua bayaran hendaklah dibuat kepada Pemberi Pinjam melalui kaedah yang ditetapkan.',
  'Fasal 4: Faedah. Faedah akan dikenakan pada kadar yang dipersetujui di Jadual Pertama. Pengiraan faedah dibuat selaras dengan model kadar faedah produk pinjaman yang dipilih.',
  'Fasal 5: Fi, caj dan kos. Peminjam bersetuju membayar apa-apa fi, duti setem, kos guaman, atau caj lain yang dibenarkan oleh undang-undang dan dipersetujui dalam dokumen pinjaman.',
  'Fasal 6: Kegagalan membayar. Jika berlaku kemungkiran, Pemberi Pinjam berhak mengambil tindakan yang dibenarkan di sisi undang-undang, termasuk menuntut jumlah tertunggak dan kos berkaitan.',
  'Fasal 7: Akuan Peminjam. Peminjam mengakui semua maklumat yang diberikan adalah benar, tepat, dan lengkap, serta bersetuju untuk memaklumkan sebarang perubahan material dengan segera.',
  'Fasal 8: Notis. Sebarang notis berkaitan Perjanjian ini boleh disampaikan secara bertulis ke alamat terakhir yang dimaklumkan oleh pihak masing-masing.',
  'Fasal 9: Hak Pemberi Pinjam. Pemberi Pinjam berhak menyemak akaun, mengeluarkan penyata, dan menguatkuasakan hak kontrak apabila berlaku ketidakpatuhan syarat Perjanjian.',
  'Fasal 10: Pemindahan hak. Hak Pemberi Pinjam di bawah Perjanjian ini boleh dipindahkan selaras dengan undang-undang yang terpakai.',
  'Fasal 11: Undang-undang terpakai. Perjanjian ini ditadbir oleh undang-undang Malaysia.',
  'Fasal 12: Jadual Pertama. Jadual Pertama hendaklah dibaca bersama-sama Perjanjian ini dan mempunyai kesan yang sama seperti syarat utama Perjanjian.',
];

const JADUAL_K_CLAUSES = [
  'Fasal 1: Definisi dan tafsiran. Istilah dalam Perjanjian ini ditafsirkan menurut Akta Pemberi Pinjam Wang 1951, peraturan-peraturan yang berkaitan, serta amalan pematuhan berkuat kuasa.',
  'Fasal 2: Jumlah pinjaman. Pemberi Pinjam memberikan kemudahan pinjaman mengikut jumlah pokok yang dinyatakan dalam Jadual Pertama.',
  'Fasal 3: Tujuan pinjaman. Peminjam bersetuju menggunakan dana pinjaman bagi tujuan yang sah serta mematuhi undang-undang yang berkaitan.',
  'Fasal 4: Kadar faedah. Kadar faedah tahunan adalah seperti dinyatakan dalam Jadual Pertama dan dikira selaras dengan terma produk pinjaman.',
  'Fasal 5: Tempoh pinjaman. Tempoh bayaran balik bermula dari tarikh pembayaran jumlah wang pokok kepada Peminjam.',
  'Fasal 6: Ansuran. Bilangan dan jumlah ansuran hendaklah menurut Jadual Pertama, serta hendaklah dibayar tepat pada masa.',
  'Fasal 7: Kaedah pembayaran. Semua bayaran hendaklah dibuat ke akaun yang dinyatakan oleh Pemberi Pinjam atau kaedah lain yang dipersetujui secara bertulis.',
  'Fasal 8: Rekod pembayaran. Rekod Pemberi Pinjam mengenai bayaran, baki, caj, dan faedah adalah prima facie evidence melainkan dibuktikan sebaliknya.',
  'Fasal 9: Kemungkiran. Jika berlaku kemungkiran, jumlah terhutang boleh menjadi serta-merta perlu dibayar tertakluk kepada hak Pemberi Pinjam di sisi undang-undang.',
  'Fasal 10: Cagaran. Jika pinjaman ini bercagaran, butir-butir cagaran dan nilainya adalah seperti Jadual Pertama.',
  'Fasal 11: Insurans dan perlindungan. Peminjam bertanggungjawab mengekalkan perlindungan sewajarnya bagi aset bercagaran jika dikehendaki oleh undang-undang atau terma pinjaman.',
  'Fasal 12: Representasi dan waranti. Peminjam mengesahkan bahawa semua representasi yang diberikan adalah benar dan tidak mengelirukan.',
  'Fasal 13: Perubahan terma. Sebarang pindaan terma hendaklah dibuat secara bertulis dan dipersetujui kedua-dua pihak.',
  'Fasal 14: Notis. Notis dianggap sah apabila dihantar ke alamat terakhir yang direkodkan oleh pihak berkenaan.',
  'Fasal 15: Undang-undang terpakai. Perjanjian ini tertakluk kepada undang-undang Malaysia dan bidang kuasa mahkamah yang kompeten.',
  'Fasal 16: Jadual Pertama. Jadual Pertama merupakan sebahagian penting Perjanjian ini dan hendaklah dibaca bersama-sama terma utama.',
];

// ============================================
// Helpers
// ============================================

function createPdfBuffer(renderer: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: MARGIN_TOP,
        bottom: MARGIN_BOTTOM,
        left: MARGIN_LEFT,
        right: MARGIN_RIGHT,
      },
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

function currencyToMalayWords(amount: number): string {
  const ringgit = Math.floor(amount);
  const sen = Math.round((amount - ringgit) * 100);
  let words = `${numberToMalayWords(ringgit)} ringgit`;

  if (sen > 0) {
    words += ` dan ${numberToMalayWords(sen)} sen`;
  }

  return words;
}

function formatMalayDate(date: Date): string {
  const day = date.getDate();
  const months = [
    'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
    'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
  ];
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function drawPageHeader(doc: PDFKit.PDFDocument, title: string, subtitle?: string): number {
  doc.font(FONT_BOLD).fontSize(14).fillColor('#000').text(title, MARGIN_LEFT, MARGIN_TOP, {
    width: CONTENT_WIDTH,
    align: 'center',
  });
  let y = doc.y + 6;
  if (subtitle) {
    doc.font(FONT_REGULAR).fontSize(10).text(subtitle, MARGIN_LEFT, y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    y = doc.y + 10;
  }
  return y;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.font(FONT_BOLD).fontSize(11).text(title, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  return doc.y + 6;
}

function drawTableCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  options?: {
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    fontSize?: number;
    paddingX?: number;
    paddingY?: number;
  }
): void {
  const paddingX = options?.paddingX ?? 5;
  const paddingY = options?.paddingY ?? 4;
  doc.rect(x, y, width, height).stroke('#000000');
  doc.font(options?.bold ? FONT_BOLD : FONT_REGULAR)
    .fontSize(options?.fontSize ?? 9)
    .text(text, x + paddingX, y + paddingY, {
      width: width - paddingX * 2,
      align: options?.align ?? 'left',
    });
}

function calculateValues(loan: LoanForAgreement): AgreementComputedValues {
  const principal = toSafeNumber(loan.principalAmount);
  const interestRate = toSafeNumber(loan.interestRate);
  const borrowerName = loan.borrower.borrowerType === 'CORPORATE' && loan.borrower.companyName
    ? loan.borrower.companyName
    : loan.borrower.name;

  const flatInterest = calculateFlatInterest(principal, interestRate, loan.term);
  const monthlyPaymentFlat = safeDivide(safeAdd(principal, flatInterest), loan.term);
  const monthlyPaymentEmi = calculateEMI(principal, interestRate, loan.term);
  const monthlyPayment = loan.product.interestModel === 'FLAT'
    ? monthlyPaymentFlat
    : monthlyPaymentEmi;
  const totalPayable = safeMultiply(monthlyPayment, loan.term);

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

  const effectiveFirstRepaymentDate = loan.firstRepaymentDate ? new Date(loan.firstRepaymentDate) : null;
  const effectiveRepaymentDay = loan.monthlyRepaymentDay
    ?? (effectiveFirstRepaymentDate ? effectiveFirstRepaymentDate.getDate() : null);

  return {
    principal,
    interestRate,
    monthlyPayment,
    totalPayable,
    agreementDateText: formatMalayDate(new Date()),
    firstRepaymentDateText: effectiveFirstRepaymentDate ? formatMalayDate(effectiveFirstRepaymentDate) : '-',
    monthlyRepaymentDayText: effectiveRepaymentDay ? `${effectiveRepaymentDay} HB` : '-',
    borrowerName,
    borrowerDetails: borrowerLines.join('\n'),
    lenderDetails: lenderLines.join('\n'),
  };
}

function getBorrowerSignatories(loan: LoanForAgreement, borrowerName: string): Signatory[] {
  if (loan.borrower.borrowerType !== 'CORPORATE') {
    return [{
      name: borrowerName,
      idLabel: 'No. K.P.',
      idValue: loan.borrower.icNumber || '-',
      roleLabel: 'Peminjam',
    }];
  }

  const directors = (loan.borrower.directors || [])
    .filter((director) => director.name?.trim() && director.icNumber?.trim())
    .slice(0, 10);

  if (directors.length > 0) {
    return directors.map((director) => ({
      name: director.name,
      idLabel: 'No. K.P.',
      idValue: director.icNumber,
      roleLabel: director.position?.trim() || 'Pengarah',
    }));
  }

  return [{
    name: loan.borrower.companyName || borrowerName,
    idLabel: 'No. Pendaftaran Syarikat',
    idValue: loan.borrower.companyRegistrationNumber || '-',
    roleLabel: 'Wakil Syarikat',
  }];
}

function drawAgreementIntroPage(doc: PDFKit.PDFDocument, loan: LoanForAgreement, values: AgreementComputedValues, isJadualK: boolean): void {
  let y = drawPageHeader(
    doc,
    'PERJANJIAN PINJAMAN WANG',
    isJadualK ? 'BORANG JADUAL K' : 'BORANG JADUAL J'
  );

  doc.font(FONT_REGULAR).fontSize(10).text(
    `Perjanjian ini dibuat pada ${values.agreementDateText} di antara ${loan.tenant.name} sebagai Pemberi Pinjam dengan ${values.borrowerName} sebagai Peminjam.`,
    MARGIN_LEFT,
    y,
    { width: CONTENT_WIDTH, align: 'justify', lineGap: 2 }
  );
  y = doc.y + 16;

  y = drawSectionTitle(doc, 'Maklumat Bayaran Balik Ansuran', y);
  const firstCol = 230;
  const secondCol = CONTENT_WIDTH - firstCol;
  const tableX = MARGIN_LEFT;
  let tableY = y;

  const rows: Array<[string, string]> = [
    ['Tarikh bayaran balik yang pertama', values.firstRepaymentDateText],
    ['Setiap dan tiap-tiap bulan pada hari', values.monthlyRepaymentDayText],
    ['Tempoh bayaran balik', `${loan.term} bulan`],
  ];

  if (isJadualK) {
    rows.push(['Bilangan bayaran balik ansuran', `${loan.term} ansuran`]);
  }

  rows.push(['Jumlah wang setiap bayaran balik ansuran', formatCurrency(values.monthlyPayment)]);
  rows.push(['Jumlah keseluruhan bayaran balik', formatCurrency(values.totalPayable)]);

  for (const [label, value] of rows) {
    const rowHeight = 26;
    drawTableCell(doc, tableX, tableY, firstCol, rowHeight, label, { fontSize: 9 });
    drawTableCell(doc, tableX + firstCol, tableY, secondCol, rowHeight, value, { fontSize: 9 });
    tableY += rowHeight;
  }

  y = tableY + 16;
  y = drawSectionTitle(doc, 'Maklumat Pihak-Pihak', y);

  doc.font(FONT_BOLD).fontSize(10).text('Pemberi Pinjam', MARGIN_LEFT, y);
  y = doc.y + 4;
  doc.font(FONT_REGULAR).fontSize(9).text(values.lenderDetails, MARGIN_LEFT, y, { width: CONTENT_WIDTH, lineGap: 2 });
  y = doc.y + 10;

  doc.font(FONT_BOLD).fontSize(10).text('Peminjam', MARGIN_LEFT, y);
  y = doc.y + 4;
  doc.font(FONT_REGULAR).fontSize(9).text(values.borrowerDetails, MARGIN_LEFT, y, { width: CONTENT_WIDTH, lineGap: 2 });
}

function drawClausePage(doc: PDFKit.PDFDocument, title: string, clauses: string[]): void {
  let y = drawPageHeader(doc, title);
  doc.font(FONT_REGULAR).fontSize(9);

  for (const clause of clauses) {
    doc.text(clause, MARGIN_LEFT, y, {
      width: CONTENT_WIDTH,
      align: 'justify',
      lineGap: 2,
    });
    y = doc.y + 8;
  }
}

function drawAttestationPage(doc: PDFKit.PDFDocument): void {
  let y = drawPageHeader(doc, 'Perakuan dan Akujanji');
  doc.font(FONT_REGULAR).fontSize(9).text(
    'Peminjam mengesahkan bahawa beliau telah membaca, memahami, dan menerima semua syarat Perjanjian Pinjaman Wang ini termasuk Jadual Pertama. Peminjam juga mengakui bahawa maklumat yang diberikan adalah benar dan tepat.',
    MARGIN_LEFT,
    y,
    {
      width: CONTENT_WIDTH,
      align: 'justify',
      lineGap: 3,
    }
  );
  y = doc.y + 14;

  doc.text(
    'Sebarang pertikaian berkaitan perjanjian ini hendaklah diselesaikan menurut undang-undang Malaysia. Salinan perjanjian ini diserahkan kepada Peminjam semasa penandatanganan.',
    MARGIN_LEFT,
    y,
    {
      width: CONTENT_WIDTH,
      align: 'justify',
      lineGap: 3,
    }
  );
}

function drawBorrowerSignaturePage(doc: PDFKit.PDFDocument, signatories: Signatory[]): void {
  drawPageHeader(doc, 'Ruangan Tandatangan Peminjam');
  doc.font(FONT_REGULAR).fontSize(9).text(
    'DITANDATANGANI oleh Peminjam / Pengarah-Pengarah syarikat peminjam:',
    MARGIN_LEFT,
    100,
    { width: CONTENT_WIDTH }
  );

  const displaySignatories = signatories.slice(0, 10);
  const columnGap = 16;
  const columns = 2;
  const rows = Math.max(1, Math.ceil(displaySignatories.length / columns));
  const availableHeight = PAGE_HEIGHT - 170 - MARGIN_BOTTOM;
  const rowHeight = Math.floor(availableHeight / rows);
  const blockWidth = (CONTENT_WIDTH - columnGap) / 2;

  displaySignatories.forEach((signatory, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN_LEFT + col * (blockWidth + columnGap);
    const y = 135 + row * rowHeight;

    doc.font(FONT_BOLD).fontSize(9).text(`${index + 1}. ${signatory.roleLabel}`, x, y, {
      width: blockWidth - 6,
    });

    const lineY = y + 28;
    doc.moveTo(x, lineY).lineTo(x + blockWidth - 6, lineY).stroke('#000000');
    doc.font(FONT_REGULAR).fontSize(8).text('(Tandatangan)', x, lineY + 2, {
      width: blockWidth - 6,
      align: 'center',
    });

    doc.font(FONT_REGULAR).fontSize(9).text(`Nama: ${signatory.name}`, x, lineY + 22, {
      width: blockWidth - 6,
      lineGap: 1,
    });
    doc.text(`${signatory.idLabel}: ${signatory.idValue}`, x, lineY + 38, {
      width: blockWidth - 6,
    });
  });
}

function drawLenderSignaturePage(doc: PDFKit.PDFDocument, loan: LoanForAgreement): void {
  drawPageHeader(doc, 'Ruangan Tandatangan Pemberi Pinjam');
  const y = 220;
  const lineWidth = CONTENT_WIDTH - 120;
  const lineX = MARGIN_LEFT + 60;

  doc.font(FONT_REGULAR).fontSize(10).text(
    'DITANDATANGANI bagi pihak Pemberi Pinjam:',
    MARGIN_LEFT,
    y - 40,
    { width: CONTENT_WIDTH, align: 'center' }
  );

  doc.moveTo(lineX, y).lineTo(lineX + lineWidth, y).stroke('#000000');
  doc.font(FONT_REGULAR).fontSize(8).text('(Tandatangan & Cop Syarikat)', lineX, y + 4, {
    width: lineWidth,
    align: 'center',
  });

  doc.font(FONT_BOLD).fontSize(10).text(loan.tenant.name, MARGIN_LEFT, y + 35, {
    width: CONTENT_WIDTH,
    align: 'center',
  });

  if (loan.tenant.registrationNumber) {
    doc.font(FONT_REGULAR).fontSize(9).text(`No. Pendaftaran: ${loan.tenant.registrationNumber}`, MARGIN_LEFT, y + 52, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  }

  if (loan.tenant.licenseNumber) {
    doc.font(FONT_REGULAR).fontSize(9).text(`No. Lesen: ${loan.tenant.licenseNumber}`, MARGIN_LEFT, y + 67, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  }
}

function buildJadualRows(loan: LoanForAgreement, values: AgreementComputedValues, isJadualK: boolean): JadualRow[] {
  const commonRows: JadualRow[] = [
    { no: '1', perkara: 'Hari dan tahun Perjanjian ini', butir: values.agreementDateText },
    { no: '2', perkara: 'Nama, No. K.P./No. Pendaftaran, No. Lesen dan alamat Pemberi Pinjam', butir: values.lenderDetails },
    { no: '3', perkara: 'Nama, No. K.P./No. Pendaftaran dan alamat Peminjam', butir: values.borrowerDetails },
    { no: '4', perkara: 'Jumlah Wang Pokok', butir: `${currencyToMalayWords(values.principal)}\n(${formatCurrency(values.principal)})` },
    { no: '5', perkara: 'Kadar faedah', butir: `${numberToMalayWords(Math.floor(values.interestRate))} peratus (${values.interestRate}%) setahun` },
  ];

  if (!isJadualK) {
    return [
      ...commonRows,
      { no: '6', perkara: 'Jumlah wang setiap bayaran balik ansuran', butir: formatCurrency(values.monthlyPayment) },
      { no: '7', perkara: 'Jumlah keseluruhan bayaran balik', butir: formatCurrency(values.totalPayable) },
    ];
  }

  const repaymentDay = loan.monthlyRepaymentDay
    ?? (loan.firstRepaymentDate ? new Date(loan.firstRepaymentDate).getDate() : null);
  const collateralValue = loan.collateralValue && loan.collateralValue > 0 ? loan.collateralValue : 0;

  return [
    ...commonRows,
    { no: '6', perkara: 'Tempoh bayaran balik', butir: `${loan.term} bulan dari tarikh pembayaran jumlah wang pokok` },
    { no: '7', perkara: 'Bilangan bayaran balik ansuran', butir: `${loan.term} ansuran` },
    { no: '8', perkara: 'Jumlah wang bagi setiap bayaran balik ansuran', butir: formatCurrency(values.monthlyPayment) },
    { no: '9', perkara: 'Cara bayaran balik', butir: repaymentDay ? `Bayaran balik pada hari ke-${repaymentDay} setiap bulan` : 'Mengikut jadual bayaran balik yang dipersetujui' },
    { no: '10', perkara: 'Jumlah keseluruhan bayaran balik', butir: formatCurrency(values.totalPayable) },
    { no: '11', perkara: 'Butir-butir Cagaran', butir: loan.collateralType || 'Tiada cagaran dinyatakan' },
    {
      no: '12',
      perkara: 'Nilai Cagaran',
      butir: collateralValue > 0
        ? `${currencyToMalayWords(collateralValue)}\n(${formatCurrency(collateralValue)})`
        : 'Tidak berkenaan',
    },
  ];
}

function drawJadualPertamaPage(doc: PDFKit.PDFDocument, rows: JadualRow[]): void {
  let y = drawPageHeader(
    doc,
    'JADUAL PERTAMA',
    '(yang hendaklah dibaca dan diertikan sebagai bahagian penting Perjanjian ini)'
  );

  y += 10;
  const x = MARGIN_LEFT;
  const noWidth = 38;
  const perkaraWidth = 210;
  const butirWidth = CONTENT_WIDTH - noWidth - perkaraWidth;

  const headerHeight = 24;
  drawTableCell(doc, x, y, noWidth, headerHeight, 'No.', { bold: true, align: 'center', fontSize: 9 });
  drawTableCell(doc, x + noWidth, y, perkaraWidth, headerHeight, 'Seksyen / Perkara', { bold: true, fontSize: 9 });
  drawTableCell(doc, x + noWidth + perkaraWidth, y, butirWidth, headerHeight, 'Butir-butir', { bold: true, fontSize: 9 });
  y += headerHeight;

  for (const row of rows) {
    doc.font(FONT_REGULAR).fontSize(8.5);
    const noHeight = doc.heightOfString(row.no, { width: noWidth - 10 });
    const perkaraHeight = doc.heightOfString(row.perkara, { width: perkaraWidth - 10, lineGap: 1 });
    const butirHeight = doc.heightOfString(row.butir, { width: butirWidth - 10, lineGap: 1 });
    const rowHeight = Math.max(24, Math.ceil(Math.max(noHeight, perkaraHeight, butirHeight)) + 10);

    drawTableCell(doc, x, y, noWidth, rowHeight, row.no, { align: 'center', fontSize: 8.5 });
    drawTableCell(doc, x + noWidth, y, perkaraWidth, rowHeight, row.perkara, { fontSize: 8.5 });
    drawTableCell(doc, x + noWidth + perkaraWidth, y, butirWidth, rowHeight, row.butir, { fontSize: 8.5 });
    y += rowHeight;
  }
}

// ============================================
// Main PDF generation
// ============================================

export async function generateLoanAgreement(loan: LoanForAgreement): Promise<Buffer> {
  const isJadualK = loan.product.loanScheduleType === 'JADUAL_K';
  const values = calculateValues(loan);
  const signatories = getBorrowerSignatories(loan, values.borrowerName);
  const jadualRows = buildJadualRows(loan, values, isJadualK);

  return createPdfBuffer((doc) => {
    drawAgreementIntroPage(doc, loan, values, isJadualK);

    if (isJadualK) {
      doc.addPage();
      drawClausePage(doc, 'Terma dan Syarat (Fasal 1 - 5)', JADUAL_K_CLAUSES.slice(0, 5));
      doc.addPage();
      drawClausePage(doc, 'Terma dan Syarat (Fasal 6 - 10)', JADUAL_K_CLAUSES.slice(5, 10));
      doc.addPage();
      drawClausePage(doc, 'Terma dan Syarat (Fasal 11 - 16)', JADUAL_K_CLAUSES.slice(10, 16));
      doc.addPage();
      drawAttestationPage(doc);
    } else {
      doc.addPage();
      drawClausePage(doc, 'Terma dan Syarat (Fasal 1 - 6)', JADUAL_J_CLAUSES.slice(0, 6));
      doc.addPage();
      drawClausePage(doc, 'Terma dan Syarat (Fasal 7 - 12)', JADUAL_J_CLAUSES.slice(6, 12));
    }

    doc.addPage();
    drawBorrowerSignaturePage(doc, signatories);

    doc.addPage();
    drawLenderSignaturePage(doc, loan);

    // Last page is a standalone page with a hard page break before it.
    doc.addPage();
    drawJadualPertamaPage(doc, jadualRows);
  });
}

// ============================================
// Calibration and test helpers
// ============================================

export async function generateCalibrationPdf(template: 'jadual-j' | 'jadual-k' = 'jadual-j'): Promise<Buffer> {
  const pageCount = template === 'jadual-k' ? 8 : 6;
  return createPdfBuffer((doc) => {
    for (let i = 0; i < pageCount; i++) {
      if (i > 0) doc.addPage();

      doc.font(FONT_BOLD).fontSize(12).fillColor('#cc0000').text(
        `${template.toUpperCase()} - Page ${i + 1}`,
        MARGIN_LEFT,
        20
      );

      doc.font(FONT_REGULAR).fontSize(8).fillColor('#000000');
      for (let x = 0; x <= PAGE_WIDTH; x += 50) {
        doc.moveTo(x, 0).lineTo(x, PAGE_HEIGHT).strokeColor('#dddddd').stroke();
        if (x % 100 === 0) {
          doc.text(String(x), x + 2, 6, { width: 35 });
        }
      }
      for (let y = 0; y <= PAGE_HEIGHT; y += 50) {
        doc.moveTo(0, y).lineTo(PAGE_WIDTH, y).strokeColor('#dddddd').stroke();
        if (y % 100 === 0) {
          doc.text(String(y), 4, y + 2, { width: 35 });
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
