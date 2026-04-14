import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/lib/theme/theme-preference';

export default function AppTabs() {
  const { resolvedScheme } = useThemePreference();
  const colors = Colors[resolvedScheme];
  const iosBlurEffect =
    resolvedScheme === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight';

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      blurEffect={Platform.OS === 'ios' ? iosBlurEffect : undefined}
      disableTransparentOnScrollEdge={Platform.OS === 'ios'}
      tintColor={colors.primary}
      iconColor={{
        default: colors.textSecondary,
        selected: colors.primary,
      }}
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: colors.primary },
      }}
      shadowColor={Platform.OS === 'ios' ? colors.border : undefined}
      indicatorColor={Platform.OS === 'android' ? colors.primary : undefined}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="house"
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="applications">
        <NativeTabs.Trigger.Label>Applications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="doc.text"
          md="description"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="loans">
        <NativeTabs.Trigger.Label>Loans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="banknote"
          md="account_balance_wallet"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="borrower-profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="person.text.rectangle"
          md="badge"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings-menu">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="gearshape"
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
