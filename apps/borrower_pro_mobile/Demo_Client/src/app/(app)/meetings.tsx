import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { MeetingSummaryCard } from '@/components/meeting-summary-card';
import { PageScreen } from '@/components/page-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { meetingsClient } from '@/lib/api/borrower';
import { toast } from '@/lib/toast';
import type { BorrowerMeetingSummary } from '@kredit/borrower';
import { useRouter, type Href } from 'expo-router';

type TabId = 'action' | 'upcoming' | 'past';

function bucketRows(rows: BorrowerMeetingSummary[]) {
  const actionList: BorrowerMeetingSummary[] = [];
  const upcomingList: BorrowerMeetingSummary[] = [];
  const pastList: BorrowerMeetingSummary[] = [];
  for (const r of rows) {
    if (r.actionNeeded || r.uiTab === 'action') {
      actionList.push(r);
      continue;
    }
    if (r.uiTab === 'past' || (r.attestationStatus === 'COMPLETED' && r.meetingStartAt)) {
      pastList.push(r);
      continue;
    }
    if (r.attestationStatus === 'COMPLETED' && !r.meetingStartAt) {
      continue;
    }
    upcomingList.push(r);
  }
  return { action: actionList, upcoming: upcomingList, past: pastList };
}

export default function MeetingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<BorrowerMeetingSummary[]>([]);
  const [tab, setTab] = useState<TabId>('action');
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const r = await meetingsClient.listBorrowerMeetings({ includePast: true });
      if (r.success) {
        setRows(r.data);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load meetings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setNow(new Date());
      void load();
    }, [load]),
  );

  const { action, upcoming, past } = useMemo(() => bucketRows(rows), [rows]);
  const display = tab === 'action' ? action : tab === 'upcoming' ? upcoming : past;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setNow(new Date());
    void load();
  }, [load]);

  return (
    <PageScreen
      title="Meetings"
      showBackButton
      backFallbackHref="/"
      subtitle="Attestation meetings and scheduling across your loans. Times are in Malaysia time."
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }>
      <View style={styles.tabRow}>
        {(
          [
            { id: 'action' as const, label: 'Action needed', count: action.length },
            { id: 'upcoming' as const, label: 'Upcoming', count: upcoming.length },
            { id: 'past' as const, label: 'Past', count: past.length },
          ] as const
        ).map((t) => {
          const selected = tab === t.id;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setTab(t.id)}
              style={({ pressed }) => [
                styles.tabPill,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.backgroundSelected : theme.background,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.text }}>
                {t.label}
              </ThemedText>
              {t.count > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small">{t.count > 99 ? '99+' : t.count}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : display.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
            {tab === 'action'
              ? 'Nothing needs your attention right now.'
              : tab === 'upcoming'
                ? 'No upcoming meeting slots. When you request or schedule a meeting, it will appear here.'
                : 'No past meetings in this list yet.'}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/loans' as Href)}
            style={({ pressed }) => [
              styles.outlineBtn,
              { borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
            ]}>
            <ThemedText type="smallBold">Back to loans</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {display.map((row) => (
            <MeetingSummaryCard
              key={`${row.loanId}-${row.sortAt}`}
              row={row}
              onChanged={() => void load()}
              now={now}
            />
          ))}
        </View>
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.footerHint}>
        Pull down to refresh. For full attestation steps, open the loan.
      </ThemedText>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.four },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  centered: { paddingVertical: 48, alignItems: 'center' },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  emptyText: { textAlign: 'center' },
  outlineBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  list: { gap: Spacing.four, paddingBottom: Spacing.four },
  footerHint: { textAlign: 'center', marginTop: Spacing.three, marginBottom: Spacing.four },
});
