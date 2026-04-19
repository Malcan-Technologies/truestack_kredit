/**
 * Pushed route for the borrower to sign their loan agreement.
 *
 * Mirrors web's `AgreementSigningView` but adapted for mobile:
 *   - PDF preview is downloaded via signingClient.fetchAgreementPreview and opened in the
 *     OS share sheet (no inline iframe — react-native has no native PDF renderer).
 *   - Signature capture uses `react-native-signature-canvas`, which emits a base64 PNG
 *     data URL matching the wire format web signs with.
 *   - Email OTP is the primary auth factor; PIN remains as an internal-user escape hatch.
 *   - OTP-sent timestamp is persisted via AsyncStorage so the OTP entry survives a
 *     background/foreground cycle (web uses sessionStorage).
 */
import { MaterialIcons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Signature, { type SignatureViewRef } from 'react-native-signature-canvas';

import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { InlineStatusRow } from '@/components/verified-status-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signingClient } from '@/lib/api/borrower';
import {
  getStoredItem,
  removeStoredItem,
  setStoredItem,
} from '@/lib/storage/app-storage';
import { toast } from '@/lib/toast';

type Phase =
  | 'loading'
  | 'review'
  | 'auth_requesting'
  | 'auth_ready'
  | 'signing'
  | 'signed';

type SigningAuthMethod = 'emailOtp' | 'pin';

const EMAIL_OTP_EXPIRY_MS = 5 * 60 * 1000;
const PDF_CACHE_SUBDIR = 'loan-agreement-preview';

function signingOtpKey(loanId: string) {
  return `signing_otp_sent_${loanId}`;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function ensurePdfCacheDir(): Directory {
  const dir = new Directory(Paths.cache, PDF_CACHE_SUBDIR);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

export default function SignAgreementScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ loanId?: string | string[] }>();
  const loanId = Array.isArray(params.loanId) ? params.loanId[0] : params.loanId;

  const [phase, setPhase] = useState<Phase>('loading');
  const [pdfFileUri, setPdfFileUri] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<SigningAuthMethod>('emailOtp');
  const [authFactorValue, setAuthFactorValue] = useState('');
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [hasPersistedOtp, setHasPersistedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  const sigRef = useRef<SignatureViewRef>(null);

  useEffect(() => {
    if (!loanId) return;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await signingClient.fetchAgreementPreview(loanId);
        const bytes = await blobToBytes(blob);
        const dir = ensurePdfCacheDir();
        const file = new File(dir, `loan-${loanId}-agreement.pdf`);
        if (file.exists) file.delete();
        file.create();
        file.write(bytes);
        if (cancelled) return;
        setPdfFileUri(file.uri);
      } catch (e) {
        if (!cancelled) {
          setPdfError(
            e instanceof Error ? e.message : 'Failed to load agreement preview',
          );
        }
      } finally {
        if (!cancelled) setPhase('review');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    if (!loanId) return;
    let cancelled = false;
    void (async () => {
      const stored = await getStoredItem(signingOtpKey(loanId));
      if (cancelled || !stored) return;
      const ts = parseInt(stored, 10);
      if (!Number.isFinite(ts)) return;
      if (Date.now() - ts < EMAIL_OTP_EXPIRY_MS) {
        setHasPersistedOtp(true);
        setAuthMethod('emailOtp');
      } else {
        await removeStoredItem(signingOtpKey(loanId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    if (phase !== 'signed') return;
    if (countdown <= 0) {
      if (loanId) router.replace(`/loans/${loanId}`);
      else router.back();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, loanId, router]);

  const handleSignatureCaptured = useCallback((dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
  }, []);

  const handleRedrawSignature = useCallback(() => {
    sigRef.current?.clearSignature();
    setSignatureDataUrl(null);
  }, []);

  const handleRequestCapture = useCallback(() => {
    sigRef.current?.readSignature();
  }, []);

  const handleOpenPdf = useCallback(async () => {
    if (!pdfFileUri) return;
    try {
      if (Platform.OS === 'web') {
        toast.error('Preview is only available on iOS and Android builds.');
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        toast.error('Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(pdfFileUri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Loan agreement preview',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open preview.');
    }
  }, [pdfFileUri]);

  const handleRequestOtp = useCallback(async () => {
    if (!loanId) return;
    setAuthMethod('emailOtp');
    setAuthFactorValue('');
    setBusy(true);
    setErrorMsg(null);
    setPhase('auth_requesting');
    try {
      const result = await signingClient.requestSigningOTP();
      if (result.success) {
        setPhase('auth_ready');
        if (result.email) setOtpEmail(result.email);
        await setStoredItem(signingOtpKey(loanId), String(Date.now()));
        setHasPersistedOtp(true);
        toast.success(
          result.email
            ? `OTP sent to ${result.email}`
            : 'OTP sent to your registered email.',
        );
      } else {
        setPhase('review');
        setErrorMsg(
          result.errorDescription || result.statusMsg || 'Failed to send OTP',
        );
      }
    } catch (e) {
      setPhase('review');
      setErrorMsg(e instanceof Error ? e.message : 'Failed to request OTP');
    } finally {
      setBusy(false);
    }
  }, [loanId]);

  const handleUsePin = useCallback(() => {
    setAuthMethod('pin');
    setAuthFactorValue('');
    setOtpEmail(null);
    setErrorMsg(null);
    setPhase('auth_ready');
  }, []);

  const handleSign = useCallback(async () => {
    if (!loanId) return;
    if (!signatureDataUrl) {
      toast.error('Signature is required.');
      return;
    }
    if (!authFactorValue.trim()) {
      toast.error(
        authMethod === 'pin'
          ? 'Enter your certificate PIN.'
          : 'Enter the OTP from your email.',
      );
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setPhase('signing');
    try {
      const result = await signingClient.signAgreement(
        loanId,
        authFactorValue.trim(),
        signatureDataUrl,
        authMethod,
      );
      if (result.success) {
        setPhase('signed');
        setCountdown(5);
        await removeStoredItem(signingOtpKey(loanId));
        setHasPersistedOtp(false);
        toast.success('Agreement signed. Submitted for lender review.');
      } else {
        setPhase('auth_ready');
        setAuthFactorValue('');
        const desc = result.errorDescription || '';
        const msg = result.statusMsg || '';
        const code = result.statusCode || '';
        const isAuthFactorError =
          /otp|authfactor|auth.factor/i.test(desc + msg) ||
          ['DS112', 'DS113', 'DS114', 'AP112', 'AP113', 'AP114'].includes(code);
        if (isAuthFactorError) {
          setErrorMsg(
            desc ||
              (authMethod === 'pin'
                ? 'Invalid PIN. Please check and try again.'
                : 'Invalid or expired OTP. Request a new code and try again.'),
          );
        } else {
          setErrorMsg(
            desc ||
              msg ||
              `Signing failed (code: ${code || 'unknown'}). Please try again or contact support.`,
          );
        }
      }
    } catch (e) {
      setPhase('auth_ready');
      setAuthFactorValue('');
      setErrorMsg(
        e instanceof Error ? e.message : 'Signing failed unexpectedly. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [loanId, signatureDataUrl, authFactorValue, authMethod]);

  const showAuthSection = Boolean(signatureDataUrl);
  const showEmailOtpEntry =
    showAuthSection &&
    authMethod === 'emailOtp' &&
    (phase === 'auth_ready' ||
      phase === 'signing' ||
      (phase === 'review' && hasPersistedOtp));
  const showPinEntry =
    showAuthSection && authMethod === 'pin' && (phase === 'auth_ready' || phase === 'signing');
  const showAuthChoice =
    showAuthSection &&
    phase === 'review' &&
    !hasPersistedOtp;

  const stickyFooter = useMemo(() => {
    if (phase === 'loading' || phase === 'signed') return null;

    if (!signatureDataUrl) {
      return (
        <FooterButton
          label="Capture signature"
          icon="check"
          onPress={handleRequestCapture}
          theme={theme}
        />
      );
    }

    if (showAuthChoice) {
      return (
        <FooterButton
          label="Send email OTP"
          icon="mail"
          busy={busy}
          onPress={handleRequestOtp}
          theme={theme}
        />
      );
    }

    if (phase === 'auth_requesting') {
      return (
        <FooterButton
          label="Sending OTP…"
          busy
          onPress={() => {}}
          theme={theme}
        />
      );
    }

    if (showEmailOtpEntry || showPinEntry) {
      return (
        <FooterButton
          label={
            phase === 'signing'
              ? 'Signing…'
              : authMethod === 'pin'
                ? 'Sign with PIN'
                : 'Sign agreement'
          }
          icon="verified-user"
          busy={busy || phase === 'signing'}
          disabled={!authFactorValue.trim()}
          onPress={handleSign}
          theme={theme}
        />
      );
    }

    return null;
  }, [
    phase,
    signatureDataUrl,
    showAuthChoice,
    showEmailOtpEntry,
    showPinEntry,
    authMethod,
    authFactorValue,
    busy,
    handleRequestCapture,
    handleRequestOtp,
    handleSign,
    theme,
  ]);

  if (!loanId) {
    return (
      <PageScreen title="Sign agreement" showBackButton backFallbackHref="/loans">
        <View style={styles.centered}>
          <ThemedText type="smallBold">Missing loan ID.</ThemedText>
        </View>
      </PageScreen>
    );
  }

  const backHref = `/loans/${loanId}` as const;

  if (phase === 'loading') {
    return (
      <PageScreen title="Sign agreement" showBackButton backFallbackHref={backHref}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
            Preparing agreement…
          </ThemedText>
        </View>
      </PageScreen>
    );
  }

  if (phase === 'signed') {
    return (
      <PageScreen title="Sign agreement" showBackButton backFallbackHref={backHref}>
        <SectionCard hideHeader>
          <View style={styles.successStack}>
            <View
              style={[
                styles.successIconWrap,
                { backgroundColor: theme.background, borderColor: theme.success },
              ]}>
              <MaterialIcons name="check-circle" size={40} color={theme.success} />
            </View>
            <ThemedText type="subtitle">Agreement signed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.successCopy}>
              Your digitally signed loan agreement has been submitted for lender review. A signed
              copy has been emailed to you.
            </ThemedText>
            <View style={styles.successMetaRow}>
              <MaterialIcons name="verified-user" size={14} color={theme.success} />
              <ThemedText type="small" themeColor="textSecondary">
                PKI digital signature applied
              </ThemedText>
            </View>
            <View style={styles.successMetaRow}>
              <MaterialIcons name="mail" size={14} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                Copy emailed to you
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              Returning to loan in {countdown}s…
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(backHref)}
              style={({ pressed }) => [
                styles.goNowBtn,
                { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="smallBold">Go now</ThemedText>
            </Pressable>
          </View>
        </SectionCard>
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title="Sign agreement"
      showBackButton
      backFallbackHref={backHref}
      stickyFooter={stickyFooter}>
      {errorMsg ? (
        <View
          style={[
            styles.errorBanner,
            { borderColor: theme.error, backgroundColor: theme.background },
          ]}>
          <MaterialIcons name="error-outline" size={16} color={theme.error} />
          <ThemedText type="small" style={{ color: theme.error, flex: 1 }}>
            {errorMsg}
          </ThemedText>
        </View>
      ) : null}

      <SectionCard
        title="1. Review the agreement"
        description="Open the PDF to review the full agreement before signing."
        action={
          pdfFileUri ? <InlineStatusRow tone="success" label="Ready" /> : undefined
        }>
        {pdfError ? (
          <ThemedText type="small" style={{ color: theme.error }}>
            {pdfError}
          </ThemedText>
        ) : pdfFileUri ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleOpenPdf()}
            style={({ pressed }) => [
              styles.openPdfBtn,
              { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
            ]}>
            <MaterialIcons name="picture-as-pdf" size={18} color={theme.primary} />
            <View style={styles.openPdfCopy}>
              <ThemedText type="smallBold">Open agreement PDF</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Opens in your device PDF viewer.
              </ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Preparing preview…
          </ThemedText>
        )}
      </SectionCard>

      <SectionCard
        title="2. Draw your signature"
        description="Your signature is stamped on page 4 and embedded with a PKI seal."
        action={
          signatureDataUrl ? <InlineStatusRow tone="success" label="Captured" /> : undefined
        }>
        {signatureDataUrl ? (
          <View
            style={[
              styles.capturedBox,
              { borderColor: theme.success, backgroundColor: theme.background },
            ]}>
            <MaterialIcons name="check-circle" size={18} color={theme.success} />
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
              Signature captured. You can re-draw it if needed.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={handleRedrawSignature}
              style={({ pressed }) => [
                styles.redrawBtn,
                { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
              ]}>
              <MaterialIcons name="refresh" size={14} color={theme.text} />
              <ThemedText type="smallBold">Re-draw</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View
            style={[
              styles.canvasWrap,
              { borderColor: theme.border, backgroundColor: '#ffffff' },
            ]}>
            <Signature
              ref={sigRef}
              onOK={handleSignatureCaptured}
              onEmpty={() => toast.error('Please draw your signature first.')}
              webStyle={SIGNATURE_WEB_STYLE}
              descriptionText=""
              imageType="image/png"
              trimWhitespace
              penColor="#1a1a2e"
              backgroundColor="rgba(255,255,255,0)"
              style={styles.canvas}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => sigRef.current?.clearSignature()}
              style={({ pressed }) => [
                styles.clearBtn,
                { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
              ]}>
              <MaterialIcons name="close" size={14} color={theme.text} />
              <ThemedText type="smallBold">Clear</ThemedText>
            </Pressable>
          </View>
        )}
      </SectionCard>

      {showAuthSection ? (
        <SectionCard
          title="3. Authorize signing"
          description={
            authMethod === 'pin'
              ? 'Enter your certificate PIN to sign.'
              : 'Enter the 6-digit OTP sent to your registered email.'
          }>
          {showAuthChoice ? (
            <View style={styles.stack}>
              <ThemedText type="small" themeColor="textSecondary">
                We will send a one-time code to your registered email. PIN signing is only for
                internal users.
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={handleUsePin}
                style={({ pressed }) => [
                  styles.secondaryLink,
                  { borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="smallBold">Sign with PIN instead</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {phase === 'auth_requesting' ? (
            <View style={styles.inlineRow}>
              <ActivityIndicator color={theme.primary} size="small" />
              <ThemedText type="small" themeColor="textSecondary">
                Sending OTP to your email…
              </ThemedText>
            </View>
          ) : null}

          {showEmailOtpEntry ? (
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
                    ? `A 6-digit code was sent to ${otpEmail}. The code expires in 5 minutes.`
                    : 'Check your inbox for the 6-digit code. The code expires in 5 minutes.'}
                </ThemedText>
              </View>

              <View style={styles.field}>
                <ThemedText type="small" themeColor="textSecondary">
                  Email OTP
                </ThemedText>
                <TextInput
                  value={authFactorValue}
                  onChangeText={(v) => setAuthFactorValue(v.replace(/\D/g, ''))}
                  editable={phase !== 'signing'}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={theme.textSecondary}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={8}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  style={[
                    styles.input,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
              </View>

              <View style={styles.inlineRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleRequestOtp()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.secondaryLink,
                    { borderColor: theme.border, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
                  ]}>
                  <MaterialIcons name="refresh" size={14} color={theme.text} />
                  <ThemedText type="smallBold">Resend OTP</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleUsePin}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.secondaryLink,
                    { borderColor: theme.border, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
                  ]}>
                  <ThemedText type="smallBold">Use PIN instead</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {showPinEntry ? (
            <View style={styles.stack}>
              <View
                style={[
                  styles.infoBox,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}>
                <ThemedText type="smallBold">Sign with certificate PIN</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  For internal users only. No email OTP will be requested.
                </ThemedText>
              </View>

              <View style={styles.field}>
                <ThemedText type="small" themeColor="textSecondary">
                  Certificate PIN
                </ThemedText>
                <TextInput
                  value={authFactorValue}
                  onChangeText={setAuthFactorValue}
                  editable={phase !== 'signing'}
                  placeholder="Enter certificate PIN"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  autoComplete="current-password"
                  maxLength={8}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleRequestOtp()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.secondaryLink,
                  { borderColor: theme.border, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
                ]}>
                <MaterialIcons name="mail" size={14} color={theme.text} />
                <ThemedText type="smallBold">Use email OTP instead</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </SectionCard>
      ) : null}
    </PageScreen>
  );
}

function FooterButton({
  label,
  icon,
  onPress,
  busy,
  disabled,
  theme,
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const isDisabled = Boolean(busy) || Boolean(disabled);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void onPress()}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.footerBtn,
        {
          backgroundColor: theme.primary,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={theme.primaryForeground} />
      ) : (
        <>
          {icon ? <MaterialIcons name={icon} size={18} color={theme.primaryForeground} /> : null}
          <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const SIGNATURE_WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; margin: 0; }
  body, html { background: transparent; }
`;

const styles = StyleSheet.create({
  centered: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
  },
  stack: {
    gap: Spacing.two,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  openPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 52,
  },
  openPdfCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  canvasWrap: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    overflow: 'hidden',
  },
  canvas: {
    width: '100%',
    height: 220,
  },
  clearBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
    margin: Spacing.two,
  },
  capturedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
  },
  redrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
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
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    minHeight: 40,
  },
  footerBtn: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  successStack: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    gap: Spacing.two,
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  successCopy: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  successMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  goNowBtn: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
