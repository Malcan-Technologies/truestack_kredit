"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
  clearPendingVerificationEmail,
  getPendingVerificationEmail,
  setPendingVerificationEmail,
} from "@kredit/shared";
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

const ONBOARDING_NAMESPACE = "borrower";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";
  const source = searchParams.get("source")?.trim() ?? "";
  const [email, setEmail] = useState(emailFromUrl);
  const [statusMessage, setStatusMessage] = useState(
    "Check your inbox for the verification link. If it didn't arrive, resend it below."
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const nextEmail = emailFromUrl || getPendingVerificationEmail(ONBOARDING_NAMESPACE);
    if (nextEmail) {
      setEmail(nextEmail);
      setPendingVerificationEmail(ONBOARDING_NAMESPACE, nextEmail);
    }

    if (source === "signup") {
      setStatusMessage("We sent you a verification email. Open the link in that email to continue.");
      return;
    }

    if (source === "signin") {
      setStatusMessage(
        "Your email is still unverified. A fresh verification email was sent when you tried to sign in."
      );
      return;
    }

    setStatusMessage(
      "Check your inbox for the verification link. If it didn't arrive, resend it below."
    );
  }, [emailFromUrl, source]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      toast.error("Enter your email address first.");
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim(),
      });

      if (result.error) {
        throw new Error(result.error.message || "Unable to send verification email");
      }

      setPendingVerificationEmail(ONBOARDING_NAMESPACE, email.trim());
      toast.success("Verification email sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send verification email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>
            Email verification is required before you can sign in with a password.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleResend}>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {statusMessage}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Resend verification email"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Verified already?{" "}
              <Link href="/sign-in" className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                clearPendingVerificationEmail(ONBOARDING_NAMESPACE);
                setEmail("");
              }}
            >
              Use a different email
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
