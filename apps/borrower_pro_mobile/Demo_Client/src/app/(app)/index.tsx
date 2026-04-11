import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const { user, signOut } = useSession();
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Welcome back</ThemedText>
          {user?.name ? (
            <ThemedText type="default" themeColor="textSecondary">
              {user.name}
            </ThemedText>
          ) : null}
          {user?.email ? (
            <ThemedText type="small" themeColor="textSecondary">
              {user.email}
            </ThemedText>
          ) : null}
        </View>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Dashboard</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.cardHint}>
            Loan center, applications, and profile screens are coming soon.
          </ThemedText>
        </ThemedView>

        <Pressable
          style={[styles.signOutButton, { borderColor: theme.border }]}
          onPress={signOut}>
          <ThemedText type="small" style={{ color: theme.error }}>
            Sign out
          </ThemedText>
        </Pressable>

        {Platform.OS === 'web' ? null : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            borrower pro mobile — auth connected
          </ThemedText>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
    alignItems: 'stretch',
  },
  header: {
    paddingTop: Spacing.six,
    gap: Spacing.one,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardHint: {
    lineHeight: 20,
  },
  signOutButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  hint: {
    textAlign: 'center',
    opacity: 0.5,
    marginTop: 'auto',
  },
});
