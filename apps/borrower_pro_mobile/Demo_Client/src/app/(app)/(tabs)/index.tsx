import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBorrowerAccess } from '@/lib/borrower-access';
import { loadOnboardingDraft, type OnboardingDraft } from '@/lib/onboarding';
import { useSession } from '@/lib/auth/session-context';

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function getDraftProgress(draft: OnboardingDraft | null) {
  if (!draft) {
    return null;
  }

  const maxSub = draft.borrowerType === 'INDIVIDUAL' ? 3 : 5;
  const totalSteps = maxSub + 2;

  let currentIndex = 0;
  if (draft.step === 1) currentIndex = 0;
  else if (draft.step === 2) currentIndex = draft.borrowerDetailSubStep;
  else if (draft.step === 3) currentIndex = totalSteps - 1;

  if (currentIndex <= 0) {
    return null;
  }

  return `Step ${currentIndex + 1} of ${totalSteps}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useSession();
  const { hasBorrowerProfiles, isCheckingBorrowerProfiles } = useBorrowerAccess();
  const [draftProgress, setDraftProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDraftState() {
      const draft = await loadOnboardingDraft();
      if (!cancelled) {
        setDraftProgress(getDraftProgress(draft));
      }
    }

    if (!hasBorrowerProfiles) {
      void loadDraftState();
    } else {
      setDraftProgress(null);
    }

    return () => {
      cancelled = true;
    };
  }, [hasBorrowerProfiles]);

  if (!hasBorrowerProfiles) {
    return (
      <PageScreen
        title="Complete onboarding"
        subtitle="Create your borrower profile before applications, loans, and profile management unlock.">
        <SectionCard
          title="Borrower profile required"
          description="This app is intentionally limited until your first borrower profile is completed, so the next step is always clear.">
          {isCheckingBorrowerProfiles ? (
            <View style={styles.loading}>
              <ActivityIndicator />
            </View>
          ) : null}
          {!isCheckingBorrowerProfiles && draftProgress ? (
            <View
              style={[
                styles.banner,
                {
                  borderColor: theme.primary,
                  backgroundColor: theme.backgroundSelected,
                },
              ]}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                {`${draftProgress} saved.`}
              </ThemedText>
            </View>
          ) : null}
          {!isCheckingBorrowerProfiles ? (
            <ActionButton
              label={draftProgress ? 'Continue onboarding' : 'Get started'}
              onPress={() => router.push('/onboarding')}
            />
          ) : null}
        </SectionCard>
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title="Dashboard"
      subtitle="Your borrower home will live here."
      showBorrowerContextHeader>
      <SectionCard
        title="Apply for a loan"
        description="Start a new digital loan application in a few steps.">
        <ActionButton
          label="Apply for a loan"
          onPress={() => router.push('/apply-loan' as never)}
        />
      </SectionCard>
      <SectionCard
        title="Coming next"
        description="Applications, loans, and richer dashboard summaries will be added next.">
        <View style={styles.copy}>
          {user?.email ? (
            <ThemedText type="small" themeColor="textSecondary">
              {`Signed in as ${user.email}`}
            </ThemedText>
          ) : null}
        </View>
      </SectionCard>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: Spacing.two,
  },
});
