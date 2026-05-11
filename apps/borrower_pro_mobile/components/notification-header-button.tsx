import { MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { type Href, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { notificationsClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';

/**
 * Root tab headers only — sits beside the borrower profile switcher (see `PageScreen`).
 * Navigates to `/notifications` (stack screen under Settings area, not a tab).
 */
export function NotificationHeaderButton() {
  const router = useRouter();
  const theme = useTheme();
  const isFocused = useIsFocused();
  const { hasBorrowerProfiles, borrowerContextVersion } = useBorrowerAccess();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!hasBorrowerProfiles) {
      setUnreadCount(0);
      return;
    }
    void notificationsClient
      .listBorrowerNotifications({ page: 1, pageSize: 1 })
      .then((res) => setUnreadCount(res.unreadCount))
      .catch(() => {
        /* keep previous */
      });
  }, [hasBorrowerProfiles]);

  useEffect(() => {
    if (!isFocused) return;
    refreshUnread();
  }, [isFocused, refreshUnread, borrowerContextVersion]);

  const disabled = !hasBorrowerProfiles;
  const showBadge = unreadCount > 0 && !disabled;
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);
  const badgeWide = badgeLabel.length > 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        disabled
          ? 'Notifications unavailable until onboarding is complete'
          : `Notifications${showBadge ? `, ${unreadCount} unread` : ''}`
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => router.push('/notifications' as Href)}
      style={({ pressed }) => [
        styles.hit,
        {
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}>
      <MaterialIcons name="notifications-none" size={22} color={theme.primary} />
      {showBadge ? (
        <View
          style={[
            styles.countBadge,
            badgeWide ? styles.countBadgeWide : styles.countBadgeNarrow,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={[styles.countBadgeText, { color: theme.primary }]}>
            {badgeLabel}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  /** Matches `borrower-context-header` chevron badge: bottom-right, clear of the 40×40 circle. */
  countBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeNarrow: {
    minWidth: 16,
    paddingHorizontal: 0,
  },
  /** Room for “9+” (two characters) without clipping. */
  countBadgeWide: {
    minWidth: 24,
    paddingHorizontal: 4,
  },
  countBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
