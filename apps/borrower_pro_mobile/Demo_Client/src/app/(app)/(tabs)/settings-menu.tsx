import { MaterialIcons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageScreen } from '@/components/page-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type SettingsMenuItemConfig = {
  title: string;
  description: string;
  /** Route in the app shell (some stack screens are not in generated Href union yet). */
  href: Href | string;
  icon: IconName;
};

function SettingsMenuItem({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        {
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.backgroundSelected }]}>
        <MaterialIcons name={icon} size={20} color={theme.primary} />
      </View>
      <View style={styles.menuCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />
    </Pressable>
  );
}

function SettingsSection({
  title,
  items,
}: {
  title: string;
  items: SettingsMenuItemConfig[];
}) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <View
        style={[
          styles.group,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}>
        {items.map((item, index) => (
          <View
            key={item.title}
            style={[
              styles.rowShell,
              index < items.length - 1
                ? {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.border,
                  }
                : null,
            ]}>
            <SettingsMenuItem
              title={item.title}
              description={item.description}
              icon={item.icon}
              onPress={() => router.push(item.href as Href)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function SettingsMenuScreen() {
  return (
    <PageScreen
      title="Settings"
      subtitle="Manage account access and app preferences with a more native grouped layout."
      showBorrowerContextHeader>
      <SettingsSection
        title="ACCOUNT"
        items={[
          {
            title: 'Account',
            description: 'Sign-in security, email, password, 2FA, and login history.',
            href: '/account',
            icon: 'person',
          },
          {
            title: 'Meetings',
            description: 'Attestation meetings and scheduling across your loans.',
            href: '/meetings',
            icon: 'event',
          },
        ]}
      />
      <SettingsSection
        title="PREFERENCES"
        items={[
          {
            title: 'App settings',
            description: 'Theme preference and device-level app settings.',
            href: '/app-settings',
            icon: 'palette',
          },
        ]}
      />
      <SettingsSection
        title="ABOUT"
        items={[
          {
            title: 'Help',
            description: 'Borrower guides for loan journey, payments, e-KYC, and security topics.',
            href: '/help',
            icon: 'help-outline',
          },
          {
            title: 'About',
            description: 'Lender information, legal links, and app version details.',
            href: '/about',
            icon: 'info-outline',
          },
        ]}
      />
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    marginLeft: Spacing.three,
    letterSpacing: 0.6,
  },
  group: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  rowShell: {
    width: '100%',
  },
  menuItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: {
    flex: 1,
    gap: Spacing.one,
  },
});
