import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import type * as NotificationsType from 'expo-notifications';
import React, { useCallback, useEffect, useRef } from 'react';

import { useSession } from '@/lib/auth';
import { notificationsClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import {
  getNotificationData,
  isRunningInExpoGo,
  registerBorrowerPushDevice,
  syncRefreshedBorrowerPushToken,
} from '@/lib/notifications/push-registration';

/**
 * `expo-notifications` must never be imported at module scope: its
 * `DevicePushTokenAutoRegistration.fx` side-effect throws on Android in Expo
 * Go the moment it is required. See push-registration.ts for the full story.
 * We lazy-load it here and return `null` in Expo Go.
 */
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

function resolveTargetPath(notification: NotificationsType.Notification): Href {
  const { deepLink } = getNotificationData(notification);
  if (deepLink && deepLink.startsWith('/')) {
    return deepLink as Href;
  }

  return '/notifications' as Href;
}

export function PushNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { session } = useSession();
  const { activeBorrowerId } = useBorrowerAccess();
  const sessionUserId = session?.user?.id ?? null;
  const lastHandledNotificationRef = useRef<string | null>(null);

  const handleNotificationResponse = useCallback(
    (response: NotificationsType.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (lastHandledNotificationRef.current === responseId) {
        return;
      }
      lastHandledNotificationRef.current = responseId;

      const { notificationId } = getNotificationData(response.notification);
      if (notificationId) {
        void notificationsClient.markBorrowerNotificationRead(notificationId).catch(() => {
          // Ignore transient read-sync failures when deep-linking from a push.
        });
      }

      router.push(resolveTargetPath(response.notification));
    },
    [router]
  );

  // Install the foreground notification handler once the module is available.
  // In Expo Go this is a no-op; in dev/prod builds it runs on first mount.
  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        // When the app is already foregrounded, let the OS manage tray/list
        // placement without duplicating an intrusive sound over the active
        // screen.
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    if (!sessionUserId || !activeBorrowerId) {
      return;
    }

    void registerBorrowerPushDevice().catch((error) => {
      console.warn('[notifications] Failed to register push device:', error);
    });
  }, [activeBorrowerId, sessionUserId]);

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;

    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    let tokenSubscription: { remove: () => void } | null = null;
    try {
      tokenSubscription = Notifications.addPushTokenListener(() => {
        if (!sessionUserId || !activeBorrowerId) {
          return;
        }

        void syncRefreshedBorrowerPushToken().catch((error) => {
          console.warn('[notifications] Failed to sync refreshed push token:', error);
        });
      });
    } catch (error) {
      console.warn('[notifications] addPushTokenListener unavailable:', error);
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      subscription.remove();
      tokenSubscription?.remove();
    };
  }, [activeBorrowerId, handleNotificationResponse, sessionUserId]);

  return <>{children}</>;
}
