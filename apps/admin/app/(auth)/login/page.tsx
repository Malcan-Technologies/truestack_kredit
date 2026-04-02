"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  clearPendingVerificationEmail,
  getPendingVerificationEmail,
  getSecuritySetupPreference,
  setPendingVerificationEmail,
} from "@kredit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn, signInWithPasskey } from "@/lib/auth-client";
import { ensureActiveTenantAfterLogin } from "@/lib/finish-login";
import { BackToTruestackButton, BackToRootButton } from "@/components/powered-by-truestack";

const ONBOARDING_NAMESPACE = "admin";

function isEmailVerificationSignInError(
  error: { status?: number; message?: string | null } | null | undefined
) {
  if (!error || error.status !== 403) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("email") &&
    (
      message.includes("not verified") ||
      message.includes("unverified") ||
      message.includes("verify your email") ||
      message.includes("email verification")
    )
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"credentials" | "passkey" | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handlePasskeySignIn = async () => {
    setLoading("passkey");

    try {
      const result = await signInWithPasskey();
      if (result.error) {
        throw new Error(result.error.message || "Passkey sign-in failed");
      }

      await ensureActiveTenantAfterLogin();
      toast.success("Signed in with passkey");
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Passkey sign-in failed");
    } finally {
      setLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("credentials");

    try {
      const normalizedEmail = formData.email.trim();
      const result = await signIn.email({
        email: normalizedEmail,
        password: formData.password,
      });

      if (result.error) {
        if (isEmailVerificationSignInError(result.error) && normalizedEmail) {
          setPendingVerificationEmail(ONBOARDING_NAMESPACE, normalizedEmail);
          router.push(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&source=signin`);
          return;
        }

        throw new Error(result.error.message || "Login failed");
      }

      const requiresTwoFactor = Boolean(
        (result.data as { twoFactorRedirect?: boolean } | null | undefined)?.twoFactorRedirect
      );
      if (requiresTwoFactor) {
        router.replace("/two-factor");
        return;
      }

      const pendingEmail = getPendingVerificationEmail(ONBOARDING_NAMESPACE);
      const preferredSetup = getSecuritySetupPreference(ONBOARDING_NAMESPACE);
      if (
        preferredSetup &&
        pendingEmail &&
        pendingEmail.toLowerCase() === normalizedEmail.toLowerCase()
      ) {
        clearPendingVerificationEmail(ONBOARDING_NAMESPACE);
        await ensureActiveTenantAfterLogin();
        toast.success("Login successful. Let's finish securing your account.");
        router.push(`/dashboard/security-setup?setup=${encodeURIComponent(preferredSetup)}`);
        return;
      }

      clearPendingVerificationEmail(ONBOARDING_NAMESPACE);
      await ensureActiveTenantAfterLogin();
      toast.success("Login successful");
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      toast.error(message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <BackToTruestackButton variant="outline" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Sign In</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading !== null}
              onClick={handlePasskeySignIn}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {loading === "passkey" ? "Waiting for passkey..." : "Sign In with Passkey"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or use email and password</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                autoComplete="username webauthn"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href={
                    formData.email.trim()
                      ? `/forgot-password?email=${encodeURIComponent(formData.email.trim())}`
                      : "/forgot-password"
                  }
                  className="text-sm text-muted hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                autoComplete="current-password webauthn"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading !== null}>
              {loading === "credentials" ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-muted text-center">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-foreground font-medium hover:underline">
                Register
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
      <div className="mt-8">
        <BackToRootButton variant="ghost" />
      </div>
    </div>
  );
}
