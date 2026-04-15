import type {
  BorrowerNotificationItem,
  BorrowerNotificationsListResponse,
  BorrowerPushDevice,
  RegisterBorrowerPushDevicePayload,
} from '../types/notifications';
import type { FetchFn } from './shared';
import { parseJson } from './shared';

export function createNotificationsApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function listBorrowerNotifications(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<BorrowerNotificationsListResponse> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const query = search.toString();
    const res = await fetchFn(`${baseUrl}/notifications${query ? `?${query}` : ''}`);
    const json = await parseJson<BorrowerNotificationsListResponse & { error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || 'Failed to load notifications');
    }
    return json;
  }

  async function markBorrowerNotificationRead(
    notificationId: string
  ): Promise<{ success: boolean; data: BorrowerNotificationItem }> {
    const res = await fetchFn(`${baseUrl}/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await parseJson<{
      success: boolean;
      data: BorrowerNotificationItem;
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || 'Failed to mark notification as read');
    }
    return json;
  }

  async function markAllBorrowerNotificationsRead(): Promise<{
    success: boolean;
    message: string;
  }> {
    const res = await fetchFn(`${baseUrl}/notifications/read-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await parseJson<{ success: boolean; message: string; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || 'Failed to mark notifications as read');
    }
    return json;
  }

  async function registerPushDevice(
    payload: RegisterBorrowerPushDevicePayload
  ): Promise<{ success: boolean; data: BorrowerPushDevice }> {
    const res = await fetchFn(`${baseUrl}/push-devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await parseJson<{ success: boolean; data: BorrowerPushDevice; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || 'Failed to register push device');
    }
    return json;
  }

  async function revokePushDevice(deviceId: string): Promise<{
    success: boolean;
    data: BorrowerPushDevice;
  }> {
    const res = await fetchFn(`${baseUrl}/push-devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });
    const json = await parseJson<{ success: boolean; data: BorrowerPushDevice; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || 'Failed to revoke push device');
    }
    return json;
  }

  async function revokePushDeviceByToken(token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const res = await fetchFn(`${baseUrl}/push-devices/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const json = await parseJson<{ success: boolean; message: string; error?: string }>(res);
    if (!res.ok) {
      throw new Error(json.error || 'Failed to revoke push device');
    }
    return json;
  }

  return {
    listBorrowerNotifications,
    markBorrowerNotificationRead,
    markAllBorrowerNotificationsRead,
    registerPushDevice,
    revokePushDevice,
    revokePushDeviceByToken,
  };
}
