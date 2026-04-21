import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { BottomSheetModal } from '@/components/bottom-sheet-modal';
import { PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { InlineStatusRow, VerifiedStatusRow } from '@/components/verified-status-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDevicePasskey,
  changeEmail,
  changePassword,
  deleteDevicePasskey,
  disableTwoFactor,
  enableTwoFactor,
  fetchAccountProfile,
  fetchLoginHistory,
  fetchPasswordInfo,
  getPasskeySupportMessage,
  getTotpUri,
  listUserPasskeys,
  sendVerificationEmail,
  type AccountProfile,
  type LoginHistoryEntry,
  type RegisteredPasskey,
  updateUserProfile,
  verifyTotp,
} from '@/lib/auth/auth-api';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/format/date';
import { useSession } from '@/lib/auth/session-context';

type ButtonVariant = 'primary' | 'outline' | 'danger';

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Full-width destructive / primary at bottom of screen (thumb reach). */
  fullWidth?: boolean;
}) {
  const theme = useTheme();

  const buttonStyle = useMemo(() => {
    if (variant === 'outline') {
      return {
        backgroundColor: theme.background,
        borderColor: theme.border,
        textColor: theme.text,
      };
    }

    if (variant === 'danger') {
      return {
        backgroundColor: theme.error,
        borderColor: theme.error,
        textColor: theme.primaryForeground,
      };
    }

    return {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      textColor: theme.primaryForeground,
    };
  }, [theme, variant]);

  return (
    <Pressable
      style={[
        styles.button,
        fullWidth && styles.buttonFullWidth,
        {
          backgroundColor: buttonStyle.backgroundColor,
          borderColor: buttonStyle.borderColor,
        },
        (disabled || loading) && styles.buttonDisabled,
      ]}
      disabled={disabled || loading}
      onPress={() => void onPress()}>
      {loading ? (
        <ActivityIndicator color={buttonStyle.textColor} size="small" />
      ) : (
        <ThemedText type="smallBold" style={{ color: buttonStyle.textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function FormInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  editable = true,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  editable?: boolean;
}) {
  const theme = useTheme();

  return (
    <TextInput
      style={[
        styles.input,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          color: theme.text,
        },
        !editable && styles.inputDisabled,
      ]}
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      editable={editable}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value || '—'}</ThemedText>
    </View>
  );
}

function getTotpSecret(totpUri: string): string {
  const match = totpUri.match(/[?&]secret=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Matches server `parseDeviceType` labels (Mobile / Tablet / Desktop / Unknown). */
function loginActivityDeviceIcon(
  deviceType: string | null | undefined,
): 'smartphone' | 'tablet' | 'computer' | 'devices' {
  const t = (deviceType ?? '').toLowerCase();
  if (t.includes('tablet')) return 'tablet';
  if (t.includes('mobile')) return 'smartphone';
  if (t.includes('desktop')) return 'computer';
  return 'devices';
}

function AccountProfileSection() {
  const { user, refresh } = useSession();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!user?.id) {
      setAccount(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextAccount = await fetchAccountProfile();
      setAccount(nextAccount);
      setEditName(nextAccount.user.name ?? '');
    } catch (error) {
      Alert.alert(
        'Unable to load account',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const activeUser = account?.user ?? user;

  const handleSave = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile(trimmedName);
      await refresh();
      await loadAccount();
      setNameModalOpen(false);
      Alert.alert('Account updated', 'Your account details were saved.');
    } catch (error) {
      Alert.alert(
        'Unable to update account',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [editName, loadAccount, refresh]);

  const cancelNameEdit = useCallback(() => {
    setEditName(account?.user.name ?? user?.name ?? '');
    setNameModalOpen(false);
  }, [account?.user.name, user?.name]);

  return (
    <>
      <SectionCard
        title="My account"
        description="Manage login details and security"
        action={
          !loading ? (
            <ActionButton
              label="Edit"
              variant="outline"
              onPress={() => {
                setEditName(activeUser?.name ?? '');
                setNameModalOpen(true);
              }}
            />
          ) : null
        }>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <View style={styles.stack}>
            <InfoRow label="Name" value={activeUser?.name ?? '—'} />
            <InfoRow label="Email" value={activeUser?.email ?? '—'} />
            <InfoRow label="Member since" value={formatDate(account?.user.createdAt)} />
          </View>
        )}
      </SectionCard>

      <BottomSheetModal
        visible={nameModalOpen}
        onClose={cancelNameEdit}
        title="Edit name"
        subtitle="Email is changed from Security → Change email."
        footer={<ActionButton fullWidth label="Save" loading={saving} onPress={handleSave} />}>
        <View style={{ gap: Spacing.three }}>
          <FormInput
            value={editName}
            onChangeText={setEditName}
            placeholder="Your full name"
            autoCapitalize="words"
          />
          <FormInput
            value={activeUser?.email ?? ''}
            onChangeText={() => undefined}
            placeholder="Email"
            keyboardType="email-address"
            editable={false}
          />
        </View>
      </BottomSheetModal>
    </>
  );
}

function AccountSecuritySection() {
  const theme = useTheme();
  const { user, refresh } = useSession();
  const [passkeys, setPasskeys] = useState<RegisteredPasskey[]>([]);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingEmailState, setChangingEmailState] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [addingPasskeyState, setAddingPasskeyState] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupTotpUri, setSetupTotpUri] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [startingTwoFactor, setStartingTwoFactor] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [confirmingTwoFactor, setConfirmingTwoFactor] = useState(false);
  const [disablingTwoFactor, setDisablingTwoFactor] = useState(false);

  const passkeySupportMessage = getPasskeySupportMessage();

  const refreshSecurity = useCallback(async () => {
    if (!user?.id) {
      setPasskeys([]);
      setPasswordChangedAt(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [passwordInfo, registeredPasskeys] = await Promise.all([
        fetchPasswordInfo(),
        listUserPasskeys(),
      ]);
      setPasswordChangedAt(passwordInfo.passwordChangedAt);
      setPasskeys(registeredPasskeys);
    } catch (error) {
      Alert.alert(
        'Unable to load security settings',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshSecurity();
  }, [refreshSecurity]);

  async function handleResendVerification() {
    if (!user?.email) return;

    setResendingVerification(true);
    try {
      await sendVerificationEmail(user.email);
      Alert.alert(
        'Verification email sent',
        'Check your inbox to verify your borrower account email.',
      );
    } catch (error) {
      Alert.alert(
        'Unable to send verification email',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setResendingVerification(false);
    }
  }

  async function handlePasswordChange() {
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Re-enter the same new password twice.');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordModalOpen(false);
      await refreshSecurity();
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch (error) {
      Alert.alert(
        'Unable to change password',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleEmailChange() {
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert('Email required', 'Enter the new email address first.');
      return;
    }

    setChangingEmailState(true);
    try {
      await changeEmail(trimmedEmail);
      setNewEmail('');
      setEmailModalOpen(false);
      Alert.alert(
        'Check your new inbox',
        'A verification link has been sent to the new email address.',
      );
    } catch (error) {
      Alert.alert(
        'Unable to change email',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setChangingEmailState(false);
    }
  }

  async function handleAddPasskey() {
    setAddingPasskeyState(true);
    try {
      await addDevicePasskey(passkeyName);
      setPasskeyName('');
      await refresh();
      await refreshSecurity();
      Alert.alert('Passkey added', 'This device can now sign in with a passkey.');
    } catch (error) {
      Alert.alert(
        'Unable to add passkey',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setAddingPasskeyState(false);
    }
  }

  async function handleRemovePasskey(id: string) {
    setRemovingPasskeyId(id);
    try {
      await deleteDevicePasskey(id);
      await refreshSecurity();
      Alert.alert('Passkey removed', 'The passkey was removed from your account.');
    } catch (error) {
      Alert.alert(
        'Unable to remove passkey',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setRemovingPasskeyId(null);
    }
  }

  function closeTotpSetup(force = false) {
    if (confirmingTwoFactor && !force) {
      return;
    }

    setSetupTotpUri(null);
    setSetupPassword('');
    setVerificationCode('');
  }

  async function handleStartTwoFactor() {
    const trimmedPassword = setupPassword.trim();
    if (!trimmedPassword) {
      Alert.alert('Current password required', 'Enter your current password to start setup.');
      return;
    }

    setStartingTwoFactor(true);
    try {
      let totpUri: string | null = null;

      try {
        const enableResult = await enableTwoFactor(trimmedPassword);
        totpUri = enableResult.totpURI ?? null;
      } catch (enableError) {
        // If setup was previously started but never verified, the server rejects
        // a fresh enable. Fall back to fetching the existing TOTP URI.
        const message =
          enableError instanceof Error ? enableError.message.toLowerCase() : '';
        const canRecoverWithExistingSetup =
          message.includes('already') ||
          message.includes('enabled') ||
          message.includes('exists');
        if (!canRecoverWithExistingSetup) {
          throw enableError;
        }
      }

      if (!totpUri) {
        totpUri = await getTotpUri(trimmedPassword);
      }

      if (!totpUri) {
        throw new Error('Missing authenticator setup details');
      }

      setSetupPassword('');
      setVerificationCode('');
      setSetupTotpUri(totpUri);
    } catch (error) {
      Alert.alert(
        'Unable to start authenticator setup',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setStartingTwoFactor(false);
    }
  }

  async function handleConfirmTwoFactor() {
    const trimmedCode = verificationCode.trim();
    if (!trimmedCode) {
      Alert.alert(
        'Verification code required',
        'Enter the 6-digit code from your authenticator app.',
      );
      return;
    }

    setConfirmingTwoFactor(true);
    try {
      await verifyTotp(trimmedCode);
      closeTotpSetup(true);
      await refresh();
      await refreshSecurity();
      Alert.alert('Authenticator enabled', 'Two-factor authentication is now active.');
    } catch (error) {
      Alert.alert(
        'Unable to verify code',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setConfirmingTwoFactor(false);
    }
  }

  async function handleDisableTwoFactor() {
    const trimmedPassword = disablePassword.trim();
    if (!trimmedPassword) {
      Alert.alert(
        'Current password required',
        'Enter your current password to disable two-factor authentication.',
      );
      return;
    }

    setDisablingTwoFactor(true);
    try {
      await disableTwoFactor(trimmedPassword);
      setDisablePassword('');
      await refresh();
      await refreshSecurity();
      Alert.alert('Authenticator disabled', 'Two-factor authentication has been turned off.');
    } catch (error) {
      Alert.alert(
        'Unable to disable authenticator',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setDisablingTwoFactor(false);
    }
  }

  const cancelEmailModal = useCallback(() => {
    setNewEmail('');
    setEmailModalOpen(false);
  }, []);

  const cancelPasswordModal = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordModalOpen(false);
  }, []);

  return (
    <>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <SectionCard
            title="Email"
            description={user?.email ?? '—'}
            action={
              user?.emailVerified ? (
                <VerifiedStatusRow label="Verified" />
              ) : (
                <InlineStatusRow label="Verification required" tone="warning" />
              )
            }>
            <View style={styles.stack}>
              {!user?.emailVerified ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Password sign-in stays blocked until this email is verified.
                  </ThemedText>
                  <ActionButton
                    label="Resend verification email"
                    variant="outline"
                    onPress={handleResendVerification}
                    loading={resendingVerification}
                  />
                </>
              ) : (
                <ActionButton
                  label="Change email"
                  variant="outline"
                  onPress={() => setEmailModalOpen(true)}
                />
              )}
            </View>
          </SectionCard>

          <SectionCard
            title="Password"
            description={`Last changed ${formatDate(passwordChangedAt)}`}>
            <ActionButton
              label="Change password"
              variant="outline"
              onPress={() => setPasswordModalOpen(true)}
            />
          </SectionCard>

          <SectionCard
            title="Passkeys"
            description="Sign in with a device passkey instead of typing your password."
            action={
              passkeys.length > 0 ? (
                <VerifiedStatusRow
                  label={passkeys.length === 1 ? '1 registered' : `${passkeys.length} registered`}
                />
              ) : (
                <InlineStatusRow label="Not set up" tone="neutral" />
              )
            }>
            <View style={styles.stack}>
              <FormInput
                value={passkeyName}
                onChangeText={setPasskeyName}
                placeholder="Optional passkey name"
                autoCapitalize="words"
              />
              <ActionButton
                label="Add passkey"
                onPress={handleAddPasskey}
                loading={addingPasskeyState}
                disabled={Boolean(passkeySupportMessage)}
              />
            </View>

            {passkeys.length > 0 ? (
              <View
                style={[
                  styles.compactList,
                  { borderColor: theme.border, marginTop: Spacing.three },
                ]}>
                {passkeys.map((passkey, index) => (
                  <View
                    key={passkey.id}
                    style={[
                      styles.compactPasskeyRow,
                      index < passkeys.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.compactThumb,
                        { borderColor: theme.border, backgroundColor: theme.background },
                      ]}>
                      <MaterialIcons name="vpn-key" size={20} color={theme.textSecondary} />
                    </View>
                    <View style={styles.compactRowCopy}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {passkey.name?.trim() || 'Unnamed passkey'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {passkey.deviceType}
                        {passkey.backedUp ? ' · synced' : ' · local'} · {formatDate(passkey.createdAt)}
                      </ThemedText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove passkey"
                      disabled={removingPasskeyId === passkey.id}
                      onPress={() => handleRemovePasskey(passkey.id)}
                      hitSlop={8}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                      {removingPasskeyId === passkey.id ? (
                        <ActivityIndicator size="small" color={theme.error} />
                      ) : (
                        <MaterialIcons name="remove-circle-outline" size={22} color={theme.error} />
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.three }}>
                No passkeys registered yet.
              </ThemedText>
            )}
          </SectionCard>

          <SectionCard
            title="Authenticator app"
            description="Trusted devices skip the extra prompt for 7 days, matching borrower web."
            action={
              user?.twoFactorEnabled ? (
                <VerifiedStatusRow label="Enabled" />
              ) : (
                <InlineStatusRow label="Not set up" tone="neutral" />
              )
            }>
            <View style={styles.stack}>
              {/* <ThemedText type="small" themeColor="textSecondary">
                {user?.twoFactorEnabled
                  ? 'Authenticator protection is enabled for your account.'
                  : 'Set up an authenticator app such as Google Authenticator or 1Password.'}
              </ThemedText> */}
              {!user?.twoFactorEnabled ? (
                <>
                  <FormInput
                    value={setupPassword}
                    onChangeText={setSetupPassword}
                    placeholder="Current password"
                    secureTextEntry
                  />
                  <ActionButton
                    label="Set up authenticator app"
                    onPress={handleStartTwoFactor}
                    loading={startingTwoFactor}
                  />
                </>
              ) : (
                <>
                  <FormInput
                    value={disablePassword}
                    onChangeText={setDisablePassword}
                    placeholder="Current password"
                    secureTextEntry
                  />
                  <ActionButton
                    label="Disable two-factor"
                    variant="outline"
                    onPress={handleDisableTwoFactor}
                    loading={disablingTwoFactor}
                  />
                </>
              )}
            </View>
          </SectionCard>
        </>
      )}

      <BottomSheetModal
        visible={emailModalOpen}
        onClose={cancelEmailModal}
        title="Change email"
        subtitle="The new address replaces the current one only after you verify it from the email we send."
        footer={
          <ActionButton
            fullWidth
            label="Send verification"
            onPress={handleEmailChange}
            loading={changingEmailState}
          />
        }>
        <FormInput
          value={newEmail}
          onChangeText={setNewEmail}
          placeholder="New email address"
          keyboardType="email-address"
        />
      </BottomSheetModal>

      <BottomSheetModal
        visible={passwordModalOpen}
        onClose={cancelPasswordModal}
        title="Change password"
        subtitle="Use at least 8 characters. You will stay signed in on this device after updating."
        scrollable
        footer={
          <ActionButton
            fullWidth
            label="Update password"
            onPress={handlePasswordChange}
            loading={changingPassword}
          />
        }>
        <View style={{ gap: Spacing.three }}>
          <FormInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            secureTextEntry
          />
          <FormInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
          />
          <FormInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
          />
        </View>
      </BottomSheetModal>

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(setupTotpUri)}
        onRequestClose={() => closeTotpSetup(true)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            disabled={confirmingTwoFactor}
            onPress={() => closeTotpSetup(true)}
          />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.stack}>
                <View style={styles.stackTight}>
                  <ThemedText type="subtitle">Finish authenticator setup</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Scan the QR code with Google Authenticator, 1Password, or another app, then enter
                    the 6-digit code to verify and enable it.
                  </ThemedText>
                </View>

                {setupTotpUri ? (
                  <>
                    <View style={styles.qrWrap}>
                      <QRCode value={setupTotpUri} size={176} backgroundColor="#ffffff" color="#000000" />
                    </View>

                    <View
                      style={[
                        styles.secretCard,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                      ]}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Manual setup key
                      </ThemedText>
                      <ThemedText type="smallBold" style={styles.secretValue}>
                        {getTotpSecret(setupTotpUri) || 'Unavailable'}
                      </ThemedText>
                    </View>
                  </>
                ) : null}

                <FormInput
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  placeholder="Enter 6-digit code"
                  keyboardType="number-pad"
                />

                <View style={styles.actionsRow}>
                  <ActionButton
                    label="Cancel"
                    variant="outline"
                    onPress={() => closeTotpSetup(true)}
                    disabled={confirmingTwoFactor}
                  />
                  <ActionButton
                    label="Verify and enable"
                    onPress={handleConfirmTwoFactor}
                    loading={confirmingTwoFactor}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function AccountLoginActivitySection() {
  const theme = useTheme();
  const [activity, setActivity] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const nextActivity = await fetchLoginHistory();
      const sorted = [...nextActivity].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setActivity(sorted.slice(0, 3));
    } catch (error) {
      Alert.alert(
        'Unable to load login activity',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const recent = activity;

  return (
    <SectionCard
      title="Recent login activity"
      description="Your last three borrower sign-ins (newest first).">
      {loading ? (
        <ActivityIndicator />
      ) : recent.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No login history is available yet.
        </ThemedText>
      ) : (
        <View>
          {recent.map((entry, index) => (
            <View
              key={entry.id}
              accessibilityRole="text"
              accessibilityLabel={`${entry.deviceType || 'Unknown device'}, ${formatDateTime(entry.createdAt)}`}
              style={[
                styles.loginActivityListRow,
                {
                  borderBottomColor: theme.border,
                  borderBottomWidth: index === recent.length - 1 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}>
              <View
                style={[
                  styles.loginActivityThumb,
                  { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                ]}>
                <MaterialIcons
                  name={loginActivityDeviceIcon(entry.deviceType)}
                  size={22}
                  color={theme.textSecondary}
                />
              </View>
              <View style={styles.loginActivityCopy}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {formatRelativeTime(entry.createdAt)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {entry.deviceType || 'Unknown device'}
                  {' · '}
                  {formatDateTime(entry.createdAt)}
                  {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

export default function AccountScreen() {
  const { signOut } = useSession();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert(
        'Unable to sign out',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  return (
    <PageScreen title="My account" showBackButton showBottomNav backFallbackHref="/settings-menu">
      <AccountProfileSection />
      <AccountSecuritySection />
      <AccountLoginActivitySection />
      <View style={styles.signOutSection}>
        <ActionButton label="Sign out" variant="danger" fullWidth onPress={handleSignOut} />
      </View>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.three,
  },
  stackTight: {
    gap: Spacing.one,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.7,
  },
  infoRow: {
    gap: Spacing.one,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  rowBetweenCenter: {
    alignItems: 'center',
  },
  flexText: {
    flex: 1,
  },
  compactList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  compactPasskeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    minHeight: 56,
  },
  compactThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  /** Flat list like profile → Documents (`BorrowerDocumentListItem`): rows + hairlines, no outer border. */
  loginActivityListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 56,
  },
  loginActivityThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginActivityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  passkeyRow: {
    gap: Spacing.two,
  },
  modalOverlay: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 20,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalContent: {
    padding: Spacing.four,
  },
  qrWrap: {
    alignSelf: 'center',
    padding: Spacing.two,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  secretCard: {
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
  },
  secretValue: {
    fontFamily: 'monospace',
  },
  signOutSection: {
    width: '100%',
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
  },
});
