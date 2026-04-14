import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthTenantBranding } from '@/components/auth-tenant-branding';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

interface AuthScreenProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showTenantLogo?: boolean;
  centerHeader?: boolean;
}

export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  showTenantLogo = false,
  centerHeader = false,
}: AuthScreenProps) {
  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.card}>
            <View style={[styles.header, centerHeader ? styles.headerCentered : null]}>
              {showTenantLogo ? <AuthTenantBranding /> : null}
              <ThemedText type="subtitle">{title}</ThemedText>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={[styles.subtitle, centerHeader ? styles.subtitleCentered : null]}>
                {subtitle}
              </ThemedText>
            </View>

            <View style={styles.body}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  headerCentered: {
    alignItems: 'center',
  },
  subtitle: {
    lineHeight: 20,
  },
  subtitleCentered: {
    textAlign: 'center',
  },
  body: {
    gap: Spacing.three,
  },
  footer: {
    gap: Spacing.two,
  },
});
