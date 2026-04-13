import { EventEmitter } from 'node:events';

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
  const channel = `tenant:${tenantId}`;
  hub.on(channel, handler);
  return () => {
    hub.off(channel, handler);
  };
}

export function subscribeBorrowerTruestackKyc(
  borrowerId: string,
  handler: (payload: TruestackKycSsePayload) => void,
): () => void {
  const channel = `borrower:${borrowerId}`;
  hub.on(channel, handler);
  return () => {
    hub.off(channel, handler);
  };
}
