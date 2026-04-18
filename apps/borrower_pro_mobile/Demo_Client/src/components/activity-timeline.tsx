/**
 * Activity timeline — shared dot-and-line timeline used on every detail
 * screen that surfaces audit history (applications, loans, payments…).
 *
 * Design choice: a thin vertical guide line + small dot per event keeps the
 * page scannable at a glance, without each row competing visually with the
 * surrounding section cards. Detail rows (status changes, file uploads, etc.)
 * render inside a tinted inset card so the eye can group them with the
 * parent event.
 *
 * Callers supply already-formatted rows via `events` so the timeline stays
 * dumb about domain shapes. See `docs/planning/navigation-ux.md` §21.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatRelativeTime } from '@/lib/format/date';

export interface ActivityTimelineEvent {
  id: string;
  /** Headline label, e.g. "Application submitted". */
  label: string;
  /** ISO timestamp — used for both relative ("5 min ago") and absolute date footers. */
  timestamp: string;
  /** Optional actor, e.g. "You", "Admin", "Lender". */
  actor?: string | null;
  /** Optional inset detail (status diff, uploaded filename, reason text…). */
  detail?: React.ReactNode;
}

interface ActivityTimelineCardProps {
  title?: string;
  description?: string;
  events: ActivityTimelineEvent[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  emptyMessage?: string;
  collapsible?: boolean;
  /** Defaults to `false` — activity is supplemental, not the primary content. */
  defaultExpanded?: boolean;
}

export function ActivityTimelineCard({
  title = 'Activity',
  description,
  events,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  emptyMessage = 'No activity recorded yet.',
  collapsible = true,
  defaultExpanded = false,
}: ActivityTimelineCardProps) {
  const theme = useTheme();

  const collapsedSummary =
    events.length === 0
      ? 'No activity yet'
      : `${events.length} event${events.length === 1 ? '' : 's'}`;

  return (
    <SectionCard
      title={title}
      description={description}
      collapsible={collapsible}
      defaultExpanded={defaultExpanded}
      collapsedSummary={collapsedSummary}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : events.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyMessage}
        </ThemedText>
      ) : (
        <View>
          {events.map((event, index) => (
            <TimelineItem
              key={event.id}
              event={event}
              isLast={index === events.length - 1 && !hasMore}
            />
          ))}
          {hasMore && onLoadMore ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingMore}
              onPress={() => void onLoadMore()}
              style={({ pressed }) => [
                styles.loadMore,
                {
                  borderColor: theme.border,
                  opacity: pressed || loadingMore ? 0.7 : 1,
                },
              ]}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Load more
                </ThemedText>
              )}
            </Pressable>
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}

function TimelineItem({
  event,
  isLast,
}: {
  event: ActivityTimelineEvent;
  isLast: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.item}>
      <View style={styles.dotCol}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <MaterialIcons
            name="radio-button-checked"
            size={10}
            color={theme.textSecondary}
          />
        </View>
        {isLast ? null : (
          <View style={[styles.line, { backgroundColor: theme.border }]} />
        )}
      </View>
      <View style={[styles.content, isLast ? styles.contentLast : null]}>
        <ThemedText type="smallBold">{event.label}</ThemedText>
        <View style={styles.metaRow}>
          {event.actor ? (
            <ThemedText type="small" themeColor="textSecondary">
              by {event.actor} ·{' '}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {formatRelativeTime(event.timestamp)}
          </ThemedText>
        </View>
        {event.detail ? (
          <View
            style={[
              styles.detail,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}>
            {event.detail}
          </View>
        ) : null}
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.dateFooter}>
          {formatDate(event.timestamp)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dotCol: {
    alignItems: 'center',
    width: 20,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 1,
    marginTop: 4,
    minHeight: 8,
  },
  content: {
    flex: 1,
    gap: 2,
    paddingBottom: Spacing.three,
  },
  contentLast: {
    paddingBottom: 0,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detail: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginTop: Spacing.one,
    gap: Spacing.half,
  },
  dateFooter: {
    marginTop: Spacing.one,
  },
  loadMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: Spacing.two,
    minHeight: 44,
  },
});
