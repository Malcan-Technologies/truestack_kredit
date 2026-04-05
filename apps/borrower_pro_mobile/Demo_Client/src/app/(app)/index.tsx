import * as Device from 'expo-device';
import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useBrand } from '@/hooks/use-brand';
import { useTheme } from '@/hooks/use-theme';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  const brand = useBrand();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            {brand.displayName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            {brand.productTagline}
          </ThemedText>
        </ThemedView>

        <Link href="/sign-in" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.primaryCta,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Open sign-in (stub)
            </ThemedText>
          </Pressable>
        </Link>

        <ThemedText type="code" style={styles.code}>
          borrower pro mobile
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="White-label UI"
            hint={
              <ThemedText type="small">
                Brand tokens in <ThemedText type="code">src/brand/clients/</ThemedText>
              </ThemedText>
            }
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="API base URL"
            hint={<ThemedText type="code">EXPO_PUBLIC_BACKEND_URL</ThemedText>}
          />
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
  },
  primaryCta: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});
