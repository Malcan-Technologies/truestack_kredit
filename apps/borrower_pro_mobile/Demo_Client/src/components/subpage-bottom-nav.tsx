import { MaterialIcons } from '@expo/vector-icons';
import { type Href, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type NavItem = {
  key: string;
  label: string;
  href: Href;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const SETTINGS_CONTEXT_PATHS = new Set([
  '/settings-menu',
  '/account',
  '/app-settings',
  '/about',
  '/onboarding',
]);

export function SubpageBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();

  const items: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/', icon: 'home-filled' },
    { key: 'applications', label: 'Applications', href: '/applications', icon: 'description' },
    { key: 'loans', label: 'Loans', href: '/loans', icon: 'account-balance-wallet' },
    { key: 'profile', label: 'Profile', href: '/borrower-profile', icon: 'badge' },
    { key: 'settings', label: 'Settings', href: '/settings-menu', icon: 'settings' },
  ];

  function isActive(item: NavItem) {
    if (item.href === '/settings-menu') {
      return SETTINGS_CONTEXT_PATHS.has(pathname);
    }

    return pathname === item.href;
  }

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
        },
      ]}>
      <View style={styles.row}>
        {items.map((item) => {
          const active = isActive(item);

          return (
            <Pressable
              key={item.key}
              onPress={() => router.replace(item.href)}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: active ? theme.backgroundSelected : 'transparent',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <MaterialIcons
                name={item.icon}
                size={20}
                color={active ? theme.primary : theme.textSecondary}
              />
              <ThemedText
                type="small"
                style={{ color: active ? theme.primary : theme.textSecondary }}>
                {item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  item: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    borderRadius: 12,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
});
