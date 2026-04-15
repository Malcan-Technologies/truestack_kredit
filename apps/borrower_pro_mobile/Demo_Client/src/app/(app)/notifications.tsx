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

import type { BorrowerNotificationItem } from '@kredit/borrower';

const PAGE_SIZE = 20;

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

function InlineActionButton({
  label,
  onPress,
  disabled,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inlineButton,
        {
          backgroundColor: primary ? theme.primary : theme.background,
          borderColor: primary ? theme.primary : theme.border,
          opacity: pressed || disabled ? 0.75 : 1,
        },
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color: primary ? theme.primaryForeground : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function OpenDeepLinkButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.inlineButton,
        styles.openButton,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.text }}>
        Open
      </ThemedText>
      <MaterialIcons name="chevron-right" size={16} color={theme.text} />
    </Pressable>
  );
}

function NotificationCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.notificationCard,
        { borderColor: theme.border, backgroundColor: theme.background },
      ]}>
      <View style={styles.cardMainRow}>
        <View
          style={[
            styles.categoryIconWrap,
            { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}
        />
        <View style={styles.notificationTitleWrap}>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.backgroundElement, flex: 1, maxWidth: 280 },
              ]}
            />
            <View
              style={[
                styles.skeletonPill,
                { backgroundColor: theme.backgroundElement, width: 56, height: 20 },
              ]}
            />
          </View>
          <View
            style={[
              styles.skeletonLine,
              { backgroundColor: theme.backgroundElement, width: '70%', height: 12 },
            ]}
          />
          <View style={styles.metaRow}>
            <View
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.backgroundElement, width: 100, height: 12 },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <View
                style={[
                  styles.skeletonLine,
                  { backgroundColor: theme.backgroundElement, width: 72, height: 32, borderRadius: 8 },
                ]}
              />
              <View
                style={[
                  styles.skeletonLine,
                  { backgroundColor: theme.backgroundElement, width: 88, height: 32, borderRadius: 8 },
                ]}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function NotificationRow({
  notification,
  markingId,
  onMarkRead,
  onOpenDeepLink,
}: {
  notification: BorrowerNotificationItem;
  markingId: string | null;
  onMarkRead: (id: string) => void;
  onOpenDeepLink: (href: string) => void;
}) {
  const theme = useTheme();
  const isUnread = !notification.readAt;
  const channels = [
    ...new Set(
      (notification.deliveries ?? [])
        .filter((delivery) => delivery.channel !== 'in_app')
        .map((delivery) => delivery.channel.toUpperCase())
    ),
  ];
  const hasActions = Boolean(notification.deepLink) || isUnread;

  return (
    <View
      style={[
        styles.notificationCard,
        {
          borderColor: isUnread ? theme.primary : theme.border,
          backgroundColor: isUnread ? theme.backgroundSelected : theme.background,
        },
      ]}>
      <View style={styles.cardMainRow}>
        <View
          style={[
            styles.categoryIconWrap,
            {
              borderColor: isUnread ? theme.primary : theme.border,
              backgroundColor: isUnread ? theme.background : theme.backgroundElement,
            },
          ]}>
          <BorrowerNotificationCategoryIcon
            category={notification.category}
            size={20}
            color={isUnread ? theme.primary : theme.textSecondary}
          />
        </View>
        <View style={styles.notificationTitleWrap}>
          <View style={styles.titleRow}>
            <ThemedText type="smallBold" style={styles.titleFlex} numberOfLines={2}>
              {notification.title}
            </ThemedText>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isUnread ? theme.primary : theme.backgroundElement,
                  borderColor: isUnread ? theme.primary : theme.border,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={{
                  fontSize: 11,
                  color: isUnread ? theme.primaryForeground : theme.textSecondary,
                }}>
                {isUnread ? 'Unread' : 'Read'}
              </ThemedText>
            </View>
          </View>
          {channels.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.channelsLine}>
              {channels.join(' · ')}
            </ThemedText>
          ) : null}
          {notification.body ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={2}
              style={styles.bodyText}>
              {notification.body}
            </ThemedText>
          ) : null}
          <View style={[styles.metaRow, hasActions && styles.metaRowSpread]}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={[styles.timeText, hasActions && styles.timeTextFlex]}>
              {formatRelativeTime(notification.createdAt)}
            </ThemedText>
            {hasActions ? (
              <View style={styles.notificationActions}>
                {notification.deepLink ? (
                  <OpenDeepLinkButton
                    onPress={() => {
                      const href = notification.deepLink;
                      if (href?.startsWith('/')) onOpenDeepLink(href);
                    }}
                  />
                ) : null}
                {isUnread ? (
                  <InlineActionButton
                    label={markingId === notification.id ? 'Updating...' : 'Mark read'}
                    onPress={() => onMarkRead(notification.id)}
                    disabled={markingId === notification.id}
                    primary
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
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

  const sectionDescription = useMemo(() => {
    const body =
      'Platform announcements and automated borrower updates appear below.';
    if (unreadCount > 0) {
      return `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}. ${body}`;
    }
    return `You're all caught up. ${body}`;
  }, [unreadCount]);

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
    } catch (error) {
      console.warn('[notifications] Failed to mark as read:', error);
    } finally {
      setMarkingId(null);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await notificationsClient.markAllBorrowerNotificationsRead();
      setNotifications((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.warn('[notifications] Failed to mark all as read:', error);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const handleOpenDeepLink = useCallback(
    (deepLink: string) => {
      if (deepLink.startsWith('/')) {
        router.push(deepLink as Href);
      }
    },
    [router]
  );

  const onEndReached = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore || notifications.length === 0) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, hasMore, loading, loadingMore, notifications.length, refreshing]);

  const listHeader = useMemo(
    () => (
      <SectionCard
        title="Notification center"
        description={sectionDescription}
        action={
          unreadCount > 0 ? (
            <PageHeaderToolbarButton
              label="Mark all read"
              variant="outline"
              loading={markingAll}
              disabled={markingAll}
              onPress={() => void handleMarkAllRead()}
            />
          ) : null
        }>
        {loading ? (
          <View style={styles.skeletonList}>
            <NotificationCardSkeleton />
            <NotificationCardSkeleton />
            <NotificationCardSkeleton />
          </View>
        ) : null}
        {!loading && notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons
              name="inbox"
              size={40}
              color={theme.textSecondary}
              style={{ opacity: 0.45 }}
            />
            <ThemedText type="smallBold" style={{ marginTop: Spacing.three }}>
              No notifications yet
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtext}>
              When the lender sends updates or your application status changes, they will appear
              here.
            </ThemedText>
          </View>
        ) : null}
      </SectionCard>
    ),
    [
      handleMarkAllRead,
      loading,
      markingAll,
      notifications.length,
      sectionDescription,
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
          renderItem={({ item }) => (
            <NotificationRow
              notification={item}
              markingId={markingId}
              onMarkRead={handleMarkRead}
              onOpenDeepLink={handleOpenDeepLink}
            />
          )}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={styles.listHeaderSpacing}
          ListFooterComponent={listFooter}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
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
  listHeaderSpacing: {
    marginBottom: Spacing.three,
  },
  listFooter: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonList: {
    gap: Spacing.three,
  },
  skeletonLine: {
    borderRadius: 6,
  },
  skeletonPill: {
    borderRadius: 999,
  },
  loadingState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  emptySubtext: {
    textAlign: 'center',
    marginTop: Spacing.one,
    lineHeight: 20,
  },
  notificationCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  categoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  titleFlex: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
  },
  channelsLine: {
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
  },
  notificationTitleWrap: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 8,
    marginTop: 2,
  },
  metaRowSpread: {
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  timeTextFlex: {
    flex: 1,
    minWidth: 100,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    marginTop: 2,
  },
  notificationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  inlineButton: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openButton: {
    flexDirection: 'row',
    gap: 4,
  },
});
