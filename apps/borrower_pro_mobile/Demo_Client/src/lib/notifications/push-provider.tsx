import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

import { useSession } from '@/lib/auth';
import { notificationsClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import {
  getNotificationData,
  registerBorrowerPushDevice,
} from '@/lib/notifications/push-registration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function resolveTargetPath(notification: Notifications.Notification): Href {
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
    (response: Notifications.NotificationResponse) => {
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

  useEffect(() => {
    if (!sessionUserId || !activeBorrowerId) {
      return;
    }

    void registerBorrowerPushDevice().catch((error) => {
      console.warn('[notifications] Failed to register push device:', error);
    });
  }, [activeBorrowerId, sessionUserId]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);

  return <>{children}</>;
}
