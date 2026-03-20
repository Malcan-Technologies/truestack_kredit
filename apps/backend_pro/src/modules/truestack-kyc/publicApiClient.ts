/**
 * TrueStack public KYC HTTP API (Bearer API key).
 * @see admin-truestack/docs/TrueStack_KYC_API_Documentation.md
 */

import { config } from '../../lib/config.js';

export interface CreateKycSessionBody {
  document_name: string;
  document_number: string;
  webhook_url: string;
  document_type?: string;
  platform?: string;
  redirect_url?: string;
  metadata?: Record<string, unknown>;
}

export interface KycSessionCreateResponse {
  id: string;
  onboarding_url: string;
  expires_at?: string;
  status: string;
}

export interface KycSessionDetailResponse {
  id: string;
  status: string;
  result?: string | null;
  reject_message?: string | null;
  document_name?: string;
  document_number?: string;
  document_type?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  document?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  images?: Record<string, unknown>;
  refreshed?: boolean;
}

function getAuthHeaders(): Record<string, string> {
  const key = config.truestackKyc.apiKey;
  if (!key) {
    throw new Error('TRUESTACK_KYC_API_KEY is not configured');
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export async function createKycSession(body: CreateKycSessionBody): Promise<KycSessionCreateResponse> {
  const base = config.truestackKyc.apiBaseUrl;
  const url = `${base}/api/v1/kyc/sessions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      message = j.message || j.error || text;
    } catch {
      /* use raw text */
    }
    throw new Error(`TrueStack KYC create session failed (${res.status}): ${message}`);
  }
  const data = JSON.parse(text) as KycSessionCreateResponse;
  if (!data.id || !data.onboarding_url) {
    throw new Error('TrueStack KYC: invalid create response (missing id or onboarding_url)');
  }
  return data;
}

export async function getKycSession(sessionId: string): Promise<KycSessionDetailResponse> {
  const base = config.truestackKyc.apiBaseUrl;
  const url = `${base}/api/v1/kyc/sessions/${sessionId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TrueStack KYC get session failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as KycSessionDetailResponse;
}

export async function refreshKycSession(sessionId: string): Promise<KycSessionDetailResponse> {
  const base = config.truestackKyc.apiBaseUrl;
  const url = `${base}/api/v1/kyc/sessions/${sessionId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TrueStack KYC refresh session failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as KycSessionDetailResponse;
}
