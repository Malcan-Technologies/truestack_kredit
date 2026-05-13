import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { StatusBadgeTone } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Icon + bold label (same layout as signing cert / account security headers). */
export function InlineStatusRow({ label, tone }: { label: string; tone: StatusBadgeTone }) {
  const theme = useTheme();

  const { icon, color } = (() => {
    switch (tone) {
      case 'success':
        return { icon: 'check-circle' as const, color: theme.success };
      case 'warning':
        return { icon: 'warning' as const, color: theme.warning };
      case 'error':
        return { icon: 'error' as const, color: theme.error };
      case 'primary':
        return { icon: 'info' as const, color: theme.primary };
      case 'neutral':
        return { icon: 'schedule' as const, color: theme.textSecondary };
    }
  })();

  return (
    <View style={styles.inlineRow}>
      <MaterialIcons name={icon} size={18} color={color} />
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Success row — “Verified”, “Active”, “Enabled”, etc. */
export function VerifiedStatusRow({ label }: { label: string }) {
  return <InlineStatusRow label={label} tone="success" />;
}

/** Section completion indicator for SectionCard `action` slot. Renders a green
 * "Complete" row when the section is filled, and a neutral "Incomplete" row
 * (hollow circle, secondary color) otherwise so the user can see that every
 * card has been evaluated. */
export function SectionCompleteStatusRow({
  complete,
  completeLabel = 'Complete',
  incompleteLabel = 'Incomplete',
}: {
  complete: boolean;
  completeLabel?: string;
  incompleteLabel?: string;
}) {
  const theme = useTheme();
  if (complete) {
    return <InlineStatusRow label={completeLabel} tone="success" />;
  }
  return (
    <View style={styles.inlineRow}>
      <MaterialIcons
        name="radio-button-unchecked"
        size={18}
        color={theme.textSecondary}
      />
      <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
        {incompleteLabel}
      </ThemedText>
    </View>
  );
}

/** Status row for cards with no required fields. Shows a neutral "Optional"
 * badge until every field in the section is filled, then flips to the same
 * green "Complete" indicator used by required cards. */
export function SectionOptionalStatusRow({
  complete,
  completeLabel = 'Complete',
  optionalLabel = 'Optional',
}: {
  complete: boolean;
  completeLabel?: string;
  optionalLabel?: string;
}) {
  const theme = useTheme();
  if (complete) {
    return <InlineStatusRow label={completeLabel} tone="success" />;
  }
  return (
    <View style={styles.inlineRow}>
      <MaterialIcons name="info-outline" size={18} color={theme.textSecondary} />
      <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
        {optionalLabel}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
