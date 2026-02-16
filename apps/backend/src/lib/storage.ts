/**
 * Storage abstraction layer for file uploads
 * Supports local storage (development) and S3 (production)
 */

import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

// Storage configuration
const STORAGE_TYPE = config.storage.type; // 'local' or 's3'
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// S3 client (initialized lazily for production)
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKey = config.storage.s3.accessKey;
    const secretKey = config.storage.s3.secretKey;
    const hasStaticCredentials = Boolean(accessKey && secretKey);
    const hasCustomEndpoint = Boolean(config.storage.s3.endpoint);

    const clientConfig: S3ClientConfig = {
      region: process.env.AWS_REGION || 'ap-southeast-1',
    };

    if (hasCustomEndpoint) {
      clientConfig.endpoint = config.storage.s3.endpoint;
      // MinIO/local S3-compatible providers generally require path-style requests.
      clientConfig.forcePathStyle = true;
    }

    if (accessKey && secretKey) {
      clientConfig.credentials = {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      };
    } else if (hasCustomEndpoint) {
      throw new Error('S3 custom endpoint requires S3_ACCESS_KEY and S3_SECRET_KEY');
    }

    // When explicit credentials are absent, AWS SDK falls back to the default
    // provider chain (ECS task role / EC2 role / environment credentials).
    s3Client = new S3Client(clientConfig);
  }
  return s3Client;
}

// ============================================
// Directory helpers
// ============================================

export function ensureDir(dirPath: string): void {
  const fullPath = path.join(UPLOAD_DIR, dirPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

export function getUploadBaseUrl(): string {
  return process.env.UPLOAD_BASE_URL || '/uploads';
}

// ============================================
// Local Storage Functions
// ============================================

async function saveToLocal(
  buffer: Buffer,
  category: string,
  filename: string
): Promise<{ path: string; filename: string }> {
  ensureDir(category);
  
  const filepath = path.join(UPLOAD_DIR, category, filename);
  fs.writeFileSync(filepath, buffer);
  
  const urlPath = `${getUploadBaseUrl()}/${category}/${filename}`;
  return { path: urlPath, filename };
}

async function getFromLocal(filePath: string): Promise<Buffer | null> {
  // Convert URL path to filesystem path
  // Handle both /uploads/... and /api/uploads/... path formats
  const relativePath = filePath
    .replace(/^\/api\/uploads\//, '')
    .replace(getUploadBaseUrl(), '')
    .replace(/^\//, '');
  const fullPath = path.join(UPLOAD_DIR, relativePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`[Storage] File not found: ${fullPath} (original: ${filePath})`);
    return null;
  }
  
  return fs.readFileSync(fullPath);
}

async function deleteFromLocal(filePath: string): Promise<void> {
  // Convert URL path to filesystem path
  const relativePath = filePath.replace(/^\/api\/uploads\//, '').replace(getUploadBaseUrl(), '').replace(/^\//, '');
  const fullPath = path.join(UPLOAD_DIR, relativePath);
  
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

function getLocalFilePath(filePath: string): string {
  const relativePath = filePath.replace(/^\/api\/uploads\//, '').replace(getUploadBaseUrl(), '').replace(/^\//, '');
  return path.join(UPLOAD_DIR, relativePath);
}

// ============================================
// S3 Storage Functions
// ============================================

async function saveToS3(
  buffer: Buffer,
  category: string,
  filename: string
): Promise<{ path: string; filename: string }> {
  const client = getS3Client();
  const key = `${category}/${filename}`;
  
  await client.send(new PutObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: getMimeType(filename),
  }));
  
  // Return S3 key as the path
  return { path: `s3://${config.storage.s3.bucket}/${key}`, filename };
}

async function getFromS3(filePath: string): Promise<Buffer | null> {
  const client = getS3Client();
  
  // Extract key from S3 path
  const key = filePath.replace(`s3://${config.storage.s3.bucket}/`, '');
  
  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: config.storage.s3.bucket,
      Key: key,
    }));
    
    if (!response.Body) {
      return null;
    }
    
    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('Error getting file from S3:', error);
    return null;
  }
}

async function deleteFromS3(filePath: string): Promise<void> {
  const client = getS3Client();
  
  // Extract key from S3 path
  const key = filePath.replace(`s3://${config.storage.s3.bucket}/`, '');
  
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: config.storage.s3.bucket,
      Key: key,
    }));
  } catch (error) {
    console.error('Error deleting file from S3:', error);
  }
}

// ============================================
// Helper Functions
// ============================================

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function generateFilename(loanId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${loanId}-${timestamp}-${randomSuffix}${ext}`;
}

// ============================================
// Public API - Agreement Files
// ============================================

/**
 * Save an agreement file to storage (local or S3)
 */
export async function saveAgreementFile(
  buffer: Buffer,
  loanId: string,
  originalName: string
): Promise<{ path: string; filename: string }> {
  const filename = generateFilename(loanId, originalName);
  const category = 'agreements';
  
  if (STORAGE_TYPE === 's3') {
    return saveToS3(buffer, category, filename);
  }
  return saveToLocal(buffer, category, filename);
}

/**
 * Get an agreement file from storage
 */
export async function getAgreementFile(filePath: string): Promise<Buffer | null> {
  if (filePath.startsWith('s3://')) {
    return getFromS3(filePath);
  }
  return getFromLocal(filePath);
}

/**
 * Delete an agreement file from storage
 */
export async function deleteAgreementFile(filePath: string): Promise<void> {
  if (filePath.startsWith('s3://')) {
    return deleteFromS3(filePath);
  }
  return deleteFromLocal(filePath);
}

/**
 * Get the full filesystem path for a local file (for streaming)
 */
export function getLocalPath(filePath: string): string | null {
  if (filePath.startsWith('s3://')) {
    return null; // S3 files cannot be accessed via filesystem
  }
  return getLocalFilePath(filePath);
}

/**
 * Check if storage is using S3
 */
export function isS3Storage(): boolean {
  return STORAGE_TYPE === 's3';
}

// ============================================
// Public API - Generic Files (for future use)
// ============================================

/**
 * Save a file to a specific category
 */
export async function saveFile(
  buffer: Buffer,
  category: string,
  entityId: string,
  originalName: string
): Promise<{ path: string; filename: string }> {
  const filename = generateFilename(entityId, originalName);
  
  if (STORAGE_TYPE === 's3') {
    return saveToS3(buffer, category, filename);
  }
  return saveToLocal(buffer, category, filename);
}

/**
 * Get a file from storage
 */
export async function getFile(filePath: string): Promise<Buffer | null> {
  if (filePath.startsWith('s3://')) {
    return getFromS3(filePath);
  }
  return getFromLocal(filePath);
}

/**
 * Delete a file from storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  if (filePath.startsWith('s3://')) {
    return deleteFromS3(filePath);
  }
  return deleteFromLocal(filePath);
}

export { UPLOAD_DIR, STORAGE_TYPE };
