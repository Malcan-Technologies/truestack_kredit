import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useBrand } from '@/hooks/use-brand';

export default function SignInScreen() {
  const brand = useBrand();

  return (
    <>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <View style={styles.container}>
        <ThemedText type="subtitle">Sign in</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Placeholder — Better Auth + session transport for native is a planned spike (see
          docs/mobile-development-expo.md).
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
          {brand.displayName} · {brand.id}
        </ThemedText>
        <Link href="/" dismissTo style={styles.link}>
          <ThemedText type="linkPrimary">Back to home</ThemedText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  meta: {
    marginTop: Spacing.two,
  },
  link: {
    marginTop: Spacing.four,
  },
});
