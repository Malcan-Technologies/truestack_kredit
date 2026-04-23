import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthButton, AuthMessage } from '@/components/auth-controls';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { sendVerificationEmail } from '@/lib/auth/auth-api';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string; source?: string }>();
  const email = useMemo(() => {
    return typeof params.email === 'string' ? params.email : '';
  }, [params.email]);
  const source = typeof params.source === 'string' ? params.source : 'signup';

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) {
      setError('Missing email address. Go back and enter your email again.');
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      await sendVerificationEmail(email);
      setMessage('Verification email sent again. Check your inbox.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to resend verification email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen
        title="Verify your email"
        subtitle="Password sign-in stays locked until the borrower account email is verified."
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
        <AuthMessage>
          {email
            ? `We sent a verification link to ${email}. Open it on this device to complete verification in the app, or use your lender’s borrower website.`
            : 'Check the inbox for the email address you used during sign up or sign in.'}
        </AuthMessage>

        {source === 'signin' ? (
          <AuthMessage>
            Your account exists already, but email verification must be completed before password sign-in can continue.
          </AuthMessage>
        ) : null}

        {message ? <AuthMessage>{message}</AuthMessage> : null}
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthButton
          label={loading ? 'Sending…' : 'Resend verification email'}
          onPress={handleResend}
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
