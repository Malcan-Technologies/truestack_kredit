import { Link, Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthButton, AuthInput, AuthMessage } from '@/components/auth-controls';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { signInWithEmail } from '@/lib/auth/auth-api';
import { useSession } from '@/lib/auth/session-context';

export default function SignInScreen() {
  const router = useRouter();
  const { refresh } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await signInWithEmail(normalizedEmail, password);

      if (result.twoFactorRedirect) {
        router.replace(`/two-factor?email=${encodeURIComponent(normalizedEmail)}`);
        return;
      }

      await refresh();
      router.replace('/');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sign in failed. Please try again.';
      if (/not verified|verify/i.test(message) && email.trim()) {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&source=signin`);
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen
        title="Sign in"
        subtitle="Use your borrower account email and password."
        showTenantLogo
        centerHeader
        footer={
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Don&apos;t have an account?
              </ThemedText>
              <Link href="/sign-up" asChild>
                <Pressable>
                  <ThemedText type="smallBold" themeColor="primary">
                    Sign up
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </View>
        }>
        <AuthInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          editable={!loading}
        />
        <AuthInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          editable={!loading}
        />

        <View style={styles.linksRow}>
          <View />
          <Link
            href={email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : '/forgot-password'}
            asChild>
            <Pressable>
              <ThemedText type="smallBold" themeColor="primary">
                Forgot password?
              </ThemedText>
            </Pressable>
          </Link>
        </View>

        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthButton label={loading ? 'Signing in…' : 'Sign in'} onPress={handleSignIn} loading={loading} />
      </AuthScreen>
    </>
  );
}

const styles = StyleSheet.create({
  linksRow: {
    alignItems: 'flex-end',
  },
  footer: {
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
});
