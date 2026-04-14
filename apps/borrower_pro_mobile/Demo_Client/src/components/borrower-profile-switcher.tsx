import type { BorrowerProfile } from '@kredit/borrower';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatBorrowerTypeLabel,
  formatICForDisplay,
  getBorrowerDisplayName,
} from '@/lib/format/borrower';

type BorrowerProfileSwitcherProps = {
  profiles: BorrowerProfile[];
  activeProfileId: string | null;
  switchingProfileId?: string | null;
  onSwitch: (profile: BorrowerProfile) => void | Promise<void>;
};

function buildProfileMeta(profile: BorrowerProfile): string {
  const parts = [formatBorrowerTypeLabel(profile.borrowerType)];

  if (profile.borrowerType === 'INDIVIDUAL' && profile.icNumber?.trim()) {
    parts.push(formatICForDisplay(profile.icNumber));
  } else if (profile.email?.trim()) {
    parts.push(profile.email.trim());
  }

  if (profile.phone?.trim()) {
    parts.push(profile.phone.trim());
  }

  return parts.join(' • ');
}

export function BorrowerProfileSwitcher({
  profiles,
  activeProfileId,
  switchingProfileId,
  onSwitch,
}: BorrowerProfileSwitcherProps) {
  const theme = useTheme();

  if (profiles.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No borrower profiles are linked to this account yet.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {profiles.map((profile) => {
        const isActive = profile.id === activeProfileId;
        const isSwitching = profile.id === switchingProfileId;
        const isDisabled = Boolean(switchingProfileId) || isActive;

        return (
          <Pressable
            key={profile.id}
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={() => void onSwitch(profile)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: isActive ? theme.backgroundSelected : theme.background,
                borderColor: isActive ? theme.primary : theme.border,
                opacity: pressed || isSwitching ? 0.85 : 1,
              },
            ]}>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <ThemedText type="smallBold">{getBorrowerDisplayName(profile)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {buildProfileMeta(profile)}
                </ThemedText>
              </View>

              <View
                style={[
                  styles.badge,
                  {
                    borderColor: isActive ? theme.primary : theme.border,
                    backgroundColor: isActive ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}>
                {isSwitching ? (
                  <>
                    <ActivityIndicator color={theme.primary} size="small" />
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      Switching
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText
                    type="smallBold"
                    style={{ color: isActive ? theme.primary : theme.textSecondary }}>
                    {isActive ? 'Active' : 'Switch'}
                  </ThemedText>
                )}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  copy: {
    flex: 1,
    gap: Spacing.one,
  },
  badge: {
    minWidth: 86,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
