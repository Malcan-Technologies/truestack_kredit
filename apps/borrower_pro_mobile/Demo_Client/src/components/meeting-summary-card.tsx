import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loansClient } from '@/lib/api/borrower';
import { formatMeetingRange, formatRelativeMeetingLabel } from '@/lib/meetings/relative-time';
import { formatRm } from '@/lib/loans/currency';
import { toast } from '@/lib/toast';
import type { BorrowerMeetingSummary } from '@kredit/borrower';

const MALAYSIA_TZ = 'Asia/Kuala_Lumpur';

type MeetingSummaryCardProps = {
  row: BorrowerMeetingSummary;
  onChanged?: () => void;
  now: Date;
};

function attestationStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function MeetingSummaryCard({ row, onChanged, now }: MeetingSummaryCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const [restartBusy, setRestartBusy] = useState(false);
  const [meetingCompleteBusy, setMeetingCompleteBusy] = useState(false);

  const primary = row.meetingStartAt ?? row.proposalStartAt;
  const rel = primary ? formatRelativeMeetingLabel(primary, now) : '';

  const onOpenLoan = () => {
    router.push(`/loans/${row.loanId}` as Href);
  };

  const onScheduleMeeting = () => {
    router.push(`/loans/${row.loanId}/schedule-meeting` as Href);
  };

  const onJoinMeeting = () => {
    if (row.meetingLink) {
      void Linking.openURL(row.meetingLink);
    }
  };

  const onCopyLink = async () => {
    if (!row.meetingLink) return;
    await Clipboard.setStringAsync(row.meetingLink);
    toast.success('Link copied');
  };

  const onSwitchToVideo = async () => {
    if (row.attestationStatus !== 'MEETING_REQUESTED') return;
    setRestartBusy(true);
    try {
      const r = await loansClient.postAttestationRestart(row.loanId);
      if (r.success) {
        toast.success('Switched to video attestation — open your loan to continue.');
        onChanged?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch');
    } finally {
      setRestartBusy(false);
    }
  };

  const onAcceptAfterMeeting = async () => {
    setMeetingCompleteBusy(true);
    try {
      const r = await loansClient.postAttestationAcceptAfterMeeting(row.loanId);
      if (r.success) {
        toast.success('Terms accepted. Continue on the loan page for e-KYC.');
        onChanged?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not confirm');
    } finally {
      setMeetingCompleteBusy(false);
    }
  };

  const onRejectAfterMeeting = async () => {
    setMeetingCompleteBusy(true);
    try {
      const r = await loansClient.postAttestationRejectAfterMeeting(row.loanId);
      if (r.success) {
        toast.success('Loan cancelled.');
        onChanged?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reject');
    } finally {
      setMeetingCompleteBusy(false);
    }
  };

  return (
    <SectionCard hideHeader>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <ThemedText type="title" numberOfLines={2}>
            {row.tenantName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {row.productName} · {formatRm(row.principalAmount)} · {row.term} months
          </ThemedText>
        </View>
        <View style={styles.badgeCol}>
          <ThemedText
            type="smallBold"
            style={{
              color: row.actionNeeded ? theme.warning : theme.textSecondary,
            }}>
            {attestationStatusLabel(row.attestationStatus)}
          </ThemedText>
          {rel ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.rel}>
              {rel}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={[styles.timingBlock, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {row.meetingStartAt
            ? 'Scheduled time'
            : row.proposalStartAt
              ? 'Proposed / pending'
              : 'Timing'}
        </ThemedText>
        <ThemedText type="smallBold">
          {formatMeetingRange(
            row.meetingStartAt ?? row.proposalStartAt,
            row.meetingEndAt ?? row.proposalEndAt,
          )}
        </ThemedText>
        {!row.meetingStartAt && row.proposalStartAt && row.proposalEndAt ? (
          <ThemedText type="small" themeColor="textSecondary">
            {formatMeetingRange(row.proposalStartAt, row.proposalEndAt)}
          </ThemedText>
        ) : null}
        {row.proposalDeadlineAt ? (
          <ThemedText type="small" style={{ color: theme.warning }}>
            Respond by:{' '}
            {new Date(row.proposalDeadlineAt).toLocaleString('en-MY', { timeZone: MALAYSIA_TZ })}
          </ThemedText>
        ) : null}

        {row.meetingLink ? (
          <View style={styles.rowButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Join meeting"
              onPress={() => void onJoinMeeting()}
              style={({ pressed }) => [
                styles.pill,
                { borderColor: theme.primary, backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.85 : 1 },
              ]}>
              <MaterialIcons name="open-in-new" size={16} color={theme.primary} />
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Join meeting
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy meeting link"
              onPress={() => void onCopyLink()}
              style={({ pressed }) => [
                styles.pill,
                { borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
              ]}>
              <MaterialIcons name="content-copy" size={16} color={theme.text} />
              <ThemedText type="smallBold">Copy link</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Meet link may appear after your lender confirms, or use email instructions.
          </ThemedText>
        )}
      </View>

      <View style={styles.rowButtons}>
        {row.attestationStatus === 'MEETING_REQUESTED' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a meeting time"
            onPress={onScheduleMeeting}
            style={({ pressed }) => [styles.pill, { borderColor: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Choose a time
            </ThemedText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open loan"
          onPress={onOpenLoan}
          style={({ pressed }) => [styles.pill, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
          <MaterialIcons name="open-in-new" size={16} color={theme.text} />
          <ThemedText type="smallBold">Open loan</ThemedText>
        </Pressable>
      </View>

      {row.attestationStatus === 'MEETING_REQUESTED' ? (
        <View style={styles.block}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onSwitchToVideo()}
            disabled={restartBusy}
            style={({ pressed }) => [styles.pill, { borderColor: theme.border, opacity: pressed || restartBusy ? 0.7 : 1 }]}>
            <MaterialIcons name="videocam" size={16} color={theme.text} />
            <ThemedText type="smallBold">{restartBusy ? 'Switching…' : 'Switch to video attestation'}</ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Prefer instant attestation? This resets the meeting path so you can watch the short video instead.
          </ThemedText>
        </View>
      ) : null}

      {row.attestationStatus === 'MEETING_COMPLETED' ? (
        <View
          style={[
            styles.meetingCompleteBox,
            { borderColor: `${theme.primary}4D`, backgroundColor: `${theme.primary}14` },
          ]}>
          <ThemedText type="smallBold">Meeting complete — confirm next step</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Your lender marked the attestation meeting as finished. Accept the loan to continue to identity verification
            and agreement signing, or reject if you do not wish to proceed.
          </ThemedText>
          {row.attestationMeetingAdminCompletedAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              Confirmed by lender:{' '}
              {new Date(row.attestationMeetingAdminCompletedAt).toLocaleString('en-MY', {
                timeZone: MALAYSIA_TZ,
              })}
            </ThemedText>
          ) : null}
          <View style={styles.colButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void onAcceptAfterMeeting()}
              disabled={meetingCompleteBusy}
              style={({ pressed }) => [
                styles.primaryCta,
                { backgroundColor: theme.primary, opacity: pressed || meetingCompleteBusy ? 0.85 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                Accept loan — continue to e-KYC
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void onRejectAfterMeeting()}
              disabled={meetingCompleteBusy}
              style={({ pressed }) => [
                styles.pill,
                { borderColor: theme.error, opacity: pressed || meetingCompleteBusy ? 0.7 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.error }}>
                Reject loan
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  headerText: { flex: 1, minWidth: 0, gap: Spacing.one },
  badgeCol: { alignItems: 'flex-end' },
  rel: { marginTop: 2 },
  timingBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  rowButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  block: { gap: Spacing.two, marginTop: Spacing.one },
  hint: { marginTop: Spacing.one },
  meetingCompleteBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  colButtons: { gap: Spacing.two, marginTop: Spacing.one },
  primaryCta: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
});
