import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
  body: string;
  showBorrowerContextHeader?: boolean;
}

export function PlaceholderScreen({
  title,
  subtitle,
  body,
  showBorrowerContextHeader = true,
}: PlaceholderScreenProps) {
  const { user } = useSession();

  return (
    <PageScreen
      title={title}
      subtitle={subtitle}
      showBorrowerContextHeader={showBorrowerContextHeader}>
      <SectionCard title="Coming next" description="This section is scaffolded so the menu flow is ready while auth work continues.">
        <View style={styles.copy}>
          <ThemedText type="default">{body}</ThemedText>
          {user?.email ? (
            <ThemedText type="small" themeColor="textSecondary">
              Signed in as {user.email}
            </ThemedText>
          ) : null}
        </View>
      </SectionCard>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: Spacing.two,
  },
});
