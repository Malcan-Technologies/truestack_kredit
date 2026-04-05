/**
 * Semantic colors are composed from the active white-label brand (`src/brand`).
 * UI code should use `useTheme()` keys — not raw hex — so client swaps stay in brand files.
 */

import '@/global.css';

import { activeBrand } from '@/brand';
import { Platform } from 'react-native';

function palette(mode: 'light' | 'dark') {
  const b = activeBrand.colors[mode];
  return {
    text: b.text,
    background: b.background,
    backgroundElement: b.surface,
    backgroundSelected: b.surfaceSelected,
    textSecondary: b.textSecondary,
    border: b.border,
    primary: b.primary,
    success: b.success,
    warning: b.warning,
    error: b.error,
    info: b.info,
  };
}

export const Colors = {
  light: palette('light'),
  dark: palette('dark'),
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
