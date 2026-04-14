import type {
  BorrowerDetail,
  BorrowerDirector,
  TruestackKycSessionRow,
  TruestackKycStatusData,
} from '@kredit/borrower';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCorporateDirectorsForKyc, pickLatestKycSession } from '@/lib/borrower-verification';
import { formatDate } from '@/lib/format/date';

type ButtonVariant = 'primary' | 'outline';

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  loading,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  const theme = useTheme();
  const palette =
    variant === 'outline'
      ? {
          backgroundColor: theme.background,
          borderColor: theme.border,
          textColor: theme.text,
        }
      : {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
          textColor: theme.primaryForeground,
        };

  return (
    <Pressable
      disabled={loading}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed || loading ? 0.75 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.textColor} size="small" />
      ) : (
        <ThemedText type="smallBold" style={{ color: palette.textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function describeSessionState(session: TruestackKycSessionRow | undefined) {
  if (!session) {
    return {
      label: 'Not started',
      tone: 'neutral' as const,
      description: 'No e-KYC session has been created yet.',
      canOpenExistingLink: false,
      shouldOfferNewSession: true,
      ctaLabel: 'Start e-KYC',
      ctaVariant: 'primary' as const,
    };
  }

  if (session.status === 'completed' && session.result === 'approved') {
    return {
      label: 'Verified',
      tone: 'success' as const,
      description: 'The latest verification was approved.',
      canOpenExistingLink: false,
      shouldOfferNewSession: true,
      ctaLabel: 'Redo verification',
      ctaVariant: 'outline' as const,
    };
  }

  if (session.status === 'completed' && session.result === 'rejected') {
    return {
      label: 'Rejected',
      tone: 'error' as const,
      description: session.rejectMessage || 'The latest verification was rejected.',
      canOpenExistingLink: false,
      shouldOfferNewSession: true,
      ctaLabel: 'Retry e-KYC',
      ctaVariant: 'outline' as const,
    };
  }

  if (session.status === 'failed') {
    return {
      label: 'Failed',
      tone: 'error' as const,
      description: 'The verification session failed before approval.',
      canOpenExistingLink: false,
      shouldOfferNewSession: true,
      ctaLabel: 'Retry e-KYC',
      ctaVariant: 'outline' as const,
    };
  }

  if (session.status === 'expired') {
    return {
      label: 'Expired',
      tone: 'error' as const,
      description: 'The existing verification link expired. Start a fresh session when ready.',
      canOpenExistingLink: false,
      shouldOfferNewSession: true,
      ctaLabel: 'Create new link',
      ctaVariant: 'outline' as const,
    };
  }

  if (session.status === 'processing') {
    return {
      label: 'In review',
      tone: 'warning' as const,
      description: 'Your verification is being reviewed.',
      canOpenExistingLink: Boolean(session.onboardingUrl),
      shouldOfferNewSession: false,
      ctaLabel: 'Open verification link',
      ctaVariant: 'outline' as const,
    };
  }

  return {
    label: 'Pending',
    tone: 'warning' as const,
    description: 'Finish the verification flow in your browser to continue.',
    canOpenExistingLink: Boolean(session.onboardingUrl),
    shouldOfferNewSession: false,
    ctaLabel: 'Open verification link',
    ctaVariant: 'outline' as const,
  };
}

function DirectorSessionCard({
  director,
  session,
  onStartSession,
  onOpenLink,
}: {
  director: BorrowerDirector;
  session: TruestackKycSessionRow | undefined;
  onStartSession: (directorId: string) => Promise<void>;
  onOpenLink: (url: string) => Promise<void>;
}) {
  const theme = useTheme();
  const [starting, setStarting] = useState(false);
  const state = describeSessionState(session);

  return (
    <View
      style={[
        styles.sessionCard,
        {
          borderColor: theme.border,
          backgroundColor: theme.background,
        },
      ]}>
      <View style={styles.rowBetween}>
        <View style={styles.stackTight}>
          <ThemedText type="smallBold">{director.name || 'Director'}</ThemedText>
          {director.position ? (
            <ThemedText type="small" themeColor="textSecondary">
              {director.position}
            </ThemedText>
          ) : null}
        </View>
        <StatusBadge tone={state.tone} label={state.label} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {state.description}
      </ThemedText>

      {session?.updatedAt ? (
        <ThemedText type="small" themeColor="textSecondary">
          Updated {formatDate(session.updatedAt)}
        </ThemedText>
      ) : null}

      <View style={styles.actionStack}>
        {state.canOpenExistingLink && session?.onboardingUrl ? (
          <ActionButton
            label="Open verification link"
            variant="outline"
            onPress={() => onOpenLink(session.onboardingUrl)}
          />
        ) : null}
        {state.shouldOfferNewSession ? (
          <ActionButton
            label={state.ctaLabel}
            variant={state.ctaVariant}
            loading={starting}
            onPress={async () => {
              setStarting(true);
              try {
                await onStartSession(director.id);
              } finally {
                setStarting(false);
              }
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

export function TruestackKycMobileCard({
  borrower,
  kyc,
  onStartIndividualSession,
  onStartDirectorSession,
  onOpenLink,
}: {
  borrower: BorrowerDetail;
  kyc: TruestackKycStatusData | null;
  onStartIndividualSession: () => Promise<void>;
  onStartDirectorSession: (directorId: string) => Promise<void>;
  onOpenLink: (url: string) => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);

  const individualSession = useMemo(
    () => pickLatestKycSession((kyc?.sessions ?? []).filter((session) => !session.directorId)),
    [kyc?.sessions],
  );
  const requiredDirectors = useMemo(
    () => getCorporateDirectorsForKyc(borrower.directors),
    [borrower.directors],
  );

  if (borrower.borrowerType === 'CORPORATE') {
    return (
      <SectionCard title="KYC" description="Authorized representative only.">
        {requiredDirectors.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Add an authorized representative in the profile editor to start corporate e-KYC.
          </ThemedText>
        ) : (
          <View style={styles.stack}>
            {requiredDirectors.map((director) => (
              <DirectorSessionCard
                key={director.id}
                director={director}
                session={pickLatestKycSession(
                  (kyc?.sessions ?? []).filter((session) => session.directorId === director.id),
                )}
                onStartSession={onStartDirectorSession}
                onOpenLink={onOpenLink}
              />
            ))}
          </View>
        )}
      </SectionCard>
    );
  }

  const state = describeSessionState(individualSession);

  return (
    <SectionCard title="KYC" description="Identity verification for your borrower profile.">
      <View style={styles.rowBetween}>
        <View style={styles.statusCopy}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {state.description}
          </ThemedText>
          {individualSession?.updatedAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              Updated {formatDate(individualSession.updatedAt)}
            </ThemedText>
          ) : null}
        </View>
        <StatusBadge tone={state.tone} label={state.label} />
      </View>

      <View style={styles.actionStack}>
        {state.canOpenExistingLink && individualSession?.onboardingUrl ? (
          <ActionButton
            label="Open verification link"
            variant="outline"
            onPress={() => onOpenLink(individualSession.onboardingUrl)}
          />
        ) : null}
        {state.shouldOfferNewSession ? (
          <ActionButton
            label={state.ctaLabel}
            variant={state.ctaVariant}
            loading={starting}
            onPress={async () => {
              setStarting(true);
              try {
                await onStartIndividualSession();
              } finally {
                setStarting(false);
              }
            }}
          />
        ) : null}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  stackTight: {
    gap: Spacing.one,
    flex: 1,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  actionStack: {
    gap: Spacing.one,
  },
  actionButton: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.one,
  },
});
