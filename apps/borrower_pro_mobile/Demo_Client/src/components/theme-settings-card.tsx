import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type ThemePreference, useThemePreference } from '@/lib/theme/theme-preference';

function ThemePreferenceButton({
  label,
  value,
  selectedValue,
  onSelect,
}: {
  label: string;
  value: ThemePreference;
  selectedValue: ThemePreference;
  onSelect: (value: ThemePreference) => void;
}) {
  const theme = useTheme();
  const isSelected = selectedValue === value;

  return (
    <Pressable
      onPress={() => onSelect(value)}
      style={[
        styles.preferenceButton,
        {
          backgroundColor: isSelected ? theme.primary : theme.background,
          borderColor: isSelected ? theme.primary : theme.border,
        },
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color: isSelected ? theme.primaryForeground : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function ThemeSettingsCard() {
  const { preference, resolvedScheme, setPreference } = useThemePreference();

  return (
    <SectionCard
      title="Theme"
      description="Choose how this app looks on this device.">
      <ThemedText type="small" themeColor="textSecondary">
        {preference === 'system'
          ? `Following your device setting. Current theme: ${resolvedScheme}.`
          : `Using ${resolvedScheme} theme.`}
      </ThemedText>

      <View style={styles.preferenceRow}>
        <ThemePreferenceButton
          label="System"
          value="system"
          selectedValue={preference}
          onSelect={setPreference}
        />
        <ThemePreferenceButton
          label="Light"
          value="light"
          selectedValue={preference}
          onSelect={setPreference}
        />
        <ThemePreferenceButton
          label="Dark"
          value="dark"
          selectedValue={preference}
          onSelect={setPreference}
        />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  preferenceRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  preferenceButton: {
    flexGrow: 1,
    flexBasis: 96,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
