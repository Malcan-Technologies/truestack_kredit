"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, MailCheck, Shield, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addPasskey,
  authClient,
  deletePasskey,
  disableTwoFactor,
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

  const emailVerified = Boolean(currentUser?.emailVerified);
  const twoFactorEnabled = Boolean(currentUser?.twoFactorEnabled);

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
      const result = await getTotpUri({ password: setupPassword });
      if (!result.totpURI) {
        throw new Error("Missing authenticator setup details");
      }
      setVerificationCode("");
      setSetupState({
        totpURI: result.totpURI,
      });
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
      setVerificationCode("");
      setSetupPassword("");
      setSetupState(null);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="font-heading">Security</CardTitle>
            <CardDescription>Manage verification, passkeys, authenticator setup, and recent sign-ins.</CardDescription>
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

          {setupState && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="mx-auto rounded-lg border border-border bg-white p-3">
                  <QRCodeSVG value={setupState.totpURI} size={144} level="M" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    Scan this QR code with Google Authenticator, 1Password, or another authenticator app.
                  </p>
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Manual setup key</p>
                    <p className="mt-1 break-all font-mono text-sm">{getTotpSecret(setupState.totpURI) || "Unavailable"}</p>
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
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleConfirmTwoFactor} disabled={confirmingTwoFactor}>
                    {confirmingTwoFactor ? "Verifying..." : "Verify and enable"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSetupState(null);
                      setVerificationCode("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
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
          <div className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium">Password and login activity</p>
          </div>
          <p className="text-sm text-muted">
            Password last changed: {passwordChangedAt ? formatDate(passwordChangedAt) : "Never"}
          </p>
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
      </CardContent>
    </Card>
  );
}
