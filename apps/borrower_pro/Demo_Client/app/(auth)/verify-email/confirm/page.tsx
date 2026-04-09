"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { Button } from "@borrower_pro/components/ui/button";
import { peekPendingAcceptInvitationPath } from "@borrower_pro/lib/borrower-auth-client";

type VerifyState = "loading" | "success" | "error";

function VerifyEmailConfirmContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [state, setState] = useState<VerifyState>(token ? "loading" : "error");
  const [message, setMessage] = useState("Verifying your email...");
  const [signInHref, setSignInHref] = useState("/sign-in");

  useEffect(() => {
    const pending = peekPendingAcceptInvitationPath();
    if (pending) {
      setSignInHref(`/sign-in?returnTo=${encodeURIComponent(pending)}`);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is invalid or incomplete.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.message || result?.error?.message || "This verification link is invalid or has expired.");
        }

        if (!cancelled) {
          setState("success");
          setMessage("Your email has been verified. You can sign in now.");
        }
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "Unable to verify your email.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Email verification</CardTitle>
          <CardDescription>
            {state === "loading" ? "Please wait while we confirm your email." : message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "loading" ? (
            <p className="text-center text-sm text-muted-foreground">Verifying your email...</p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {state === "success" ? (
            <Button asChild className="w-full">
              <Link href={signInHref}>Go to sign in</Link>
            </Button>
          ) : null}
          {state === "error" ? (
            <Button asChild variant="outline" className="w-full">
              <Link href="/verify-email">Resend verification email</Link>
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function VerifyEmailConfirmPage() {
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
      <VerifyEmailConfirmContent />
    </Suspense>
  );
}
