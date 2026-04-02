"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(emailFromUrl);
  const emailLocked = !!emailFromUrl;

  useEffect(() => {
    const fromUrl = searchParams.get("email")?.trim() ?? "";
    if (fromUrl) setEmail(fromUrl);
  }, [searchParams]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-gradient">
            Reset Password
          </CardTitle>
          <CardDescription>
            Request a secure password reset link.
          </CardDescription>
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
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={emailLocked}
                className={emailLocked ? "bg-muted" : undefined}
                required
              />
              {emailLocked ? (
                <p className="text-xs text-muted">
                  <Link href="/forgot-password" className="text-foreground font-medium hover:underline">
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
            <p className="text-sm text-muted text-center">
              Remember your password?{" "}
              <Link href="/login" className="text-foreground font-medium hover:underline">
                Sign In
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
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">Loading...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
