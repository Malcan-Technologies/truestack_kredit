import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SessionProvider, useSession } from '@/lib/auth';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme/theme-preference';

// ---------------------------------------------------------------------------
// Auth guard — runs inside SessionProvider so it has access to session state
// ---------------------------------------------------------------------------

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const hasResolvedInitialSessionRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      hasResolvedInitialSessionRef.current = true;
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;

    const isAuthRoute =
      pathname === '/sign-in' ||
      pathname === '/sign-up' ||
      pathname === '/forgot-password' ||
      pathname === '/verify-email' ||
      pathname === '/two-factor';
    const isTwoFactorRoute = pathname === '/two-factor';
    const hasSession = Boolean(session?.session?.token);

    if (!hasSession && !isAuthRoute) {
      router.replace('/(auth)/sign-in');
    } else if (hasSession && isAuthRoute && !isTwoFactorRoute) {
      router.replace('/');
    }
  }, [isLoading, pathname, router, session]);

  if (isLoading && !hasResolvedInitialSessionRef.current) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

function RootLayoutContent() {
  const { resolvedScheme } = useThemePreference();

  return (
    <SessionProvider>
      <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AuthGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(auth)" />
          </Stack>
        </AuthGate>
      </ThemeProvider>
    </SessionProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <RootLayoutContent />
    </ThemePreferenceProvider>
  );
}
