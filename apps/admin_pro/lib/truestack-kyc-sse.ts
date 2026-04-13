/**
 * Single shared EventSource for admin TrueStack KYC webhook pushes (per tab).
 * Backend: GET /api/admin/signing/kyc/stream
 */

export type TruestackKycSsePayload = {
  kind: "borrower" | "staff";
  borrowerId?: string;
  directorId?: string | null;
};

const STREAM_URL = "/api/proxy/admin/signing/kyc/stream";

let refCount = 0;
let es: EventSource | null = null;
let reconnectTimer: number | null = null;
let streamErrorCount = 0;
const MAX_STREAM_ERRORS = 6;
const listeners = new Set<(payload: TruestackKycSsePayload) => void>();

function scheduleReconnect() {
  if (typeof window === "undefined" || refCount <= 0) return;
  if (reconnectTimer || streamErrorCount >= MAX_STREAM_ERRORS) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (refCount > 0 && !es) openStream();
  }, 2500) as unknown as number;
}

function openStream() {
  if (typeof window === "undefined" || es) return;
  es = new EventSource(STREAM_URL, { withCredentials: true });
  es.onopen = () => {
    streamErrorCount = 0;
  };
  es.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as TruestackKycSsePayload;
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {
          // Ignore subscriber errors so the stream stays alive.
        }
      });
    } catch {
      // Ignore malformed events.
    }
  };
  es.onerror = () => {
    streamErrorCount += 1;
    es?.close();
    es = null;
    if (streamErrorCount < MAX_STREAM_ERRORS) {
      scheduleReconnect();
    }
  };
}

export function subscribeAdminTruestackKycSse(
  listener: (payload: TruestackKycSsePayload) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.add(listener);
  refCount += 1;
  openStream();

  return () => {
    listeners.delete(listener);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      es?.close();
      es = null;
    }
  };
}
