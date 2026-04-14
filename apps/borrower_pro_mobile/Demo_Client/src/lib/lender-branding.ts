import { getEnv } from '@/lib/config/env';

export function resolveLenderLogoUrl(logoUrl: string | null) {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return logoUrl;
  }

  const trimmed = logoUrl.replace(/^\/+/, '');
  const backendUrl = getEnv().backendUrl;
  if (!backendUrl) {
    return undefined;
  }

  if (trimmed.startsWith('uploads/')) {
    return `${backendUrl}/${trimmed}`;
  }

  if (trimmed.startsWith('api/uploads/')) {
    return `${backendUrl}/${trimmed.replace(/^api\//, '')}`;
  }

  return `${backendUrl}/${trimmed}`;
}
