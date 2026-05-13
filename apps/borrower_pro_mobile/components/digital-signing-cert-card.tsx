import type { CertStatusResult } from '@kredit/borrower';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PageHeaderToolbarButton } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { VerifiedStatusRow } from '@/components/verified-status-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signingClient } from '@/lib/api/borrower';
import { formatDate } from '@/lib/format/date';

type Phase = 'loading' | 'offline' | 'no_cert' | 'valid' | 'expired' | 'revoked' | 'error';

function formatCertDate(iso: string | null): string {
  if (!iso) return '—';
  return formatDate(iso);
}

function serialShort(serial: string | null): string {
  if (!serial) return '—';
  if (serial.length <= 14) return serial;
  return `${serial.slice(0, 6)}…${serial.slice(-4)}`;
}

export function DigitalSigningCertCard() {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('loading');
  const [cert, setCert] = useState<CertStatusResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setPhase('loading');
    setErrorMsg(null);

    try {
      const health = await signingClient.checkSigningGatewayHealth();
      if (!health.online) {
        setPhase('offline');
        return;
      }

      const result = await signingClient.getSigningCertStatus();
      setCert(result);

      if (!result.success || !result.hasCert) {
        setPhase('no_cert');
        return;
      }

      const status = (result.certStatus ?? '').toLowerCase();
      if (status === 'valid') {
        setPhase('valid');
      } else if (status === 'expired') {
        setPhase('expired');
      } else if (status === 'revoked') {
        setPhase('revoked');
      } else {
        setPhase('no_cert');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to check certificate');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  let body: React.ReactNode;

  if (phase === 'loading') {
    body = (
      <View style={styles.inlineRow}>
        <ActivityIndicator color={theme.primary} size="small" />
        <ThemedText type="small" themeColor="textSecondary">
          Checking certificate…
        </ThemedText>
      </View>
    );
  } else if (phase === 'offline') {
    body = (
      <View style={styles.compactBlock}>
        <View style={styles.inlineRow}>
          <MaterialIcons name="wifi-off" size={18} color={theme.textSecondary} />
          <ThemedText type="smallBold">Signing service offline</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Status will load when the service is available.
        </ThemedText>
        <PageHeaderToolbarButton label="Retry" variant="outline" onPress={() => void runCheck()} />
      </View>
    );
  } else if (phase === 'error') {
    body = (
      <View style={styles.compactBlock}>
        <ThemedText type="small" style={{ color: theme.error }}>
          {errorMsg ?? 'Something went wrong'}
        </ThemedText>
        <PageHeaderToolbarButton label="Retry" variant="outline" onPress={() => void runCheck()} />
      </View>
    );
  } else if (phase === 'no_cert') {
    body = (
      <View style={styles.compactBlock}>
        <View style={styles.inlineRow}>
          <MaterialIcons name="shield" size={18} color={theme.warning} />
          <ThemedText type="smallBold">No certificate yet</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          A certificate is created when you complete digital signing on a loan agreement.
        </ThemedText>
      </View>
    );
  } else if (phase === 'valid' && cert) {
    body = (
      <View style={styles.compactBlock}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          Serial {serialShort(cert.certSerialNo)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatCertDate(cert.certValidFrom)} → {formatCertDate(cert.certValidTo)}
        </ThemedText>
      </View>
    );
  } else if (phase === 'expired' && cert) {
    body = (
      <View style={styles.compactBlock}>
        <View style={styles.inlineRow}>
          <MaterialIcons name="shield" size={18} color={theme.warning} />
          <ThemedText type="smallBold" style={{ color: theme.warning }}>
            Expired
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Expired {formatCertDate(cert.certValidTo)}. A new certificate can be issued at the next
          signing.
        </ThemedText>
      </View>
    );
  } else if (phase === 'revoked') {
    body = (
      <View style={styles.compactBlock}>
        <View style={styles.inlineRow}>
          <MaterialIcons name="shield" size={18} color={theme.error} />
          <ThemedText type="smallBold" style={{ color: theme.error }}>
            Revoked
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          A new certificate can be issued at the next loan signing.
        </ThemedText>
      </View>
    );
  } else {
    body = null;
  }

  return (
    <SectionCard
      title="Signing certificate"
      description="PKI certificate for loan agreement signing."
      action={phase === 'valid' && cert ? <VerifiedStatusRow label="Active" /> : undefined}>
      {body}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  compactBlock: {
    gap: Spacing.two,
  },
});
