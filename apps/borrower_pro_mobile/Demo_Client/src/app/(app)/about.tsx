import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { borrowerAuthClient } from '@/lib/api/borrower';
import { getEnv } from '@/lib/config/env';
import { resolveLenderLogoUrl } from '@/lib/lender-branding';
import type { LenderInfo } from '@kredit/borrower';

const POLICY_LINKS = [
  { href: '/legal/terms', label: 'Terms of use' },
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/security', label: 'Security policy' },
  { href: '/legal/pdpa', label: 'PDPA notice' },
  { href: '/legal/cookies', label: 'Cookie policy' },
] as const;

const TRUESTACK_URL = 'https://truestack.my';

function licenseTypeLabel(type: LenderInfo['type']): string {
  if (type === 'PPW') return 'PPW — Pemberi Pinjam Wang';
  if (type === 'PPG') return 'PPG — Pemberi Pajak Gadai';
  return '—';
}

async function openExternalUrl(url: string) {
  await openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
}

function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void | Promise<void>;
}) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {onPress ? (
        <Pressable onPress={() => void onPress()}>
          <ThemedText type="default" themeColor="primary">
            {value || '—'}
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="default">{value || '—'}</ThemedText>
      )}
    </View>
  );
}

export default function AboutScreen() {
  const theme = useTheme();
  const [lender, setLender] = useState<LenderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void borrowerAuthClient
      .fetchLenderInfo()
      .then((result) => {
        if (!cancelled) {
          setLender(result.data);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Something went wrong');
        }
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

  const logoUrl = useMemo(() => resolveLenderLogoUrl(lender?.logoUrl ?? null), [lender?.logoUrl]);
  const borrowerWebUrl = getEnv().authBaseUrl.replace(/\/$/, '');
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <PageScreen
      title="About"
      subtitle="Lender information, policies, and app details for this borrower app."
      showBackButton
      showBottomNav
      backFallbackHref="/settings-menu">
      <SectionCard
        title="About your lender"
        description="Licensed moneylender details for the company you are borrowing from.">
        {loading ? (
          <ActivityIndicator />
        ) : error || !lender ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error || 'Unable to load lender information.'}
          </ThemedText>
        ) : (
          <View style={styles.contentStack}>
            {logoUrl ? (
              <View
                style={[
                  styles.logoRow,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}>
                <View
                  style={[
                    styles.logoFrame,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}>
                  <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="contain" />
                </View>
                <View style={styles.logoCopy}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Company
                  </ThemedText>
                  <ThemedText type="smallBold">{lender.name}</ThemedText>
                </View>
              </View>
            ) : null}

            {!logoUrl ? <InfoRow label="Company name" value={lender.name} /> : null}
            <InfoRow label="License type" value={licenseTypeLabel(lender.type)} />
            <InfoRow label="KPKT license number" value={lender.licenseNumber || '—'} />
            <InfoRow label="Registration number (SSM)" value={lender.registrationNumber || '—'} />
            <InfoRow
              label="Company email"
              value={lender.email || '—'}
              onPress={
                lender.email ? () => Linking.openURL(`mailto:${encodeURIComponent(lender.email || '')}`) : undefined
              }
            />
            <InfoRow
              label="Contact number"
              value={lender.contactNumber || '—'}
              onPress={
                lender.contactNumber
                  ? () => Linking.openURL(`tel:${String(lender.contactNumber).replace(/\s+/g, '')}`)
                  : undefined
              }
            />
            <InfoRow label="Business address" value={lender.businessAddress || '—'} />
          </View>
        )}
      </SectionCard>

      <SectionCard
        title="Policies & legal"
        description="Important documents governing your use of this portal and how your data is handled.">
        <View style={styles.linkList}>
          {POLICY_LINKS.map((item) => {
            const url = borrowerWebUrl ? `${borrowerWebUrl}${item.href}` : item.href;

            return (
              <Pressable
                key={item.href}
                onPress={() => void openExternalUrl(url)}
                style={[
                  styles.linkRow,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="smallBold">{item.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Open
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard
        title="Powered by TrueStack"
        description={`Lending software powered by TrueKredit Pro · v${appVersion}`}>
        <Pressable
          onPress={() => void openExternalUrl(TRUESTACK_URL)}
          style={[
            styles.linkRow,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
          ]}>
          <ThemedText type="smallBold">Visit truestack.my</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Open
          </ThemedText>
        </Pressable>
      </SectionCard>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: Spacing.two,
  },
  infoRow: {
    gap: Spacing.one,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  logoFrame: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.one,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  linkList: {
    gap: Spacing.two,
  },
  linkRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
