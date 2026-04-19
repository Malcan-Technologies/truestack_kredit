import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Appearance, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SessionProvider, useSession } from '@/lib/auth';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme/theme-preference';
import { ToastProvider } from '@/lib/toast';

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

  /**
   * Drive UIKit's window `overrideUserInterfaceStyle` from the app's resolved theme.
   *
   * iOS 26 Liquid Glass tab bar (and other system chrome) samples its blur material against the
   * **window's** trait collection — not the screen view. With `app.config.userInterfaceStyle: 'automatic'`
   * the window follows the *device* style, so a "Dark" in-app preference on a light-mode device leaves
   * the tab bar's `scrollEdgeAppearance` painted as light material (visible as a "white-ish" bar on
   * tabs whose content fits without scrolling, e.g. Dashboard / Settings, and as a brief flash on
   * every tab switch). `Appearance.setColorScheme` calls into UIKit to set the override, aligning
   * window chrome with our resolved scheme.
   */
  useEffect(() => {
    Appearance.setColorScheme(resolvedScheme);
  }, [resolvedScheme]);

  return (
    <SessionProvider>
      <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ToastProvider>
          <AnimatedSplashOverlay />
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(app)" />
              <Stack.Screen name="(auth)" />
            </Stack>
          </AuthGate>
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <RootLayoutContent />
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}
