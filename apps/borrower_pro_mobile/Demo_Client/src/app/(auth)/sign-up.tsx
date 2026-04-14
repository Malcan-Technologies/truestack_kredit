import { Link, Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthButton, AuthInput, AuthMessage } from '@/components/auth-controls';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signUpWithEmail } from '@/lib/auth/auth-api';

export default function SignUpScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    if (!acceptedTerms) {
      setError('Please accept the terms to create your borrower account.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await signUpWithEmail(normalizedEmail, password, name.trim() || 'User');
      router.replace(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&source=signup`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen
        title="Sign up"
        subtitle="Create a borrower account to apply for loans from your mobile app."
        showTenantLogo
        centerHeader
        footer={
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Already have an account?
              </ThemedText>
              <Link href="/sign-in" asChild>
                <Pressable>
                  <ThemedText type="smallBold" themeColor="primary">
                    Sign in
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </View>
        }>
        <AuthInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          autoCapitalize="words"
          editable={!loading}
        />
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
          placeholder="At least 8 characters"
          secureTextEntry
          editable={!loading}
        />

        <Pressable
          style={styles.checkboxRow}
          disabled={loading}
          onPress={() => setAcceptedTerms((current) => !current)}>
          <View
            style={[
              styles.checkbox,
              { borderColor: acceptedTerms ? theme.primary : theme.border },
            ]}>
            {acceptedTerms ? (
              <View style={[styles.checkboxInner, { backgroundColor: theme.primary }]} />
            ) : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.checkboxCopy}>
            I agree to the borrower terms and conditions.
          </ThemedText>
        </Pressable>

        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthButton
          label={loading ? 'Creating account…' : 'Sign up'}
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
        />
      </AuthScreen>
    </>
  );
}

const styles = StyleSheet.create({
  checkboxRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  checkboxCopy: {
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
});
