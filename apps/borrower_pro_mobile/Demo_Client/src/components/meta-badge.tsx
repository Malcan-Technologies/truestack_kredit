/**
 * MetaBadge — neutral chip for metadata badges shown beneath a screen title.
 *
 * Used in detail-screen headers (loans, applications, etc.) where multiple
 * descriptive labels sit side-by-side: status, channel, schedule type,
 * borrower type, etc. The previous design used a different visual style for
 * each (tonal status pill, info-blue channel pill, neutral schedule chip),
 * which created visual noise and made it look like the badges meant
 * different "kinds" of things.
 *
 * Per the dashboard's brand guidelines we now render all of them with a
 * single neutral chip style (the one previously used for the schedule chip
 * — `theme.backgroundSelected` fill, `theme.border` outline, `textSecondary`
 * text/icon). Differentiation comes from the icon + label, not from colour.
 *
 * Tonal status communication still has its place (e.g., individual repayment
 * row badges, profile-card pills) — those keep using `StatusBadge`. Use
 * `MetaBadge` only for the title-row metadata badges.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface MetaBadgeProps {
  /** Optional leading icon — sized to match the chip's text height. */
  icon?: keyof typeof MaterialIcons.glyphMap;
  label: string;
}

export function MetaBadge({ icon, label }: MetaBadgeProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: theme.backgroundSelected,
          borderColor: theme.border,
        },
      ]}>
      {icon ? (
        <MaterialIcons name={icon} size={14} color={theme.textSecondary} />
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
});
