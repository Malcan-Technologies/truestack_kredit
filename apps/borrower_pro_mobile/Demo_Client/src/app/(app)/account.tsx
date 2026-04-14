import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { PageHeaderToolbarButton, PageScreen } from '@/components/page-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
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
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
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
        textColor: Colors.dark.text,
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
          backgroundColor: theme.background,
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

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
}) {
  const theme = useTheme();

  const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : theme.textSecondary;

  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </View>
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

function SurfacePanel({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.panel,
        {
          borderColor: theme.border,
          backgroundColor: theme.background,
        },
      ]}>
      {children}
    </View>
  );
}

function getTotpSecret(totpUri: string): string {
  const match = totpUri.match(/[?&]secret=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function AccountProfileSection({
  editing,
  onEditingChange,
  toolbarApiRef,
  onSavingChange,
}: {
  editing: boolean;
  onEditingChange: (next: boolean) => void;
  toolbarApiRef: React.MutableRefObject<{ save: () => Promise<void>; cancel: () => void } | null>;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { user, refresh } = useSession();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
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
      onEditingChange(false);
      Alert.alert('Account updated', 'Your account details were saved.');
    } catch (error) {
      Alert.alert(
        'Unable to update account',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [editName, loadAccount, onEditingChange, refresh]);

  const cancelEdit = useCallback(() => {
    setEditName(account?.user.name ?? user?.name ?? '');
    onEditingChange(false);
  }, [account?.user.name, onEditingChange, user?.name]);

  useLayoutEffect(() => {
    toolbarApiRef.current = {
      save: handleSave,
      cancel: cancelEdit,
    };
  }, [cancelEdit, handleSave, toolbarApiRef]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [onSavingChange, saving]);

  return (
    <SectionCard title="My account" description="Manage the personal details attached to your borrower login.">
      {loading ? (
        <ActivityIndicator />
      ) : editing ? (
        <View style={styles.stack}>
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
          <ThemedText type="small" themeColor="textSecondary">
            Email changes live in the Security section below.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.stack}>
          <InfoRow label="Name" value={activeUser?.name ?? '—'} />
          <InfoRow label="Email" value={activeUser?.email ?? '—'} />
          <InfoRow
            label="Member since"
            value={formatDate(account?.user.createdAt)}
          />
        </View>
      )}
    </SectionCard>
  );
}

function AccountSecuritySection() {
  const theme = useTheme();
  const { user, refresh } = useSession();
  const [passkeys, setPasskeys] = useState<RegisteredPasskey[]>([]);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
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
      setShowPasswordForm(false);
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
      setShowEmailForm(false);
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
      await enableTwoFactor(trimmedPassword);
      const totpUri = await getTotpUri(trimmedPassword);
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

  return (
    <SectionCard
      title="Security"
      description="Manage verification, password, passkeys, and the current mobile auth setup.">
      {loading ? (
        <ActivityIndicator />
      ) : (
        <View style={styles.stack}>
          <SurfacePanel>
            <View style={styles.rowBetween}>
              <View style={styles.stackTight}>
                <ThemedText type="smallBold">Email verification</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {user?.email ?? '—'}
                </ThemedText>
              </View>
              <StatusPill
                label={user?.emailVerified ? 'Verified' : 'Verification required'}
                tone={user?.emailVerified ? 'success' : 'warning'}
              />
            </View>

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
            ) : showEmailForm ? (
              <View style={styles.stack}>
                <FormInput
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="New email address"
                  keyboardType="email-address"
                />
                <ThemedText type="small" themeColor="textSecondary">
                  The new email address will only replace the current one after verification.
                </ThemedText>
                <View style={styles.actionsRow}>
                  <ActionButton
                    label="Send change email"
                    onPress={handleEmailChange}
                    loading={changingEmailState}
                  />
                  <ActionButton
                    label="Cancel"
                    variant="outline"
                    onPress={() => {
                      setShowEmailForm(false);
                      setNewEmail('');
                    }}
                  />
                </View>
              </View>
            ) : (
              <ActionButton
                label="Change email"
                variant="outline"
                onPress={() => setShowEmailForm(true)}
              />
            )}
          </SurfacePanel>

          <SurfacePanel>
            <View style={styles.stackTight}>
              <ThemedText type="smallBold">Password</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Last changed {formatDate(passwordChangedAt)}
              </ThemedText>
            </View>

            <ActionButton
              label={showPasswordForm ? 'Hide form' : 'Change password'}
              variant="outline"
              onPress={() => setShowPasswordForm((current) => !current)}
            />

            {showPasswordForm ? (
              <View style={styles.stack}>
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
                <View style={styles.actionsRow}>
                  <ActionButton
                    label="Update password"
                    onPress={handlePasswordChange}
                    loading={changingPassword}
                  />
                  <ActionButton
                    label="Cancel"
                    variant="outline"
                    onPress={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  />
                </View>
              </View>
            ) : null}
          </SurfacePanel>

          <SurfacePanel>
            <View style={styles.rowBetween}>
              <View style={styles.stackTight}>
                <ThemedText type="smallBold">Passkeys</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Sign in with the device passkey instead of typing your password.
                </ThemedText>
              </View>
              <StatusPill
                label={passkeys.length > 0 ? `${passkeys.length} registered` : 'Not set up'}
                tone={passkeys.length > 0 ? 'success' : 'neutral'}
              />
            </View>

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

            <View style={styles.stack}>
              {passkeys.length > 0 ? (
                passkeys.map((passkey) => (
                  <View key={passkey.id} style={styles.passkeyRow}>
                    <View style={styles.stackTight}>
                      <ThemedText type="smallBold">
                        {passkey.name?.trim() || 'Unnamed passkey'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {passkey.deviceType} {passkey.backedUp ? '• synced' : '• local only'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Added {formatDate(passkey.createdAt)}
                      </ThemedText>
                    </View>
                    <ActionButton
                      label="Remove"
                      variant="outline"
                      onPress={() => handleRemovePasskey(passkey.id)}
                      loading={removingPasskeyId === passkey.id}
                    />
                  </View>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No passkeys registered yet.
                </ThemedText>
              )}
            </View>
          </SurfacePanel>

          <SurfacePanel>
            <ThemedText type="smallBold">Authenticator app</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Trusted devices skip the extra prompt for 7 days, matching borrower web.
            </ThemedText>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flexText}>
                {user?.twoFactorEnabled
                  ? 'Authenticator protection is enabled for your account.'
                  : 'Set up an authenticator app such as Google Authenticator or 1Password.'}
              </ThemedText>
              <StatusPill
                label={user?.twoFactorEnabled ? 'Enabled' : 'Not set up'}
                tone={user?.twoFactorEnabled ? 'success' : 'neutral'}
              />
            </View>

            {!user?.twoFactorEnabled ? (
              <View style={styles.stack}>
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
              </View>
            ) : (
              <View style={styles.stack}>
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
              </View>
            )}
          </SurfacePanel>

          <Modal
            transparent
            animationType="fade"
            visible={Boolean(setupTotpUri)}
            onRequestClose={closeTotpSetup}>
            <View style={styles.modalOverlay}>
              <Pressable
                style={StyleSheet.absoluteFillObject}
                disabled={confirmingTwoFactor}
                onPress={closeTotpSetup}
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
                        Scan the QR code with Google Authenticator, 1Password, or another app,
                        then enter the 6-digit code to verify and enable it.
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
                        onPress={closeTotpSetup}
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
        </View>
      )}
    </SectionCard>
  );
}

function AccountLoginActivitySection() {
  const [activity, setActivity] = useState<LoginHistoryEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const nextActivity = await fetchLoginHistory();
      setActivity(nextActivity);
      setHasLoaded(true);
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
    if (!expanded || hasLoaded) {
      return;
    }

    void loadActivity();
  }, [expanded, hasLoaded, loadActivity]);

  return (
    <SectionCard
      title="Recent login activity"
      description="Your latest borrower sign-ins across devices."
      action={
        <ActionButton
          label={expanded ? 'Hide' : 'Show'}
          variant="outline"
          onPress={() => setExpanded((current) => !current)}
        />
      }>
      {!expanded ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hasLoaded
            ? activity.length > 0
              ? `${activity.length} recent sign-in${activity.length === 1 ? '' : 's'} available.`
              : 'No login history is available yet.'
            : 'Expand to view your recent borrower sign-ins.'}
        </ThemedText>
      ) : loading ? (
        <ActivityIndicator />
      ) : activity.length > 0 ? (
        <View style={styles.stack}>
          {activity.map((entry) => (
            <SurfacePanel key={entry.id}>
              <InfoRow label="When" value={formatRelativeTime(entry.createdAt)} />
              <InfoRow label="Date & time" value={formatDateTime(entry.createdAt)} />
              <InfoRow label="Device" value={entry.deviceType || 'Unknown'} />
              <InfoRow label="IP address" value={entry.ipAddress || '—'} />
            </SurfacePanel>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          No login history is available yet.
        </ThemedText>
      )}
    </SectionCard>
  );
}

export default function AccountScreen() {
  const { signOut } = useSession();
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const accountToolbarRef = useRef<{ save: () => Promise<void>; cancel: () => void } | null>(null);

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
    <PageScreen
      title="My account"
      subtitle="Manage your login, security, and account information."
      showBackButton
      showBottomNav
      backFallbackHref="/settings-menu"
      headerActions={
        <>
          {profileEditing ? (
            <>
              <PageHeaderToolbarButton
                label="Cancel"
                variant="outline"
                onPress={() => accountToolbarRef.current?.cancel()}
              />
              <PageHeaderToolbarButton
                label="Save changes"
                loading={profileSaving}
                onPress={() => void accountToolbarRef.current?.save()}
              />
            </>
          ) : (
            <PageHeaderToolbarButton label="Edit" variant="outline" onPress={() => setProfileEditing(true)} />
          )}
          <PageHeaderToolbarButton label="Sign out" variant="danger" onPress={handleSignOut} />
        </>
      }>
      <AccountProfileSection
        editing={profileEditing}
        onEditingChange={setProfileEditing}
        toolbarApiRef={accountToolbarRef}
        onSavingChange={setProfileSaving}
      />
      <AccountSecuritySection />
      <AccountLoginActivitySection />
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
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  infoRow: {
    gap: Spacing.one,
  },
  panel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  flexText: {
    flex: 1,
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
});
