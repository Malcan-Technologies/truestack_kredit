/**
 * Attestation video screen — borrower-facing video attestation flow.
 *   - Dev-only "skip to 100%" helper lives behind `__DEV__`.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

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

const ATTESTATION_VIDEO_ASSET = require('../../../../../assets/attestation/attestation-video.mp4');

type ConfirmationChoice = 'accept' | 'disagree' | 'withdraw' | null;

export default function WatchVideoScreen() {
  const params = useLocalSearchParams<{ loanId: string }>();
  const loanId = typeof params.loanId === 'string' ? params.loanId : '';

  if (!loanId) {
    return (
      <PageScreen title="Attestation video" showBackButton backFallbackHref="/loans">
        <NotFoundState />
      </PageScreen>
    );
  }

  return <WatchVideoContent loanId={loanId} />;
}

function WatchVideoContent({ loanId }: { loanId: string }) {
  const theme = useTheme();
  const router = useRouter();

  const [loan, setLoan] = useState<BorrowerLoanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(ATTESTATION_VIDEO_ASSET, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.loop = false;
  });
  const playingState = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const isPlaying = playingState?.isPlaying ?? false;
  const timeUpdate = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  const maxWatchedSecRef = useRef(0);
  const videoRef = useRef<VideoView>(null);
  const [videoReadyToConfirm, setVideoReadyToConfirm] = useState(false);
  const [videoProgressPct, setVideoProgressPct] = useState(0);
  const [confirmationChoice, setConfirmationChoice] = useState<ConfirmationChoice>(null);

  const currentTime = timeUpdate?.currentTime ?? 0;

  /* --- Load loan -------------------------------------------------- */

  const refresh = useCallback(async () => {
    try {
      const res = await loansClient.getBorrowerLoan(loanId);
      setLoan(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load loan');
    }
  }, [loanId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await loansClient.getBorrowerLoan(loanId);
        if (!cancelled) setLoan(res.data);
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

  /* --- Track progress via timeUpdate event ------------------------ */

  useEffect(() => {
    const duration = player.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    if (currentTime > maxWatchedSecRef.current) {
      maxWatchedSecRef.current = currentTime;
    }
    const remaining = Math.max(0, duration - currentTime);
    if (remaining <= 0.25) {
      setVideoReadyToConfirm(true);
      setVideoProgressPct(100);
      return;
    }
    const pct = (currentTime / duration) * 100;
    setVideoProgressPct(Math.min(100, Math.round(pct * 10) / 10));
  }, [currentTime, player]);

  /* --- Actions ---------------------------------------------------- */

  const togglePlayPause = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const restartVideo = useCallback(() => {
    player.pause();
    player.currentTime = 0;
    maxWatchedSecRef.current = 0;
    setVideoReadyToConfirm(false);
    setVideoProgressPct(0);
    setConfirmationChoice(null);
  }, [player]);

  const enterFullscreen = useCallback(() => {
    videoRef.current?.enterFullscreen().catch(() => {
      toast.error('Could not open fullscreen.');
    });
  }, []);

  const devSkipToEnd = useCallback(() => {
    const duration = player.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      toast.error('Video not ready.');
      return;
    }
    player.pause();
    maxWatchedSecRef.current = duration;
    player.currentTime = duration;
    setVideoReadyToConfirm(true);
    setVideoProgressPct(100);
  }, [player]);

  const attestationAlreadyCompleted =
    loan?.attestationStatus === 'COMPLETED' || Boolean(loan?.attestationCompletedAt);
  const videoAlreadyRecorded =
    attestationAlreadyCompleted ||
    loan?.attestationStatus === 'VIDEO_COMPLETED' ||
    Boolean(loan?.attestationVideoCompletedAt);
  const isVideoFullyWatched = videoReadyToConfirm || videoProgressPct >= 99.5;
  const videoChoiceUnlocked = isVideoFullyWatched || videoAlreadyRecorded;

  const canContinue =
    !busy &&
    (attestationAlreadyCompleted ||
      videoAlreadyRecorded ||
      (confirmationChoice !== null && isVideoFullyWatched));

  const primaryLabel = attestationAlreadyCompleted
    ? 'Back to loan page'
    : confirmationChoice === 'disagree'
      ? 'Continue to lawyer meeting'
      : confirmationChoice === 'withdraw'
        ? 'Withdraw application'
        : videoAlreadyRecorded && confirmationChoice === null
          ? 'Continue to e-KYC'
          : 'Accept terms and continue';

  const completeAttestation = useCallback(async () => {
    setBusy(true);
    let videoRecorded = false;
    try {
      if (attestationAlreadyCompleted) {
        toast.success('Attestation is already complete.');
        await refresh();
        router.replace(`/loans/${loanId}` as Href);
        return;
      }
      if (!videoAlreadyRecorded) {
        if (!isVideoFullyWatched) {
          toast.error('Watch the full video (100%) before continuing.');
          return;
        }
        if (confirmationChoice !== 'accept') {
          toast.error('Confirm that you accept the terms before continuing.');
          return;
        }
        await loansClient.postAttestationVideoComplete(loanId, { watchedPercent: 100 });
        videoRecorded = true;
      }
      await loansClient.postAttestationProceedToSigning(loanId);
      toast.success('Attestation complete. Continue with e-KYC.');
      await refresh();
      router.replace(`/loans/${loanId}` as Href);
    } catch (e) {
      if (videoRecorded) {
        toast.error(
          'Video attestation was saved, but we could not continue automatically. Continue from the loan page.',
        );
        await refresh();
        router.replace(`/loans/${loanId}` as Href);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }, [
    attestationAlreadyCompleted,
    confirmationChoice,
    isVideoFullyWatched,
    loanId,
    refresh,
    router,
    videoAlreadyRecorded,
  ]);

  const requestMeeting = useCallback(async () => {
    setBusy(true);
    try {
      await loansClient.postAttestationRequestMeeting(loanId);
      toast.success('Meeting requested — choose a time.');
      await refresh();
      router.push(`/loans/${loanId}/schedule-meeting` as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }, [loanId, refresh, router]);

  const confirmWithdraw = useCallback(() => {
    Alert.alert(
      'Withdraw this loan?',
      'Your application is already approved. Withdrawing will cancel it and you will lose all current progress.',
      [
        { text: 'Keep my application', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await loansClient.postAttestationCancelLoan(loanId, { reason: 'WITHDRAWN' });
              toast.success('Loan withdrawn.');
              router.replace('/loans' as Href);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Action failed');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [loanId, router]);

  const onPrimaryAction = useCallback(() => {
    if (confirmationChoice === 'withdraw') {
      confirmWithdraw();
      return;
    }
    if (confirmationChoice === 'disagree') {
      void requestMeeting();
      return;
    }
    void completeAttestation();
  }, [completeAttestation, confirmWithdraw, confirmationChoice, requestMeeting]);

  /* --- Render ----------------------------------------------------- */

  if (loading) {
    return (
      <PageScreen
        title="Attestation video"
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
        title="Attestation video"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <NotFoundState />
      </PageScreen>
    );
  }

  if (loan.status !== 'PENDING_DISBURSEMENT' && loan.status !== 'PENDING_ATTESTATION') {
    return (
      <PageScreen
        title="Attestation video"
        showBackButton
        backFallbackHref={`/loans/${loanId}` as Href}>
        <View style={styles.centered}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredHint}>
            This page is only available while the loan is pending attestation or disbursement.
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  const channelLabel = loan.loanChannel === 'PHYSICAL' ? 'Physical loan' : 'Online loan';

  return (
    <PageScreen
      title="Attestation video"
      showBackButton
      backFallbackHref={`/loans/${loanId}` as Href}
      stickyFooter={
        <PrimaryActionButton
          label={primaryLabel}
          onPress={onPrimaryAction}
          disabled={!canContinue}
          busy={busy}
          tone={confirmationChoice === 'withdraw' ? 'danger' : 'primary'}
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
        title="Step 1 — Attestation video"
        description="Watch the full video before continuing. If you leave this page, you will need to watch from the beginning when you return.">
        <View style={[styles.videoWrap, { backgroundColor: '#000' }]}>
          <VideoView
            ref={videoRef}
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls={false}
            requiresLinearPlayback
            allowsPictureInPicture={false}
          />
          {!isPlaying ? (
            <View pointerEvents="box-none" style={styles.videoOverlay}>
              <View style={styles.videoTopControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restart video"
                  onPress={restartVideo}
                  style={({ pressed }) => [
                    styles.videoTopBtn,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <MaterialIcons name="replay" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Enter fullscreen"
                  onPress={enterFullscreen}
                  style={({ pressed }) => [
                    styles.videoTopBtn,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <MaterialIcons name="fullscreen" size={22} color="#fff" />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Play video"
                onPress={togglePlayPause}
                style={({ pressed }) => [
                  styles.videoPlay,
                  { opacity: pressed ? 0.85 : 1 },
                ]}>
                <MaterialIcons name="play-arrow" size={36} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pause video"
                onPress={togglePlayPause}
                style={styles.videoPauseZone}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enter fullscreen"
                onPress={enterFullscreen}
                style={({ pressed }) => [
                  styles.videoFullscreenWhilePlaying,
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                <MaterialIcons name="fullscreen" size={22} color="#fff" />
              </Pressable>
            </>
          )}
          <View pointerEvents="none" style={styles.videoFooter}>
            <ThemedText type="small" style={styles.videoFooterText}>
              Use play/pause only — you cannot skip ahead until the video has played through.
            </ThemedText>
          </View>
        </View>

        <View style={styles.progressWrap}>
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: theme.primary,
                  width: `${videoProgressPct}%`,
                },
              ]}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Progress: {videoProgressPct.toFixed(1)}% (100% required)
          </ThemedText>
        </View>

        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            onPress={devSkipToEnd}
            style={({ pressed }) => [
              styles.devSkipBtn,
              {
                borderColor: theme.warning,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <MaterialIcons name="fast-forward" size={16} color={theme.warning} />
            <ThemedText type="small" style={{ color: theme.warning, fontWeight: '600' }}>
              Dev: skip to 100%
            </ThemedText>
          </Pressable>
        ) : null}
      </SectionCard>

      <SectionCard
        title="After watching, choose one option"
        description={
          attestationAlreadyCompleted
            ? 'This attestation is already complete. Return to the loan page to continue.'
            : videoAlreadyRecorded
              ? 'Your video attestation is already saved. Continue or choose another option.'
              : !isVideoFullyWatched
                ? 'Finish the video first to unlock these options.'
                : undefined
        }>
        <ChoiceRow
          icon="verified"
          iconTone="success"
          label="I confirm and accept the terms"
          helper="Complete video attestation and continue to e-KYC."
          selected={confirmationChoice === 'accept'}
          disabled={attestationAlreadyCompleted || !videoChoiceUnlocked || busy}
          onPress={() => setConfirmationChoice('accept')}
        />
        <ChoiceRow
          icon="groups"
          iconTone="warning"
          label="I disagree or want a lawyer to explain the terms"
          helper="Schedule an online meeting with a lawyer instead."
          selected={confirmationChoice === 'disagree'}
          disabled={attestationAlreadyCompleted || !videoChoiceUnlocked || busy}
          onPress={() => setConfirmationChoice('disagree')}
        />
        <ChoiceRow
          icon="warning"
          iconTone="error"
          label="Withdraw my loan application"
          helper="Cancel this approved loan and lose your current progress."
          selected={confirmationChoice === 'withdraw'}
          disabled={attestationAlreadyCompleted || !videoChoiceUnlocked || busy}
          onPress={() => setConfirmationChoice('withdraw')}
        />
      </SectionCard>
    </PageScreen>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                            */
/* ------------------------------------------------------------------ */

function ChoiceRow({
  icon,
  iconTone,
  label,
  helper,
  selected,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  iconTone: 'success' | 'warning' | 'error';
  label: string;
  helper: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const toneColor =
    iconTone === 'success' ? theme.success : iconTone === 'warning' ? theme.warning : theme.error;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choiceRow,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : theme.background,
          opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
        },
      ]}>
      <View style={[styles.choiceIcon, { backgroundColor: toneColor + '1A' }]}>
        <MaterialIcons name={icon} size={20} color={toneColor} />
      </View>
      <View style={styles.choiceCopy}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {helper}
        </ThemedText>
      </View>
      <MaterialIcons
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={22}
        color={selected ? theme.primary : theme.textSecondary}
      />
    </Pressable>
  );
}

function PrimaryActionButton({
  label,
  onPress,
  disabled,
  busy,
  tone,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  tone: 'primary' | 'danger';
}) {
  const theme = useTheme();
  const bg = tone === 'danger' ? theme.error : theme.primary;
  const fg = theme.primaryForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        {
          backgroundColor: bg,
          opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <ThemedText type="smallBold" style={{ color: fg }}>
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
  videoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPauseZone: {
    ...StyleSheet.absoluteFillObject,
  },
  videoTopControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  videoTopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFullscreenWhilePlaying: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  videoFooterText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
  progressWrap: {
    gap: Spacing.one,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  devSkipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.three,
  },
  choiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
});
