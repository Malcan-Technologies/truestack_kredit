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
   * On iOS 26+, the default `UIScrollEdgeEffect` on the **bottom** can overlap the tab bar blur
   * (documented by react-native-screens); hiding the bottom edge effect avoids fighting the bar.
   *
   * Window-level `userInterfaceStyle` is now driven from the app's resolved theme via
   * `Appearance.setColorScheme` in the root layout, so we no longer need a per-screen
   * `experimental_userInterfaceStyle` override here — the Liquid Glass tab bar samples the right
   * material from the window trait collection.
   *
   * @see https://github.com/software-mansion/react-native-screens/blob/main/src/types.tsx
   */
  const iosTabScreenNativeProps = useMemo((): NativeScreenProps | undefined => {
    if (Platform.OS !== 'ios') return undefined;
    if (iosMajor != null && iosMajor >= 26) {
      return {
        scrollEdgeEffects: {
          top: 'automatic',
          bottom: 'hidden',
          left: 'automatic',
          right: 'automatic',
        },
      };
    }
    return undefined;
  }, [iosMajor]);

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
      // Android Material 3 NavigationBar:
      // - `labeled` keeps every label visible (default 'auto' hides inactive labels with 4+ tabs,
      //   violating navigation-ux §1 "always pair icons with labels").
      // - The active indicator pill sits behind the selected icon. Using `primary` (near-black)
      //   camouflages the selected icon/label (also primary), so we use a tonal `backgroundSelected`
      //   tint — matches the subtle iOS pill and keeps content readable in both themes.
      labelVisibilityMode={Platform.OS === 'android' ? 'labeled' : undefined}
      rippleColor={Platform.OS === 'android' ? colors.backgroundSelected : undefined}
      indicatorColor={Platform.OS === 'android' ? colors.backgroundSelected : undefined}>
      <NativeTabs.Trigger name="index" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="applications" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Applications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="description"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="loans" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Loans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'banknote', selected: 'banknote.fill' }}
          md="account_balance_wallet"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="borrower-profile" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.text.rectangle', selected: 'person.text.rectangle.fill' }}
          md="badge"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings-menu" {...tabTriggerNative}>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
