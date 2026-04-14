import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthButton, AuthInput, AuthMessage } from '@/components/auth-controls';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { requestPasswordReset } from '@/lib/auth/auth-api';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail = useMemo(() => {
    return typeof params.email === 'string' ? params.email : '';
  }, [params.email]);

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!email.trim()) {
      setError('Enter your borrower account email first.');
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setMessage(
        'Reset instructions have been sent if the email exists. The reset page currently opens on the borrower web app.',
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to send reset instructions.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen
        title="Forgot password"
        subtitle="We’ll send a secure reset link to your borrower account email."
        footer={
          <View style={styles.footer}>
            <Link href="/sign-in" asChild>
              <Pressable>
                <ThemedText type="smallBold" themeColor="primary">
                  Back to sign in
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        }>
        <AuthInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          editable={!loading}
        />

        {message ? <AuthMessage>{message}</AuthMessage> : null}
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthButton
          label={loading ? 'Sending reset link…' : 'Send reset link'}
          onPress={handleReset}
          loading={loading}
          disabled={loading}
        />
      </AuthScreen>
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
});
