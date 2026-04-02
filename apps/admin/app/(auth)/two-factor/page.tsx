"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { verifyBackupCode, verifyTotp } from "@/lib/auth-client";
import { ensureActiveTenantAfterLogin } from "@/lib/finish-login";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function TwoFactorPage() {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [loadingMode, setLoadingMode] = useState<"totp" | "backup" | null>(null);

  const finishLogin = async () => {
    await ensureActiveTenantAfterLogin();
    toast.success("Two-factor verification complete.");
    router.push("/dashboard");
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Two-Factor Verification</CardTitle>
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
          <Button variant="ghost" onClick={() => router.push("/login")}>
            Back to sign in
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
