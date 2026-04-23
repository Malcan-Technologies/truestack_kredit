"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { signIn, signInWithPasskey } from "@/lib/auth-client";
import { setPendingVerificationEmail } from "@kredit/shared";
import { getBorrowerPostLoginDestination } from "@borrower_pro/lib/finish-login";
import { Button } from "@borrower_pro/components/ui/button";
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
import { toast } from "sonner";
import { AuthLenderBranding } from "../auth-lender-branding";

const ONBOARDING_NAMESPACE = "borrower";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"credentials" | "passkey" | null>(null);

  const signUpHref = returnTo
    ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-up";

  async function handlePasskeySignIn() {
    setLoading("passkey");
    try {
      const result = await signInWithPasskey();
      if (result.error) {
        throw new Error(result.error.message ?? "Passkey sign in failed");
      }

      const destination = await getBorrowerPostLoginDestination(returnTo);
      toast.success("Signed in successfully");
      router.replace(destination);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Passkey sign in failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading("credentials");
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        throw new Error(result.error.message ?? "Sign in failed");
      }

      const requiresTwoFactor = Boolean(
        (result.data as { twoFactorRedirect?: boolean } | null | undefined)?.twoFactorRedirect
      );
      if (requiresTwoFactor) {
        const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
        router.replace(`/two-factor${q}`);
        return;
      }

      const destination = await getBorrowerPostLoginDestination(returnTo);
      toast.success("Signed in successfully");
      router.replace(destination);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign in failed";
      if (/not verified|verify/i.test(message) && email.trim()) {
        setPendingVerificationEmail(ONBOARDING_NAMESPACE, email.trim());
        router.push(`/verify-email?email=${encodeURIComponent(email.trim())}&source=signin`);
        return;
      }
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <AuthLenderBranding />
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Enter your email and password to access your account.</CardDescription>
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
              {loading === "passkey" ? "Waiting for passkey..." : "Sign in with passkey"}
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
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username webauthn"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href={
                    email.trim()
                      ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                      : "/forgot-password"
                  }
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password webauthn"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading !== null}>
              {loading === "credentials" ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href={signUpHref} className="text-primary underline underline-offset-4">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function SignInPage() {
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
      <SignInForm />
    </Suspense>
  );
}
