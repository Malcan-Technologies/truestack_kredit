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
/** Browser timer id (avoid NodeJS.Timeout vs number in shared typings). */
let reconnectTimer: number | null = null;
const listeners = new Set<(p: TruestackKycSsePayload) => void>();

function scheduleReconnect() {
  if (typeof window === "undefined" || refCount <= 0) return;
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (refCount > 0 && !es) openStream();
  }, 2500) as unknown as number;
}

function openStream() {
  if (typeof window === "undefined" || es) return;
  es = new EventSource(STREAM_URL, { withCredentials: true });
  es.onmessage = (ev) => {
    try {
      const p = JSON.parse(ev.data) as TruestackKycSsePayload;
      listeners.forEach((fn) => {
        try {
          fn(p);
        } catch {
          /* ignore subscriber errors */
        }
      });
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    es?.close();
    es = null;
    scheduleReconnect();
  };
}

export function subscribeAdminTruestackKycSse(
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
