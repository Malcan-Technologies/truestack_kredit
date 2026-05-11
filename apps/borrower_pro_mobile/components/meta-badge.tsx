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
 * row badges with icon + label, profile-card pills). Pass `tone` on `MetaBadge`
 * for those; omit it for title-row neutral chips.
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { statusBadgeTonalColors, type StatusBadgeTone } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface MetaBadgeProps {
  /** Optional leading icon — sized to match the chip's text height. */
  icon?: keyof typeof MaterialIcons.glyphMap;
  label: string;
  /** Semantic colours for icon + label + border. Omit for neutral title-row chips. */
  tone?: StatusBadgeTone;
}

export function MetaBadge({ icon, label, tone }: MetaBadgeProps) {
  const theme = useTheme();
  const tonal = tone != null ? statusBadgeTonalColors(theme, tone) : null;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tonal?.backgroundColor ?? theme.backgroundSelected,
          borderColor: tonal?.borderColor ?? theme.border,
        },
      ]}>
      {icon ? (
        <MaterialIcons name={icon} size={14} color={tonal?.foregroundColor ?? theme.textSecondary} />
      ) : null}
      <ThemedText
        type={tonal ? 'smallBold' : 'small'}
        themeColor={tonal ? undefined : 'textSecondary'}
        style={tonal ? { color: tonal.foregroundColor } : undefined}>
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
