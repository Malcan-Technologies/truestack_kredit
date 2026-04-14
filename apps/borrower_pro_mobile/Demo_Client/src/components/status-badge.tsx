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

/**
 * Pill label for status (KYC, account security, borrower type, etc.).
 * Success uses a light green fill; other tones use `backgroundSelected` like the profile overview.
 */
export function StatusBadge({ label, tone }: { label: string; tone: StatusBadgeTone }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const backgroundColor =
    tone === 'success' ? lightSuccessBackground(theme.success) : theme.backgroundSelected;

  return (
    <View
      style={[
        styles.badge,
        {
          borderColor: color,
          backgroundColor,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color }}>
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
