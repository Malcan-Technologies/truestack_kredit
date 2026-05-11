/**
 * Channel pill — communicates whether a loan / application originated from
 * an in-branch (PHYSICAL) or self-serve (ONLINE) flow.
 *
 * Use the same icon + label pair across every list and detail screen so the
 * borrower learns one visual vocabulary:
 *
 * - PHYSICAL → `apartment` (branch building)
 * - ONLINE   → `computer`  (self-serve / digital)
 *
 * See `docs/planning/navigation-ux.md` §20 for guidance on where to render
 * the pill (lists: row right-edge; detail: header badges row).
 */

import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type LoanChannel = 'ONLINE' | 'PHYSICAL';

interface ChannelPillProps {
  channel?: LoanChannel | null;
  /**
   * `compact` — list rows / dense card headers (12px icon, 11pt label).
   * `default` — detail-screen header badges (14px icon, regular small label).
   */
  size?: 'compact' | 'default';
}

export function ChannelPill({ channel, size = 'default' }: ChannelPillProps) {
  const theme = useTheme();
  const isPhysical = channel === 'PHYSICAL';
  const fg = isPhysical ? theme.text : theme.info;
  const bg = isPhysical ? theme.backgroundSelected : `${theme.info}14`;
  const border = isPhysical ? theme.border : `${theme.info}40`;
  const isCompact = size === 'compact';

  return (
    <View
      style={[
        styles.pill,
        isCompact ? styles.pillCompact : styles.pillDefault,
        { backgroundColor: bg, borderColor: border },
      ]}>
      <MaterialIcons
        name={isPhysical ? 'apartment' : 'computer'}
        size={isCompact ? 12 : 14}
        color={fg}
      />
      <ThemedText
        type="smallBold"
        style={
          isCompact ? [styles.labelCompact, { color: fg }] : { color: fg }
        }>
        {isPhysical ? 'Physical' : 'Online'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  pillCompact: {
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  pillDefault: {
    gap: Spacing.one,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  labelCompact: {
    fontSize: 11,
  },
});
