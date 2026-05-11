import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { useColorScheme as useSystemColorScheme } from '@/hooks/use-color-scheme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedThemeScheme = 'light' | 'dark';

interface ThemePreferenceContextValue {
  preference: ThemePreference;
  resolvedScheme: ResolvedThemeScheme;
  setPreference: (value: ThemePreference) => void;
  hasHydrated: boolean;
}

const STORAGE_KEY = 'borrower-mobile-theme-preference';

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

async function readPreference() {
  if (Platform.OS === 'web') {
    return isThemePreference(globalThis.localStorage?.getItem(STORAGE_KEY))
      ? (globalThis.localStorage?.getItem(STORAGE_KEY) as ThemePreference)
      : null;
  }

  const value = await SecureStore.getItemAsync(STORAGE_KEY);
  return isThemePreference(value) ? value : null;
}

async function writePreference(value: ThemePreference) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const storedPreference = await readPreference();
        if (isMounted && storedPreference) {
          setPreferenceState(storedPreference);
        }
      } finally {
        if (isMounted) {
          setHasHydrated(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    void writePreference(value);
  }, []);

  const resolvedScheme: ResolvedThemeScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({
      preference,
      resolvedScheme,
      setPreference,
      hasHydrated,
    }),
    [hasHydrated, preference, resolvedScheme, setPreference],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);

  if (!context) {
    throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  }

  return context;
}
