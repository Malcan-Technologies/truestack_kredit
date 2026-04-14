import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AuthButton, AuthInput, AuthMessage } from '@/components/auth-controls';
import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { verifyTotp } from '@/lib/auth/auth-api';
import { useSession } from '@/lib/auth/session-context';

const TRUST_DEVICE_DAYS = 7;

export default function TwoFactorScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { refresh } = useSession();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : null;

  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    const normalizedCode = code.replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await verifyTotp(normalizedCode, trustDevice);
      await refresh();
      router.replace('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Two-factor verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen
        title="Two-factor verification"
        subtitle={
          email
            ? `Enter the 6-digit authenticator code for ${email}.`
            : 'Enter the 6-digit code from your authenticator app.'
        }
        showTenantLogo
        centerHeader
        footer={
          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              Need to change account or password?
            </ThemedText>
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
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          keyboardType="number-pad"
          editable={!loading}
        />

        <View
          style={[
            styles.trustRow,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <View style={styles.trustCopy}>
            <ThemedText type="smallBold">Trust this device</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`Skip authenticator prompts on this device for ${TRUST_DEVICE_DAYS} days.`}
            </ThemedText>
          </View>
          <Switch
            value={trustDevice}
            onValueChange={setTrustDevice}
            disabled={loading}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={theme.primaryForeground}
          />
        </View>

        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

        <AuthButton
          label={loading ? 'Verifying…' : 'Verify code'}
          onPress={handleVerify}
          loading={loading}
          disabled={loading}
        />
      </AuthScreen>
    </>
  );
}

const styles = StyleSheet.create({
  trustRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  trustCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.one,
  },
});
