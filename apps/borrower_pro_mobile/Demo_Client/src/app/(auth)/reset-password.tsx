import { authClient } from '@/lib/auth/auth-client';
import { AuthButton, AuthInput, AuthMessage } from '@/components/auth-controls';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { toast } from '@/lib/toast';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = useMemo(() => {
    return typeof params.token === 'string' ? params.token.trim() : '';
  }, [params.token]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const hasToken = token.length > 0;

  async function handleSubmit() {
    if (!hasToken) {
      toast.error('This reset link is invalid or has expired.');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      toast.error('Password must be between 8 and 128 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword });
      if (result.error) {
        throw new Error(result.error.message || 'Unable to reset password');
      }
      toast.success('Password reset successfully. You can sign in now.');
      router.replace('/sign-in');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen
        title="Choose a new password"
        subtitle="Create a fresh password for your account."
        footer={
          <View style={styles.footer}>
            <Link href="/forgot-password" asChild>
              <Pressable>
                <ThemedText type="smallBold" themeColor="primary">
                  Request a new reset link
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/sign-in" asChild>
              <Pressable>
                <ThemedText type="smallBold" themeColor="primary" style={styles.backSignIn}>
                  Back to sign in
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        }>
        {!hasToken ? (
          <AuthMessage tone="error">
            This reset link is invalid or has expired. Request a new one to continue.
          </AuthMessage>
        ) : null}

        <AuthInput
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          secureTextEntry
          editable={!loading && hasToken}
        />
        <AuthInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          secureTextEntry
          editable={!loading && hasToken}
        />

        <AuthButton
          label={loading ? 'Resetting…' : 'Reset password'}
          onPress={handleSubmit}
          loading={loading}
          disabled={loading || !hasToken}
        />
      </AuthScreen>
    </>
  );
}

const styles = StyleSheet.create({
  footer: { gap: Spacing.three, alignItems: 'center' },
  backSignIn: { marginTop: Spacing.one },
});
