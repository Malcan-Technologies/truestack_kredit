"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { verifyBackupCode, verifyTotp } from "@/lib/auth-client";
import { getBorrowerPostLoginDestination } from "@borrower_pro/lib/finish-login";
import { Button } from "@borrower_pro/components/ui/button";
import { Checkbox } from "@borrower_pro/components/ui/checkbox";
import { Input } from "@borrower_pro/components/ui/input";
import { Label } from "@borrower_pro/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { Separator } from "@borrower_pro/components/ui/separator";

function TwoFactorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || null;

  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [loadingMode, setLoadingMode] = useState<"totp" | "backup" | null>(null);

  const finishLogin = async () => {
    const destination = await getBorrowerPostLoginDestination(returnTo);
    toast.success("Two-factor verification complete.");
    router.replace(destination);
    router.refresh();
  };

  const handleVerifyTotp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoadingMode("totp");

    try {
      const result = await verifyTotp({
        code: totpCode.trim(),
        trustDevice,
      });

      if (result.error) {
        throw new Error(result.error.message || "Invalid authentication code");
      }

      await finishLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid authentication code");
    } finally {
      setLoadingMode(null);
    }
  };

  const handleVerifyBackupCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoadingMode("backup");

    try {
      const result = await verifyBackupCode({
        code: backupCode.trim(),
        trustDevice,
      });

      if (result.error) {
        throw new Error(result.error.message || "Invalid backup code");
      }

      await finishLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid backup code");
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Two-factor verification</CardTitle>
          <CardDescription>
            Enter a code from your authenticator app or use one of your backup codes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totpCode">Authenticator code</Label>
              <Input
                id="totpCode"
                inputMode="numeric"
                placeholder="123456"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loadingMode !== null}>
              {loadingMode === "totp" ? "Verifying..." : "Verify code"}
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <Checkbox
              id="trustDevice"
              checked={trustDevice}
              onCheckedChange={(checked) => setTrustDevice(Boolean(checked))}
            />
            <Label htmlFor="trustDevice" className="text-sm font-normal">
              Trust this device for 7 days
            </Label>
          </div>

          <Separator />

          <form onSubmit={handleVerifyBackupCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backupCode">Backup code</Label>
              <Input
                id="backupCode"
                placeholder="Enter one of your backup codes"
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={loadingMode !== null}>
              {loadingMode === "backup" ? "Verifying..." : "Use backup code"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button
            variant="ghost"
            onClick={() =>
              router.push(
                `/sign-in${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
              )
            }
          >
            Back to sign in
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <p className="text-center text-sm text-muted-foreground">Loading…</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <TwoFactorForm />
    </Suspense>
  );
}
