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

export const ANDROID_ALERTS_CHANNEL_ID = 'borrower-alerts';
export const ANDROID_ANNOUNCEMENTS_CHANNEL_ID = 'borrower-announcements';

function hasNotificationAuthorization(
  permissions: Notifications.NotificationPermissionsStatus
): boolean {
  const normalized = permissions as Notifications.NotificationPermissionsStatus & {
    granted?: boolean;
    status?: string;
  };
  const iosStatus = (permissions as { ios?: { status?: number } }).ios?.status;
  return (
    normalized.granted === true ||
    normalized.status === 'granted' ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_ALERTS_CHANNEL_ID, {
    name: 'Borrower Alerts',
    description: 'Loan, repayment, and application updates that may require attention.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#208AEF',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(ANDROID_ANNOUNCEMENTS_CHANNEL_ID, {
    name: 'Announcements',
    description: 'General account and product announcements.',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: '#208AEF',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: 'default',
  });
}

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

async function syncBorrowerPushToken(token: string): Promise<void> {
  await notificationsClient.registerPushDevice({
    token,
    platform: Platform.OS,
    appId: getEnv().clientId,
    deviceName: Device.deviceName ?? undefined,
  });
  await setStoredPushToken(token);
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

  await ensureAndroidNotificationChannels();

  const currentPermissions = await Notifications.getPermissionsAsync();
  let hasAuthorization = hasNotificationAuthorization(currentPermissions);

  if (!hasAuthorization) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
        allowAnnouncements: false,
      },
    });
    hasAuthorization = hasNotificationAuthorization(requested);
  }

  if (!hasAuthorization) {
    await revokeStoredBorrowerPushToken();
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

  await syncBorrowerPushToken(token);

  return { token, registered: true };
}

export async function syncRefreshedBorrowerPushToken(token: string): Promise<void> {
  await ensureAndroidNotificationChannels();
  await syncBorrowerPushToken(token);
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
