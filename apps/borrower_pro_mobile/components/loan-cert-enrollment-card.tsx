import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { InlineStatusRow } from '@/components/verified-status-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signingClient } from '@/lib/api/borrower';
import { toast } from '@/lib/toast';
import type { CertStatusResult } from '@kredit/borrower';

type Phase =
  | 'checking'
  | 'gateway_offline'
  | 'cert_valid'
  | 'cert_missing'
  | 'otp_sent'
  | 'enrolling'
  | 'enrolled';

interface Props {
  stepLabel: string;
  onCertReady: () => void;
}

export function LoanCertEnrollmentCard({ stepLabel, onCertReady }: Props) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('checking');
  const [certInfo, setCertInfo] = useState<CertStatusResult | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notifiedReady, setNotifiedReady] = useState(false);

  const runChecks = useCallback(async () => {
    setPhase('checking');
    setErrorMsg(null);
    setCertInfo(null);

    try {
      const health = await signingClient.checkSigningGatewayHealth();
      if (!health.online) {
        setPhase('gateway_offline');
        return;
      }

      const cert = await signingClient.getSigningCertStatus();
      setCertInfo(cert);
      setPhase(cert.hasCert ? 'cert_valid' : 'cert_missing');
    } catch (e) {
      setPhase('gateway_offline');
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed');
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  useEffect(() => {
    if ((phase === 'cert_valid' || phase === 'enrolled') && !notifiedReady) {
      setNotifiedReady(true);
      onCertReady();
    }
  }, [phase, notifiedReady, onCertReady]);

  const handleRequestOtp = useCallback(async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await signingClient.requestEnrollmentOTP();
      if (result.success) {
        setPhase('otp_sent');
        if (result.email) setOtpEmail(result.email);
        toast.success(
          result.email ? `OTP sent to ${result.email}` : 'OTP sent to your registered email.',
        );
      } else {
        setErrorMsg(result.errorDescription || result.statusMsg || 'Failed to send OTP');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to request OTP');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleEnroll = useCallback(async () => {
    if (!otpValue.trim()) {
      toast.error('Enter the OTP from your email.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setPhase('enrolling');
    try {
      const result = await signingClient.enrollSigningCert(otpValue.trim());
      if (result.success) {
        setPhase('enrolled');
        toast.success('Digital certificate issued.');
      } else {
        setPhase('otp_sent');
        setErrorMsg(result.errorDescription || result.statusMsg || 'Enrollment failed');
      }
    } catch (e) {
      setPhase('otp_sent');
      setErrorMsg(e instanceof Error ? e.message : 'Enrollment failed');
    } finally {
      setBusy(false);
    }
  }, [otpValue]);

  const cardAction =
    phase === 'cert_valid' || phase === 'enrolled' ? (
      <InlineStatusRow tone="success" label="Ready" />
    ) : phase === 'gateway_offline' ? (
      <InlineStatusRow tone="error" label="Offline" />
    ) : undefined;

  let body: React.ReactNode = null;

  if (phase === 'checking') {
    body = (
      <View style={styles.inlineRow}>
        <ActivityIndicator color={theme.primary} size="small" />
        <ThemedText type="small" themeColor="textSecondary">
          Checking signing service...
        </ThemedText>
      </View>
    );
  } else if (phase === 'gateway_offline') {
    body = (
      <View style={styles.stack}>
        <ThemedText type="small" themeColor="textSecondary">
          The on-premise signing server is not reachable right now. This is usually temporary —
          please try again shortly.
        </ThemedText>
        {errorMsg ? (
          <ThemedText type="small" style={{ color: theme.error }}>
            {errorMsg}
          </ThemedText>
        ) : null}
        <ActionButton label="Try again" icon="refresh" variant="outline" onPress={runChecks} />
      </View>
    );
  } else if (phase === 'cert_valid' && certInfo) {
    body = (
      <View style={styles.stack}>
        <ThemedText type="small" themeColor="textSecondary">
          Your digital signing certificate is valid and ready.
        </ThemedText>
        <View
          style={[
            styles.certBox,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}>
          {certInfo.certSerialNo ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              Serial {certInfo.certSerialNo}
            </ThemedText>
          ) : null}
          {certInfo.certValidTo ? (
            <ThemedText type="small" themeColor="textSecondary">
              Valid until {certInfo.certValidTo}
            </ThemedText>
          ) : null}
        </View>
        <ActionButton
          label="Continue to signing"
          icon="arrow-forward"
          onPress={onCertReady}
        />
      </View>
    );
  } else if (phase === 'enrolled') {
    body = (
      <View style={styles.stack}>
        <ThemedText type="small" themeColor="textSecondary">
          Certificate issued. You can now proceed to sign your agreement.
        </ThemedText>
        <ActionButton
          label="Continue to signing"
          icon="arrow-forward"
          onPress={onCertReady}
        />
      </View>
    );
  } else if (phase === 'cert_missing') {
    body = (
      <View style={styles.stack}>
        <ThemedText type="small" themeColor="textSecondary">
          A digital certificate must be issued in your name before you can sign the loan agreement.
          We will email a one-time code to confirm your identity.
        </ThemedText>
        {errorMsg ? (
          <ThemedText type="small" style={{ color: theme.error }}>
            {errorMsg}
          </ThemedText>
        ) : null}
        <ActionButton
          label="Send OTP to my email"
          icon="mail"
          busy={busy}
          onPress={handleRequestOtp}
        />
      </View>
    );
  } else {
    body = (
      <View style={styles.stack}>
        <View
          style={[
            styles.infoBox,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}>
          <View style={styles.inlineRow}>
            <MaterialIcons name="mail" size={16} color={theme.textSecondary} />
            <ThemedText type="smallBold">OTP sent to your email</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {otpEmail
              ? `A 6-digit code was sent to ${otpEmail}. The code expires in a few minutes.`
              : 'Check your inbox for the 6-digit code. The code expires in a few minutes.'}
          </ThemedText>
        </View>

        {errorMsg ? (
          <ThemedText type="small" style={{ color: theme.error }}>
            {errorMsg}
          </ThemedText>
        ) : null}

        <View style={styles.field}>
          <ThemedText type="small" themeColor="textSecondary">
            Email OTP
          </ThemedText>
          <TextInput
            value={otpValue}
            onChangeText={(v) => setOtpValue(v.replace(/\D/g, ''))}
            editable={phase !== 'enrolling'}
            placeholder="Enter 6-digit code"
            placeholderTextColor={theme.textSecondary}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={8}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={[
              styles.input,
              { borderColor: theme.border, color: theme.text, backgroundColor: theme.background },
            ]}
          />
        </View>

        <ActionButton
          label="Get certificate"
          icon="verified-user"
          busy={busy || phase === 'enrolling'}
          disabled={!otpValue.trim()}
          onPress={handleEnroll}
        />
        <ActionButton
          label="Resend OTP"
          icon="refresh"
          variant="outline"
          busy={busy && phase !== 'enrolling'}
          onPress={handleRequestOtp}
        />
      </View>
    );
  }

  return (
    <SectionCard title={stepLabel} description="Digital signing certificate" action={cardAction}>
      {body}
    </SectionCard>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  busy,
  disabled,
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'outline';
  busy?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const isOutline = variant === 'outline';
  const bg = isOutline ? 'transparent' : theme.primary;
  const fg = isOutline ? theme.text : theme.primaryForeground;
  const borderColor = isOutline ? theme.border : theme.primary;
  const isDisabled = Boolean(busy) || Boolean(disabled);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={() => void onPress()}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: bg,
          borderColor,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <MaterialIcons name={icon} size={16} color={fg} /> : null}
          <ThemedText type="smallBold" style={{ color: fg }}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  certBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    fontSize: 16,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
});
