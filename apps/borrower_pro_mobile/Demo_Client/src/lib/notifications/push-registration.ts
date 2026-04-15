import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { notificationsClient } from '@/lib/api/borrower';
import { getEnv } from '@/lib/config/env';
import {
  clearStoredPushToken,
  getStoredPushToken,
  setStoredPushToken,
} from '@/lib/notifications/device-storage';

type NotificationData = {
  notificationId?: string;
  deepLink?: string | null;
};

function resolveExpoProjectId(): string | undefined {
  const extraProjectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

  return (
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID?.trim() ||
    Constants.easConfig?.projectId ||
    extraProjectId ||
    undefined
  );
}

export function getNotificationData(
  notification: Notifications.Notification
): NotificationData {
  const raw = notification.request.content.data as Record<string, unknown>;
  return {
    notificationId:
      typeof raw.notificationId === 'string' ? raw.notificationId : undefined,
    deepLink: typeof raw.deepLink === 'string' ? raw.deepLink : null,
  };
}

export async function registerBorrowerPushDevice(): Promise<{
  token: string | null;
  registered: boolean;
  reason?: string;
}> {
  if (Platform.OS === 'web') {
    return { token: null, registered: false, reason: 'push_not_supported_on_web' };
  }

  if (!Device.isDevice) {
    return { token: null, registered: false, reason: 'physical_device_required' };
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permStatus = currentPermissions as { status?: string; granted?: boolean };
  let finalStatus =
    permStatus.status ??
    (permStatus.granted === true ? 'granted' : 'undetermined');
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    const req = requested as { status?: string; granted?: boolean };
    finalStatus = req.status ?? (req.granted === true ? 'granted' : 'undetermined');
  }

  if (finalStatus !== 'granted') {
    return { token: null, registered: false, reason: 'permission_denied' };
  }

  const projectId = resolveExpoProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;

  if (!token) {
    return { token: null, registered: false, reason: 'missing_push_token' };
  }

  await notificationsClient.registerPushDevice({
    token,
    platform: Platform.OS,
    appId: getEnv().clientId,
    deviceName: Device.deviceName ?? undefined,
  });
  await setStoredPushToken(token);

  return { token, registered: true };
}

export async function revokeStoredBorrowerPushToken(): Promise<void> {
  const token = await getStoredPushToken();
  if (!token) {
    return;
  }

  try {
    await notificationsClient.revokePushDeviceByToken(token);
  } catch (error) {
    console.warn('[notifications] Failed to revoke stored push token:', error);
  } finally {
    await clearStoredPushToken();
  }
}
