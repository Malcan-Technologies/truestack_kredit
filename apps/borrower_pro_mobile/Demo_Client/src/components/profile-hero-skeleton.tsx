import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SkeletonBlock } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Mirrors the profile overview hero (badge, name, document lines, edit row) for initial load.
 */
export function ProfileHeroCardSkeleton() {
  const theme = useTheme();

  return (
    <View
      style={styles.stack}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading profile header">
      <View style={styles.header}>
        <View style={styles.copy}>
          <SkeletonBlock width={96} height={26} borderRadius={999} />
          <SkeletonBlock width="72%" height={26} borderRadius={10} style={styles.titleBar} />
          <SkeletonBlock width="100%" height={14} borderRadius={6} />
          <SkeletonBlock width="55%" height={14} borderRadius={6} />
        </View>
      </View>

      <View style={[styles.editRow, { borderColor: theme.border }]}>
        <SkeletonBlock width={18} height={18} borderRadius={9} />
        <View style={styles.editLineWrap}>
          <SkeletonBlock width="100%" height={16} borderRadius={6} />
        </View>
        <SkeletonBlock width={20} height={20} borderRadius={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  copy: {
    gap: Spacing.one,
  },
  titleBar: {
    marginTop: 2,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 44,
  },
  editLineWrap: {
    flex: 1,
    minWidth: 0,
  },
});
