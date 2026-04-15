import type { NativeScreenProps } from 'expo-router/build/native-tabs/types';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React, { useMemo } from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/lib/theme/theme-preference';

function iosMajorVersion(): number | null {
  if (Platform.OS !== 'ios') return null;
  const v = Platform.Version;
  if (typeof v === 'string') return parseInt(v.split('.')[0] ?? '0', 10) || null;
  if (typeof v === 'number') return Math.floor(v);
  return null;
}

export default function AppTabs() {
  const { resolvedScheme } = useThemePreference();
  const colors = Colors[resolvedScheme];
  /** Prefer chrome materials — closer to system tab bar / Liquid Glass chrome than generic `systemMaterial*`. */
  const iosBlurEffect =
    resolvedScheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight';
  const iosMajor = iosMajorVersion();
  /**
   * iOS 26+ defaults to scroll-linked tab bar minimize (`automatic`). That can briefly show the wrong
   * blur/material until scroll-edge state updates — especially on tab switches — which reads as a
   * light flash in dark mode. Disabling minimize avoids that transition.
   *
   * @see https://developer.apple.com/documentation/uikit/uitabbarcontroller/minimizebehavior
   */
  const tabBarMinimizeBehavior =
    Platform.OS === 'ios' && iosMajor != null && iosMajor >= 26 ? 'never' : undefined;

  /**
   * Native tab bar materials (especially Liquid Glass on iOS 26+) follow **UIKit's** interface style.
   * With `app.config` `userInterfaceStyle: 'automatic'`, that can stay **light** while the app theme
   * is **dark**, so the bar flashes or sticks light until scroll/layout updates. `experimental_userInterfaceStyle`
   * pins the tab screen (and bar chrome) to match our resolved in-app scheme.
   *
   * On iOS 26+, default `UIScrollEdgeEffect` on the **bottom** can overlap the tab bar blur (RNScreens
   * documents this); hiding the bottom edge effect avoids fighting the bar — often visible on long,
   * scroll-edge-heavy tabs like Home and Settings.
   *
   * @see https://github.com/software-mansion/react-native-screens/blob/main/src/types.tsx
   */
  const iosTabScreenNativeProps = useMemo((): NativeScreenProps | undefined => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }
    const uiStyle = resolvedScheme === 'dark' ? 'dark' : 'light';
    if (iosMajor != null && iosMajor >= 26) {
      return {
        experimental_userInterfaceStyle: uiStyle,
        scrollEdgeEffects: {
          top: 'automatic',
          bottom: 'hidden',
          left: 'automatic',
          right: 'automatic',
        },
      };
    }
    return { experimental_userInterfaceStyle: uiStyle };
  }, [resolvedScheme, iosMajor]);

  const tabTriggerNative = iosTabScreenNativeProps
    ? { unstable_nativeProps: iosTabScreenNativeProps }
    : {};

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      blurEffect={Platform.OS === 'ios' ? iosBlurEffect : undefined}
      disableTransparentOnScrollEdge={Platform.OS === 'ios'}
      minimizeBehavior={tabBarMinimizeBehavior}
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
      <NativeTabs.Trigger name="index" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="house"
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="applications" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Applications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="doc.text"
          md="description"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="loans" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Loans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="banknote"
          md="account_balance_wallet"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="borrower-profile" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="person.text.rectangle"
          md="badge"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings-menu" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="gearshape"
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
