/**
 * Shared EventSource for borrower TrueStack KYC webhook pushes (active profile).
 * Backend: GET /api/borrower-auth/kyc/stream
 */

export type TruestackKycSsePayload = {
  kind: "borrower" | "staff";
  borrowerId?: string;
  directorId?: string | null;
};

const STREAM_URL = "/api/proxy/borrower-auth/kyc/stream";

let refCount = 0;
let es: EventSource | null = null;
let reconnectTimer: number | null = null;
/** Stops tight reconnect loops when the route is missing (404) or SSE is blocked. */
let streamErrorCount = 0;
const MAX_STREAM_ERRORS = 6;
const listeners = new Set<(p: TruestackKycSsePayload) => void>();

function scheduleReconnect() {
  if (typeof window === "undefined" || refCount <= 0) return;
  if (reconnectTimer) return;
  if (streamErrorCount >= MAX_STREAM_ERRORS) return;
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
  es.onmessage = (ev) => {
    try {
      const p = JSON.parse(ev.data) as TruestackKycSsePayload;
      listeners.forEach((fn) => {
        try {
          fn(p);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
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

export function subscribeBorrowerTruestackKycSse(
  listener: (p: TruestackKycSsePayload) => void,
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

/** Call after switching active borrower so SSE re-binds to the new session server-side. */
export function reconnectBorrowerTruestackKycSse(): void {
  if (typeof window === "undefined" || refCount <= 0) return;
  streamErrorCount = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  es?.close();
  es = null;
  openStream();
}
