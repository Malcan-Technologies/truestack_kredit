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
import { Button } from "@/components/ui/button";
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

const ONBOARDING_NAMESPACE = "admin";

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

    setStatusMessage("Check your inbox for the verification link. If it didn't arrive, resend it below.");
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">Verify Your Email</CardTitle>
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
                placeholder="admin@example.com"
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
            <p className="text-sm text-muted text-center">
              Verified already?{" "}
              <Link href="/login" className="text-foreground font-medium hover:underline">
                Sign In
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
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">Loading...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
