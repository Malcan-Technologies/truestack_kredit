"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, MailCheck, Shield, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  clearPendingTotpSetup,
  getPendingTotpSetup,
  setPendingTotpSetup,
} from "@kredit/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addPasskey,
  authClient,
  changePassword,
  deletePasskey,
  disableTwoFactor,
  enableTwoFactor,
  fetchSecurityStatus,
  getTotpUri,
  listUserPasskeys,
  RegisteredPasskey,
  useSession,
  verifyTotp,
} from "@/lib/auth-client";
import { formatDate, formatRelativeTime } from "@/lib/utils";

interface LoginLog {
  id: string;
  ipAddress: string | null;
  deviceType: string | null;
  createdAt: string;
}

interface AccountSecurityCardProps {
  passwordChangedAt?: string | null;
  loginLogs: LoginLog[];
}

function getTotpSecret(totpUri: string): string {
  const match = totpUri.match(/[?&]secret=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

const ONBOARDING_NAMESPACE = "admin-pro";

export function AccountSecurityCard({
  passwordChangedAt,
  loginLogs,
}: AccountSecurityCardProps) {
  const { data: session, refetch } = useSession();
  const currentUser = useMemo(
    () =>
      (session?.user ?? null) as
        | ({
            id: string;
            email: string;
            emailVerified?: boolean | null;
            twoFactorEnabled?: boolean | null;
          } & Record<string, unknown>)
        | null,
    [session]
  );

  const [passkeys, setPasskeys] = useState<RegisteredPasskey[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupState, setSetupState] = useState<{ totpURI: string } | null>(null);
  const [startingTwoFactor, setStartingTwoFactor] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmingTwoFactor, setConfirmingTwoFactor] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disablingTwoFactor, setDisablingTwoFactor] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [latestPasswordChangedAt, setLatestPasswordChangedAt] = useState(passwordChangedAt ?? null);

  const emailVerified = Boolean(currentUser?.emailVerified);
  const twoFactorEnabled = Boolean(currentUser?.twoFactorEnabled);

  useEffect(() => {
    if (!currentUser?.id) {
      setSetupState(null);
      return;
    }

    if (twoFactorEnabled) {
      clearPendingTotpSetup(ONBOARDING_NAMESPACE);
      setSetupState(null);
      return;
    }

    const pendingSetup = getPendingTotpSetup(ONBOARDING_NAMESPACE);
    if (!pendingSetup) {
      return;
    }

    if (pendingSetup.userId !== currentUser.id) {
      clearPendingTotpSetup(ONBOARDING_NAMESPACE);
      return;
    }

    setSetupState({
      totpURI: pendingSetup.totpURI,
    });
  }, [currentUser?.id, twoFactorEnabled]);

  useEffect(() => {
    setLatestPasswordChangedAt(passwordChangedAt ?? null);
  }, [passwordChangedAt]);

  const openSetupDialog = (totpURI: string) => {
    if (currentUser?.id) {
      setPendingTotpSetup(ONBOARDING_NAMESPACE, {
        userId: currentUser.id,
        totpURI,
      });
    }
    setSetupPassword("");
    setVerificationCode("");
    setSetupState({ totpURI });
  };

  const closeSetupDialog = () => {
    clearPendingTotpSetup(ONBOARDING_NAMESPACE);
    setVerificationCode("");
    setSetupPassword("");
    setSetupState(null);
  };

  const refreshStatus = async () => {
    if (!currentUser) {
      setPasskeys([]);
      setLoadingStatus(false);
      return;
    }

    setLoadingStatus(true);
    try {
      const status = await fetchSecurityStatus(currentUser);
      setPasskeys(status.passkeys);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load security settings");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, [currentUser?.id]);

  const handleResendVerification = async () => {
    if (!currentUser?.email) return;

    setResendingVerification(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: currentUser.email,
      });
      if (result.error) {
        throw new Error(result.error.message || "Unable to send verification email");
      }
      toast.success("Verification email sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send verification email");
    } finally {
      setResendingVerification(false);
    }
  };

  const handleAddPasskey = async () => {
    setAddingPasskey(true);
    try {
      const result = await addPasskey({
        name: passkeyName.trim() || undefined,
      });
      if (result.error) {
        throw new Error(result.error.message || "Unable to register passkey");
      }
      setPasskeyName("");
      await refetch();
      const nextPasskeys = await listUserPasskeys();
      setPasskeys(nextPasskeys);
      toast.success("Passkey added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to register passkey");
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    setRemovingPasskeyId(id);
    try {
      await deletePasskey({ id });
      const nextPasskeys = await listUserPasskeys();
      setPasskeys(nextPasskeys);
      toast.success("Passkey removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove passkey");
    } finally {
      setRemovingPasskeyId(null);
    }
  };

  const handleStartTwoFactor = async () => {
    if (!setupPassword.trim()) {
      toast.error("Enter your current password first.");
      return;
    }

    setStartingTwoFactor(true);
    try {
      const enableResult = await enableTwoFactor({ password: setupPassword });
      if (enableResult.error) {
        throw new Error(enableResult.error.message || "Unable to start two-factor setup");
      }

      const qrResult = await getTotpUri({ password: setupPassword });
      const totpURI = qrResult.totpURI;
      if (!totpURI) {
        throw new Error("Missing authenticator setup details");
      }

      openSetupDialog(totpURI);
      toast.success("Scan the QR code and enter the 6-digit code to finish setup.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start two-factor setup");
    } finally {
      setStartingTwoFactor(false);
    }
  };

  const handleConfirmTwoFactor = async () => {
    if (!verificationCode.trim()) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setConfirmingTwoFactor(true);
    try {
      const result = await verifyTotp({ code: verificationCode.trim() });
      if (result.error) {
        throw new Error(result.error.message || "Invalid authenticator code");
      }
      closeSetupDialog();
      await refetch();
      await refreshStatus();
      toast.success("Two-factor authentication enabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid authenticator code");
    } finally {
      setConfirmingTwoFactor(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!disablePassword.trim()) {
      toast.error("Enter your current password to disable two-factor authentication.");
      return;
    }

    setDisablingTwoFactor(true);
    try {
      const result = await disableTwoFactor({ password: disablePassword });
      if (result.error) {
        throw new Error(result.error.message || "Unable to disable two-factor authentication");
      }
      setDisablePassword("");
      await refetch();
      toast.success("Two-factor authentication disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to disable two-factor authentication");
    } finally {
      setDisablingTwoFactor(false);
    }
  };

  const resetPasswordForm = () => {
    setShowChangePassword(false);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setChangingPassword(true);
    try {
      const result = await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      if (result.error) {
        throw new Error(result.error.message || "Unable to change password");
      }

      resetPasswordForm();
      setLatestPasswordChangedAt(new Date().toISOString());
      await refetch();
      toast.success("Password updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="font-heading">Security</CardTitle>
            <CardDescription>
              Manage verification, passkeys, authenticator setup, password changes, and recent sign-ins.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Email verification</p>
              <p className="text-sm text-muted">
                Password sign-in stays blocked until this email is verified.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={emailVerified ? "success" : "outline"}>
                {emailVerified ? "Verified" : "Verification required"}
              </Badge>
              {!emailVerified && (
                <Button variant="outline" onClick={handleResendVerification} disabled={resendingVerification}>
                  {resendingVerification ? "Sending..." : "Resend email"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Passkeys</p>
              <p className="text-sm text-muted">
                Use passkeys as your preferred sign-in path instead of email and password.
              </p>
            </div>
            <Badge variant={passkeys.length > 0 ? "success" : "outline"}>
              {passkeys.length > 0 ? `${passkeys.length} registered` : "Not set up"}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={passkeyName}
              onChange={(event) => setPasskeyName(event.target.value)}
              placeholder="Optional passkey name"
            />
            <Button onClick={handleAddPasskey} disabled={addingPasskey}>
              {addingPasskey ? "Registering..." : "Add passkey"}
            </Button>
          </div>

          {loadingStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading passkeys...
            </div>
          ) : passkeys.length > 0 ? (
            <div className="space-y-3">
              {passkeys.map((passkey) => (
                <div key={passkey.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{passkey.name?.trim() || "Unnamed passkey"}</p>
                    </div>
                    <p className="text-sm text-muted">
                      {passkey.deviceType} {passkey.backedUp ? "· synced" : "· local only"} · added {formatDate(passkey.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removingPasskeyId === passkey.id}
                    onClick={() => void handleDeletePasskey(passkey.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {removingPasskeyId === passkey.id ? "Removing..." : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No passkeys registered yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Authenticator app</p>
              <p className="text-sm text-muted">
                Trusted devices skip the extra prompt for 7 days after a successful password login.
              </p>
            </div>
            <Badge variant={twoFactorEnabled ? "success" : "outline"}>
              {twoFactorEnabled ? "Enabled" : "Required for 2FA"}
            </Badge>
          </div>

          {!twoFactorEnabled && !setupState && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                value={setupPassword}
                onChange={(event) => setSetupPassword(event.target.value)}
                placeholder="Current password"
              />
              <Button onClick={handleStartTwoFactor} disabled={startingTwoFactor}>
                {startingTwoFactor ? "Preparing..." : "Set up app"}
              </Button>
            </div>
          )}

          {twoFactorEnabled && (
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">Disable authenticator app</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    placeholder="Current password"
                  />
                  <Button variant="outline" onClick={handleDisableTwoFactor} disabled={disablingTwoFactor}>
                    {disablingTwoFactor ? "Disabling..." : "Disable two-factor"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <MailCheck className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium">Password and login activity</p>
            </div>
            <Button variant="outline" onClick={() => (showChangePassword ? resetPasswordForm() : setShowChangePassword(true))}>
              {showChangePassword ? "Cancel" : "Change password"}
            </Button>
          </div>
          <p className="text-sm text-muted">
            Password last changed: {latestPasswordChangedAt ? formatDate(latestPasswordChangedAt) : "Never"}
          </p>

          {showChangePassword && (
            <form onSubmit={handleChangePassword} className="rounded-lg border border-border p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="admin-pro-current-password">
                  Current password
                </label>
                <div className="relative">
                  <Input
                    id="admin-pro-current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    required
                  />
                  <button
                    type="button"
                    aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrentPassword((current) => !current)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="admin-pro-new-password">
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="admin-pro-new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        newPassword: event.target.value,
                      }))
                    }
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNewPassword((current) => !current)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted">Use at least 8 characters.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="admin-pro-confirm-new-password">
                  Confirm new password
                </label>
                <Input
                  id="admin-pro-confirm-new-password"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  minLength={8}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={changingPassword}>
                  {changingPassword ? "Updating..." : "Update password"}
                </Button>
                <Button type="button" variant="outline" onClick={resetPasswordForm} disabled={changingPassword}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {loginLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loginLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <span title={formatDate(log.createdAt)}>{formatRelativeTime(log.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.deviceType || "Unknown"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted">No login history available.</p>
          )}
        </div>

        <Dialog
          open={Boolean(setupState)}
          onOpenChange={(open) => {
            if (!open && setupState) {
              closeSetupDialog();
            }
          }}
        >
          <DialogContent
            className="max-w-xl [&>button]:hidden"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Finish authenticator setup</DialogTitle>
              <DialogDescription>
                Scan the QR code with Google Authenticator, 1Password, or another app, then
                enter the 6-digit code to verify and enable it.
              </DialogDescription>
            </DialogHeader>

            {setupState ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="mx-auto rounded-lg border border-border bg-white p-3">
                    <QRCodeSVG value={setupState.totpURI} size={168} level="M" />
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Manual setup key
                      </p>
                      <p className="mt-1 break-all font-mono text-sm">
                        {getTotpSecret(setupState.totpURI) || "Unavailable"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    placeholder="Enter 6-digit code"
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeSetupDialog}
                disabled={confirmingTwoFactor}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmTwoFactor}
                disabled={confirmingTwoFactor}
              >
                {confirmingTwoFactor ? "Verifying..." : "Verify and enable"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
