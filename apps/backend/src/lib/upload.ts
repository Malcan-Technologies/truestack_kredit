import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import { BadRequestError } from './errors.js';

// Configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB for logos
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB for documents
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

// Document file types
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const ALLOWED_DOCUMENT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

// Logo constraints (relaxed for flexibility)
const LOGO_MIN_WIDTH = 32;
const LOGO_MAX_WIDTH = 4000;
const LOGO_MIN_HEIGHT = 32;
const LOGO_MAX_HEIGHT = 4000;
const LOGO_MIN_ASPECT_RATIO = 0.1; // 1:10 (very tall)
const LOGO_MAX_ASPECT_RATIO = 10.0; // 10:1 (very wide)

// Ensure upload directory exists
export function ensureUploadDir(): void {
  const logoDir = path.join(UPLOAD_DIR, 'logos');
  if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
  }
}

// Ensure documents directory exists
export function ensureDocumentsDir(): void {
  const docsDir = path.join(UPLOAD_DIR, 'documents');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
}

// Get the base URL for uploaded files
export function getUploadBaseUrl(): string {
  // In production, this would return the S3 URL
  // For now, return local path that will be served by Express
  return process.env.UPLOAD_BASE_URL || '/uploads';
}

// Parse multipart form data manually (simple implementation)
// In production, you'd use multer with S3 storage
export async function parseLogoUpload(req: Request): Promise<{
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      reject(new BadRequestError('Content-Type must be multipart/form-data'));
      return;
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      reject(new BadRequestError('Missing boundary in Content-Type'));
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        reject(new BadRequestError(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const data = Buffer.concat(chunks);
        const content = data.toString('binary');
        
        // Parse multipart data
        const parts = content.split(`--${boundary}`);
        
        for (const part of parts) {
          if (part.includes('Content-Disposition') && part.includes('filename=')) {
            // Extract filename
            const filenameMatch = part.match(/filename="([^"]+)"/);
            const originalName = filenameMatch ? filenameMatch[1] : 'logo';
            
            // Extract content type
            const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
            const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
            
            // Validate mime type
            if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
              reject(new BadRequestError(`Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`));
              return;
            }
            
            // Validate extension
            const ext = path.extname(originalName).toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
              reject(new BadRequestError(`Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
              return;
            }
            
            // Extract file content (after double CRLF)
            const headerEnd = part.indexOf('\r\n\r\n');
            if (headerEnd === -1) {
              reject(new BadRequestError('Invalid multipart format'));
              return;
            }
            
            const fileContent = part.substring(headerEnd + 4);
            // Remove trailing boundary markers
            const cleanContent = fileContent.replace(/\r\n--$/, '').replace(/--\r\n$/, '').replace(/\r\n$/, '');
            
            const buffer = Buffer.from(cleanContent, 'binary');
            
            resolve({ buffer, originalName, mimeType });
            return;
          }
        }
        
        reject(new BadRequestError('No file found in request'));
      } catch (error) {
        reject(new BadRequestError('Failed to parse file upload'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

// Validate image dimensions (basic check using file header)
export function validateImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } {
  let width = 0;
  let height = 0;
  
  if (mimeType === 'image/png') {
    // PNG: width at bytes 16-19, height at bytes 20-23
    if (buffer.length >= 24) {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    }
  } else if (mimeType === 'image/jpeg') {
    // JPEG: need to parse SOF markers
    let offset = 2; // Skip SOI marker
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      
      // SOF0, SOF1, SOF2 markers contain dimensions
      if (marker >= 0xC0 && marker <= 0xC3) {
        height = buffer.readUInt16BE(offset + 5);
        width = buffer.readUInt16BE(offset + 7);
        break;
      }
      
      // Skip to next marker
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += segmentLength + 2;
    }
  } else if (mimeType === 'image/webp') {
    // WebP: VP8 or VP8L format
    if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
      const format = buffer.toString('ascii', 12, 16);
      if (format === 'VP8 ') {
        // Lossy VP8
        width = buffer.readUInt16LE(26) & 0x3FFF;
        height = buffer.readUInt16LE(28) & 0x3FFF;
      } else if (format === 'VP8L') {
        // Lossless VP8L
        const bits = buffer.readUInt32LE(21);
        width = (bits & 0x3FFF) + 1;
        height = ((bits >> 14) & 0x3FFF) + 1;
      }
    }
  }
  
  if (width === 0 || height === 0) {
    throw new BadRequestError('Could not determine image dimensions');
  }
  
  // Validate dimensions
  if (width < LOGO_MIN_WIDTH || width > LOGO_MAX_WIDTH) {
    throw new BadRequestError(`Image width must be between ${LOGO_MIN_WIDTH}px and ${LOGO_MAX_WIDTH}px`);
  }
  
  if (height < LOGO_MIN_HEIGHT || height > LOGO_MAX_HEIGHT) {
    throw new BadRequestError(`Image height must be between ${LOGO_MIN_HEIGHT}px and ${LOGO_MAX_HEIGHT}px`);
  }
  
  const aspectRatio = width / height;
  if (aspectRatio < LOGO_MIN_ASPECT_RATIO || aspectRatio > LOGO_MAX_ASPECT_RATIO) {
    throw new BadRequestError(`Image aspect ratio must be between ${LOGO_MIN_ASPECT_RATIO}:1 and ${LOGO_MAX_ASPECT_RATIO}:1`);
  }
  
  return { width, height };
}

// Save file to local storage
export function saveLogoFile(buffer: Buffer, tenantId: string, extension: string): string {
  ensureUploadDir();
  
  const filename = `${tenantId}-${Date.now()}${extension}`;
  const logoDir = path.join(UPLOAD_DIR, 'logos');
  const filepath = path.join(logoDir, filename);
  
  fs.writeFileSync(filepath, buffer);
  
  // Return the URL path (not filesystem path)
  return `${getUploadBaseUrl()}/logos/${filename}`;
}

// Delete old logo file
export function deleteLogoFile(logoUrl: string): void {
  if (!logoUrl || !logoUrl.startsWith(getUploadBaseUrl())) {
    return; // S3 URL or no logo, don't delete
  }
  
  const filename = logoUrl.replace(`${getUploadBaseUrl()}/logos/`, '');
  const filepath = path.join(UPLOAD_DIR, 'logos', filename);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

// Parse multipart form data for document uploads
export async function parseDocumentUpload(req: Request): Promise<{
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  category: string;
}> {
  const result = await parseFileUpload(req);
  
  if (!result.fields?.category) {
    throw new BadRequestError('Category is required');
  }
  
  return {
    buffer: result.buffer,
    originalName: result.originalName,
    mimeType: result.mimeType,
    category: result.fields.category,
  };
}

// Parse multipart form data for file uploads (without requiring category)
export async function parseFileUpload(req: Request): Promise<{
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  fields: Record<string, string>;
}> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      reject(new BadRequestError('Content-Type must be multipart/form-data'));
      return;
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      reject(new BadRequestError('Missing boundary in Content-Type'));
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_DOCUMENT_SIZE) {
        reject(new BadRequestError(`File size exceeds maximum of ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const data = Buffer.concat(chunks);
        const content = data.toString('binary');
        
        // Parse multipart data
        const parts = content.split(`--${boundary}`);
        
        const fields: Record<string, string> = {};
        let fileBuffer: Buffer | null = null;
        let originalName = '';
        let mimeType = '';
        
        for (const part of parts) {
          if (part.includes('Content-Disposition')) {
            // Check field name
            const nameMatch = part.match(/name="([^"]+)"/);
            const fieldName = nameMatch ? nameMatch[1] : '';
            
            if (!part.includes('filename=')) {
              // This is a regular field, extract its value
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd !== -1) {
                const value = part.substring(headerEnd + 4).replace(/\r\n--$/, '').replace(/--\r\n$/, '').replace(/\r\n$/, '').trim();
                if (fieldName) {
                  fields[fieldName] = value;
                }
              }
            }
            
            if (part.includes('filename=')) {
              // Extract filename
              const filenameMatch = part.match(/filename="([^"]+)"/);
              originalName = filenameMatch ? filenameMatch[1] : 'document';
              
              // Extract content type
              const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
              mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
              
              // Validate mime type
              if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType)) {
                reject(new BadRequestError(`Invalid file type. Allowed: ${ALLOWED_DOCUMENT_MIME_TYPES.join(', ')}`));
                return;
              }
              
              // Validate extension
              const ext = path.extname(originalName).toLowerCase();
              if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
                reject(new BadRequestError(`Invalid file extension. Allowed: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}`));
                return;
              }
              
              // Extract file content (after double CRLF)
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd === -1) {
                reject(new BadRequestError('Invalid multipart format'));
                return;
              }
              
              const fileContent = part.substring(headerEnd + 4);
              // Remove trailing boundary markers
              const cleanContent = fileContent.replace(/\r\n--$/, '').replace(/--\r\n$/, '').replace(/\r\n$/, '');
              
              fileBuffer = Buffer.from(cleanContent, 'binary');
            }
          }
        }
        
        if (!fileBuffer) {
          reject(new BadRequestError('No file found in request'));
          return;
        }
        
        resolve({ buffer: fileBuffer, originalName, mimeType, fields });
      } catch (error) {
        reject(new BadRequestError('Failed to parse file upload'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

// Save document file to local storage (dev) or S3 (prod)
export function saveDocumentFile(
  buffer: Buffer,
  tenantId: string,
  applicationId: string,
  extension: string
): { filename: string; path: string } {
  ensureDocumentsDir();
  
  const filename = `${tenantId}-${applicationId}-${Date.now()}${extension}`;
  const docsDir = path.join(UPLOAD_DIR, 'documents');
  const filepath = path.join(docsDir, filename);
  
  fs.writeFileSync(filepath, buffer);
  
  // Return both the filename and the URL path
  const urlPath = `${getUploadBaseUrl()}/documents/${filename}`;
  return { filename, path: urlPath };
}

// Delete document file
export function deleteDocumentFile(documentPath: string): void {
  if (!documentPath || !documentPath.startsWith(getUploadBaseUrl())) {
    return; // S3 URL or invalid path, don't delete locally
  }
  
  // Try documents folder first
  let filename = documentPath.replace(`${getUploadBaseUrl()}/documents/`, '');
  let filepath = path.join(UPLOAD_DIR, 'documents', filename);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    return;
  }

  // Try receipts folder
  filename = documentPath.replace(`${getUploadBaseUrl()}/receipts/`, '');
  filepath = path.join(UPLOAD_DIR, 'receipts', filename);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

// Ensure receipts directory exists
export function ensureReceiptsDir(): void {
  const receiptsDir = path.join(UPLOAD_DIR, 'receipts');
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
  }
}

// Save payment receipt/bank slip file to local storage (dev) or S3 (prod)
export function savePaymentReceiptFile(
  buffer: Buffer,
  tenantId: string,
  loanId: string,
  allocationId: string,
  extension: string
): { filename: string; path: string } {
  ensureReceiptsDir();
  
  const filename = `${tenantId}-${loanId}-${allocationId}-${Date.now()}${extension}`;
  const receiptsDir = path.join(UPLOAD_DIR, 'receipts');
  const filepath = path.join(receiptsDir, filename);
  
  fs.writeFileSync(filepath, buffer);
  
  // Return both the filename and the URL path
  const urlPath = `${getUploadBaseUrl()}/receipts/${filename}`;
  return { filename, path: urlPath };
}

export { UPLOAD_DIR, MAX_FILE_SIZE, MAX_DOCUMENT_SIZE, ALLOWED_MIME_TYPES, ALLOWED_DOCUMENT_MIME_TYPES };
