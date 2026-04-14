import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBorrowerAccess } from '@/lib/borrower-access';

type OnboardingFirstGateProps = {
  title: string;
  pageSubtitle?: string;
  children: React.ReactNode;
};

/**
 * For tabs that require a borrower profile: shows a prompt until onboarding completes.
 * Settings and other exempt routes should not use this wrapper.
 */
export function OnboardingFirstGate({ title, pageSubtitle, children }: OnboardingFirstGateProps) {
  const { hasBorrowerProfiles, isCheckingBorrowerProfiles } = useBorrowerAccess();

  if (isCheckingBorrowerProfiles) {
    return (
      <PageScreen title={title} subtitle={pageSubtitle ?? 'Loading…'} showBorrowerContextHeader={false}>
        <SectionCard title="Loading">
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        </SectionCard>
      </PageScreen>
    );
  }

  if (!hasBorrowerProfiles) {
    return <OnboardingFirstMessage title={title} pageSubtitle={pageSubtitle} />;
  }

  return <>{children}</>;
}

type OnboardingFirstMessageProps = {
  title: string;
  pageSubtitle?: string;
};

export function OnboardingFirstMessage({ title, pageSubtitle }: OnboardingFirstMessageProps) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <PageScreen
      title={title}
      subtitle={pageSubtitle}
      showBorrowerContextHeader={false}>
      <SectionCard
        title="Complete onboarding first"
        description="This page will appear after onboarding is done.">
        <View style={styles.stack}>
          <ThemedText type="default">
            Applications, loans, and your borrower profile unlock once you finish borrower onboarding.
            Complete onboarding first to continue.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/onboarding')}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
              Go to onboarding
            </ThemedText>
          </Pressable>
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
  stack: {
    gap: Spacing.three,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
