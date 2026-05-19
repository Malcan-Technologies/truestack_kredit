/**
 * Renders a TrueSSM company profile pull into a branded A4 PDF that we attach
 * to the borrower documents list as evidence of the registry pull.
 *
 * Design goals (after iterating on the v1 output):
 *   - Branded header with TrueStack logo + title on every page.
 *   - Footer that stays in the bottom margin and never triggers auto-pagination
 *     (the previous footer used `doc.text()` without `lineBreak: false`, which
 *     pushed `doc.y` past the bottom edge and caused phantom blank pages).
 *   - List-style "cards" for officers and shareholders instead of cramped
 *     tables — multi-line addresses kept getting word-wrapped to one word per
 *     line in narrow table cells.
 *   - Tighter, well-spaced section grid for identity / share capital data.
 *   - Charges table with sized columns that fit the content width without
 *     truncating the chargee name.
 *
 * Provider response paths are documented in `apps/admin_pro/docs/TRUESSM_API.md`.
 */

import fs from 'node:fs';
import path from 'node:path';

import PDFDocument from 'pdfkit';

import type { SsmAcknowledgement } from './client.js';

interface RenderInput {
  rawData: Record<string, unknown>;
  acknowledgement: SsmAcknowledgement;
  regNo: string;
  pulledAt: Date;
  tenantName?: string | null;
}

/* ------------------------------- constants -------------------------------- */

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const PAGE_MARGINS = { top: 96, bottom: 72, left: 50, right: 50 } as const;
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGINS.left - PAGE_MARGINS.right;

const HEADER_BAND_HEIGHT = 64;
const FOOTER_BAND_HEIGHT = 40;

const COLORS = {
  text: '#0f172a',
  muted: '#64748b',
  mutedSoft: '#94a3b8',
  rule: '#e2e8f0',
  ruleSoft: '#eef2f7',
  zebra: '#f8fafc',
  accent: '#059669', // emerald-600 — TrueSSM brand colour
  accentSoft: '#ecfdf5', // emerald-50
  badgeText: '#065f46',
} as const;

/* -------------------------------- logo I/O -------------------------------- */

let LOGO_BUFFER: Buffer | null | undefined;

/**
 * Resolve and cache the TrueStack logo bytes. The logo lives in the runtime
 * public/ directory adjacent to the compiled module, both in dev (tsx) and in
 * prod (dist). If the file is missing for any reason we silently skip the
 * logo so report generation still succeeds.
 */
function loadLogo(): Buffer | null {
  if (LOGO_BUFFER !== undefined) return LOGO_BUFFER;
  try {
    // CommonJS gives us __dirname; works in both dev (tsx) and prod (dist).
    const here = __dirname;
    const candidates = [
      // src/modules/truessm or dist/modules/truessm → backend_pro/public
      path.resolve(here, '../../../public/logo-light.png'),
      // dist nested one level deeper (defensive)
      path.resolve(here, '../../public/logo-light.png'),
      // monorepo cwd fallback
      path.resolve(process.cwd(), 'public/logo-light.png'),
      path.resolve(process.cwd(), 'apps/backend_pro/public/logo-light.png'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        LOGO_BUFFER = fs.readFileSync(candidate);
        return LOGO_BUFFER;
      }
    }
  } catch {
    /* ignore — proceed without logo */
  }
  LOGO_BUFFER = null;
  return null;
}

/* ----------------------------- value coercion ----------------------------- */

function plain(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    );
  }
  return null;
}

function readNestedList(source: unknown, outerKey: string, innerKey: string): Array<Record<string, unknown>> {
  const outer = asObject((source as Record<string, unknown>)?.[outerKey]);
  if (!outer) return [];
  const middle = asObject(outer[innerKey]);
  if (!middle) return [];
  return asArray(middle[innerKey]) ?? [];
}

function formatPulledAt(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function formatDateOnly(value: unknown): string | null {
  const s = plain(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function formatMoney(value: unknown): string | null {
  const s = plain(value);
  if (!s) return null;
  const num = Number(s);
  if (!Number.isFinite(num)) return s;
  return num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Accounting-style number formatting for the financial sections:
 *   - Negatives in parentheses (`(1,234.56)`) per audit convention.
 *   - Two decimal places, comma grouping (`en-MY`).
 *   - Zero rendered as an em-dash to declutter the column.
 *   - Returns `null` for missing values so the caller can decide whether to
 *     render a row at all.
 */
function formatAccounting(value: unknown): string | null {
  const s = plain(value);
  if (s === null) return null;
  const num = Number(s);
  if (!Number.isFinite(num)) return s;
  if (num === 0) return '\u2014'; // em-dash
  const abs = Math.abs(num).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `(${abs})` : abs;
}

function sumNumericStrings(values: unknown[]): string | null {
  let total = 0;
  let hasAny = false;
  for (const v of values) {
    const s = plain(v);
    if (s === null) continue;
    const n = Number(s);
    if (!Number.isFinite(n)) continue;
    total += n;
    hasAny = true;
  }
  return hasAny ? String(total) : null;
}

/**
 * Sort balance-sheet / P&L entries with the most recent `financialYearEndDate`
 * first. Entries without a parseable date sink to the bottom.
 */
function sortByFinancialYearDesc<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ad = plain(a['financialYearEndDate']) ?? '';
    const bd = plain(b['financialYearEndDate']) ?? '';
    return bd.localeCompare(ad);
  });
}

/**
 * Map common SSM lodgement form codes to a short human description. Codes
 * not in this list pass through as `null` so the form code stands alone.
 *
 * Reference: Companies Act 2016 / 1965 prescribed forms.
 */
const SSM_FORM_DESCRIPTIONS: Record<string, string> = {
  '13': 'Change of Name',
  '24': 'Return of Allotment of Shares',
  '32A': 'Transfer of Securities',
  '44': 'Notice of Registered Office',
  '48A': 'Statutory Declaration by Director',
  '49': 'Return of Particulars of Directors / Officers',
  '557': 'Annual Return',
  '9': 'Certificate of Incorporation',
  AR: 'Annual Return',
  BSC: 'Balance Sheet / Accounts',
  PNA: 'Notice of Annual General Meeting',
};

function describeSsmForm(code: string | null): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return SSM_FORM_DESCRIPTIONS[upper] ?? SSM_FORM_DESCRIPTIONS[code] ?? null;
}

/* ------------------------------- code maps -------------------------------- */

const SSM_STATE_NAMES: Record<string, string> = {
  A: 'Johor',
  B: 'Selangor',
  C: 'Pahang',
  D: 'Kelantan',
  E: 'Kedah',
  F: 'Negeri Sembilan',
  G: 'Pulau Pinang',
  H: 'Sabah',
  J: 'Perak',
  K: 'Sarawak',
  L: 'W.P. Labuan',
  M: 'Melaka',
  N: 'Perlis',
  P: 'Terengganu',
  R: 'W.P. Putrajaya',
  W: 'W.P. Kuala Lumpur',
};

const SSM_OFFICER_DESIGNATION: Record<string, string> = {
  D: 'Director',
  S: 'Secretary',
  A: 'Auditor',
  M: 'Manager',
  O: 'Officer',
};

const SSM_CHARGE_STATUS: Record<string, string> = {
  S: 'Subsisting',
  R: 'Released',
  U: 'Discharged',
};

const SSM_CHARGE_MORTGAGE_TYPE: Record<string, string> = {
  A: 'Assignment',
  F: 'Fixed charge',
  O: 'Other',
  D: 'Debenture',
  L: 'Legal',
};

const SSM_COMPANY_STATUS: Record<string, string> = {
  E: 'EXISTING',
  L: 'LIQUIDATED',
  W: 'WOUND UP',
  D: 'DISSOLVED',
  S: 'STRUCK OFF',
};

const SSM_COMPANY_TYPE: Record<string, string> = {
  S: 'Sdn Bhd (Private)',
  B: 'Berhad (Public)',
};

const SSM_ID_TYPE: Record<string, string> = {
  MK: 'MyKad',
  P: 'Passport',
  C: 'Company',
  X: 'Other',
};

function decode(map: Record<string, string>, code: unknown): string | null {
  const s = plain(code);
  if (!s) return null;
  return map[s.toUpperCase()] ?? s;
}

/* ------------------------------- helpers --------------------------------- */

interface AddressBlock {
  address1?: unknown;
  address2?: unknown;
  address3?: unknown;
  postcode?: unknown;
  state?: unknown;
  town?: unknown;
}

function formatAddressInline(block: AddressBlock | null): string | null {
  if (!block) return null;
  const street = [plain(block.address1), plain(block.address2), plain(block.address3)]
    .filter(Boolean)
    .join(', ');
  const cityLine = [plain(block.postcode), plain(block.town)].filter(Boolean).join(' ');
  const stateName = decode(SSM_STATE_NAMES, block.state);
  return [street, cityLine, stateName].filter(Boolean).join(', ') || null;
}

function formatAddressMultiline(block: AddressBlock | null): string | null {
  if (!block) return null;
  const lines = [
    plain(block.address1),
    plain(block.address2),
    plain(block.address3),
    [plain(block.postcode), plain(block.town)].filter(Boolean).join(' ') || null,
    decode(SSM_STATE_NAMES, block.state),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

/* ------------------------------- low-level ------------------------------- */

/**
 * Reserve `requiredHeight` vertical pixels on the current page; if there is
 * not enough room before the bottom margin, force a page break first. This
 * keeps section headers stuck to their content and prevents a single row
 * from being orphaned at the bottom of a page.
 */
function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  const limit = A4_HEIGHT - PAGE_MARGINS.bottom;
  if (doc.y + requiredHeight > limit) {
    doc.addPage();
  }
}

function hRule(doc: PDFKit.PDFDocument, color: string = COLORS.rule, y?: number): void {
  const yy = y ?? doc.y;
  doc
    .moveTo(PAGE_MARGINS.left, yy)
    .lineTo(PAGE_MARGINS.left + CONTENT_WIDTH, yy)
    .lineWidth(0.5)
    .strokeColor(color)
    .stroke();
  doc.strokeColor(COLORS.text).lineWidth(1);
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, count?: number): void {
  ensureSpace(doc, 50);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text);
  doc.text(title, PAGE_MARGINS.left, y, { width: CONTENT_WIDTH - 80 });
  if (typeof count === 'number') {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    doc.text(
      `${count} record${count === 1 ? '' : 's'}`,
      PAGE_MARGINS.left + CONTENT_WIDTH - 80,
      y + 3,
      { width: 80, align: 'right' },
    );
  }
  // doc.y now points just below the heading text — drop a rule and add padding.
  const ruleY = doc.y + 4;
  hRule(doc, COLORS.rule, ruleY);
  doc.y = ruleY + 8;
  doc.fillColor(COLORS.text);
}

/* --------------------------- key-value rendering -------------------------- */

interface KvRow {
  label: string;
  value: string | null;
}

function renderKvGrid(doc: PDFKit.PDFDocument, rows: KvRow[]): void {
  const entries = rows.filter((r) => r.value !== null && r.value !== '');
  if (entries.length === 0) {
    renderEmpty(doc, 'No data returned for this section.');
    return;
  }

  const colGap = 18;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  let columnIndex = 0;
  let rowTopY = doc.y;
  let maxRowBottomY = rowTopY;
  const rowSpacing = 14;

  for (const { label, value } of entries) {
    // If we're about to overflow, finish the current row then break.
    if (doc.y + 40 > A4_HEIGHT - PAGE_MARGINS.bottom) {
      doc.addPage();
      rowTopY = doc.y;
      maxRowBottomY = rowTopY;
      columnIndex = 0;
    }
    const x = PAGE_MARGINS.left + columnIndex * (colWidth + colGap);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text(label.toUpperCase(), x, rowTopY, { width: colWidth, characterSpacing: 0.4 });
    const valueY = doc.y + 1;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
    doc.text(String(value), x, valueY, { width: colWidth });
    maxRowBottomY = Math.max(maxRowBottomY, doc.y + rowSpacing);
    columnIndex += 1;
    if (columnIndex >= 2) {
      columnIndex = 0;
      rowTopY = maxRowBottomY;
      doc.y = rowTopY;
    } else {
      doc.y = rowTopY;
    }
  }

  // If we ended mid-row, advance to the row bottom so subsequent sections
  // don't overlap the right-hand column.
  doc.y = maxRowBottomY;
  doc.fillColor(COLORS.text);
}

/**
 * Two-column accounting layout: each row places the label on the left and a
 * right-aligned monetary value on the right of the same column. Negative
 * values (rendered as `(1,234.56)` by `formatAccounting`) are highlighted in
 * a muted red so they catch the eye but don't dominate the page.
 *
 * Use this in place of `renderKvGrid` for balance-sheet / P&L sections —
 * the rest of the document still uses the regular key-above-value layout.
 */
function renderAccountingGrid(doc: PDFKit.PDFDocument, rows: KvRow[]): void {
  const entries = rows.filter((r) => r.value !== null && r.value !== '');
  if (entries.length === 0) {
    renderEmpty(doc, 'No data returned for this section.');
    return;
  }

  const colGap = 24;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const rowHeight = 16;
  let columnIndex = 0;
  let rowTopY = doc.y;

  for (const { label, value } of entries) {
    if (rowTopY + rowHeight > A4_HEIGHT - PAGE_MARGINS.bottom) {
      doc.addPage();
      rowTopY = doc.y;
      columnIndex = 0;
    }
    const x = PAGE_MARGINS.left + columnIndex * (colWidth + colGap);

    // Dotted separator under each row to anchor the eye across the column.
    doc
      .moveTo(x, rowTopY + rowHeight - 3)
      .lineTo(x + colWidth, rowTopY + rowHeight - 3)
      .lineWidth(0.4)
      .dash(1, { space: 2 })
      .strokeColor(COLORS.ruleSoft)
      .stroke();
    doc.undash().lineWidth(1).strokeColor(COLORS.text);

    // Label (left)
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    doc.text(label, x, rowTopY + 1, {
      width: colWidth - 70,
      lineBreak: false,
      ellipsis: true,
    });

    // Value (right)
    const valStr = String(value);
    const isNegative = valStr.startsWith('(');
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(isNegative ? '#b91c1c' /* rose-700 */ : COLORS.text);
    doc.text(valStr, x, rowTopY, {
      width: colWidth,
      align: 'right',
      lineBreak: false,
    });

    columnIndex = (columnIndex + 1) % 2;
    if (columnIndex === 0) {
      rowTopY += rowHeight;
    }
  }
  if (columnIndex !== 0) {
    rowTopY += rowHeight;
  }
  doc.y = rowTopY + 2;
  doc.fillColor(COLORS.text);
}

function renderEmpty(doc: PDFKit.PDFDocument, message: string): void {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.mutedSoft);
  doc.text(message, PAGE_MARGINS.left, doc.y, { width: CONTENT_WIDTH });
  doc.fillColor(COLORS.text);
  doc.moveDown(0.4);
}

/* ----------------------------- list "cards" ------------------------------ */

/**
 * Render a list of officers / shareholders / similar where each entry has a
 * primary line (name + meta pill on the right), one or more secondary lines,
 * and a row separator. Avoids the broken word-wrapping we get when stuffing
 * long names + addresses into table cells.
 */
function renderEntityCards(
  doc: PDFKit.PDFDocument,
  entries: Array<{
    name: string | null;
    rightPill?: string | null;
    rightValue?: string | null;
    metaLine?: string | null;
    detailLine?: string | null;
  }>,
): void {
  if (entries.length === 0) {
    renderEmpty(doc, 'No data returned for this section.');
    return;
  }

  const rightColumnWidth = 130;
  const leftWidth = CONTENT_WIDTH - rightColumnWidth - 12;

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    // Reserve a sensible chunk so the card doesn't split awkwardly.
    ensureSpace(doc, 56);
    const startY = doc.y;

    // Left column: name
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
    doc.text(entry.name ?? '—', PAGE_MARGINS.left, startY, { width: leftWidth });
    const leftAfterName = doc.y;

    // Right column: pill or value, aligned to top
    const rightX = PAGE_MARGINS.left + leftWidth + 12;
    if (entry.rightPill) {
      drawPill(doc, entry.rightPill, rightX, startY);
    } else if (entry.rightValue) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
      doc.text(entry.rightValue, rightX, startY, { width: rightColumnWidth, align: 'right' });
    }

    // Move cursor to below the name line
    doc.y = leftAfterName;

    if (entry.metaLine) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
      doc.text(entry.metaLine, PAGE_MARGINS.left, doc.y + 2, { width: CONTENT_WIDTH });
    }
    if (entry.detailLine) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
      doc.text(entry.detailLine, PAGE_MARGINS.left, doc.y + 2, { width: CONTENT_WIDTH });
    }

    doc.y += 6;
    // Separator (skip after last entry)
    if (idx < entries.length - 1) {
      hRule(doc, COLORS.ruleSoft);
      doc.y += 6;
    }
  }
  doc.fillColor(COLORS.text);
}

function drawPill(doc: PDFKit.PDFDocument, text: string, x: number, y: number): void {
  const padX = 6;
  const padY = 3;
  const fontSize = 8;
  doc.font('Helvetica-Bold').fontSize(fontSize);
  const textWidth = doc.widthOfString(text);
  const pillWidth = textWidth + padX * 2;
  const pillHeight = fontSize + padY * 2;
  const pillX = x + 130 - pillWidth; // right-align within reserved column
  doc
    .roundedRect(pillX, y, pillWidth, pillHeight, 4)
    .fillAndStroke(COLORS.accentSoft, COLORS.accent);
  doc.fillColor(COLORS.badgeText).text(text, pillX + padX, y + padY, {
    width: textWidth + 2,
    lineBreak: false,
  });
  doc.fillColor(COLORS.text);
}

/* ------------------------------- tables ---------------------------------- */

interface Column<R extends Record<string, unknown>> {
  key: keyof R & string;
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function renderTable<R extends Record<string, unknown>>(
  doc: PDFKit.PDFDocument,
  rows: R[],
  columns: Array<Column<R>>,
): void {
  if (rows.length === 0) {
    renderEmpty(doc, 'No data returned for this section.');
    return;
  }

  const startX = PAGE_MARGINS.left;
  const headerHeight = 22;
  const cellPad = 6;

  const drawHeader = (): void => {
    const y = doc.y;
    // Header band
    doc.rect(startX, y, CONTENT_WIDTH, headerHeight).fill(COLORS.zebra);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted);
    let x = startX;
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x + cellPad, y + 7, {
        width: col.width - cellPad * 2,
        align: col.align ?? 'left',
        characterSpacing: 0.4,
        lineBreak: false,
      });
      x += col.width;
    }
    doc.y = y + headerHeight;
    hRule(doc, COLORS.rule);
    doc.y += 4;
    doc.fillColor(COLORS.text);
  };

  drawHeader();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Measure tallest cell at the current row position.
    doc.font('Helvetica').fontSize(9);
    let maxCellHeight = 0;
    for (const col of columns) {
      const text = (plain(row[col.key]) ?? '—') as string;
      const h = doc.heightOfString(text, {
        width: col.width - cellPad * 2,
        align: col.align ?? 'left',
      });
      if (h > maxCellHeight) maxCellHeight = h;
    }
    const rowHeight = maxCellHeight + cellPad * 2;

    if (doc.y + rowHeight > A4_HEIGHT - PAGE_MARGINS.bottom) {
      doc.addPage();
      drawHeader();
    }

    const rowY = doc.y;
    // Zebra striping
    if (i % 2 === 1) {
      doc.rect(startX, rowY, CONTENT_WIDTH, rowHeight).fill(COLORS.zebra);
    }
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.text);

    let x = startX;
    for (const col of columns) {
      const text = (plain(row[col.key]) ?? '—') as string;
      doc.text(text, x + cellPad, rowY + cellPad, {
        width: col.width - cellPad * 2,
        align: col.align ?? 'left',
      });
      x += col.width;
    }
    doc.y = rowY + rowHeight;
    hRule(doc, COLORS.ruleSoft);
  }
  doc.fillColor(COLORS.text);
}

/* ---------------------------- page chrome -------------------------------- */

/**
 * Run `paint()` with page margins temporarily zeroed. This is the canonical
 * PDFKit trick for drawing into the header/footer "gutter" — without it,
 * any `doc.text()` whose y lies outside the content margins triggers an
 * auto page-break, multiplying the page count.
 */
function withinMargins(doc: PDFKit.PDFDocument, paint: () => void): void {
  const { top, bottom } = doc.page.margins;
  doc.page.margins.top = 0;
  doc.page.margins.bottom = 0;
  try {
    paint();
  } finally {
    doc.page.margins.top = top;
    doc.page.margins.bottom = bottom;
  }
}

function paintHeader(doc: PDFKit.PDFDocument): void {
  withinMargins(doc, () => {
    const logo = loadLogo();
    const top = 36;
    // Light bottom rule under the header band.
    doc
      .moveTo(PAGE_MARGINS.left, top + 28)
      .lineTo(A4_WIDTH - PAGE_MARGINS.right, top + 28)
      .lineWidth(0.5)
      .strokeColor(COLORS.rule)
      .stroke();
    doc.strokeColor(COLORS.text).lineWidth(1);

    // Logo (left); fallback to text wordmark if image is missing.
    if (logo) {
      try {
        doc.image(logo, PAGE_MARGINS.left, top - 4, { height: 22 });
      } catch {
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text);
        doc.text('TrueStack', PAGE_MARGINS.left, top, { lineBreak: false });
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text);
      doc.text('TrueStack', PAGE_MARGINS.left, top, { lineBreak: false });
    }

    // Title (right) — two lines stacked
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
    doc.text('TrueSSM\u2122 Company Profile', PAGE_MARGINS.left, top, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text('In partnership with ssmsearch.com', PAGE_MARGINS.left, top + 14, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
    doc.fillColor(COLORS.text);
  });
}

function paintFooter(
  doc: PDFKit.PDFDocument,
  pageIndex: number,
  totalPages: number,
  acknowledgement: SsmAcknowledgement,
): void {
  withinMargins(doc, () => {
    const ruleY = A4_HEIGHT - PAGE_MARGINS.bottom + 16;
    const textY = ruleY + 8;

    doc
      .moveTo(PAGE_MARGINS.left, ruleY)
      .lineTo(A4_WIDTH - PAGE_MARGINS.right, ruleY)
      .lineWidth(0.5)
      .strokeColor(COLORS.rule)
      .stroke();
    doc.strokeColor(COLORS.text).lineWidth(1);

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);

    // Two non-overlapping zones: left (brand + usage), right (page counter).
    // Centering a long Usage ID between two short pieces is fragile because
    // the UUID alone is ~145pt at 8pt, so we keep it on the left.
    const usageLine = acknowledgement.usage_id
      ? `Confidential · Generated via TrueSSM\u2122 · Usage ID ${acknowledgement.usage_id}`
      : 'Confidential · Generated via TrueSSM\u2122 · For internal use';
    doc.text(usageLine, PAGE_MARGINS.left, textY, {
      width: CONTENT_WIDTH - 100,
      align: 'left',
      lineBreak: false,
    });

    doc.text(
      `Page ${pageIndex + 1} of ${totalPages}`,
      A4_WIDTH - PAGE_MARGINS.right - 100,
      textY,
      { width: 100, align: 'right', lineBreak: false },
    );

    doc.fillColor(COLORS.text);
  });
}

/* ----------------------------- main renderer ----------------------------- */

export function renderCompanyProfilePdf(input: RenderInput): Promise<Buffer> {
  const { rawData, acknowledgement, regNo, pulledAt, tenantName } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: PAGE_MARGINS,
      bufferPages: true,
      info: {
        Title: `SSM Company Profile ${regNo}`,
        Author: tenantName || 'TrueKredit',
        Subject: 'TrueSSM Company Profile Pull',
        Producer: 'TrueKredit · TrueSSM',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const compProfile =
      asObject((rawData as Record<string, unknown>)['getCompProfile']) ??
      (rawData as Record<string, unknown>);

    const roc = asObject(compProfile['rocCompanyInfo']) ?? {};
    const regAddress = asObject(compProfile['rocRegAddressInfo']);
    const businessAddress = asObject(compProfile['rocBusinessAddressInfo']);
    const shareCapital = asObject(compProfile['rocShareCapitalInfo']);
    const officers = readNestedList(
      compProfile,
      'rocCompanyOfficerListInfo',
      'rocCompanyOfficerInfos',
    );
    const shareholders = readNestedList(
      compProfile,
      'rocShareholderListInfo',
      'rocShareholderInfos',
    );
    const charges = readNestedList(compProfile, 'rocChargesListInfo', 'rocChargesInfos');
    const balanceSheets = readNestedList(
      compProfile,
      'rocBalanceSheetListInfo',
      'rocBalanceSheetInfos',
    );
    const profitLoss = readNestedList(
      compProfile,
      'rocProfitLossListInfo',
      'rocProfitLossInfos',
    );
    const businessCodes = readNestedList(
      compProfile,
      'rocBusinessCodeListInfo',
      'rocBusinessCodeInfos',
    );
    const documentLodge = readNestedList(
      compProfile,
      'rocDocumentLodgeListInfo',
      'rocDocumentLodgeInfos',
    );

    /* ---- Title block (first page only, below the header band) ---- */
    const companyName = plain(roc['companyName']) ?? 'Unknown Entity';
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text);
    doc.text(companyName, PAGE_MARGINS.left, PAGE_MARGINS.top, { width: CONTENT_WIDTH });

    // Compose canonical reg no — old SSM numbers (pre-2017) carry a
    // single-letter check digit in a separate field (e.g. "67" + "W" → "67-W").
    // New 12-digit reg numbers leave `checkDigit` blank.
    const rocCompanyNo = plain(roc['companyNo']);
    const rocCheckDigit = plain(roc['checkDigit']);
    const composedRegNo =
      rocCompanyNo && rocCheckDigit
        ? `${rocCompanyNo}-${rocCheckDigit}`
        : (rocCompanyNo ?? regNo);

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    const subtitleParts = [
      `Registration No: ${composedRegNo}`,
      `Pulled ${formatPulledAt(pulledAt)} (MYT)`,
    ];
    if (acknowledgement.usage_id) subtitleParts.push(`Usage ID ${acknowledgement.usage_id}`);
    doc.text(subtitleParts.join(' · '), PAGE_MARGINS.left, doc.y + 2, { width: CONTENT_WIDTH });

    const businessDesc = plain(roc['businessDescription']);

    /* ---- 1. Identity ---- */
    sectionHeading(doc, '1. Company Identity');
    renderKvGrid(doc, [
      { label: 'Company Name', value: plain(roc['companyName']) },
      { label: 'Former Name', value: plain(roc['companyOldName']) },
      { label: 'Registration No', value: composedRegNo },
      { label: 'Company Type', value: decode(SSM_COMPANY_TYPE, roc['companyType']) },
      {
        label: 'Status',
        value:
          decode(SSM_COMPANY_STATUS, roc['statusOfCompany']) ??
          decode(SSM_COMPANY_STATUS, roc['companyStatus']),
      },
      { label: 'Incorporation Date', value: formatDateOnly(roc['incorpDate']) },
      { label: 'Last Change Date', value: formatDateOnly(roc['dateOfChange']) },
      { label: 'Country', value: plain(roc['companyCountry']) },
      { label: 'Currency', value: plain(roc['currency']) },
      {
        label: 'Local / Foreign',
        value:
          plain(roc['localforeignCompany']) === 'L'
            ? 'Local'
            : plain(roc['localforeignCompany']) === 'F'
              ? 'Foreign'
              : null,
      },
      { label: 'Last Doc Update', value: formatDateOnly(roc['latestDocUpdateDate']) },
    ]);

    if (businessDesc) {
      doc.moveDown(0.4);
      ensureSpace(doc, 60);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text('BUSINESS DESCRIPTION', PAGE_MARGINS.left, doc.y, {
        width: CONTENT_WIDTH,
        characterSpacing: 0.4,
      });
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
      doc.text(businessDesc, PAGE_MARGINS.left, doc.y + 2, { width: CONTENT_WIDTH });
    }

    /* ---- 2. Addresses ---- */
    sectionHeading(doc, '2. Registered & Business Address');
    const regAddr = formatAddressMultiline(regAddress as AddressBlock | null);
    const bizAddr = formatAddressMultiline(businessAddress as AddressBlock | null);
    if (!regAddr && !bizAddr) {
      renderEmpty(doc, 'No address returned.');
    } else {
      const colGap = 18;
      const colWidth = (CONTENT_WIDTH - colGap) / 2;
      const topY = doc.y;
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text('REGISTERED OFFICE', PAGE_MARGINS.left, topY, {
        width: colWidth,
        characterSpacing: 0.4,
      });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
      doc.text(regAddr ?? '—', PAGE_MARGINS.left, doc.y + 2, { width: colWidth });
      const leftBottom = doc.y;

      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text('BUSINESS ADDRESS', PAGE_MARGINS.left + colWidth + colGap, topY, {
        width: colWidth,
        characterSpacing: 0.4,
      });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
      doc.text(bizAddr ?? '—', PAGE_MARGINS.left + colWidth + colGap, doc.y + 2, {
        width: colWidth,
      });
      const rightBottom = doc.y;

      doc.y = Math.max(leftBottom, rightBottom) + 4;
      doc.fillColor(COLORS.text);
    }

    /* ---- 3. Officers ---- */
    sectionHeading(doc, '3. Directors / Officers', officers.length);
    renderEntityCards(
      doc,
      officers.map((o) => ({
        name: plain(o.name),
        rightPill: decode(SSM_OFFICER_DESIGNATION, o.designationCode),
        metaLine: [
          plain(o.idNo) ? `${decode(SSM_ID_TYPE, o.idType) ?? 'ID'} ${plain(o.idNo)}` : null,
          formatDateOnly(o.startDate) ? `Since ${formatDateOnly(o.startDate)}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
        detailLine: formatAddressInline(o as AddressBlock),
      })),
    );

    /* ---- 4. Shareholders ---- */
    sectionHeading(doc, '4. Shareholders', shareholders.length);
    renderEntityCards(
      doc,
      shareholders.map((h) => ({
        name: plain(h.name),
        rightValue: formatMoney(h.share) ? `${formatMoney(h.share)} shares` : null,
        metaLine: [
          decode(SSM_ID_TYPE, h.idType),
          plain(h.idNo) && plain(h.idNo) !== '-' ? plain(h.idNo) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      })),
    );

    /* ---- 5. Share capital ---- */
    sectionHeading(doc, '5. Share Capital');
    if (shareCapital) {
      renderKvGrid(doc, [
        { label: 'Authorised Capital', value: formatMoney(shareCapital['authorisedCapital']) },
        { label: 'Total Issued (Paid-up)', value: formatMoney(shareCapital['totalIssued']) },
        { label: 'Currency', value: plain(shareCapital['currency']) },
        { label: 'Ordinary Shares', value: formatMoney(shareCapital['ordNumberOfShares']) },
        { label: 'Ord. Issued (Cash)', value: formatMoney(shareCapital['ordIssuedCash']) },
        { label: 'Ord. Issued (Non-Cash)', value: formatMoney(shareCapital['ordIssuedNonCash']) },
        { label: 'Ord. Nominal Value (sen)', value: formatMoney(shareCapital['ordNominalValue']) },
        { label: 'Preference Shares', value: formatMoney(shareCapital['prefNumberOfShares']) },
      ]);
    } else {
      renderEmpty(doc, 'No share capital data returned.');
    }

    /* ---- 6. Charges ---- */
    sectionHeading(doc, '6. Charges', charges.length);
    renderTable(
      doc,
      charges.map((c) => ({
        chargeNo: plain(c.chargeNo),
        amount: formatMoney(c.chargeAmount),
        type: decode(SSM_CHARGE_MORTGAGE_TYPE, c.chargeMortgageType),
        status: decode(SSM_CHARGE_STATUS, c.chargeStatus),
        chargee: plain(c.chargeeName) ?? plain(c.chargeeId),
        createdOn: formatDateOnly(c.chargeCreateDate),
      })),
      [
        { key: 'chargeNo', label: 'No', width: 30 },
        { key: 'amount', label: 'Amount (RM)', width: 86, align: 'right' },
        { key: 'type', label: 'Type', width: 74 },
        { key: 'status', label: 'Status', width: 64 },
        { key: 'chargee', label: 'Chargee', width: 168 },
        { key: 'createdOn', label: 'Created', width: 73 },
      ],
    );

    /* ---- 7. Balance Sheet (latest filed year) ---- */
    const sortedBalanceSheets = sortByFinancialYearDesc(balanceSheets);
    const latestBalanceSheet = sortedBalanceSheets[0];
    sectionHeading(doc, '7. Balance Sheet', balanceSheets.length);
    if (!latestBalanceSheet) {
      renderEmpty(doc, 'No balance-sheet filings returned.');
    } else {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text(
        `LATEST FILED YEAR · ${formatDateOnly(latestBalanceSheet['financialYearEndDate']) ?? '—'}` +
          (formatDateOnly(latestBalanceSheet['dateOfTabling'])
            ? ` · Tabled ${formatDateOnly(latestBalanceSheet['dateOfTabling'])}`
            : ''),
        PAGE_MARGINS.left,
        doc.y,
        { width: CONTENT_WIDTH, characterSpacing: 0.4 },
      );
      doc.text(
        'All values in RM · figures in (parentheses) are negative',
        PAGE_MARGINS.left,
        doc.y + 1,
        { width: CONTENT_WIDTH },
      );
      doc.moveDown(0.3);
      doc.fillColor(COLORS.text);

      renderAccountingGrid(doc, [
        { label: 'Current Assets', value: formatAccounting(latestBalanceSheet['currentAsset']) },
        { label: 'Fixed Assets', value: formatAccounting(latestBalanceSheet['fixedAsset']) },
        { label: 'Non-Current Assets', value: formatAccounting(latestBalanceSheet['nonCurrAsset']) },
        { label: 'Other Assets', value: formatAccounting(latestBalanceSheet['otherAsset']) },
        { label: 'Liabilities', value: formatAccounting(latestBalanceSheet['liability']) },
        {
          label: 'Long-Term Liabilities',
          value: formatAccounting(latestBalanceSheet['longTermLiability']),
        },
        {
          label: 'Non-Current Liabilities',
          value: formatAccounting(latestBalanceSheet['nonCurrentLiability']),
        },
        { label: 'Paid-up Capital', value: formatAccounting(latestBalanceSheet['paidUpCapital']) },
        { label: 'Reserves', value: formatAccounting(latestBalanceSheet['reserves']) },
        { label: 'Share Premium', value: formatAccounting(latestBalanceSheet['sharePremium']) },
        {
          label: 'Retained Earnings',
          value: formatAccounting(latestBalanceSheet['inappropriateProfit']),
        },
        {
          // Provider typo: `contigent` — preserved verbatim. See TRUESSM_API.md.
          label: 'Contingent Liabilities',
          value: formatAccounting(latestBalanceSheet['contigentLiability']),
        },
      ]);

      // Multi-year history (compact table) — only when ≥ 2 years available.
      if (sortedBalanceSheets.length > 1) {
        doc.moveDown(0.6);
        renderTable(
          doc,
          sortedBalanceSheets.map((b) => ({
            year: formatDateOnly(b['financialYearEndDate']),
            assets: formatAccounting(
              sumNumericStrings([
                b['currentAsset'],
                b['fixedAsset'],
                b['nonCurrAsset'],
                b['otherAsset'],
              ]),
            ),
            liabilities: formatAccounting(
              sumNumericStrings([
                b['liability'],
                b['longTermLiability'],
                b['nonCurrentLiability'],
              ]),
            ),
            paidUp: formatAccounting(b['paidUpCapital']),
            reserves: formatAccounting(b['reserves']),
            retained: formatAccounting(b['inappropriateProfit']),
          })),
          [
            { key: 'year', label: 'FY end', width: 70 },
            { key: 'assets', label: 'Total assets', width: 90, align: 'right' },
            { key: 'liabilities', label: 'Total liab.', width: 85, align: 'right' },
            { key: 'paidUp', label: 'Paid-up', width: 80, align: 'right' },
            { key: 'reserves', label: 'Reserves', width: 80, align: 'right' },
            { key: 'retained', label: 'Retained', width: 90, align: 'right' },
          ],
        );
      }
    }

    /* ---- 8. Profit & Loss (latest filed year) ---- */
    const sortedProfitLoss = sortByFinancialYearDesc(profitLoss);
    const latestPL = sortedProfitLoss[0];
    sectionHeading(doc, '8. Profit & Loss', profitLoss.length);
    if (!latestPL) {
      renderEmpty(doc, 'No profit & loss filings returned.');
    } else {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text(
        `LATEST FILED YEAR · ${formatDateOnly(latestPL['financialYearEndDate']) ?? '—'}`,
        PAGE_MARGINS.left,
        doc.y,
        { width: CONTENT_WIDTH, characterSpacing: 0.4 },
      );
      doc.text(
        'All values in RM · figures in (parentheses) are negative',
        PAGE_MARGINS.left,
        doc.y + 1,
        { width: CONTENT_WIDTH },
      );
      doc.moveDown(0.3);
      doc.fillColor(COLORS.text);

      renderAccountingGrid(doc, [
        { label: 'Turnover', value: formatAccounting(latestPL['turnover']) },
        { label: 'Revenue', value: formatAccounting(latestPL['revenue']) },
        { label: 'Total Revenue', value: formatAccounting(latestPL['totalRevenue']) },
        { label: 'Total Income', value: formatAccounting(latestPL['totalIncome']) },
        { label: 'Total Expenditure', value: formatAccounting(latestPL['totalExpenditure']) },
        { label: 'Profit Before Tax', value: formatAccounting(latestPL['profitBeforeTax']) },
        { label: 'Profit After Tax', value: formatAccounting(latestPL['profitAfterTax']) },
        { label: 'Profit to Shareholders', value: formatAccounting(latestPL['profitShareholder']) },
        { label: 'Gross Dividend Rate', value: formatAccounting(latestPL['grossDividendRate']) },
        { label: 'Net Dividend', value: formatAccounting(latestPL['netDividend']) },
        {
          label: 'Retained Earnings (b/f)',
          value: formatAccounting(latestPL['inappropriateProfitBf']),
        },
        {
          label: 'Retained Earnings (c/f)',
          value: formatAccounting(latestPL['inappropriateProfitCf']),
        },
      ]);

      if (sortedProfitLoss.length > 1) {
        doc.moveDown(0.6);
        renderTable(
          doc,
          sortedProfitLoss.map((p) => ({
            year: formatDateOnly(p['financialYearEndDate']),
            revenue: formatAccounting(p['revenue']) ?? formatAccounting(p['turnover']),
            pbt: formatAccounting(p['profitBeforeTax']),
            pat: formatAccounting(p['profitAfterTax']),
            retained: formatAccounting(p['inappropriateProfitCf']),
          })),
          [
            { key: 'year', label: 'FY end', width: 80 },
            { key: 'revenue', label: 'Revenue', width: 105, align: 'right' },
            { key: 'pbt', label: 'Profit before tax', width: 110, align: 'right' },
            { key: 'pat', label: 'Profit after tax', width: 105, align: 'right' },
            { key: 'retained', label: 'Retained (c/f)', width: 95, align: 'right' },
          ],
        );
      }
    }

    /* ---- 9. Auditor (from latest balance sheet) ---- */
    sectionHeading(doc, '9. Auditor');
    if (!latestBalanceSheet || !plain(latestBalanceSheet['auditFirmName'])) {
      renderEmpty(doc, 'No auditor information returned.');
    } else {
      const auditAddress = formatAddressMultiline({
        address1: latestBalanceSheet['auditFirmAddress1'],
        address2: latestBalanceSheet['auditFirmAddress2'],
        address3: latestBalanceSheet['auditFirmAddress3'],
        postcode: latestBalanceSheet['auditFirmPostcode'],
        state: latestBalanceSheet['auditFirmState'],
        town: latestBalanceSheet['auditFirmTown'],
      });
      renderKvGrid(doc, [
        { label: 'Audit Firm', value: plain(latestBalanceSheet['auditFirmName']) },
        { label: 'Audit Firm No.', value: plain(latestBalanceSheet['auditFirmNo']) },
        { label: 'Reporting Year', value: formatDateOnly(latestBalanceSheet['financialYearEndDate']) },
        { label: 'Address', value: auditAddress },
      ]);
    }

    /* ---- 10. MSIC Business Codes ---- */
    const sortedBusinessCodes = [...businessCodes].sort((a, b) => {
      const ap = Number(plain(a['priority']) ?? '99');
      const bp = Number(plain(b['priority']) ?? '99');
      return (Number.isFinite(ap) ? ap : 99) - (Number.isFinite(bp) ? bp : 99);
    });
    sectionHeading(doc, '10. MSIC Business Codes', businessCodes.length);
    renderTable(
      doc,
      sortedBusinessCodes.map((c) => ({
        priority:
          plain(c['priority']) === '1'
            ? 'Primary'
            : plain(c['priority'])
              ? `Secondary ${plain(c['priority'])}`
              : null,
        code: plain(c['businessCode']),
      })),
      [
        { key: 'priority', label: 'Priority', width: 160 },
        { key: 'code', label: 'MSIC 2008 code', width: 335 },
      ],
    );

    /* ---- 11. Document Lodgement History ---- */
    const sortedLodge = [...documentLodge].sort((a, b) => {
      const ad = plain(a['documentDate']) ?? '';
      const bd = plain(b['documentDate']) ?? '';
      return bd.localeCompare(ad);
    });
    sectionHeading(doc, '11. Document Lodgement History', documentLodge.length);
    renderTable(
      doc,
      sortedLodge.map((d) => ({
        date: formatDateOnly(d['documentDate']),
        form: plain(d['formTrx']),
        description: describeSsmForm(plain(d['formTrx'])),
      })),
      [
        { key: 'date', label: 'Lodgement date', width: 130 },
        { key: 'form', label: 'Form', width: 70 },
        { key: 'description', label: 'Description', width: 295 },
      ],
    );

    /* ---- Header + footer on every page ---- */
    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      paintHeader(doc);
      paintFooter(doc, i - range.start, totalPages, acknowledgement);
    }

    doc.end();
  });
}
