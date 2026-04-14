import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerAuthClient } from '@/lib/api/borrower';
import { resolveLenderLogoUrl } from '@/lib/lender-branding';
import type { LenderInfo } from '@kredit/borrower';

type AuthTenantBrandingState = Pick<LenderInfo, 'name' | 'logoUrl'>;

export function AuthTenantBranding() {
  const theme = useTheme();
  const [branding, setBranding] = useState<AuthTenantBrandingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void borrowerAuthClient
      .fetchLenderInfo()
      .then((result) => {
        if (!cancelled) {
          setBranding(result.data);
        }
      })
      .catch(() => {
        // Auth pages should still render if lender branding cannot be loaded.
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logoUrl = useMemo(() => resolveLenderLogoUrl(branding?.logoUrl ?? null), [branding?.logoUrl]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.frame}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      </View>
    );
  }

  if (!logoUrl) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        <Image
          source={{ uri: logoUrl }}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel={branding?.name ? `${branding.name} logo` : 'Tenant logo'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingBottom: Spacing.one,
  },
  frame: {
    minHeight: 80,
    minWidth: 212,
    maxWidth: '100%',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 48,
    maxWidth: '100%',
  },
});
