import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { verifyEmailToken } from '@/lib/auth/verify-email-api';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

type VerifyState = 'loading' | 'success' | 'error';

export default function VerifyEmailConfirmScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = useMemo(
    () => (typeof params.token === 'string' ? params.token.trim() : ''),
    [params.token],
  );

  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'error');
  const [message, setMessage] = useState(
    token ? 'Verifying your email…' : 'This verification link is invalid or incomplete.',
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await verifyEmailToken(token);
        if (!cancelled) {
          setState('success');
          setMessage('Your email has been verified. You can sign in now.');
        }
      } catch (e) {
        if (!cancelled) {
          setState('error');
          setMessage(e instanceof Error ? e.message : 'Unable to verify your email.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen title="Email verification" subtitle={message}>
        {state === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : null}
        {state === 'success' ? (
          <View style={styles.block}>
            <ThemedText type="default" style={{ textAlign: 'center' }}>
              {message}
            </ThemedText>
            <Link href="/sign-in" asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                  Continue to sign in
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        ) : null}
        {state === 'error' ? (
          <View style={styles.block}>
            <ThemedText type="default" style={{ color: theme.error, textAlign: 'center' }}>
              {message}
            </ThemedText>
            <Link href="/sign-in" asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.outlineBtn,
                  { borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
                ]}>
                <ThemedText type="smallBold" themeColor="primary">
                  Back to sign in
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        ) : null}
      </AuthScreen>
    </>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: Spacing.four, alignItems: 'center' },
  block: { gap: Spacing.four, alignItems: 'stretch' },
  primaryBtn: {
    marginTop: Spacing.two,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  outlineBtn: {
    marginTop: Spacing.two,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
});
