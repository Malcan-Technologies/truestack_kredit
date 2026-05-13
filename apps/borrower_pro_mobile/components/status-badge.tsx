import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type StatusBadgeTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral';

/** Light tint for success / verified pills (7-char hex + alpha). */
export function lightSuccessBackground(successHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(successHex)) {
    return `${successHex}2A`;
  }
  return successHex;
}

function toneColor(theme: ReturnType<typeof useTheme>, tone: StatusBadgeTone): string {
  if (tone === 'primary') return theme.primary;
  if (tone === 'success') return theme.success;
  if (tone === 'warning') return theme.warning;
  if (tone === 'error') return theme.error;
  return theme.border;
}

/** Border, fill, and label/icon colours for a tonal badge — shared by `StatusBadge` and tonal `MetaBadge`. */
export function statusBadgeTonalColors(
  theme: ReturnType<typeof useTheme>,
  tone: StatusBadgeTone,
): { borderColor: string; backgroundColor: string; foregroundColor: string } {
  if (tone === 'neutral') {
    return {
      foregroundColor: theme.textSecondary,
      borderColor: theme.border,
      backgroundColor: theme.backgroundElement,
    };
  }
  const foregroundColor = toneColor(theme, tone);
  return {
    borderColor: foregroundColor,
    backgroundColor:
      tone === 'success' ? lightSuccessBackground(theme.success) : theme.backgroundSelected,
    foregroundColor,
  };
}

/**
 * Pill label for status (KYC, account security, borrower type, etc.).
 * Success uses a light green fill; other tones use `backgroundSelected` like the profile overview.
 */
export function StatusBadge({ label, tone }: { label: string; tone: StatusBadgeTone }) {
  const theme = useTheme();
  const { borderColor, backgroundColor, foregroundColor } = statusBadgeTonalColors(theme, tone);

  return (
    <View
      style={[
        styles.badge,
        {
          borderColor,
          backgroundColor,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: foregroundColor }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    alignSelf: 'flex-start',
  },
});
