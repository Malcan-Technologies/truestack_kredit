"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(emailFromUrl);
  const emailLocked = !!emailFromUrl;

  useEffect(() => {
    if (emailFromUrl) {
      setEmail(emailFromUrl);
    }
  }, [emailFromUrl]);

  const handleRequestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
      });

      if (result.error) {
        throw new Error(result.error.message || "Unable to send reset link");
      }

      setSubmitted(true);
      toast.success("If an account exists, you will receive a reset link.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <CardDescription>Request a secure password reset link.</CardDescription>
        </CardHeader>
        <form onSubmit={handleRequestReset}>
          <CardContent className="space-y-4">
            {submitted ? (
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                If an account exists for <span className="font-medium text-foreground">{email}</span>,
                a reset link is on its way.
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                readOnly={emailLocked}
                className={emailLocked ? "bg-muted" : undefined}
                required
              />
              {emailLocked ? (
                <p className="text-xs text-muted-foreground">
                  <Link href="/forgot-password" className="text-foreground underline underline-offset-4 hover:text-foreground/90">
                    Use a different email
                  </Link>
                </p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : submitted ? "Resend reset link" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link href="/sign-in" className="text-foreground underline underline-offset-4 hover:text-foreground/90">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function ForgotPasswordPage() {
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
      <ForgotPasswordContent />
    </Suspense>
  );
}
