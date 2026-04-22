import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IDENTITY_EKYC_LOCKED_BANNER_TEXT } from '@/lib/identity-ekyc-copy';

/**
 * Same structure as web `IdentityEkycLockedBanner`: success check + muted body text (`ThemedText` small).
 */
export function IdentityEkycLockedCallout() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.two,
        paddingHorizontal: 12,
        paddingVertical: Spacing.two + 2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.backgroundElement,
      }}
      accessibilityRole="text"
    >
      <MaterialIcons name="check-circle" size={22} color={theme.success} style={{ marginTop: 1 }} />
      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, lineHeight: 20 }}>
        {IDENTITY_EKYC_LOCKED_BANNER_TEXT}
      </ThemedText>
    </View>
  );
}
