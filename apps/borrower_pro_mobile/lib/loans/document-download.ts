/**
 * Authenticated borrower-document download + share helper.
 *
 * The protected file endpoints (`/loans/:id/agreement`,
 * `/loans/:id/disbursement-proof`, `/loans/:id/stamp-certificate`,
 * `/schedules/transactions/:txId/receipt`, `/schedules/transactions/:txId/proof`)
 * stream binary content gated by the borrower session cookie. Mobile cannot
 * just `Linking.openURL(url)` — the device browser does not carry our cookie.
 *
 * Instead we:
 *   1. Resolve the stored Better Auth session cookie.
 *   2. `File.downloadFileAsync` the URL into the OS cache directory with the
 *      cookie attached as a header.
 *   3. Hand the local file to the system share sheet via `expo-sharing`,
 *      which lets the borrower view it in their preferred PDF / image viewer
 *      or save / forward it.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { authClient } from '@/lib/auth/auth-client';

const authClientWithCookie = authClient as typeof authClient & {
  getCookie: () => string | null | undefined;
};

const DOWNLOAD_SUBDIR = 'loan-documents';

interface DownloadAndShareOptions {
  /** Authenticated URL to fetch (must resolve to binary content). */
  url: string;
  /**
   * Filename to save the cached copy as (e.g. `loan-agreement.pdf`). Used as
   * the fallback display name in the share sheet — pick something the
   * borrower would recognise.
   */
  filename: string;
  /** Optional MIME type hint forwarded to the share sheet. */
  mimeType?: string;
  /**
   * Optional Apple Uniform Type Identifier passed to the iOS share sheet
   * (e.g. `com.adobe.pdf`). Defaults to a sensible value derived from the
   * MIME type when omitted.
   */
  uti?: string;
  /** Title shown above the share sheet (Android). */
  dialogTitle?: string;
}

/** Friendly download error that callers can surface to the borrower. */
export class DocumentDownloadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DocumentDownloadError';
  }
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  return trimmed.length > 0 ? trimmed : 'document';
}

function utiForMime(mimeType?: string): string | undefined {
  if (!mimeType) return undefined;
  if (mimeType === 'application/pdf') return 'com.adobe.pdf';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'public.jpeg';
  if (mimeType === 'image/png') return 'public.png';
  if (mimeType === 'image/webp') return 'public.webp';
  return undefined;
}

function ensureCacheDirectory(): Directory {
  const dir = new Directory(Paths.cache, DOWNLOAD_SUBDIR);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/**
 * Download a borrower document with the active session cookie and present it
 * in the OS share sheet so the user can preview, save, or forward it.
 *
 * Throws `DocumentDownloadError` on failure — callers should wrap with their
 * own toast / alert.
 */
export async function downloadAndShareDocument({
  url,
  filename,
  mimeType,
  uti,
  dialogTitle,
}: DownloadAndShareOptions): Promise<void> {
  const cookie = authClientWithCookie.getCookie?.();
  if (!cookie) {
    throw new DocumentDownloadError(
      'You need to be signed in to download this document.',
    );
  }

  const safeName = sanitizeFilename(filename);
  const dir = ensureCacheDirectory();
  const target = new File(dir, safeName);

  try {
    await File.downloadFileAsync(url, target, {
      headers: { Cookie: cookie },
      idempotent: true,
    });
  } catch (e) {
    throw new DocumentDownloadError(
      e instanceof Error && e.message.includes('401')
        ? 'Your session expired. Sign in again and retry.'
        : 'Could not download the document. Please try again.',
      e,
    );
  }

  if (Platform.OS === 'web') {
    // Sharing is unavailable in the web preview — surface the cached URL
    // instead so the developer can confirm the file landed.
    throw new DocumentDownloadError(
      'Document sharing is only supported on iOS and Android builds.',
    );
  }

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new DocumentDownloadError(
      'Sharing is not available on this device.',
    );
  }

  try {
    await Sharing.shareAsync(target.uri, {
      mimeType,
      dialogTitle: dialogTitle ?? safeName,
      UTI: uti ?? utiForMime(mimeType),
    });
  } catch (e) {
    throw new DocumentDownloadError('Could not open the document viewer.', e);
  }
}
