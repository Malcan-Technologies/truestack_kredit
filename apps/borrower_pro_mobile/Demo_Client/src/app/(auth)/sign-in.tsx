import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { signInWithEmail } from '@/lib/auth/auth-api';
import { useSession } from '@/lib/auth/session-context';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const { refresh } = useSession();
  const theme = useTheme();

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
      const result = await signInWithEmail(email.trim().toLowerCase(), password);

      if (result.twoFactorRedirect) {
        setError(
          'Two-factor authentication is required. 2FA is not yet supported on mobile. Please sign in via the web app.',
        );
        return;
      }

      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.backgroundElement,
      borderColor: error ? theme.error : theme.border,
      color: theme.text,
    },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.root}>
        <KeyboardAvoidingView
          style={styles.inner}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <ThemedText type="subtitle">Sign in</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Use your borrower account email and password.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <TextInput
              style={inputStyle}
              placeholder="Email"
              placeholderTextColor={theme.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!loading}
            />
            <TextInput
              style={inputStyle}
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              editable={!loading}
            />

            {error ? (
              <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
                {error}
              </ThemedText>
            ) : null}

            <Pressable
              style={[styles.button, { backgroundColor: theme.primary }, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.dark.text} size="small" />
              ) : (
                <ThemedText type="smallBold" style={styles.buttonText}>
                  Sign in
                </ThemedText>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  subtitle: {
    lineHeight: 20,
  },
  form: {
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one, // 12
    fontSize: 16,
  },
  error: {
    lineHeight: 18,
  },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.two + Spacing.one, // 12
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
  },
});
