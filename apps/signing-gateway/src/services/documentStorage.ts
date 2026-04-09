import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

interface DocumentMeta {
  loanId: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  signedAt: string;
  signerUserId: string;
  signerName: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loanDir(loanId: string): string {
  return path.join(config.storage.path, loanId);
}

export function storeSignedPdf(
  loanId: string,
  pdfBase64: string,
  meta: Omit<DocumentMeta, 'filename' | 'sizeBytes' | 'signedAt'>
): { documentPath: string; metadata: DocumentMeta } {
  const dir = loanDir(loanId);
  ensureDir(dir);

  const timestamp = Date.now();
  const filename = `signed-agreement-${timestamp}.pdf`;
  const pdfPath = path.join(dir, filename);
  const metaPath = path.join(dir, `signed-agreement-${timestamp}.json`);

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  fs.writeFileSync(pdfPath, pdfBuffer);

  const metadata: DocumentMeta = {
    ...meta,
    filename,
    sizeBytes: pdfBuffer.length,
    signedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log(`[DocumentStorage] Stored signed PDF for loan ${loanId}: ${pdfPath} (${pdfBuffer.length} bytes)`);
  return { documentPath: pdfPath, metadata };
}

export function getLatestSignedPdf(loanId: string): { buffer: Buffer; metadata: DocumentMeta } | null {
  const dir = loanDir(loanId);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('signed-agreement-') && f.endsWith('.pdf'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const pdfFile = files[0];
  const metaFile = pdfFile.replace('.pdf', '.json');
  const pdfPath = path.join(dir, pdfFile);
  const metaPath = path.join(dir, metaFile);

  const buffer = fs.readFileSync(pdfPath);
  let metadata: DocumentMeta;

  if (fs.existsSync(metaPath)) {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } else {
    metadata = {
      loanId,
      filename: pdfFile,
      originalName: pdfFile,
      sizeBytes: buffer.length,
      signedAt: new Date().toISOString(),
      signerUserId: '',
      signerName: '',
    };
  }

  return { buffer, metadata };
}

export function listAllDocuments(): DocumentMeta[] {
  const baseDir = config.storage.path;
  if (!fs.existsSync(baseDir)) return [];

  const results: DocumentMeta[] = [];
  const loanDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of loanDirs) {
    const loanPath = path.join(baseDir, dir.name);
    const metaFiles = fs.readdirSync(loanPath)
      .filter((f) => f.startsWith('signed-agreement-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (metaFiles.length === 0) continue;

    try {
      const meta: DocumentMeta = JSON.parse(
        fs.readFileSync(path.join(loanPath, metaFiles[0]), 'utf-8'),
      );
      results.push(meta);
    } catch {
      // skip corrupted metadata
    }
  }

  return results;
}

export function checkDocumentsExist(loanIds: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const loanId of loanIds) {
    const dir = loanDir(loanId);
    if (!fs.existsSync(dir)) {
      result[loanId] = false;
      continue;
    }
    const hasFiles = fs.readdirSync(dir)
      .some((f) => f.startsWith('signed-agreement-') && f.endsWith('.pdf'));
    result[loanId] = hasFiles;
  }
  return result;
}

export function restoreSignedPdf(
  loanId: string,
  pdfBuffer: Buffer,
): { documentPath: string; metadata: DocumentMeta } {
  const dir = loanDir(loanId);
  ensureDir(dir);

  const timestamp = Date.now();
  const filename = `signed-agreement-${timestamp}.pdf`;
  const pdfPath = path.join(dir, filename);
  const metaPath = path.join(dir, `signed-agreement-${timestamp}.json`);

  fs.writeFileSync(pdfPath, pdfBuffer);

  const metadata: DocumentMeta = {
    loanId,
    filename,
    originalName: `restored-agreement-${loanId}.pdf`,
    sizeBytes: pdfBuffer.length,
    signedAt: new Date().toISOString(),
    signerUserId: '',
    signerName: 'Restored from backup',
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log(`[DocumentStorage] Restored PDF for loan ${loanId}: ${pdfPath} (${pdfBuffer.length} bytes)`);
  return { documentPath: pdfPath, metadata };
}
