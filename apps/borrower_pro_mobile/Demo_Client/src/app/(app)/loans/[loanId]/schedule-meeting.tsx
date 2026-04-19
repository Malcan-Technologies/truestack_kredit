/**
 * Attestation schedule meeting screen.
 *
 * Mirrors `apps/borrower_pro/components/loan-center/attestation-schedule-meeting-panel.tsx`
 * on mobile: radio list of available 60-minute slots grouped by Malaysia date, with a
 * sticky "Propose this slot" CTA and an escape hatch to switch back to video attestation.
 *
 * Gate: only reachable when `attestationStatus === 'MEETING_REQUESTED'`.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MetaBadge } from '@/components/meta-badge';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loansClient } from '@/lib/api/borrower';
import { formatRm } from '@/lib/loans/currency';
import { toast } from '@/lib/toast';
import type { BorrowerLoanDetail } from '@kredit/borrower';

const MALAYSIA_TZ = 'Asia/Kuala_Lumpur';

type Slot = { startAt: string; endAt: string };

/** YYYY-MM-DD in Malaysia tz for grouping slots by day. */
function malaysiaDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** "Monday, 28 Oct 2025" — used as the sub-heading above the slot grid. */
function formatDateGroupHeading(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  return d.toLocaleDateString('en-MY', {
    timeZone: MALAYSIA_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "Mon" — two-line day chip, line 1. */
function formatWeekdayShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  return d.toLocaleDateString('en-MY', {
    timeZone: MALAYSIA_TZ,
    weekday: 'short',
  });
}

/** "28 Oct" — two-line day chip, line 2. */
function formatDateShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  return d.toLocaleDateString('en-MY', {
    timeZone: MALAYSIA_TZ,
    day: 'numeric',
    month: 'short',
  });
}

function formatSlotTimeRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: MALAYSIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  };
  return `${new Date(startIso).toLocaleTimeString('en-MY', opts)} – ${new Date(endIso).toLocaleTimeString('en-MY', opts)}`;
}

export default function ScheduleMeetingScreen() {
  const params = useLocalSearchParams<{ loanId: string }>();
  const loanId = typeof params.loanId === 'string' ? params.loanId : '';

  if (!loanId) {
    return (
      <PageScreen title="Schedule meeting" showBackButton backFallbackHref="/loans">
        <NotFoundState />
      </PageScreen>
    );
  }

  return <ScheduleMeetingContent loanId={loanId} />;
}

function ScheduleMeetingContent({ loanId }: { loanId: string }) {
  const theme = useTheme();
  const router = useRouter();

  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsSource, setSlotsSource] = useState<string>('');
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const refreshLoan = useCallback(async () => {
    try {
      const r = await loansClient.getBorrowerLoan(loanId);
      setLoan(r.data);
    } catch {
      /* ignore — surfaced by main load */
    }
  }, [loanId]);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const r = await loansClient.getAttestationAvailability(loanId);
      setSlots(r.data.slots);
      setSlotsSource(r.data.source);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load availability');
    } finally {
      setSlotsLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await loansClient.getBorrowerLoan(loanId);
        if (!cancelled) setLoan(r.data);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load loan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    if (loan?.attestationStatus === 'MEETING_REQUESTED') {
      void loadSlots();
    }
  }, [loan?.attestationStatus, loadSlots]);

  const slotsByDate = useMemo(() => {
    const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const map = new Map<string, Slot[]>();
    for (const s of sorted) {
      const key = malaysiaDateKey(s.startAt);
      const existing = map.get(key);
      if (existing) existing.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()];
  }, [slots]);

  // Default the day selection to the first available day, or the day of the
  // currently selected slot. Re-evaluated whenever the availability changes.
  useEffect(() => {
    if (slotsByDate.length === 0) {
      if (selectedDateKey !== null) setSelectedDateKey(null);
      return;
    }
    const availableKeys = slotsByDate.map(([key]) => key);
    if (!selectedDateKey || !availableKeys.includes(selectedDateKey)) {
      const preferred = selectedSlotStart
        ? malaysiaDateKey(selectedSlotStart)
        : availableKeys[0];
      setSelectedDateKey(availableKeys.includes(preferred) ? preferred : availableKeys[0]);
    }
  }, [slotsByDate, selectedDateKey, selectedSlotStart]);

  const visibleSlots = useMemo(() => {
    if (!selectedDateKey) return [];
    const entry = slotsByDate.find(([key]) => key === selectedDateKey);
    return entry ? entry[1] : [];
  }, [slotsByDate, selectedDateKey]);

  const onPropose = useCallback(async () => {
    if (!selectedSlotStart) {
      toast.error('Choose an available time slot.');
      return;
    }
    setBusy(true);
    try {
      await loansClient.postAttestationProposeSlot(loanId, { startAt: selectedSlotStart });
      toast.success('Slot proposed. Your lender will confirm or suggest another time.');
      await refreshLoan();
      router.replace(`/loans/${loanId}` as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to propose slot');
    } finally {
      setBusy(false);
    }
  }, [loanId, refreshLoan, router, selectedSlotStart]);

  const onRestartAttestation = useCallback(async () => {
    setResetBusy(true);
    try {
      await loansClient.postAttestationRestart(loanId);
      toast.success('Attestation restarted — choose video or meeting again.');
      router.replace(`/loans/${loanId}` as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restart attestation');
    } finally {
      setResetBusy(false);
    }
  }, [loanId, router]);

  /* --- Render ----------------------------------------------------- */

  if (loading) {
    return (
      <PageScreen
        title="Schedule meeting"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </PageScreen>
    );
  }

  if (!loan) {
    return (
      <PageScreen
        title="Schedule meeting"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <NotFoundState />
      </PageScreen>
    );
  }

  if (loan.status === 'CANCELLED') {
    return (
      <PageScreen
        title="Schedule meeting"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <View style={styles.centered}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredHint}>
            This loan was cancelled
            {loan.attestationCancellationReason
              ? ` (${loan.attestationCancellationReason})`
              : ''}
            .
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  if (loan.attestationStatus !== 'MEETING_REQUESTED') {
    return (
      <PageScreen
        title="Schedule meeting"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <View style={styles.centered}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredHint}>
            Scheduling is not available at this step
            {loan.attestationStatus ? ` (current: ${loan.attestationStatus})` : ''}. Return to your
            loan page to continue attestation.
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  const canPropose = !busy && !resetBusy && selectedSlotStart !== null;
  const channelLabel = loan.loanChannel === 'PHYSICAL' ? 'Physical loan' : 'Online loan';
  const sourceLabel =
    slotsSource === 'google_free_busy' ? 'Google Calendar' : 'office hours';

  return (
    <PageScreen
      title="Schedule meeting"
      showBackButton
      backFallbackHref={`/loans/${loanId}` as Href}
      stickyFooter={
        <PrimaryActionButton
          label="Propose this slot"
          onPress={() => void onPropose()}
          disabled={!canPropose}
          busy={busy}
        />
      }>
      <View style={styles.headerWrap}>
        <ThemedText type="subtitle">{formatRm(loan.principalAmount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {loan.product?.name ?? 'Loan'} · {loan.term} months
        </ThemedText>
        <View style={styles.headerBadges}>
          <MetaBadge label={channelLabel} />
        </View>
      </View>

      <SectionCard
        title="Prefer instant attestation?"
        description="Video attestation is immediate — watch the required video when you are ready. Scheduling a meeting usually takes 2–3 business days while your lender confirms a time.">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: resetBusy || busy }}
          onPress={() => void onRestartAttestation()}
          disabled={resetBusy || busy}
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              borderColor: theme.primary,
              opacity: resetBusy || busy ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          {resetBusy ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <>
              <MaterialIcons name="restart-alt" size={18} color={theme.primary} />
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Switch to video attestation
              </ThemedText>
            </>
          )}
        </Pressable>
      </SectionCard>

      <SectionCard
        title="Choose a time"
        description={`Availability: ${sourceLabel}. Each booking is 60 minutes (Malaysia time). You can propose one slot at a time; if your lender does not confirm before that time, you will be asked to choose again.`}>
        {slotsLoading ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : slots.length === 0 ? (
          <ThemedText type="small" style={{ color: theme.warning }}>
            No open slots right now. Try again later.
          </ThemedText>
        ) : (
          <View style={styles.slotsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayStrip}>
              {slotsByDate.map(([dateKey, daySlots]) => {
                const active = selectedDateKey === dateKey;
                return (
                  <Pressable
                    key={dateKey}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active, disabled: busy }}
                    onPress={() => setSelectedDateKey(dateKey)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.dayChip,
                      {
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active
                          ? theme.backgroundSelected
                          : theme.background,
                        opacity: busy ? 0.6 : pressed ? 0.85 : 1,
                      },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{
                        color: active ? theme.primary : theme.textSecondary,
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                      {formatWeekdayShort(dateKey)}
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      style={{ color: active ? theme.primary : theme.text }}>
                      {formatDateShort(dateKey)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {daySlots.length} slot{daySlots.length === 1 ? '' : 's'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {selectedDateKey ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDateGroupHeading(selectedDateKey)}
                </ThemedText>
                <View style={styles.slotGrid}>
                  {visibleSlots.map((s) => {
                    const selected = selectedSlotStart === s.startAt;
                    return (
                      <Pressable
                        key={s.startAt}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: busy }}
                        onPress={() => setSelectedSlotStart(s.startAt)}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.slotChip,
                          {
                            borderColor: selected ? theme.primary : theme.border,
                            backgroundColor: selected
                              ? theme.backgroundSelected
                              : theme.background,
                            opacity: busy ? 0.55 : pressed ? 0.9 : 1,
                          },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={[
                            styles.slotChipText,
                            { color: selected ? theme.primary : theme.text },
                          ]}>
                          {formatSlotTimeRange(s.startAt, s.endAt)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        )}
      </SectionCard>
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                            */
/* ------------------------------------------------------------------ */

function PrimaryActionButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        {
          backgroundColor: theme.primary,
          opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={theme.primaryForeground} />
      ) : (
        <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function NotFoundState() {
  return (
    <View style={styles.centered}>
      <ThemedText type="smallBold">Loan not found</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredHint}>
        Open it from the loans tab and try again.
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  centered: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  centeredHint: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  headerWrap: {
    gap: Spacing.one,
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  slotsLoading: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  slotsWrap: {
    gap: Spacing.three,
  },
  dayStrip: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  dayChip: {
    minWidth: 76,
    minHeight: 76,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  slotChip: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotChipText: {
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
});
