import type { LoanApplicationDetail } from '@kredit/borrower';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

import { OnboardingFirstGate } from '@/components/onboarding-first-gate';
import { PageScreen } from '@/components/page-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applicationsClient } from '@/lib/api/borrower';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { isReturnedForAmendment } from '@/lib/applications/amendment';
import { getPendingLenderCounterOffer } from '@/lib/applications/counter-offer';
import { formatCurrencyRM } from '@/lib/loan-application-wizard';

type AppFilter = '' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';

function applicationNeedsBorrowerAction(app: LoanApplicationDetail): boolean {
  return isReturnedForAmendment(app) || getPendingLenderCounterOffer(app) != null;
}

function applyStatusFilter(rows: LoanApplicationDetail[], filter: AppFilter): LoanApplicationDetail[] {
  if (filter === '') return rows;
  if (filter === 'PENDING_REVIEW') return rows.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW');
  return rows.filter((a) => a.status === filter);
}

function StatusBadgePill({ status }: { status: string }) {
  const theme = useTheme();
  const colorMap: Record<string, string> = {
    DRAFT: theme.textSecondary,
    SUBMITTED: theme.info,
    UNDER_REVIEW: theme.warning,
    APPROVED: theme.success,
    REJECTED: theme.error,
    CANCELLED: theme.error,
  };
  const color = colorMap[status] ?? theme.textSecondary;
  const label = status.replace(/_/g, ' ');

  return (
    <View style={[styles.statusPill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <ThemedText type="small" style={{ color, fontWeight: '600', fontSize: 11 }}>
        {label}
      </ThemedText>
    </View>
  );
}

function FilterChip({ label, active, onPress, count }: { label: string; active: boolean; onPress: () => void; count?: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: active ? theme.primary : theme.backgroundElement,
          borderColor: active ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color: active ? theme.primaryForeground : theme.text, fontSize: 13 }}>
        {label}
        {count != null && count > 0 ? ` (${count})` : ''}
      </ThemedText>
    </Pressable>
  );
}

function AppRow({ app, onPress }: { app: LoanApplicationDetail; onPress: () => void }) {
  const theme = useTheme();
  const hasOffer = getPendingLenderCounterOffer(app) != null;
  const isAmendment = isReturnedForAmendment(app);
  const needsAction = applicationNeedsBorrowerAction(app);

  const statusBadge =
    hasOffer ? (
      <View style={[styles.statusPill, { backgroundColor: theme.warning + '22', borderColor: theme.warning + '44' }]}>
        <ThemedText type="small" style={{ color: theme.warning, fontWeight: '600', fontSize: 11 }}>
          COUNTER OFFER
        </ThemedText>
      </View>
    ) : isAmendment ? (
      <View style={[styles.statusPill, { backgroundColor: theme.warning + '22', borderColor: theme.warning + '44' }]}>
        <ThemedText type="small" style={{ color: theme.warning, fontWeight: '600', fontSize: 11 }}>
          AMENDMENT
        </ThemedText>
      </View>
    ) : (
      <StatusBadgePill status={app.status} />
    );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.appRow,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: needsAction ? `${theme.warning}40` : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.appRowMain}>
        <View style={styles.appRowLeft}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {app.product?.name ?? '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatCurrencyRM(app.amount)} · {app.term} months
          </ThemedText>
        </View>
        <View style={styles.appRowRight}>{statusBadge}</View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.one }}>
        {new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(app.createdAt))}
      </ThemedText>
    </Pressable>
  );
}

function ApplicationsContent() {
  const theme = useTheme();
  const router = useRouter();
  const { borrowerContextVersion } = useBorrowerAccess();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<LoanApplicationDetail[]>([]);
  const [filter, setFilter] = useState<AppFilter>('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await applicationsClient.listBorrowerApplications({ pageSize: 200 });
      if (res.success) setRows((res.data ?? []) as unknown as LoanApplicationDetail[]);
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, borrowerContextVersion]);

  const counterOfferCount = useMemo(
    () => rows.filter((a) => getPendingLenderCounterOffer(a) != null).length,
    [rows],
  );
  const amendmentCount = useMemo(
    () => rows.filter((a) => isReturnedForAmendment(a)).length,
    [rows],
  );
  const pendingReviewCount = useMemo(
    () => rows.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length,
    [rows],
  );
  const filtered = useMemo(() => applyStatusFilter(rows, filter), [rows, filter]);

  function handleApply() {
    router.push('/apply-loan' as never);
  }

  const ListHeader = (
    <View style={{ gap: Spacing.two, paddingBottom: Spacing.two }}>
      {counterOfferCount > 0 && (
        <View style={[styles.alertBanner, { backgroundColor: theme.warning + '18', borderColor: theme.warning + '55' }]}>
          <MaterialIcons name="swap-horiz" size={18} color={theme.warning} />
          <ThemedText type="small" style={{ color: theme.warning, flex: 1 }}>
            <ThemedText type="smallBold" style={{ color: theme.warning }}>
              {counterOfferCount} counter-offer{counterOfferCount !== 1 ? 's' : ''}
            </ThemedText>
            {' '}waiting for your response
          </ThemedText>
        </View>
      )}
      {amendmentCount > 0 && (
        <View style={[styles.alertBanner, { backgroundColor: theme.warning + '18', borderColor: theme.warning + '55' }]}>
          <MaterialIcons name="assignment-return" size={18} color={theme.warning} />
          <ThemedText type="small" style={{ color: theme.warning, flex: 1 }}>
            <ThemedText type="smallBold" style={{ color: theme.warning }}>
              {amendmentCount} application{amendmentCount !== 1 ? 's' : ''}
            </ThemedText>
            {' '}returned for amendments
          </ThemedText>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.one }}>
        {([
          { label: 'All', value: '' as AppFilter },
          { label: 'Draft', value: 'DRAFT' as AppFilter },
          { label: 'Submitted', value: 'SUBMITTED' as AppFilter },
          { label: 'Approved', value: 'APPROVED' as AppFilter },
          { label: 'Rejected', value: 'REJECTED' as AppFilter },
          { label: 'Pending Review', value: 'PENDING_REVIEW' as AppFilter, count: pendingReviewCount },
        ] as { label: string; value: AppFilter; count?: number }[]).map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            active={filter === chip.value}
            onPress={() => setFilter(chip.value)}
            count={chip.count}
          />
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <PageScreen
      title="Applications"
      subtitle="Track drafts, submissions, and status."
      showBorrowerContextHeader
      showBottomNav
      stickyFooter={
        <Pressable
          onPress={handleApply}
          style={({ pressed }) => [
            styles.applyButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
          ]}>
          <MaterialIcons name="add" size={20} color={theme.primaryForeground} />
          <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
            Apply for a loan
          </ThemedText>
        </Pressable>
      }
      scrollableOverride={
        <Animated.FlatList
          data={filtered}
          keyExtractor={(item: LoanApplicationDetail) => item.id}
          renderItem={({ item }: { item: LoanApplicationDetail }) => (
            <AppRow app={item} onPress={() => router.push(`/applications/${item.id}` as never)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="description" size={48} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.two }}>
                No applications yet
              </ThemedText>
              <Pressable
                onPress={handleApply}
                style={({ pressed }) => [
                  styles.emptyApplyButton,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                  Apply for a loan
                </ThemedText>
              </Pressable>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={theme.primary}
            />
          }
          removeClippedSubviews
        />
      }>
      {null}
    </PageScreen>
  );
}

export default function ApplicationsScreen() {
  return (
    <OnboardingFirstGate
      title="Applications"
      pageSubtitle="Track drafts, submissions, and application status.">
      <ApplicationsContent />
    </OnboardingFirstGate>
  );
}

const styles = StyleSheet.create({
  filterChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  appRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.three,
  },
  appRowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  appRowLeft: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  appRowRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  statusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.two + 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: Spacing.four,
  },
  emptyApplyButton: {
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: 12,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    borderRadius: 14,
  },
});
