import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';

import { notificationsClient } from '@/lib/api/borrower';
import { getEnv } from '@/lib/config/env';
import {
  clearStoredPushToken,
  getStoredPushToken,
  setStoredPushToken,
} from '@/lib/notifications/device-storage';

/**
 * Expo Go dropped support for remote (push) notifications in SDK 53+.
 *
 * The issue is deeper than "don't call push APIs in Expo Go":
 * `expo-notifications`' own `DevicePushTokenAutoRegistration.fx` side-effect
 * file calls `addPushTokenListener` unconditionally at module load, which
 * throws on Android via `warnOfExpoGoPushUsage`. That means *importing*
 * `expo-notifications` anywhere in the module graph crashes the JS bundle
 * on Android-in-Expo-Go before any of our guards can run.
 *
 * Workaround: never import `expo-notifications` at module scope. Types are
 * fine (`import type` is erased at runtime). All runtime access goes through
 * `loadNotifications()` which `require`s the module on demand and returns
 * `null` in Expo Go, so nothing is ever loaded there.
 */
export function isRunningInExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

let cachedNotificationsModule: typeof NotificationsType | null | undefined;

function loadNotifications(): typeof NotificationsType | null {
  if (cachedNotificationsModule !== undefined) {
    return cachedNotificationsModule;
  }
  if (isRunningInExpoGo()) {
    cachedNotificationsModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedNotificationsModule = require('expo-notifications') as typeof NotificationsType;
  } catch (error) {
    console.warn('[notifications] expo-notifications unavailable:', error);
    cachedNotificationsModule = null;
  }
  return cachedNotificationsModule;
}

type NotificationData = {
  notificationId?: string;
  deepLink?: string | null;
};

export const ANDROID_ALERTS_CHANNEL_ID = 'borrower-alerts';
export const ANDROID_ANNOUNCEMENTS_CHANNEL_ID = 'borrower-announcements';

function hasNotificationAuthorization(
  permissions: NotificationsType.NotificationPermissionsStatus,
  Notifications: typeof NotificationsType
): boolean {
  const normalized = permissions as NotificationsType.NotificationPermissionsStatus & {
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

async function ensureAndroidNotificationChannels(
  Notifications: typeof NotificationsType
): Promise<void> {
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
  notification: NotificationsType.Notification
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

async function getCurrentExpoPushToken(
  Notifications: typeof NotificationsType
): Promise<string | null> {
  const projectId = resolveExpoProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return tokenResponse.data || null;
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

  const Notifications = loadNotifications();
  if (!Notifications) {
    return { token: null, registered: false, reason: 'expo_go_unsupported' };
  }

  await ensureAndroidNotificationChannels(Notifications);

  const currentPermissions = await Notifications.getPermissionsAsync();
  let hasAuthorization = hasNotificationAuthorization(currentPermissions, Notifications);

  if (!hasAuthorization) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
        allowAnnouncements: false,
      },
    });
    hasAuthorization = hasNotificationAuthorization(requested, Notifications);
  }

  if (!hasAuthorization) {
    await revokeStoredBorrowerPushToken();
    return { token: null, registered: false, reason: 'permission_denied' };
  }

  const token = await getCurrentExpoPushToken(Notifications);

  if (!token) {
    return { token: null, registered: false, reason: 'missing_push_token' };
  }

  await syncBorrowerPushToken(token);

  return { token, registered: true };
}

export async function syncRefreshedBorrowerPushToken(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) {
    // Remote push tokens are unavailable in Expo Go; silently skip.
    return;
  }

  await ensureAndroidNotificationChannels(Notifications);
  const refreshedExpoToken = await getCurrentExpoPushToken(Notifications);
  if (!refreshedExpoToken) {
    throw new Error('missing_push_token');
  }

  await syncBorrowerPushToken(refreshedExpoToken);
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
