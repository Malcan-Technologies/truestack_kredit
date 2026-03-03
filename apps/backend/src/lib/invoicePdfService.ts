import PDFDocument from 'pdfkit';

export interface InvoicePdfTenant {
  name: string;
  registrationNumber?: string | null;
  businessAddress?: string | null;
}

export interface InvoicePdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoicePdfPayload {
  invoiceNumber: string;
  issuedAt: Date;
  dueAt: Date;
  periodStart: Date;
  periodEnd: Date;
  subtotal: number;
  sstRate: number;
  sstAmount: number;
  total: number;
  tenant: InvoicePdfTenant;
  lineItems: InvoicePdfLineItem[];
}

function createPdfBuffer(renderer: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
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
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  })
    .format(amount)
    .replace('MYR', 'RM');
}

function formatDateMY(date: Date): string {
  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

export async function generateInvoicePdf(payload: InvoicePdfPayload): Promise<Buffer> {
  return createPdfBuffer((doc) => {
    const left = 50;
    const right = 545;
    let y = 50;

    doc.font('Helvetica-Bold').fontSize(20).text('INVOICE', left, y);
    y += 30;

    doc.font('Helvetica').fontSize(11);
    doc.text(`Invoice #: ${payload.invoiceNumber}`, left, y);
    doc.text(`Issued: ${formatDateMY(payload.issuedAt)}`, 350, y, { width: right - 350, align: 'right' });
    y += 16;
    doc.text(`Period: ${formatDateMY(payload.periodStart)} - ${formatDateMY(payload.periodEnd)}`, left, y);
    doc.text(`Due: ${formatDateMY(payload.dueAt)}`, 350, y, { width: right - 350, align: 'right' });
    y += 26;

    doc.font('Helvetica-Bold').text('Bill To', left, y);
    y += 15;
    doc.font('Helvetica').text(payload.tenant.name, left, y);
    y += 14;
    if (payload.tenant.registrationNumber) {
      doc.text(`Reg. No: ${payload.tenant.registrationNumber}`, left, y);
      y += 14;
    }
    if (payload.tenant.businessAddress) {
      doc.text(payload.tenant.businessAddress, left, y, { width: 300 });
      y = doc.y + 10;
    } else {
      y += 10;
    }

    const tableTop = y;
    const colDesc = left;
    const colQty = 345;
    const colUnit = 405;
    const colAmount = 485;

    doc.font('Helvetica-Bold');
    doc.text('Description', colDesc, tableTop);
    doc.text('Qty', colQty, tableTop, { width: 45, align: 'right' });
    doc.text('Unit Price', colUnit, tableTop, { width: 70, align: 'right' });
    doc.text('Amount', colAmount, tableTop, { width: 60, align: 'right' });
    y = tableTop + 20;

    doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor('#cccccc').stroke();
    doc.strokeColor('#000000');
    doc.font('Helvetica');

    for (const item of payload.lineItems) {
      doc.text(item.description, colDesc, y, { width: 280 });
      doc.text(String(item.quantity), colQty, y, { width: 45, align: 'right' });
      doc.text(formatCurrency(item.unitPrice), colUnit, y, { width: 70, align: 'right' });
      doc.text(formatCurrency(item.amount), colAmount, y, { width: 60, align: 'right' });
      y = Math.max(doc.y, y + 16) + 6;
      if (y > 720) {
        doc.addPage();
        y = 60;
      }
    }

    y += 8;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#cccccc').stroke();
    doc.strokeColor('#000000');
    y += 10;

    doc.font('Helvetica');
    doc.text('Subtotal', colUnit - 30, y, { width: 100, align: 'right' });
    doc.text(formatCurrency(payload.subtotal), colAmount, y, { width: 60, align: 'right' });
    y += 16;
    doc.text(`SST (${(payload.sstRate * 100).toFixed(0)}%)`, colUnit - 30, y, { width: 100, align: 'right' });
    doc.text(formatCurrency(payload.sstAmount), colAmount, y, { width: 60, align: 'right' });
    y += 18;
    doc.font('Helvetica-Bold');
    doc.text('Total', colUnit - 30, y, { width: 100, align: 'right' });
    doc.text(formatCurrency(payload.total), colAmount, y, { width: 60, align: 'right' });

    y += 36;
    doc.font('Helvetica').fontSize(10);
    doc.text('This is a system-generated invoice.', left, y);
  });
}
