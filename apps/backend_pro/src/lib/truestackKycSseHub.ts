import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for TrueStack KYC webhook → SSE subscribers.
 * Events reach clients connected to the same API process only; for multiple ECS tasks
 * without sticky sessions, use an external bus (e.g. Redis) or accept best-effort + polling.
 */
export type TruestackKycSsePayload = {
  kind: 'borrower' | 'staff';
  borrowerId?: string;
  directorId?: string | null;
};

const hub = new EventEmitter();
hub.setMaxListeners(2000);

export function notifyTruestackKycUpdate(tenantId: string, payload: TruestackKycSsePayload): void {
  hub.emit(`tenant:${tenantId}`, payload);
  if (payload.borrowerId) {
    hub.emit(`borrower:${payload.borrowerId}`, payload);
  }
}

export function subscribeTenantTruestackKyc(
  tenantId: string,
  handler: (payload: TruestackKycSsePayload) => void,
): () => void {
  const ch = `tenant:${tenantId}`;
  hub.on(ch, handler);
  return () => {
    hub.off(ch, handler);
  };
}

export function subscribeBorrowerTruestackKyc(
  borrowerId: string,
  handler: (payload: TruestackKycSsePayload) => void,
): () => void {
  const ch = `borrower:${borrowerId}`;
  hub.on(ch, handler);
  return () => {
    hub.off(ch, handler);
  };
}
