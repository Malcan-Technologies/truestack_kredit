import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { BorrowerNotificationCategoryIcon } from '@/components/borrower-notification-category-icon';
import { PageHeaderToolbarButton, PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notificationsClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { toast } from '@/lib/toast';

import type { BorrowerNotificationItem } from '@kredit/borrower';

const PAGE_SIZE = 20;
const ROW_RADIUS = 16;

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

function NotificationRowSkeleton({
  isFirst,
  isLast,
}: {
  isFirst: boolean;
  isLast: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: theme.backgroundSelected },
        ]}
      />
      <View style={styles.rowContent}>
        <View style={styles.titleLine}>
          <View
            style={[
              styles.skeletonLine,
              {
                backgroundColor: theme.backgroundSelected,
                flex: 1,
                maxWidth: 220,
                height: 14,
              },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              {
                backgroundColor: theme.backgroundSelected,
                width: 28,
                height: 12,
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.skeletonLine,
            {
              backgroundColor: theme.backgroundSelected,
              width: '85%',
              height: 12,
              marginTop: 6,
            },
          ]}
        />
      </View>
    </View>
  );
}

function NotificationRow({
  notification,
  isFirst,
  isLast,
  isMarking,
  onPress,
}: {
  notification: BorrowerNotificationItem;
  isFirst: boolean;
  isLast: boolean;
  isMarking: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isUnread = !notification.readAt;
  const hasDeepLink = Boolean(notification.deepLink);
  const interactive = hasDeepLink || isUnread;

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={notification.title}
      disabled={!interactive || isMarking}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: isUnread
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed && interactive ? 0.7 : 1,
        },
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: isUnread
              ? theme.background
              : theme.backgroundSelected,
          },
        ]}>
        <BorrowerNotificationCategoryIcon
          category={notification.category}
          size={18}
          color={isUnread ? theme.primary : theme.textSecondary}
        />
      </View>

      <View style={styles.rowContent}>
        <View style={styles.titleLine}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={[
              styles.titleText,
              !isUnread && { fontWeight: '600' },
            ]}>
            {notification.title}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.timeText}>
            {formatRelativeTime(notification.createdAt)}
          </ThemedText>
        </View>
        {notification.body ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={2}
            style={styles.bodyText}>
            {notification.body}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.trailing}>
        {isMarking ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : isUnread ? (
          <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
        ) : hasDeepLink ? (
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={theme.textSecondary}
          />
        ) : (
          <View style={styles.trailingSpacer} />
        )}
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { hasBorrowerProfiles, isCheckingBorrowerProfiles, borrowerContextVersion } =
    useBorrowerAccess();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<BorrowerNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({ page: 0, totalPages: 0 });

  const pageMetaRef = useRef({ page: 0, totalPages: 0 });
  const loadingMoreRef = useRef(false);

  const hasMore = pagination.totalPages > 0 && pagination.page < pagination.totalPages;

  useEffect(() => {
    if (isCheckingBorrowerProfiles) return;
    if (!hasBorrowerProfiles) {
      router.replace('/onboarding');
    }
  }, [hasBorrowerProfiles, isCheckingBorrowerProfiles, router]);

  const fetchFirstPage = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    try {
      const response = await notificationsClient.listBorrowerNotifications({
        page: 1,
        pageSize: PAGE_SIZE,
      });
      pageMetaRef.current = {
        page: response.pagination.page,
        totalPages: response.pagination.totalPages,
      };
      setPagination(pageMetaRef.current);
      setNotifications(response.data);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.warn('[notifications] Failed to load list:', error);
    } finally {
      if (mode === 'initial') setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  const fetchNextPage = useCallback(async () => {
    const { page, totalPages } = pageMetaRef.current;
    if (loadingMoreRef.current || page >= totalPages || totalPages === 0) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const response = await notificationsClient.listBorrowerNotifications({
        page: page + 1,
        pageSize: PAGE_SIZE,
      });
      pageMetaRef.current = {
        page: response.pagination.page,
        totalPages: response.pagination.totalPages,
      };
      setPagination(pageMetaRef.current);
      setUnreadCount(response.unreadCount);
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        const next = [...prev];
        for (const item of response.data) {
          if (!seen.has(item.id)) next.push(item);
        }
        return next;
      });
    } catch (error) {
      console.warn('[notifications] Failed to load next page:', error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!hasBorrowerProfiles || isCheckingBorrowerProfiles) return;
    void fetchFirstPage('initial');
  }, [hasBorrowerProfiles, isCheckingBorrowerProfiles, borrowerContextVersion, fetchFirstPage]);

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => void fetchFirstPage('refresh')}
        tintColor={theme.primary}
        colors={Platform.OS === 'android' ? [theme.primary] : undefined}
      />
    ),
    [fetchFirstPage, refreshing, theme.primary]
  );

  const handleMarkRead = useCallback(async (notificationId: string) => {
    setMarkingId(notificationId);
    try {
      const response = await notificationsClient.markBorrowerNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? response.data : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      toast.success('Marked as read', {
        id: `notification-read-${notificationId}`,
        description: response.data.title,
      });
    } catch (error) {
      console.warn('[notifications] Failed to mark as read:', error);
      toast.error("Couldn't mark as read", {
        id: `notification-read-error-${notificationId}`,
        description: 'Please try again in a moment.',
      });
    } finally {
      setMarkingId(null);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    const previousUnreadCount = unreadCount;
    try {
      await notificationsClient.markAllBorrowerNotificationsRead();
      setNotifications((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      toast.success(
        previousUnreadCount === 1
          ? '1 notification marked as read'
          : `${previousUnreadCount} notifications marked as read`,
        { id: 'notifications-mark-all-read' },
      );
    } catch (error) {
      console.warn('[notifications] Failed to mark all as read:', error);
      toast.error("Couldn't mark all as read", {
        id: 'notifications-mark-all-read-error',
        description: 'Please try again in a moment.',
      });
    } finally {
      setMarkingAll(false);
    }
  }, [unreadCount]);

  const handleRowPress = useCallback(
    (notification: BorrowerNotificationItem) => {
      const isUnread = !notification.readAt;
      if (isUnread) {
        void handleMarkRead(notification.id);
      }
      const href = notification.deepLink;
      if (href && href.startsWith('/')) {
        router.push(href as Href);
      }
    },
    [handleMarkRead, router]
  );

  const onEndReached = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore || notifications.length === 0) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, hasMore, loading, loadingMore, notifications.length, refreshing]);

  const summaryDescription = useMemo(() => {
    if (loading) return 'Loading recent activity…';
    if (unreadCount > 0) {
      return `${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'} from your loan journey.`;
    }
    return "You're all caught up. New updates will appear here.";
  }, [loading, unreadCount]);

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <SectionCard
          hideHeader
          title="Inbox summary">
          <View style={styles.summaryRow}>
            <View style={styles.summaryCopy}>
              <ThemedText type="smallBold">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.summarySubtext}>
                {summaryDescription}
              </ThemedText>
            </View>
            {unreadCount > 0 ? (
              <PageHeaderToolbarButton
                label="Mark all read"
                variant="outline"
                loading={markingAll}
                disabled={markingAll}
                onPress={() => void handleMarkAllRead()}
              />
            ) : null}
          </View>
        </SectionCard>

        {loading ? (
          <View style={styles.skeletonList}>
            <NotificationRowSkeleton isFirst isLast={false} />
            <NotificationRowSkeleton isFirst={false} isLast={false} />
            <NotificationRowSkeleton isFirst={false} isLast />
          </View>
        ) : null}

        {!loading && notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIconWrap,
                { backgroundColor: theme.backgroundElement },
              ]}>
              <MaterialIcons
                name="inbox"
                size={28}
                color={theme.textSecondary}
              />
            </View>
            <ThemedText type="smallBold" style={styles.emptyTitle}>
              No notifications yet
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.emptySubtext}>
              When the lender sends updates or your application status changes, they will appear
              here.
            </ThemedText>
          </View>
        ) : null}
      </View>
    ),
    [
      handleMarkAllRead,
      loading,
      markingAll,
      notifications.length,
      summaryDescription,
      theme.backgroundElement,
      theme.textSecondary,
      unreadCount,
    ]
  );

  const listFooter = useMemo(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.listFooter} accessibilityRole="progressbar">
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }, [loadingMore, theme.primary]);

  if (isCheckingBorrowerProfiles) {
    return (
      <PageScreen title="Notifications" showBackButton backFallbackHref="/">
        <View style={styles.loadingState}>
          <ActivityIndicator />
        </View>
      </PageScreen>
    );
  }

  if (!hasBorrowerProfiles) {
    return (
      <PageScreen title="Notifications" showBackButton backFallbackHref="/">
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
            Redirecting…
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title="Notifications"
      subtitle="Updates about your applications, loans, payments, and lender announcements."
      showBackButton
      backFallbackHref="/"
      refreshControl={loading ? undefined : refreshControl}
      scrollableOverride={
        <Animated.FlatList
          data={loading || (!loading && notifications.length === 0) ? [] : notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <NotificationRow
              notification={item}
              isFirst={index === 0}
              isLast={index === notifications.length - 1}
              isMarking={markingId === item.id}
              onPress={() => handleRowPress(item)}
            />
          )}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={styles.listHeaderSpacing}
          ListFooterComponent={listFooter}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      }>
      {null}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    gap: Spacing.three,
  },
  listHeaderSpacing: {
    marginBottom: Spacing.three,
  },
  listFooter: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summarySubtext: {
    lineHeight: 18,
  },
  skeletonList: {
    overflow: 'hidden',
    borderRadius: ROW_RADIUS,
  },
  skeletonLine: {
    borderRadius: 4,
  },
  loadingState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  emptyTitle: {
    marginTop: Spacing.one,
  },
  emptySubtext: {
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: ROW_RADIUS,
    borderTopRightRadius: ROW_RADIUS,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: ROW_RADIUS,
    borderBottomRightRadius: ROW_RADIUS,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  timeText: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 0,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  trailing: {
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
  },
  trailingSpacer: {
    width: 8,
    height: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
